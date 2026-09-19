import { ParentLinkRequestRepository, StudentRepository, TeacherRepository } from "@/backend/db/repo";
import { INITIAL_DEMO_USERS } from "@/backend/db/seeds/users";
import { ConflictError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { RegistrationService } from "@/backend/services";
import { ColdStartCertificationService } from "@/backend/services/admin/cold-start-certification.service";
import { ParentLinkRequestService } from "@/backend/services/parents/parent-link-request.service";

/**
 * Result summary for the demo-linkage seed step.
 *
 * `teacherCertified` reports which production path ran for the demo
 * teacher's cold-start certification (`already` = the teacher row was
 * already approved, the step is a no-op). `parentLinked` reports whether
 * the demo parent ended the step linked to the demo student (either the
 * link pre-existed or the request/confirm flow just completed).
 */
export interface DemoLinkageState {
  teacherCertified: "created" | "elevated" | "already";
  parentLinked: boolean;
}

export async function resolveDemoUserId(role: "teacher" | "parent" | "student"): Promise<number> {
  const spec = INITIAL_DEMO_USERS.find(candidate => candidate.role === role);
  if (!spec) {
    throw new Error(`seed-parent-linkage: INITIAL_DEMO_USERS carries no ${role} spec`);
  }
  const user = await RegistrationService.findRegisteredUserByEmail(spec.email);
  if (!user) {
    throw new Error(`seed-parent-linkage: demo ${role} user not found (${spec.email}) — run the users seed step first`);
  }
  return user.id;
}

/**
 * Certification arm: run the production admin cold-start path for the demo
 * teacher. An already-approved row (or a concurrent certification surfacing
 * as ConflictError) is idempotent success.
 */
async function certifyDemoTeacher(
  adminActorId: number,
  teacherUserId: number,
  locale: string
): Promise<"created" | "elevated" | "already"> {
  const existing = await TeacherRepository.findById(teacherUserId);
  if (existing?.isApproved) {
    logger.info("Demo teacher already certified, skipping cold-start certification");
    return "already";
  }
  try {
    await ColdStartCertificationService.certifyTeacherColdStart(
      adminActorId,
      { userId: teacherUserId, makeEvaluator: false },
      locale
    );
    logger.info("Demo teacher cold-start certification applied");
    return "elevated";
  } catch (error) {
    if (!(error instanceof ConflictError)) {
      throw error;
    }
    logger.info("Demo teacher certification confirmed after concurrent certification");
    return "already";
  }
}

/**
 * Link arm: walk the real handshake flow — the parent requests the student's
 * handshake code, the student confirms — so the audit trail matches a
 * genuine link. Idempotent: an already-linked student short-circuits; a
 * pending request from a previous partial run is confirmed via the
 * pending (parent, student) pair instead of re-requesting.
 */
async function linkDemoParentToStudent(parentUserId: number, studentUserId: number, locale: string): Promise<void> {
  const studentRow = await StudentRepository.findById(studentUserId);
  if (!studentRow) {
    throw new Error(
      `seed-parent-linkage: demo student row not found (user ${studentUserId}) — run the students seed step first`
    );
  }
  if (studentRow.parentId !== null) {
    logger.info("Demo student already linked to a parent, skipping link flow");
    return;
  }

  let requestId: number;
  try {
    const outgoing = await ParentLinkRequestService.requestLink(studentRow.handshakeCode, parentUserId, locale);
    if (!outgoing) {
      throw new Error("seed-parent-linkage: link request produced no outgoing row");
    }
    requestId = outgoing.id;
  } catch (error) {
    if (!(error instanceof ConflictError)) {
      throw error;
    }
    const pending = await ParentLinkRequestRepository.findPendingByPair(parentUserId, studentUserId);
    if (!pending) {
      throw new Error("seed-parent-linkage: link request conflicted but no pending row was found to confirm", {
        cause: error,
      });
    }
    requestId = pending.id;
  }
  await ParentLinkRequestService.respondToLinkRequest(requestId, true, studentUserId, locale);
  logger.info("Demo parent linked to demo student through the handshake flow");
}

/**
 * Demo-linkage seeder — connects the demo trio through PRODUCTION entry
 * points so a freshly seeded sandbox exercises the real parent-portal
 * flows end to end (teacher booking, linked-child gating, deep links).
 *
 * Two idempotent reconciliations: demo teacher cold-start certification
 * (without the `teacher` row every student booking attempt fails with
 * TEACHER_NOT_FOUND) and the demo parent ↔ demo student link (the parent
 * portal's link gate requires `students.parent_id`).
 *
 * Cross-seeder dependencies (the admin actor id) are wired by the master
 * controller and passed in — never resolved inside this seeder.
 */
export async function seedOrGet(adminActorId: number, locale = "en"): Promise<DemoLinkageState> {
  const teacherUserId = await resolveDemoUserId("teacher");
  const parentUserId = await resolveDemoUserId("parent");
  const studentUserId = await resolveDemoUserId("student");

  const teacherCertified = await certifyDemoTeacher(adminActorId, teacherUserId, locale);
  await linkDemoParentToStudent(parentUserId, studentUserId, locale);

  const studentRow = await StudentRepository.findById(studentUserId);
  const parentLinked = studentRow?.parentId !== null && studentRow?.parentId !== undefined;

  return { teacherCertified, parentLinked };
}
