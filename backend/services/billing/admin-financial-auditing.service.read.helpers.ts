/**
 * AdminFinancialAuditingService read path — the module-scope read machinery
 * (the consistent-snapshot wrapper, the wallet ownership read, the teacher
 * name resolver) and the three paginated list implementations extracted
 * VERBATIM from `admin-financial-auditing.service.ts` (behavior-identical
 * extraction; zero logic change). The public surface stays the
 * `AdminFinancialAuditingService` namespace in the service file: the list
 * methods below back the namespace's read members as one-to-one delegation
 * targets, and the three mutations (approve / reject / adjust) remain
 * implemented inline in the namespace file. Nothing in this module is part
 * of the public API.
 *
 * Conventions carried over unchanged (per `backend/services/AGENTS.md`,
 * mirroring `WalletService`): the strict governance admin gate
 * (`assertActorAdminActive`, not the role-only gate) runs FIRST inside the
 * caller's transaction — role, then deleted → blocked → suspended, failing
 * closed on governed admins; the paired count + page reads share ONE
 * repeatable-read snapshot; every localized message resolves through the
 * `errorsTranslations` bundle; expected rejections log via
 * `logger.logDomainError` with bounded context only.
 */

import { db } from "@/backend/db";
import { StudentPaymentRepository, TeacherRepository, UserRepository, WalletRepository } from "@/backend/db/repo";
import { escapeLikeWildcards } from "@/backend/lib/db/escape-like-wildcards";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { NotFoundError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { assertActorAdminActive } from "@/backend/services/admin/admin-gate.helpers";
import { resolvePageBounds } from "@/backend/services/admin/user-management.helpers";
import { ADMIN_WALLET_CURRENCY_LABEL } from "@/backend/services/billing/admin-financial-auditing.service.helpers";
import type {
  AdminStudentPaymentPageReturnType,
  AdminStudentPaymentRow,
  AdminTeacherWalletProbe,
  AdminTeacherWalletReturnType,
  AdminWithdrawalQueuePageReturnType,
  AdminWithdrawalQueueRow,
  DBTransaction,
  NormalizedAdminPaymentFilters,
  WalletSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** Localized-error bundle type (the errorsTranslations namespace). */
type ErrorsTranslations = ReturnType<typeof getServerTranslations>["errorsTranslations"];

/**
 * Runs the paired count + page reads inside ONE consistent snapshot. When
 * the caller supplied a transaction, execution joins it as a nested block;
 * otherwise a fresh top-level transaction opens at the `repeatable read`
 * isolation level so the count and the listing observe the same committed
 * state.
 *
 * The guarantee covers the count + page PAIR — plus whatever the callback
 * reads before them (the wallet inspection's wallet probe and its
 * teacher-name resolution share the same snapshot, so the rendered balance
 * can never be older than the ledger rows beside it). The admin gate and
 * the mutation-path settlement probes are NOT part of this snapshot: the
 * gate runs first on the caller's transaction, and the settlement probes
 * run on a SEPARATE top-level transaction when no outer transaction is
 * supplied — best-effort, non-authoritative reads that no write decision
 * ever trusts (every guarded repo primitive re-asserts its predicate in
 * SQL; the probes exist for human-readable error disambiguation only).
 */
async function readInSnapshot<T>(
  outerTx: DBTransaction | undefined,
  fn: (tx: DBTransaction) => Promise<T>
): Promise<T> {
  if (outerTx) {
    return outerTx.transaction(fn);
  }
  return db.transaction(fn, { isolationLevel: "repeatable read" });
}

/**
 * Reads the wallet row for a known `walletId` on the caller's transaction —
 * the wallet → teacher ownership link for the audit contract. A missing row
 * cannot happen for a ledger row that just settled or adjusted (its FK
 * restricts the wallet), so a null here surfaces as a plain runtime error
 * (masked generic internal) rather than a fabricated identity.
 */
async function readWalletById(walletId: number, tx: DBTransaction): Promise<WalletSelectType> {
  const row = await WalletRepository.findById(walletId, tx);
  if (!row) {
    throw new Error(`AdminFinancialAuditingService: wallet row ${String(walletId)} vanished mid-transaction`);
  }
  return row;
}

/**
 * Resolves the teacher's display name for a teacher id: the probe carries it
 * when a wallet exists; the fallback covers the wallet-less teacher. The
 * teacher profile row must exist — the wallet FK targets the teacher table,
 * so a missing row is a genuine not-found (the localized teacher not-found
 * family), not an empty-name render.
 */
async function resolveTeacherName(
  teacherId: number,
  probe: AdminTeacherWalletProbe | null,
  t: ErrorsTranslations,
  tx: DBTransaction
): Promise<string> {
  if (probe) {
    return probe.teacherName;
  }
  const teacherProfile = await TeacherRepository.findById(teacherId, tx);
  if (!teacherProfile) {
    logger.logDomainError("Admin wallet inspection denied: teacher not found", {
      code: "NOT_FOUND",
      entity: "teacher",
      entityId: teacherId,
    });
    throw new NotFoundError("TEACHER", t.teacherNotFound);
  }
  const teacherUser = await UserRepository.findById(teacherId, tx);
  return teacherUser?.fullName ?? "";
}

/**
 * REQ-1 — the student payments ledger audit view: newest-first page over
 * `student_payments` joined with each student's display identity, filtered
 * by student / name search / status / gateway / date window.
 *
 * Pure read: zero writes, zero audit rows, and the happy path logs
 * nothing. The name-search substring is wildcard-escaped and wrapped as
 * `%…%` BEFORE the repository call — the repo binds the final pattern
 * directly to its `ilike` predicate without re-escaping (BO-SI rule).
 *
 * @param actorUserId  The acting admin's user id (never client input).
 * @param filters  Filter input copied field-by-field from the resolver
 *     (closed whitelist — nulls express "clear this filter").
 * @param page  1-based page number (`null` → 1).
 * @param pageSize Rows per page (`null` → the default 25).
 * @param locale  Locale for the localized validation message.
 * @param outerTx  Optional caller transaction to join for the reads.
 * @returns One honest page of typed payment rows.
 */
export async function listStudentPaymentsForAdmin(
  actorUserId: number,
  filters: NormalizedAdminPaymentFilters,
  page: number | null,
  pageSize: number | null,
  locale: string,
  outerTx?: DBTransaction
): Promise<AdminStudentPaymentPageReturnType> {
  return withTransaction(outerTx, async tx => {
    await assertActorAdminActive(actorUserId, locale, tx);

    const normalized: NormalizedAdminPaymentFilters = {
      studentId: filters.studentId ?? null,
      studentNameSearch:
        filters.studentNameSearch === null ? null : `%${escapeLikeWildcards(filters.studentNameSearch)}%`,
      status: filters.status ?? null,
      paymentGateway: filters.paymentGateway ?? null,
      from: filters.from ?? null,
      to: filters.to ?? null,
    };
    const { resolvedPage, resolvedPageSize, offset } = resolvePageBounds(page ?? 1, pageSize ?? undefined, locale);

    const [pageRows, totalCount] = await readInSnapshot(
      outerTx,
      async (snapshotTx): Promise<[AdminStudentPaymentRow[], number]> => {
        const count = await StudentPaymentRepository.countForAdminAudit(normalized, snapshotTx);
        const rows = await StudentPaymentRepository.listForAdminAudit(normalized, resolvedPageSize, offset, snapshotTx);
        return [rows, count];
      }
    );

    return { items: pageRows, totalCount, page: resolvedPage, pageSize: resolvedPageSize };
  });
}

/**
 * REQ-2 — inspects any teacher's wallet: the wallet row (`balance`,
 * `totalEarning` as decimal strings) plus one newest-first ledger page
 * with optional type/status/date-window filters.
 *
 * READ-ONLY by contract: creating/ensuring rows on read is forbidden — a
 * teacher without a wallet row renders the honest null-pair empty state
 * (both amounts `null`), NOT an error and NOT a fabricated wallet. The
 * teacher identity resolves from the wallet probe when a wallet exists,
 * else via a teacher → user fallback lookup; a teacher whose profile row
 * itself is missing is a genuine not-found (the wallet FK targets the
 * teacher table, so no wallet could ever exist for it). Snapshot
 * consistency: the wallet probe, the teacher-name resolution, and the
 * count + page pair share ONE consistent snapshot (`readInSnapshot`) — the
 * rendered `balance` can never be older than the ledger rows beside it.
 */
export async function getTeacherWalletForAdmin(
  actorUserId: number,
  teacherId: number,
  txFilters: Parameters<typeof WalletRepository.countTransactionsForAdmin>[1],
  page: number | null,
  pageSize: number | null,
  locale: string,
  outerTx?: DBTransaction
): Promise<AdminTeacherWalletReturnType> {
  const t = getServerTranslations(locale).errorsTranslations;

  return withTransaction(outerTx, async tx => {
    await assertActorAdminActive(actorUserId, locale, tx);
    const { resolvedPage, resolvedPageSize, offset } = resolvePageBounds(page ?? 1, pageSize ?? undefined, locale);

    // Snapshot consistency: the wallet probe, the teacher-name resolution,
    // and the count + page pair share ONE consistent snapshot, so the
    // rendered balance can never be older than the ledger rows beside it.
    return readInSnapshot(outerTx, async (snapshotTx): Promise<AdminTeacherWalletReturnType> => {
      const probe = await WalletRepository.findAdminWalletProbe(teacherId, snapshotTx);
      const teacherName = await resolveTeacherName(teacherId, probe, t, snapshotTx);

      // Honest empty state: no wallet row → null-pair amounts + empty page.
      if (!probe) {
        return {
          balance: null,
          totalEarning: null,
          currency: ADMIN_WALLET_CURRENCY_LABEL,
          teacherId,
          teacherName,
          transactions: [],
          totalCount: 0,
          page: resolvedPage,
          pageSize: resolvedPageSize,
        };
      }

      const count = await WalletRepository.countTransactionsForAdmin(probe.wallet.id, txFilters, snapshotTx);
      const rows = await WalletRepository.listTransactionsForAdmin(
        probe.wallet.id,
        txFilters,
        resolvedPageSize,
        offset,
        snapshotTx
      );

      return {
        balance: probe.wallet.balance,
        totalEarning: probe.wallet.totalEarning,
        currency: ADMIN_WALLET_CURRENCY_LABEL,
        teacherId,
        teacherName,
        transactions: rows,
        totalCount: count,
        page: resolvedPage,
        pageSize: resolvedPageSize,
      };
    });
  });
}

/**
 * REQ-3 — the pending-withdrawal settlement queue: every
 * `type=withdrawal ∧ status=pending` ledger row (analytics-counter parity)
 * joined with the teacher's display name and the wallet's current
 * balance, oldest first (longest-waiting first).
 *
 * Pure read: zero writes, zero audit rows. The paired count + listing
 * share ONE repeatable-read snapshot (same contract as the other lists);
 * the probe reads around it remain best-effort, non-authoritative reads
 * outside that snapshot (see `readInSnapshot`).
 */
export async function listPendingWithdrawalsForAdmin(
  actorUserId: number,
  page: number | null,
  pageSize: number | null,
  locale: string,
  outerTx?: DBTransaction
): Promise<AdminWithdrawalQueuePageReturnType> {
  return withTransaction(outerTx, async tx => {
    await assertActorAdminActive(actorUserId, locale, tx);
    const { resolvedPage, resolvedPageSize, offset } = resolvePageBounds(page ?? 1, pageSize ?? undefined, locale);

    const [pageRows, totalCount] = await readInSnapshot(
      outerTx,
      async (snapshotTx): Promise<[AdminWithdrawalQueueRow[], number]> => {
        const count = await WalletRepository.countPendingWithdrawals(snapshotTx);
        const rows = await WalletRepository.listPendingWithdrawals(resolvedPageSize, offset, snapshotTx);
        return [rows, count];
      }
    );

    return { items: pageRows, totalCount, page: resolvedPage, pageSize: resolvedPageSize };
  });
}

// Exported for the namespace file's mutation paths only (the read helpers
// `readInSnapshot` / `resolveTeacherName` stay module-private here).
/**
 * The wallet ownership read for the audit contract — the namespace file's
 * mutation paths reuse this module-private helper through this re-export.
 */
export { readWalletById };
