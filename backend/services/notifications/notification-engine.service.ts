/**
 * NotificationEngine — the platform's SINGLE write path into the `notifications`
 * table (emit surface; the inbox surface joins this file in Task 2.7).
 *
 * Write-path contract (persist-first, publish-after-commit):
 *  1. Validate the emit input BEFORE any DB/cache access — every failure is a
 *     localized `ValidationError` (`emit-validation.ts`).
 *  2. Optional idempotency claim (`emit-idempotency.ts`): a duplicate claim
 *     returns the PRIOR receipt with NO insert and NO publish; any cache
 *     outage fails OPEN with one structured warn (documented deviation D5 —
 *     a domain event is never hostage to cache health).
 *  3. Persist through `NotificationRepository` inside the caller's transaction
 *     (SAVEPOINT-aware `withTransaction(outerTx)`) — or, when no `tx` is
 *     supplied, inside the engine's OWN commit.
 *  4. Caller-`tx` path returns a `NotificationDeliveryReceipt` WITHOUT
 *     publishing — the CALLER invokes `publishReceipts(receipts, locale)` only
 *     after its own transaction resolves (ghost pushes are impossible by
 *     construction: nothing is published for uncommitted rows).
 *  5. Own-commit path publishes exactly ONCE per batch — a single
 *     `publishFanout` carrying the FULL recipient list — AFTER the insert
 *     transaction has committed. A publish failure at that point logs
 *     `NOTIFICATION_DELIVERY_DEGRADED` and RESOLVES: the persisted inbox row
 *     is the truth and the client's catch-up refetch self-heals (REQ-011).
 *
 * The engine never translates, templates, or mutates caller copy — `title` /
 * `body` are stored verbatim (REQ-015/028). User-facing strings resolve
 * through `getServerTranslations(locale)` (property access only).
 *
 * Dependency seams (INJECTED, no module state beyond one bounded default-
 * transport memo): `options.transport` (the fan-out port; tests/journeys pass
 * `SpiedFanoutTransport`) and `options.cache` (the idempotency claim port).
 * The DEFAULT transport resolves ONCE per process through the env-keyed
 * factory; the claim cache has NO default — keyed emits without an injected
 * cache run fail-open with a warn.
 */
import { db } from "@/backend/db";
import { NotificationRepository } from "@/backend/db/repo";
import type { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { logger } from "@/backend/lib/logger";
import {
  attemptEmitClaim,
  buildEmitClaimKey,
  type NotificationIdempotencyClaimCache,
  storeEmitReceiptQuietly,
  warnEmitIdempotencyUnavailable,
} from "@/backend/services/notifications/emit-idempotency";
import { validateEmitBatchInput, validateEmitInput } from "@/backend/services/notifications/emit-validation";
import type { NotificationFanoutTransport } from "@/backend/services/notifications/realtime/fanout-transport";
import { resolveFanoutTransport } from "@/backend/services/notifications/realtime/fanout-transport.factory";
import type {
  DBTransaction,
  NotificationDeliveryReceipt,
  NotificationEmitBatchInput,
  NotificationEmitInput,
  NotificationInsertType,
  NotificationReturnType,
  RealtimeNotificationPayload,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * Per-call injection seam for the emit surface — an OPTIONAL trailing options
 * parameter appended AFTER `tx?` (planned §4.1 call shapes stay valid:
 * production callers keep `emitForUser(input, locale)` /
 * `emitForUser(input, locale, tx)`; tests and journeys append options).
 */
export interface NotificationEngineCallOptions {
  /** Injected fan-out transport. Tests/journeys pass `SpiedFanoutTransport`. */
  readonly transport?: NotificationFanoutTransport;
  /** Injected idempotency-claim cache port (SET-NX-EX semantics). */
  readonly cache?: NotificationIdempotencyClaimCache;
}

/**
 * The process-wide default fan-out transport, resolved ONCE through the
 * env-keyed selection factory (repeated resolution would construct a fresh
 * Redis client + TCP connection per emit). This single memoized promise is
 * the module's ONLY state — a bounded one-slot cache, never grown, never
 * keyed by request data. Tests and journeys always inject their own
 * transport, so the default is exercised only by production callers.
 */
let defaultFanoutTransportPromise: Promise<NotificationFanoutTransport> | undefined;

function resolveDefaultFanoutTransport(): Promise<NotificationFanoutTransport> {
  // Single-slot bounded memo (the module's ONLY state): resolve once per
  // process; every subsequent emit reuses the same transport instance.
  defaultFanoutTransportPromise ??= resolveFanoutTransport();
  return defaultFanoutTransportPromise;
}

/**
 * Runs `fn` inside a transaction. When `outerTx` is provided (caller-owned
 * unit) the work runs in a SAVEPOINT on the outer transaction — failures roll
 * back only the savepoint and the outer transaction stays usable; when
 * `outerTx` is undefined the engine opens its own top-level `db.transaction`,
 * whose resolution IS the commit (the publish-after-commit ordering below is
 * provable from this structure: no publish line is reachable before the
 * `withTransaction` call resolves).
 */
async function withTransaction<T>(
  outerTx: DBTransaction | undefined,
  fn: (tx: DBTransaction) => Promise<T>
): Promise<T> {
  if (outerTx) {
    return outerTx.transaction(fn);
  }
  return db.transaction(fn);
}

/** Copy fields shared by the single-recipient and batch emit contracts. */
type NotificationEmitCopy = Pick<
  NotificationEmitInput,
  "type" | "title" | "body" | "relatedEntityType" | "relatedEntityId"
>;

/**
 * Field-by-field mapping into `NotificationInsertType` (BOPLA — no object
 * spreads; only whitelisted columns are ever written). `createdAt` is the
 * batch's single captured `now` (REQ-047) and `isRead` is always emitted
 * false — the read latch is one-directional and user-owned.
 */
function toNotificationInsert(userId: number, copy: NotificationEmitCopy, now: Date): NotificationInsertType {
  return {
    userId,
    type: copy.type,
    title: copy.title,
    body: copy.body,
    isRead: false,
    relatedEntityType: copy.relatedEntityType,
    relatedEntityId: copy.relatedEntityId,
    createdAt: now,
  };
}

/**
 * Allowlisted realtime payload projection of one persisted row (BOPLA —
 * field-by-field). `userId` is excluded by construction: the payload travels
 * only on the recipient's own authenticated socket, so the recipient is
 * implied and no account identifier rides the wire (REQ-021).
 */
function toRealtimePayload(row: NotificationReturnType): RealtimeNotificationPayload {
  return {
    v: 1,
    kind: "notification",
    data: {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      relatedEntityType: row.relatedEntityType,
      relatedEntityId: row.relatedEntityId,
      createdAt: row.createdAt,
    },
  };
}

/**
 * Publishes one realtime fan-out, degrading on ANY failure (transport
 * resolution error or publish rejection) to a single structured
 * `NOTIFICATION_DELIVERY_DEGRADED` log and a resolve — never a throw. The
 * persisted inbox remains authoritative (REQ-011/043).
 */
async function publishAfterCommit(
  userIds: readonly number[],
  payload: RealtimeNotificationPayload,
  locale: string,
  options: NotificationEngineCallOptions | undefined
): Promise<void> {
  try {
    const transport = options?.transport ?? (await resolveDefaultFanoutTransport());
    await transport.publishFanout(userIds, payload);
  } catch (error) {
    logger.logDomainError("Notification realtime delivery degraded; the persisted inbox remains authoritative", {
      code: "NOTIFICATION_DELIVERY_DEGRADED",
      entity: "notifications",
      locale,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

/**
 * Pre-insert idempotency claim for one emission. Returns the PRIOR receipt
 * when a duplicate claim is replayable (the caller must return it WITHOUT
 * inserting or publishing); `undefined` means "proceed with the write"
 * (claim won, or fail-open degradation already warned).
 */
async function claimOrPriorReceipt(
  idempotencyKey: string | undefined,
  userIds: readonly number[],
  type: NotificationType,
  options: NotificationEngineCallOptions | undefined
): Promise<NotificationDeliveryReceipt | undefined> {
  if (idempotencyKey === undefined) {
    return undefined;
  }
  const cache = options?.cache;
  if (cache === undefined) {
    // Keyed emit with no claim cache injected — dedupe capability absent:
    // fail open with one structured warn (deviation D5).
    warnEmitIdempotencyUnavailable();
    return undefined;
  }
  const claimKey = buildEmitClaimKey(userIds, type, idempotencyKey);
  const outcome = await attemptEmitClaim(cache, claimKey);
  if (outcome.status === "duplicate") {
    return outcome.receipt;
  }
  return undefined;
}

export namespace NotificationEngine {
  /**
   * Emits one notification to one recipient — the platform's canonical
   * single-recipient write path.
   *
   *  - No `tx`: the engine commits its own unit, then publishes exactly ONE
   *    `publishFanout([userId], payload)` AFTER the commit, then returns the
   *    created row.
   *  - With `tx`: the row is written inside the caller's transaction and a
   *    delivery receipt is returned WITHOUT publishing — the caller publishes
   *    via `publishReceipts` after its transaction resolves (REQ-012/042).
   *  - With an `idempotencyKey` that is already claimed: the PRIOR receipt is
   *    returned with NO insert and NO publish (REQ-016).
   *
   * @throws ValidationError  on the FIRST violated input rule — BEFORE any DB
   *     or cache access.
   */
  export async function emitForUser(
    input: NotificationEmitInput,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationReturnType | NotificationDeliveryReceipt> {
    const t = getServerTranslations(locale).errorsTranslations;

    validateEmitInput(input, t.validation);

    const priorReceipt = await claimOrPriorReceipt(input.idempotencyKey, [input.userId], input.type, options);
    if (priorReceipt !== undefined) {
      return priorReceipt;
    }

    // One `now` per emission (REQ-047) — captured after validation/claim,
    // before the insert unit.
    const now = new Date();
    const insert = toNotificationInsert(input.userId, input, now);

    if (tx !== undefined) {
      const row = await withTransaction(tx, txArg => NotificationRepository.createReturning(insert, txArg));
      return { notifications: [row], recipientUserIds: [input.userId] };
    }

    // Own-commit path: withTransaction(undefined) resolves ONLY once the
    // insert's transaction has committed — everything below is post-commit.
    const row = await withTransaction(undefined, txArg => NotificationRepository.createReturning(insert, txArg));
    const receipt: NotificationDeliveryReceipt = { notifications: [row], recipientUserIds: [input.userId] };
    if (input.idempotencyKey !== undefined && options?.cache !== undefined) {
      await storeEmitReceiptQuietly(
        options.cache,
        buildEmitClaimKey([input.userId], input.type, input.idempotencyKey),
        receipt
      );
    }
    await publishAfterCommit([input.userId], toRealtimePayload(row), locale, options);
    return row;
  }

  /**
   * Fans one notification out to a cohort — every recipient gets an identical
   * copy of the shared payload.
   *
   *  - ONE multi-row `INSERT … RETURNING` inside ONE transaction unit
   *    (REQ-013): either every row lands or none does.
   *  - ONE `now` per batch (REQ-047): sibling rows share a byte-identical
   *    `createdAt` (ordering tiebreaks deterministically by `id` DESC).
   *  - ONE `publishFanout(userIds, payload)` carrying the FULL recipient list
   *    on the own-commit path — never per-recipient publishes.
   *  - With `tx`: rows are written in the caller's unit and the receipt is
   *    returned WITHOUT publishing (the caller's post-commit step is
   *    `publishReceipts`). The idempotency receipt is only ever STORED after
   *    a durable commit, so a rolled-back caller transaction can never ghost
   *    a future replay into returning nonexistent rows.
   *
   * @throws ValidationError  on the FIRST violated input rule (including an
   *     empty or duplicate-carrying recipient list) — BEFORE any DB or cache
   *     access.
   */
  export async function emitForUsers(
    input: NotificationEmitBatchInput,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt> {
    const t = getServerTranslations(locale).errorsTranslations;

    validateEmitBatchInput(input, t.validation);

    const priorReceipt = await claimOrPriorReceipt(input.idempotencyKey, input.userIds, input.type, options);
    if (priorReceipt !== undefined) {
      return priorReceipt;
    }

    // ONE `now` per batch (REQ-047) — every sibling row shares this instant.
    const now = new Date();
    const inserts = input.userIds.map(userId => toNotificationInsert(userId, input, now));

    if (tx !== undefined) {
      const rows = await withTransaction(tx, txArg => NotificationRepository.createManyReturning(inserts, txArg));
      return { notifications: rows, recipientUserIds: [...input.userIds] };
    }

    // Own-commit path: withTransaction(undefined) resolves ONLY once the
    // batch's transaction has committed — everything below is post-commit.
    const rows = await withTransaction(undefined, txArg => NotificationRepository.createManyReturning(inserts, txArg));
    const receipt: NotificationDeliveryReceipt = {
      notifications: rows,
      recipientUserIds: [...input.userIds],
    };
    if (input.idempotencyKey !== undefined && options?.cache !== undefined) {
      await storeEmitReceiptQuietly(
        options.cache,
        buildEmitClaimKey(input.userIds, input.type, input.idempotencyKey),
        receipt
      );
    }
    const representativeRow = rows.at(0);
    if (representativeRow !== undefined) {
      await publishAfterCommit(input.userIds, toRealtimePayload(representativeRow), locale, options);
    }
    return receipt;
  }

  /**
   * Post-commit publisher for tx-owning emitters: publishes one fan-out PER
   * receipt (each carrying that receipt's FULL recipient list, payload
   * projected from its representative first row). Callers invoke this ONLY
   * after their own transaction has resolved successfully (REQ-012/042).
   *
   * Publish failures are swallowed WITH a structured
   * `NOTIFICATION_DELIVERY_DEGRADED` log per occurrence (the only sanctioned
   * degradation in this surface — REQ-011/055): the persisted rows remain the
   * truth and clients self-heal through catch-up refetch. An empty receipts
   * array (or a degenerate receipt with no rows) is a documented no-op.
   *
   * Receipts are published strictly IN ORDER via an index-recursive sweep
   * (the repo's no-await-in-loop pattern), not `Promise.all` — a transport
   * outage on receipt N must not race ahead of receipt N−1's hand-off.
   */
  export async function publishReceipts(
    receipts: readonly NotificationDeliveryReceipt[],
    locale: string,
    options?: NotificationEngineCallOptions
  ): Promise<void> {
    await publishReceiptsFromIndex(receipts, 0, locale, options);
  }
}

/** Sequential in-order publish sweep — see `NotificationEngine.publishReceipts`. */
async function publishReceiptsFromIndex(
  receipts: readonly NotificationDeliveryReceipt[],
  index: number,
  locale: string,
  options: NotificationEngineCallOptions | undefined
): Promise<void> {
  if (index >= receipts.length) {
    return;
  }
  const receipt = receipts[index];
  const representativeRow = receipt.notifications.at(0);
  if (representativeRow !== undefined) {
    await publishAfterCommit(receipt.recipientUserIds, toRealtimePayload(representativeRow), locale, options);
  }
  await publishReceiptsFromIndex(receipts, index + 1, locale, options);
}
