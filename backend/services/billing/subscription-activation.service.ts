/**
 * SubscriptionActivationService — the webhook-facing activation flow for
 * subscription purchases.
 *
 * The route layer (transport) hands this service an ALREADY-VERIFIED
 * `PaymentWebhookEvent` (signature + size + parse happen upstream); the
 * service owns the settlement decision and every side effect. The flow is a
 * fixed sequence of fail-closed stages:
 *
 *   1. reference correlation — a non-transactional read finds the
 *      subscription by its gateway `paymentReference`. An unknown reference
 *      mutates NOTHING, logs one bounded warning (never an error storm) and
 *      answers `{ processed: false }` so the gateway can stop retrying;
 *   2. settlement quarantine — the stored payment row's amount/currency are
 *      compared with the event's claimed values. Any disagreement mutates
 *      NOTHING and logs one `logger.error` carrying correlation ids only
 *      (never raw payloads, never financial values): settlement integrity
 *      beats liveness;
 *   3. `confirmed` — ONE transaction decides: the payment row's status is
 *      read first for PATH SELECTION ONLY (every state change below is
 *      decided by a guarded UPDATE that re-verifies the predicate itself —
 *      the guards are the arbiter, never the pre-read). `failed` → the
 *      delivery is REJECTED and logged (a decided payment is terminal — no
 *      silent upgrade); `paid` → idempotent replay; `pending` → the
 *      activation sequence: the plan row is re-read in-transaction (a NULL
 *      balance lane QUARANTINES the delivery — an admin can clear a plan's
 *      lane after the purchase commits — nothing mutated, one correlated
 *      error log, `{ processed: false }`), `activatePendingOnce` flips the
 *      subscription (zero rows ⇒ replay: NO credit, NO second
 *      notification), `markPaidOnce` decides the payment, the full
 *      `sessionCount` is credited to the plan's lane, and the
 *      `payment_confirmation` notification is persisted in the SAME
 *      transaction. The realtime fan-out publishes strictly AFTER the
 *      transaction commits — a publish failure never rolls back the
 *      committed activation (the persisted inbox row remains authoritative);
 *   4. `failed` — a single guarded decision write on the payment row only;
 *      the subscription stays `pending` (operator follow-up owns it), no
 *      credit, no notification. Zero rows ⇒ the payment was already decided
 *      — an idempotent replay ack.
 *
 * Notification copy is composed in the caller-supplied locale (the webhook
 * is server-to-server: no session, no per-recipient locale resolution).
 * The emit is deliberately keyless — the dedupe obligation is owned by the
 * activation itself: the guarded `activatePendingOnce` zero-row arbiter
 * guarantees the emit (and the credit) run exactly once per subscription.
 *
 * `outerTx` is the canonical test-path seam (a caller-owned transaction runs
 * the flow as a SAVEPOINT on it); production callers omit it and the flow
 * opens its own transaction. When supplied, it ALSO carries the two
 * pre-transaction reads and the failed-path decision write, so the whole
 * delivery participates in the caller's transaction instead of escaping to
 * the pool.
 */

import { PlanRepository, StudentPaymentRepository, StudentRepository, SubscriptionRepository } from "@/backend/db/repo";
import { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { NotificationEngine } from "@/backend/services/notifications";
import type {
  DBTransaction,
  NotificationDeliveryReceipt,
  NotificationEmitInput,
  PaymentWebhookEvent,
  PlanSelectType,
  StudentPaymentSelectType,
  SubscriptionSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** Milliseconds per day — the activation window arithmetic (`intervalDays`). */
const MS_PER_DAY = 86_400_000;

/**
 * Client-safe copy for the activation flow's internal-invariant conflicts.
 * These conflicts are unreachable through the write guards; the DIAGNOSTIC
 * detail belongs to the adjacent correlated log line — never to the webhook
 * caller's error envelope, which the gateway (not an operator) reads.
 */
const PAYMENT_PROCESSING_CONFLICT_MESSAGE = "Payment could not be processed.";

/**
 * Fail-closed abort for an unreachable mid-activation state — one bounded
 * diagnostic log (the exact breach, correlated ids only) plus the client-safe
 * conflict copy. Throwing from here rolls the whole activation unit back.
 */
function abortActivation(detail: string, context: Record<string, unknown>): never {
  logger.error(`Subscription activation aborted: ${detail} — unit rolled back`, context);
  throw new ConflictError(PAYMENT_PROCESSING_CONFLICT_MESSAGE);
}

/**
 * Reads the plan row that feeds BOTH the activation window (`intervalDays`)
 * and the credit (`balanceLane`, `sessionCount`). The FK restrict guarantees
 * the row exists — a vanished row fails the unit closed — and a catalog
 * deactivation after a settled payment does not void the activation. A NULL
 * lane is the REACHABLE quarantine (an admin can clear a plan's balance lane
 * after the purchase commits): one correlated `logger.error`, nothing
 * mutated, and a `null` return tells the caller to end the unit with
 * `{ processed: false }` — the sibling quarantine posture (the gateway
 * stops retrying; operator follow-up owns the settled charge). A lane is
 * never guessed from plan copy.
 *
 * @returns The lane-configured plan row, or `null` when the plan's balance
 *     lane is unconfigured and the delivery must quarantine.
 */
async function readActivationPlan(
  subscription: SubscriptionSelectType,
  reference: string,
  tx: DBTransaction
): Promise<(PlanSelectType & { balanceLane: Exclude<PlanSelectType["balanceLane"], null> }) | null> {
  const plan = await PlanRepository.findById(subscription.planId, tx);
  if (plan === null) {
    abortActivation("plan row vanished mid-activation", {
      reference,
      subscriptionId: subscription.id,
      planId: subscription.planId,
    });
  }
  if (plan.balanceLane === null) {
    logger.error("Payment webhook quarantined: plan balance lane is not configured — nothing mutated", {
      reference,
      subscriptionId: subscription.id,
      planId: subscription.planId,
    });
    return null;
  }
  // The spread re-asserts the narrowed lane on the returned row shape.
  return { ...plan, balanceLane: plan.balanceLane };
}

/**
 * The payment-status vocabulary, widened to plain strings: the stored row's
 * `status` is the raw pg-enum string union, so the path-selection comparisons
 * test the enum member's string identity — the vocabulary still flows from
 * the enum, never from a bare literal.
 */
const PAYMENT_PAID: string = PaymentStatus.Paid;
const PAYMENT_FAILED: string = PaymentStatus.Failed;

/**
 * The lane vocabulary, widened to plain strings for the same stored-union
 * comparison treatment.
 */
const LANE_HIFZ: string = SubscriptionCreditLane.Hifz;
const LANE_TAJWEED: string = SubscriptionCreditLane.Tajweed;

/**
 * Maps the plan row's stored balance-lane value onto the strongly-typed enum
 * the credit primitive requires — FAIL-CLOSED over the closed pg-enum
 * vocabulary: every writable member is mapped explicitly (never a cast), and
 * an unknown stored value is an internal invariant breach (vocabulary drift
 * between the DB enum and this code) that aborts the activation unit closed
 * — the tx rolls back, nothing is credited — instead of silently crediting a
 * DIFFERENT lane than the plan designated (loud over silent-wrong; the same
 * discipline as the sibling mappers). Unreachable through the pgEnum.
 */
function subscriptionCreditLaneOf(
  lane: PlanSelectType["balanceLane"] & string,
  correlation: { readonly reference: string; readonly subscriptionId: number; readonly planId: number }
): SubscriptionCreditLane {
  if (lane === LANE_HIFZ) {
    return SubscriptionCreditLane.Hifz;
  }
  if (lane === LANE_TAJWEED) {
    return SubscriptionCreditLane.Tajweed;
  }
  return abortActivation("stored plan balance lane is not a member of the closed credit-lane vocabulary", {
    ...correlation,
    storedLane: lane,
  });
}

/**
 * What the confirmed-path transaction resolved to: a terminal non-processing
 * answer, an idempotent replay ack, or the unpublished delivery receipt of a
 * freshly committed activation.
 */
type ConfirmedTxOutcome =
  | { readonly processed: false }
  | { readonly processed: true; readonly replayed: true }
  | { readonly receipt: NotificationDeliveryReceipt };

/**
 * Emits the payment-confirmation notification INSIDE the caller's
 * transaction (persist-first) and returns the unpublished receipt. Keyless
 * by design — the activation guard is the dedupe. The engine's caller-tx
 * contract always returns the receipt; a bare row would be an engine breach.
 */
async function emitConfirmationNotification(
  subscription: SubscriptionSelectType,
  planTitle: string,
  locale: string,
  tx: DBTransaction
): Promise<NotificationDeliveryReceipt> {
  const tNotifications = getServerTranslations(locale).notificationsTranslations;
  const emitInput: NotificationEmitInput = {
    userId: subscription.userId,
    type: NotificationType.PaymentConfirmation,
    title: tNotifications.eventPaymentConfirmedTitle,
    body: tNotifications.eventPaymentConfirmedBody(planTitle),
    relatedEntityType: "subscription",
    relatedEntityId: subscription.id,
  };

  const emitted = await NotificationEngine.emitForUser(emitInput, locale, tx);
  if (!("notifications" in emitted)) {
    // Unreachable through the engine's caller-tx contract — log the exact
    // breach, throw the client-safe copy.
    abortActivation("notification engine returned a row where the caller-tx receipt contract requires a receipt", {
      subscriptionId: subscription.id,
      userId: subscription.userId,
    });
  }
  return emitted;
}

/**
 * The confirmed-delivery path — one transaction, fixed write order
 * (path-selection read → plan read + lane quarantine → guarded activation →
 * guarded payment decision → lane credit → in-tx notification persist).
 * Any failure rolls the whole unit back: the subscription stays pending and
 * the gateway's retry re-classifies against the settled state. The
 * unconfigured-lane quarantine is the one mutation-free early exit: no
 * write precedes the plan read, so the unit ends with
 * `{ processed: false }` and nothing committed.
 */
async function confirmPayment(
  subscription: SubscriptionSelectType,
  payment: StudentPaymentSelectType,
  reference: string,
  locale: string,
  outerTx?: DBTransaction
): Promise<{ processed: boolean; replayed?: boolean }> {
  const composed: ConfirmedTxOutcome = await withTransaction(outerTx, async tx => {
    // Path selection ONLY — this read decides which guarded path MAY run;
    // the guarded updates below re-verify the state server-side, so a
    // concurrent decision writer can never be overridden by a stale read.
    const current = await StudentPaymentRepository.findBySubscriptionId(subscription.id, tx);
    if (current === null) {
      // The append-only ledger makes a vanished row unreachable — fail
      // closed rather than act on a broken contract.
      abortActivation("subscription has no payment ledger row mid-activation", {
        reference,
        subscriptionId: subscription.id,
      });
    }
    if (current.status === PAYMENT_FAILED) {
      // Late `confirmed` after `failed` — replay-incompatible, no silent
      // upgrade: the failed decision is terminal, so the delivery is
      // rejected with zero mutations and one bounded log.
      logger.logDomainError("Payment webhook rejected: confirmed delivery arrived after the payment failed", {
        code: "PAYMENT_REPLAY_INCOMPATIBLE",
        entity: "student_payments",
        entityId: payment.id,
        reference,
        outcome: "confirmed",
        locale,
      });
      return { processed: false };
    }
    if (current.status === PAYMENT_PAID) {
      // Already decided paid — the earlier delivery won: idempotent replay.
      return { processed: true, replayed: true };
    }

    // The plan row feeds BOTH the activation window and the credit — the
    // dedicated read-and-guard helper fails closed on the unreachable
    // states and quarantines (`null`) on the reachable unconfigured lane.
    const plan = await readActivationPlan(subscription, reference, tx);
    if (plan === null) {
      // The unconfigured-lane quarantine: zero writes have run in this unit
      // (the two reads above are its only statements), so returning here
      // commits nothing — the transaction ends mutation-free (the sibling
      // quarantine posture) and the gateway receives the honest
      // `{ processed: false }` ack while operator follow-up owns the
      // settled charge until the lane is re-configured.
      return { processed: false };
    }

    // The atomic pending → active transition — the guarded UPDATE is the
    // arbiter. Zero rows ⇒ an already-activated replay under today's writer
    // set (the activation predicate is this status's only writer so far):
    // NO credit, NO second notification. When a non-activation status
    // writer (suspension/cancellation/expiry) lands, revisit this branch to
    // distinguish replay from terminal-state suppression.
    const now = new Date();
    const activated = await SubscriptionRepository.activatePendingOnce(
      subscription.id,
      {
        startDate: now,
        // Catalog validation caps intervalDays at 3650 days (ten years) — this window arithmetic can never overflow.
        endDate: new Date(now.getTime() + plan.intervalDays * MS_PER_DAY),
        paymentVerifiedAt: now,
      },
      tx
    );
    if (activated === null) {
      return { processed: true, replayed: true };
    }

    // The payment decision — same transaction, same guard discipline. Zero
    // rows here would mean the subscription flipped while its pending
    // decision disappeared; rolling back keeps the pair consistent (never
    // active without paid) and the retry re-classifies.
    const decided = await StudentPaymentRepository.markPaidOnce(subscription.id, tx);
    if (decided === null) {
      // Zero rows here means the pair state broke mid-flight — fail closed.
      abortActivation("pending payment decision wrote zero rows mid-activation", {
        reference,
        subscriptionId: subscription.id,
      });
    }

    // The lane credit — the full session count, relative accumulation on the
    // plan's designated lane, same transaction. Zero rows ⇒ the student row
    // vanished (unreachable through the FK restrict) — fail closed.
    const credited = await StudentRepository.creditLaneBalance(
      subscription.userId,
      // Fail-closed lane resolution — an unknown stored lane aborts the
      // unit closed instead of crediting a lane the plan never designated.
      subscriptionCreditLaneOf(plan.balanceLane, { reference, subscriptionId: subscription.id, planId: plan.id }),
      plan.sessionCount,
      tx
    );
    if (credited === null) {
      // The FK restrict makes a vanished student unreachable — fail closed.
      abortActivation("student row vanished before the lane credit", {
        reference,
        subscriptionId: subscription.id,
        studentId: subscription.userId,
      });
    }

    // Persist-first notification — the row commits with the activation.
    return { receipt: await emitConfirmationNotification(subscription, plan.title, locale, tx) };
  });

  if ("receipt" in composed) {
    // The unit committed — now (and only now) push. The engine degrades any
    // publish failure to one structured log and resolves: the persisted
    // inbox row remains authoritative, and the committed activation never
    // rolls back.
    await NotificationEngine.publishReceipts([composed.receipt], locale);
    return { processed: true };
  }
  return composed;
}

/**
 * The failed-delivery path — a single guarded decision write on the payment
 * row. The subscription row is untouched (it stays pending for operator
 * follow-up), no credit, no notification.
 */
async function failPayment(
  subscriptionId: number,
  outerTx?: DBTransaction
): Promise<{ processed: boolean; replayed?: boolean }> {
  const decided = await withTransaction(outerTx, tx => StudentPaymentRepository.markFailedOnce(subscriptionId, tx));
  // Zero rows ⇒ the payment was already decided (replay or late delivery):
  // ack as replay so the gateway stops retrying a settled outcome.
  return decided === null ? { processed: true, replayed: true } : { processed: true };
}

export namespace SubscriptionActivationService {
  /**
   * Processes one ALREADY-VERIFIED payment webhook event and classifies the
   * delivery. Never throws for gateway-outcome content: unknown references,
   * settlement quarantines, replay-incompatible deliveries, and an
   * unconfigured plan balance lane answer `{ processed: false }` with zero
   * mutations.
   *
   * The NULL-lane path is REACHABLE — unlike the vanished-row breaches, no
   * write guard prevents an admin from clearing a plan's balance lane after
   * the purchase has committed — so it does NOT throw: it rides the same
   * quarantine channel as the settlement mismatches. The quarantine
   * channel: nothing is mutated (no write precedes the plan read, so the
   * transaction unit ends empty), ONE `logger.error` carries the
   * correlation ids (reference, subscriptionId, planId — never financial
   * values), and the honest `{ processed: false }` ack lets the gateway
   * stop retrying while operator follow-up owns the settled charge until
   * the lane is re-configured. Only true infrastructural invariant breaches
   * (rows the FK restrict makes unremovable) surface as errors and roll the
   * activation unit back.
   *
   * Return contract:
   *  - `{ processed: true }` — the delivery was applied: confirmed ⇒ the
   *    activation committed (credit + notification persisted, publish
   *    post-commit); failed ⇒ the payment decision committed.
   *  - `{ processed: true, replayed: true }` — the delivery was ALREADY
   *    applied by an earlier delivery: zero new rows, zero double credit.
   *  - `{ processed: false }` — the delivery was NOT applied and mutated
   *    nothing: unknown reference, settlement quarantine, an unconfigured
   *    plan balance lane at activation time, or a `confirmed` arriving
   *    after the payment failed (replay-incompatible).
   *
   * @param event  The verified gateway event (the transport already checked
   *     signature, size, and envelope — the service trusts the payload shape).
   * @param locale  Active locale for the localized notification copy and
   *     error messages.
   * @param outerTx  Optional caller-owned transaction (test path): the flow
   *     runs as a SAVEPOINT on it. Production callers omit it.
   */
  export async function processWebhookEvent(
    event: PaymentWebhookEvent,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<{ processed: boolean; replayed?: boolean }> {
    // Stage 1 — reference correlation: the gateway reference is the only
    // lookup key; an unknown one mutates nothing. (Production: a bare
    // pool read. Test path: the caller's transaction.)
    const subscription = await SubscriptionRepository.findByPaymentReference(event.reference, outerTx);
    if (subscription === null) {
      logger.logDomainError("Payment webhook: unknown payment reference — nothing mutated", {
        code: "PAYMENT_REFERENCE_UNKNOWN",
        entity: "subscriptions",
        reference: event.reference,
        outcome: event.outcome,
        locale,
      });
      return { processed: false };
    }

    // Stage 2 — settlement quarantine: the stored ledger row is the source
    // of truth for what was purchased. A missing row, or an amount/currency
    // disagreement with the event, mutates NOTHING and logs correlation ids
    // only (never raw payloads, never financial values).
    const payment = await StudentPaymentRepository.findBySubscriptionId(subscription.id, outerTx);
    if (payment === null) {
      logger.error("Payment webhook quarantined: subscription has no payment ledger row — nothing mutated", {
        reference: event.reference,
        outcome: event.outcome,
        subscriptionId: subscription.id,
      });
      return { processed: false };
    }
    if (payment.amount !== event.amount || payment.currency !== event.currency) {
      logger.error("Payment webhook quarantined: settlement data disagrees with the stored payment — nothing mutated", {
        reference: event.reference,
        outcome: event.outcome,
        subscriptionId: subscription.id,
        paymentId: payment.id,
      });
      return { processed: false };
    }

    if (event.outcome === "confirmed") {
      return confirmPayment(subscription, payment, event.reference, locale, outerTx);
    }
    return failPayment(subscription.id, outerTx);
  }
}
