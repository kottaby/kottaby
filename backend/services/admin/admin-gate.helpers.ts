/**
 * Admin actor-gate helpers — the defense-in-depth BFLA gate and the
 * audit-enum coercion shared by every admin-domain service.
 *
 * Extracted VERBATIM from `user-management.service.ts` (behavior-identical;
 * the DEV3-016 service + chaos suites are the byte-equivalence regression
 * lock). See `docs/admin/user-management.md`.
 */
import { UserRepository } from "@/backend/db/repo";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { toUserRole, UserRole } from "@/backend/enum/users/user-role.enum";
import { ForbiddenError, UnauthorizedError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import type { DBTransaction, UserSelectType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** Sentinel `actorId` value expressing an anonymous caller. */
const ANONYMOUS_ACTOR_ID = 0;

/**
 * Runtime guard over the raw `audit_logs.action_type` pgEnum string.
 * Fail-closed: a corrupt stored value surfaces as a resolver error rather
 * than an unsafe cast (same discipline as `toUserRole` on directory rows).
 */
export function toAuditActionType(raw: string): AuditActionType | null {
  switch (raw) {
    case "create":
      return AuditActionType.Create;
    case "update":
      return AuditActionType.Update;
    case "delete":
      return AuditActionType.Delete;
    case "override":
      return AuditActionType.Override;
    case "adjust":
      return AuditActionType.Adjust;
    case "suspend":
      return AuditActionType.Suspend;
    case "reactivate":
      return AuditActionType.Reactivate;
    default:
      return null;
  }
}

/**
 * Shared admin-actor prelude — the anonymous / missing-row / non-admin
 * ladder behind BOTH the relaxed {@linkcode assertActorAdmin} gate and the
 * strict `assertActiveActorAdmin` governance guard (in
 * `admin-guards.helpers.ts`). Returns the live actor row so strict
 * consumers can layer governance checks onto the SAME fetch (single-read
 * invariant). Anonymous callers (`actorId = 0`) receive
 * `UnauthorizedError`; missing rows and non-admin roles receive
 * `ForbiddenError`. Every denial emits exactly ONE bounded
 * `logger.logDomainError` call with the canonical
 * `{ code, entity: "user", entityId }` context and performs ZERO audit
 * rows / ZERO writes — the check runs BEFORE any transaction opens.
 *
 * The actor row is fetched via `UserRepository.findById`; only the `role`
 * field is read here. The `passwordHash` column is structurally present on
 * the fetched row (per `UserSelectType`) but is NEVER read, logged, or
 * returned anywhere — the canonical never-touch-this-field discipline.
 */
export async function resolveAdminActorRow(
  actorId: number,
  locale: string,
  outerTx?: DBTransaction
): Promise<UserSelectType> {
  const tErrors = getServerTranslations(locale).errorsTranslations;

  if (actorId === ANONYMOUS_ACTOR_ID) {
    logger.logDomainError("Admin operation denied: anonymous caller", {
      code: "UNAUTHORIZED",
      entity: "user",
      entityId: actorId,
    });
    throw new UnauthorizedError(tErrors.unauthorized);
  }

  const actor = await UserRepository.findById(actorId, outerTx);
  if (!actor) {
    logger.logDomainError("Admin operation denied: actor row missing", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
    });
    throw new ForbiddenError(tErrors.forbidden);
  }

  const role = toUserRole(actor.role);
  if (role !== UserRole.Admin) {
    logger.logDomainError("Admin operation denied: actor is not admin", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
    });
    throw new ForbiddenError(tErrors.forbidden);
  }

  return actor;
}

/**
 * Defense-in-depth BFLA gate — verifies the `actorId` resolves to a real
 * `admin`-role user before any work. Anonymous callers (`actorId = 0`)
 * receive `UnauthorizedError`; authenticated non-admins (or unresolvable
 * actors) receive `ForbiddenError`. Both denials emit ZERO audit rows
 * and perform ZERO writes — the actor check happens BEFORE any
 * transaction opens.
 *
 * Implemented by delegating to {@linkcode resolveAdminActorRow} (the shared
 * prelude) and discarding the returned row.
 */
export async function assertActorAdmin(actorId: number, locale: string, outerTx?: DBTransaction): Promise<void> {
  await resolveAdminActorRow(actorId, locale, outerTx);
}

/**
 * Defense-in-depth BFLA + governance gate — verifies the `actorId` resolves
 * to a real, `admin`-role, NON-governed user before any work. The role gate
 * reuses `assertActorAdmin` verbatim (single source of gate truth: anonymous
 * callers receive `UnauthorizedError`; missing or non-admin actors receive
 * `ForbiddenError`). The governance clause re-reads the actor row only after
 * the role gate has passed and FAILS CLOSED when that re-read comes back
 * empty (the actor was deleted between the two reads) — a missing re-read
 * throws `ForbiddenError` before any governance column is inspected. The
 * governance columns (`isDeleted`, `isBlocked`, `suspended`) are evaluated in
 * the deterministic order deleted → blocked → suspended so a multi-flagged
 * actor always surfaces the same denial. Every denial emits exactly ONE
 * `logger.logDomainError` and performs ZERO audit rows, ZERO writes, and
 * ZERO reads past the gate.
 */
export async function assertActorAdminActive(actorId: number, locale: string, outerTx?: DBTransaction): Promise<void> {
  await assertActorAdmin(actorId, locale, outerTx);
  const tErrors = getServerTranslations(locale).errorsTranslations;

  const actor = await UserRepository.findById(actorId, outerTx);
  if (!actor) {
    logger.logDomainError("Admin operation denied: actor row vanished between role gate and governance re-read", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
      locale,
    });
    throw new ForbiddenError(tErrors.forbidden);
  }
  if (actor.isDeleted) {
    logger.logDomainError("Admin operation denied: actor account deleted", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
      locale,
    });
    throw new ForbiddenError(tErrors.accountDeleted);
  }
  if (actor.isBlocked) {
    logger.logDomainError("Admin operation denied: actor account blocked", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
      locale,
    });
    throw new ForbiddenError(tErrors.accountBlocked);
  }
  if (actor.suspended) {
    logger.logDomainError("Admin operation denied: actor account suspended", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
      locale,
    });
    throw new ForbiddenError(tErrors.accountSuspended);
  }
}
