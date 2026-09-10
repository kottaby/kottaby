/**
 * SessionLifecycleService — governance re-checks (module extraction,
 * behavior-identical): the defense-in-depth re-assertion of the platform
 * login/SSR fail-closed gate at the service boundary.
 *
 * The login/SSR boundary enforces the same gate — these checks are the
 * second layer for callers holding still-valid tokens whose account was
 * deleted/blocked/suspended (or, for the arbitration surface, demoted)
 * AFTER login: the DB row is the authority, never the token. Denials are
 * the typed `ForbiddenError` (`extensions.code` = `FORBIDDEN`, 403 per
 * the error-code taxonomy) — the authorization class for an authorization
 * denial, never the Conflict class.
 *
 * The public surface stays the `SessionLifecycleService` namespace in
 * `session-lifecycle.service.ts`. Nothing in this module is part of the
 * public API.
 */

import { UserRepository } from "@/backend/db/repo";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { ForbiddenError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import type { DBTransaction } from "@/backend/types";
import type { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * The admin role widened to a plain string: the user row's `role` is the
 * raw pg-enum string union, so the arbitration caller's defense-in-depth
 * role re-assertion compares against the enum member's string identity —
 * the vocabulary still flows from the enum.
 */
const USER_ADMIN_ROLE: string = UserRole.Admin;

/**
 * The teacher role widened to a plain string: the user row's `role` is the
 * raw pg-enum string union, so the session-report caller's defense-in-depth
 * role re-assertion compares against the enum member's string identity —
 * the vocabulary still flows from the enum.
 */
const USER_TEACHER_ROLE: string = UserRole.Teacher;

/**
 * Re-asserts the platform governance gate for a caller at the service
 * boundary (deleted/blocked/suspended accounts are denied; a vanished
 * caller fails closed). The denial is a typed `ForbiddenError`.
 */
export async function assertActorGovernanceClean(
  actorUserId: number,
  t: ReturnType<typeof getServerTranslations>["errorsTranslations"],
  tx?: DBTransaction
): Promise<void> {
  const actor = await UserRepository.findById(actorUserId, tx);
  if (!actor || actor.isDeleted || actor.isBlocked || actor.suspended) {
    logger.logDomainError("Session action denied: caller account is governed", {
      code: "FORBIDDEN",
      entity: "session",
      entityId: actorUserId,
    });
    throw new ForbiddenError(t.forbidden);
  }
}

/**
 * The ONE governance + role re-assertion implementation beneath every
 * role-carrying wrapper in this module: the account must be
 * governance-clean (deleted/blocked/suspended are denied; a vanished
 * caller fails closed) AND the DB row's `role` must equal `allowedRole`.
 * Each leg logs exactly one bounded domain error and throws the typed
 * `ForbiddenError` with the SAME localized message key (`t.forbidden`).
 *
 * `denialLogPrefix` keeps each surface's log vocabulary intact (the
 * arbitration surface logs "Session arbitration denied", the report
 * surface logs "Session report denied") and `roleDenialNoun` carries the
 * grammatical role noun ("an admin" / "a teacher") — the byte-exact log
 * text stays with the public wrapper, the logic lives here exactly once.
 */
async function assertRoleGovernanceClean(
  actorUserId: number,
  allowedRole: string,
  denialLogPrefix: string,
  roleDenialNoun: string,
  t: ReturnType<typeof getServerTranslations>["errorsTranslations"],
  tx?: DBTransaction
): Promise<void> {
  const actor = await UserRepository.findById(actorUserId, tx);
  if (!actor || actor.isDeleted || actor.isBlocked || actor.suspended) {
    logger.logDomainError(`${denialLogPrefix}: caller account is governed`, {
      code: "FORBIDDEN",
      entity: "session",
      entityId: actorUserId,
    });
    throw new ForbiddenError(t.forbidden);
  }
  if (actor.role !== allowedRole) {
    logger.logDomainError(`${denialLogPrefix}: caller is not ${roleDenialNoun}`, {
      code: "FORBIDDEN",
      entity: "session",
      entityId: actorUserId,
    });
    throw new ForbiddenError(t.forbidden);
  }
}

/**
 * Re-asserts the FULL arbitration authorization for a caller at the
 * service boundary: the account must be governance-clean AND hold the
 * admin role. The GraphQL scope gate enforces the same role leg — this
 * is the defense-in-depth layer for still-valid tokens held by an
 * account that was demoted or governed after login (the DB row is the
 * authority, never the token). The denial is the typed `ForbiddenError`.
 */
export async function assertAdminGovernanceClean(
  actorUserId: number,
  t: ReturnType<typeof getServerTranslations>["errorsTranslations"],
  tx?: DBTransaction
): Promise<void> {
  await assertRoleGovernanceClean(actorUserId, USER_ADMIN_ROLE, "Session arbitration denied", "an admin", t, tx);
}

/**
 * Re-asserts the FULL session-report authorization for a caller at the
 * service boundary: the account must be governance-clean AND hold the
 * teacher role. The GraphQL scope gate enforces the same role leg — this
 * is the defense-in-depth layer for still-valid tokens held by an
 * account that was demoted or governed after login (the DB row is the
 * authority, never the token). A governance-clean student/parent/admin
 * caller is STILL denied here: the session-report write surface is
 * teacher-only. The denial is the typed `ForbiddenError`.
 */
export async function assertTeacherGovernanceClean(
  actorUserId: number,
  t: ReturnType<typeof getServerTranslations>["errorsTranslations"],
  tx?: DBTransaction
): Promise<void> {
  await assertRoleGovernanceClean(actorUserId, USER_TEACHER_ROLE, "Session report denied", "a teacher", t, tx);
}
