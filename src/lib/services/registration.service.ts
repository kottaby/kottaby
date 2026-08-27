import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { StudentRepository } from "@/lib/repo/student.repository";
import { StudentTrialService } from "@/lib/services/student-trial.service";
import { ConflictError, ValidationError } from "@/lib/errors";
import { messages, type Locale } from "@/lib/i18n/messages";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UserRole = "student" | "teacher" | "parent";

export interface RegisterInput {
  email: string;
  fullName: string;
  role: UserRole;
  locale: Locale;
}

export interface RegisterResult {
  ok: true;
  studentId: string;
  role: UserRole;
  trialGranted: boolean;
}

/**
 * DEV1-004 — RegistrationService
 *
 * Registers a new user and, IF the role is `student`, grants the one-time free
 * trial credit atomically inside the same Prisma transaction (REQ-011/018/040).
 *
 * Role gating (REQ-015/033):
 *  - student  → grants trial (balanceTrial = FREE_TRIAL_SESSION_COUNT)
 *  - teacher  → NO trial (applicant path; no teacher row created here)
 *  - parent   → NO trial
 *
 * Atomicity (REQ-018): if ANY step fails after the grant, the entire
 * transaction rolls back (neither the student row nor the trial persists).
 *
 * BOPLA (REQ-031): the trial count comes exclusively from
 * `FREE_TRIAL_SESSION_COUNT` — no client-supplied field can influence it.
 *
 * BOLA (REQ-032): the target studentId is the PK of the freshly inserted
 * student row, never a client-supplied identifier.
 */
export const RegistrationService = {
  async registerUser(input: RegisterInput): Promise<RegisterResult> {
    // --- Input validation (BOPLA whitelist) ---
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new ValidationError(
        messages[input.locale]?.contact?.invalidEmail
          ?? "Please enter a valid email address.",
      );
    }
    if (input.fullName.trim().length < 2) {
      throw new ValidationError(
        messages[input.locale]?.contact?.shortMessage
          ?? "Name is too short.",
      );
    }

    // --- Atomic registration + trial grant (single transaction) ---
    try {
      const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        // Check for duplicate email BEFORE creating (23505 → ConflictError, REQ-044)
        const existing = await StudentRepository.findByEmail(email, tx);
        if (existing) {
          throw new ConflictError(
            messages[input.locale]?.trial?.emailExistsError
              ?? "An account with this email already exists.",
          );
        }

        // Create the student record (role-tagged)
        const student = await StudentRepository.create(
          {
            email,
            fullName: input.fullName.trim(),
            role: input.role,
            locale: input.locale,
          },
          tx,
        );

        // REQ-011/015 — grant trial ONLY for the student role
        let trialGranted = false;
        if (input.role === "student") {
          // REQ-018 — grant inside the same tx; rolls back if anything after fails
          await StudentTrialService.grantFreeTrial(student.id, input.locale, tx);
          trialGranted = true;
        }

        return { studentId: student.id, trialGranted };
      });

      return {
        ok: true,
        studentId: result.studentId,
        role: input.role,
        trialGranted: result.trialGranted,
      };
    } catch (err) {
      // Re-throw domain errors as-is (ConflictError, ValidationError)
      if (err instanceof ConflictError || err instanceof ValidationError) {
        throw err;
      }
      // Unexpected DB error — log + wrap
      console.error("[registration] unexpected error", err);
      throw err;
    }
  },
};
