/**
 * Shared admin-governance actor guards — the canonical import surface for
 * every admin-domain actor check. Consumers import from THIS module (never
 * from `admin-gate.helpers.ts` directly) so the relaxed BFLA actor gate and
 * the strict governance guard sit beside one another under a single import.
 *
 * Two variants:
 *  - {@linkcode assertActorAdmin}: relaxed BFLA gate (anonymous + role check
 *    only). Used by every admin-user-management method (list /
 *    detail / create / update / soft-delete). The documented GraphQL context
 *    governance window applies for the duration of an issued token; the
 *    relaxed gate intentionally does NOT re-evaluate governance state on
 *    every call — REQ-031 leaves the strict backport to a forward-referenced
 *    sibling ticket (D4) and keeps the existing methods byte-stable.
 *  - {@linkcode assertActiveActorAdmin}: strict governance gate (relaxed
 *    checks PLUS deterministic-order evaluation of `isDeleted` /
 *    `isBlocked` / `isSuspensionActive`). Used by governance mutations
 *    (suspend / block) where the blast radius is high and the context-level
 *    governance window MUST NOT apply.
 *
 * Denials from EITHER variant emit ZERO audit rows and perform ZERO writes —
 * the actor check happens BEFORE any transaction opens (JR-C-1 invariant).
 */
import { isSuspensionActive } from "@/backend/lib/auth/suspension-window";
import { ForbiddenError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { resolveAdminActorRow } from "@/backend/services/admin/admin-gate.helpers";
import type { DBTransaction } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

// Re-export the relaxed BFLA actor gate from its canonical home so consumers
// import all admin-domain actor guards from a single source. The
// implementation continues to live in `admin-gate.helpers.ts`; this
// forwarding export is the canonical import surface for callers.
export { assertActorAdmin } from "./admin-gate.helpers";

/**
 * Strict active-admin-actor assertion.
 *
 * Verifies the actor passes the relaxed BFLA gate (anonymous + role check)
 * AND is not in any governance-denial state. Denials are evaluated in
 * deterministic precedence order:
 *   1. `isDeleted === true` → `ForbiddenError(accountDeleted)` (deleted actor)
 *   2. `isBlocked === true` → `ForbiddenError(accountBlocked)` (blocked actor)
 *   3. `isSuspensionActive({...}, new Date())` →
 *      `ForbiddenError(accountSuspended)` (actively suspended actor)
 *
 * A LAPSED suspension PASSES — the predicate's strict `>` boundary
 * semantics (`endsAt > now`) restore access at the exact lapse instant
 * without any write (window honesty — REQ-019).
 *
 * The actor row is fetched ONCE via {@linkcode resolveAdminActorRow} (the
 * shared prelude in `admin-gate.helpers.ts` — the single source of the
 * anonymous / missing-row / non-admin ladder); the same row carries the
 * role field (checked by the prelude) and the five governance columns
 * (checked here) — no second query.
 *
 * Each denial emits ONE
 * `logger.logDomainError(message, { code, entity: "user", entityId })` and
 * performs ZERO writes / ZERO audit rows — the check runs BEFORE any
 * transaction opens (JR-C-1 invariant).
 *
 * @param actorId  the calling admin's user id (`0` = anonymous)
 * @param locale   the locale for the translated denial message
 * @param outerTx  optional transaction executor for in-tx actor reads
 */
export async function assertActiveActorAdmin(actorId: number, locale: string, outerTx?: DBTransaction): Promise<void> {
  const tErrors = getServerTranslations(locale).errorsTranslations;

  const actor = await resolveAdminActorRow(actorId, locale, outerTx);

  // Deterministic-order governance denials — deleted before blocked before
  // actively-suspended. A LAPSED suspension falls through to the implicit
  // pass (window honesty — no write releases the lapse). The order is the
  // canonical contract: deleted is the strongest invariant (the row is
  // gone-by-policy), blocked is the indefinite administrative deny, and the
  // suspension window is the only time-bounded state.
  if (actor.isDeleted === true) {
    logger.logDomainError("Admin operation denied: actor account deleted", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
    });
    throw new ForbiddenError(tErrors.accountDeleted);
  }

  if (actor.isBlocked === true) {
    logger.logDomainError("Admin operation denied: actor account blocked", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
    });
    throw new ForbiddenError(tErrors.accountBlocked);
  }

  if (
    isSuspensionActive(
      {
        suspended: actor.suspended,
        suspendedAt: actor.suspendedAt,
        suspendedPeriodDays: actor.suspendedPeriodDays,
      },
      new Date()
    )
  ) {
    logger.logDomainError("Admin operation denied: actor account suspended", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
    });
    throw new ForbiddenError(tErrors.accountSuspended);
  }
}
