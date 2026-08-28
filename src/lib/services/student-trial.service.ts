import { StudentRepository, type DBTransaction } from "@/lib/repo/student.repository";
import { ConflictError, logger } from "@/lib/errors";
import { FREE_TRIAL_SESSION_COUNT } from "@/lib/constants/free-trial";
import { messages, type Locale } from "@/lib/i18n/messages";

/**
 * DEV1-004 — StudentTrialService
 *
 * The SINGLE canonical entry point for granting the free trial credit
 * (REQ-017). Future callers (DEV2-009 applicant conversion, DEV3-019 direct
 * onboarding) MUST route through `grantFreeTrial` so the grant-once rule has
 * exactly one implementation.
 *
 * Hard rules (from the spec):
 * - Idempotent at SQL level (guarded conditional UPDATE — no TOCTOU).
 * - ConflictError on re-grant (REQ-013) with a localized message (REQ-051).
 * - Logs the rejection via `logger.logDomainError` (REQ-052).
 * - No try/catch swallowing on the happy path (REQ-053).
 * - The count comes EXCLUSIVELY from `FREE_TRIAL_SESSION_COUNT` (BOPLA, REQ-031).
 */
export const StudentTrialService = {
  /**
   * Grant the one-time free trial credit to a student.
   *
   * @param studentId — server-derived identity (BOLA, REQ-032); never client input.
   * @param locale — "ar" | "en" for the localized error message.
   * @param tx — optional transaction client (REQ-041 tx propagation).
   * @throws {ConflictError} if the trial was already granted (REQ-013/074).
   */
  async grantFreeTrial(
    studentId: string,
    locale: Locale,
    tx?: DBTransaction,
  ): Promise<void> {
    const granted = await StudentRepository.grantFreeTrialOnce(
      studentId,
      FREE_TRIAL_SESSION_COUNT,
      tx,
    );

    if (!granted) {
      // REQ-052 — structured error log before throwing
      logger.logDomainError("Trial grant rejected: already granted", {
        code: "TRIAL_ALREADY_GRANTED",
        entity: "students",
        entityId: studentId,
        attempt: "1",
      });

      // REQ-051 — localized message (never a hardcoded English string)
      const msg = messages[locale]?.trial.alreadyGrantedError
        ?? messages.ar.trial.alreadyGrantedError;
      throw new ConflictError(msg);
    }
    // Happy path: no error, no warning, no swallowed exception (REQ-053).
  },

  /**
   * Check trial eligibility for a student (forward contract for DEV3 booking).
   * REQ-020: eligibility = (balanceTrial > 0) OR (any paid intent lane > 0).
   */
  async isEligibleForSession(
    studentId: string,
  ): Promise<{ eligible: boolean; hasTrial: boolean; hasPaid: boolean }> {
    const student = await StudentRepository.findById(studentId);
    if (!student) {
      return { eligible: false, hasTrial: false, hasPaid: false };
    }
    const hasTrial = student.balanceTrial > 0;
    const hasPaid =
      student.balanceHifz > 0 ||
      student.balanceTajweed > 0 ||
      student.balanceReviews > 0;
    return { eligible: hasTrial || hasPaid, hasTrial, hasPaid };
  },
};
