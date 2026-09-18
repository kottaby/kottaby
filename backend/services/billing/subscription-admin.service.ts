/**
 * SubscriptionAdminService — admin-gated lifecycle operations on the
 * `subscriptions` root (the extend surface lives here; the sibling
 * admin flows join the same namespace as they ship).
 *
 * Every mutation mirrors the shipped billing admin surface: the acting
 * admin's id is a required parameter that is re-asserted against the
 * `users` table (defense in depth behind the GraphQL role scope) BEFORE
 * any write, the guarded single-statement transition plus its exactly-one
 * audit row share ONE `withTransaction` block (a rolled-back mutation
 * leaves no window shift and no audit row), and denials emit one bounded
 * `logger.logDomainError` with ids only — never student-identifying
 * data.
 *
 * Extend semantics: the new window end is computed SERVER-SIDE from the
 * row's stored `endDate` (a client can never dictate a target date).
 * Genuinely new extensions stack legitimately — each call re-reads the
 * row and extends from its current window — while an identical replay
 * that lost the guarded race surfaces an idempotent conflict instead of
 * a second shift.
 */

import { SubscriptionRepository } from "@/backend/db/repo/billing/subscription.repository";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { SubscriptionStatus } from "@/backend/enum/billing/subscription-status.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { assertActorAdmin } from "@/backend/services/admin/admin-gate.helpers";
import { AuditService } from "@/backend/services/admin/audit.service";
import { MAX_INTERVAL_DAYS } from "@/backend/services/billing/plan-catalog.helpers";
import {
  buildSubscriptionAuditContract,
  toSubscriptionAdminDomainError,
  toSubscriptionAdminReturnType,
} from "@/backend/services/billing/subscription-admin.helpers";
import type { DBTransaction, ExtendSubscriptionSubmitInput, SubscriptionReturnType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** Milliseconds per day — the extension window arithmetic. */
const MS_PER_DAY = 86_400_000;

/**
 * The active-status member, widened to a plain string: the read row's
 * `status` column is the raw pg-enum string union, so the guard compares
 * against the enum member's string identity — the vocabulary flows from
 * the enum, never from a bare literal (the session-lifecycle guard
 * idiom).
 */
const STATUS_ACTIVE: string = SubscriptionStatus.Active;

export namespace SubscriptionAdminService {
  /**
   * Extends an `active` subscription's validity window by a whole number
   * of days.
   *
   * Fail-closed sequence: the day count is validated pre-DB, the admin
   * gate re-asserts the actor's role with zero writes on denial, and one
   * transaction owns the read, the guarded `extendActiveOnce` transition,
   * and the exactly-one audit row (`Update` on the `subscription` entity,
   * details `{ previousEndDate, newEndDate, addedDays }` — ISO strings
   * and an integer only). A row that is missing, not `active`, or
   * windowless denies with the localized active-only conflict; an
   * extension that would push the resulting validity window past the
   * catalog's interval ceiling denies with the localized validation
   * reject; a replay that lost the guarded race (the window moved
   * between this transaction's read and its write) surfaces the
   * idempotent conflict and mints nothing.
   *
   * @param input  The validated submit payload (subscription id + day
   *     count); the id arrives pre-coerced through the strict numeric
   *     parse, the day count is re-validated here.
   * @param actorId  The acting admin's user id (never client input).
   * @param locale  Locale for the localized denial messages.
   * @param tx  Optional caller transaction to join (test path:
   *     SAVEPOINT) — the whole flow participates in the caller's unit.
   * @returns The extended row in its canonical read shape.
   */
  export async function extendSubscription(
    input: ExtendSubscriptionSubmitInput,
    actorId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<SubscriptionReturnType> {
    const tErrors = getServerTranslations(locale).errorsTranslations;

    // Pre-DB input validation — a fractional or non-positive day count is
    // a caller bug, never a database matter. Whole days only: the window
    // arithmetic multiplies this value into Date milliseconds.
    if (!Number.isInteger(input.days) || input.days < 1) {
      logger.logDomainError("Subscription extend denied: day count is not a positive whole number", {
        code: "VALIDATION",
        entity: "subscriptions",
        entityId: input.subscriptionId,
      });
      throw new ValidationError(tErrors.badRequest);
    }

    // Defense-in-depth BFLA gate — zero writes, zero audit rows on denial.
    await assertActorAdmin(actorId, locale, tx);

    try {
      return await withTransaction(tx, async scopedTx => {
        const subscription = await SubscriptionRepository.findById(input.subscriptionId, scopedTx);
        if (subscription?.status !== STATUS_ACTIVE || subscription.endDate === null) {
          logger.logDomainError("Subscription extend denied: row missing, not active, or windowless", {
            code: "CONFLICT",
            entity: "subscriptions",
            entityId: input.subscriptionId,
          });
          throw new ConflictError(tErrors.subscriptionAdmin.notActive);
        }

        const previousEndDate = subscription.endDate;
        const newEndDate = new Date(previousEndDate.getTime() + input.days * MS_PER_DAY);

        // The resulting validity window stays inside the catalog's interval
        // ceiling, measured from the period's start (a legacy row without a
        // start stamp is measured from its current window end so the guard
        // can never silently pass an unbounded extension).
        const windowAnchor = subscription.startDate ?? previousEndDate;
        if (newEndDate.getTime() - windowAnchor.getTime() > MAX_INTERVAL_DAYS * MS_PER_DAY) {
          logger.logDomainError("Subscription extend denied: resulting window exceeds the interval ceiling", {
            code: "VALIDATION",
            entity: "subscriptions",
            entityId: input.subscriptionId,
          });
          throw new ValidationError(tErrors.subscriptionAdmin.prorationOverflow);
        }

        // The guarded single UPDATE is the write decision: its WHERE
        // predicate re-asserts `active` AND the read window end, so a
        // concurrent writer (expiry sweep, cancellation) or an identical
        // double-submit loses the race here (zero rows) instead of
        // shifting the window twice.
        const extended = await SubscriptionRepository.extendActiveOnce(
          subscription.id,
          { previousEndDate, newEndDate },
          scopedTx
        );
        if (extended === null) {
          logger.logDomainError("Subscription extend denied: window moved concurrently (replay)", {
            code: "CONFLICT",
            entity: "subscriptions",
            entityId: subscription.id,
          });
          throw new ConflictError(tErrors.conflict);
        }

        await AuditService.createAuditLog(
          buildSubscriptionAuditContract(actorId, AuditActionType.Update, subscription.id, {
            previousEndDate: previousEndDate.toISOString(),
            newEndDate: newEndDate.toISOString(),
            addedDays: input.days,
          }),
          scopedTx
        );

        return toSubscriptionAdminReturnType(extended, tErrors);
      });
    } catch (error: unknown) {
      throw toSubscriptionAdminDomainError(error, tErrors);
    }
  }
}
