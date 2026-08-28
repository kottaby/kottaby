import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { StudentTrialService } from "@/lib/services/student-trial.service";
import { ConflictError, logger } from "@/lib/errors";
import { requireAdmin } from "@/lib/middleware/admin-auth";

/**
 * PATCH /api/admin/students/[id] — admin manual trial grant.
 *
 * Body: { action: "grant-trial" }
 *
 * Grants the one-time free trial credit to a student who doesn't have it yet
 * (e.g. created via a path that bypassed the registration grant). Uses the
 * same guarded conditional UPDATE as registration → idempotent at SQL level.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireAdmin(req ?? _req);
  if (authError) return authError;
  const { id } = await params;

  let body: { action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "grant-trial") {
    try {
      const student = await db.student.findUnique({ where: { id } });
      if (!student) {
        return NextResponse.json(
          { ok: false, error: "Student not found" },
          { status: 404 },
        );
      }

      // Use the canonical provisioning entry point (REQ-017)
      await StudentTrialService.grantFreeTrial(
        id,
        (student.locale === "en" ? "en" : "ar") as "ar" | "en",
      );

      const updated = await db.student.findUnique({ where: { id } });
      return NextResponse.json({
        ok: true,
        student: updated,
        trialGranted: updated?.trialGrantedAt !== null,
      });
    } catch (err) {
      // ConflictError if already granted (use instanceof, not string sniffing)
      if (err instanceof ConflictError) {
        return NextResponse.json(
          { ok: false, code: err.code, error: err.message },
          { status: err.httpStatus },
        );
      }
      logger.error("[admin/students/[id]] grant-trial error", err);
      return NextResponse.json(
        { ok: false, error: "Server error" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: "Invalid action. Use 'grant-trial'." },
    { status: 400 },
  );
}

/**
 * DELETE /api/admin/students/[id] — delete a student record.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireAdmin(req ?? _req);
  if (authError) return authError;
  const { id } = await params;

  try {
    const existing = await db.student.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Student not found" },
        { status: 404 },
      );
    }

    await db.student.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[admin/students/[id]] DELETE error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
