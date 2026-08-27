import { NextResponse } from "next/server";
import { StudentTrialService } from "@/lib/services/student-trial.service";
import { StudentRepository } from "@/lib/repo/student.repository";
import { NotFoundError } from "@/lib/errors";

/**
 * GET /api/students/[id] — read a student record + trial eligibility.
 *
 * Exposes the segregated balance lanes + the trial grant marker so a future
 * dashboard can render the trial balance (REQ-061 service-level read contract).
 *
 * BFLA (REQ-030): no mutation surface here — read-only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const student = await StudentRepository.findById(id);
  if (!student) {
    const err = new NotFoundError("Student not found");
    return NextResponse.json(
      { ok: false, code: err.code, error: err.message },
      { status: err.httpStatus },
    );
  }

  const eligibility = await StudentTrialService.isEligibleForSession(id);

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      email: student.email,
      fullName: student.fullName,
      role: student.role,
      // Segregated balance lanes (INV-B1/B5)
      balanceTrial: student.balanceTrial,
      balanceHifz: student.balanceHifz,
      balanceTajweed: student.balanceTajweed,
      balanceReviews: student.balanceReviews,
      // One-time grant marker (INV-B7)
      trialGrantedAt: student.trialGrantedAt,
      locale: student.locale,
      createdAt: student.createdAt,
    },
    // Forward contract for DEV3 booking (REQ-020)
    eligibility: {
      eligible: eligibility.eligible,
      hasTrial: eligibility.hasTrial,
      hasPaid: eligibility.hasPaid,
      // REQ-021 — trial-first decrement contract
      decrementOrder: "trial-first",
    },
  });
}
