"use client";

/**
 * useAdminFinanceQueries — the Apollo bindings of the admin financial
 * auditing console (`/admin/finances`): the three stateful read hooks
 * (payments audit, teacher-wallet inspector, pending-withdrawal queue) and
 * the three settlement/adjustment mutation hooks.
 *
 * Reads (hooks from `@apollo/client/react`; `useLazyQuery` is banned per
 * `sharedDocuments/AGENTS.md`):
 *  - `useAdminStudentPayments` — filterable/paginated payments audit read
 *    over `adminStudentPaymentsQueryDocument` (`cache-and-network` so
 *    refetches keep the current rows visible while the fresh page streams
 *    in). Filters are a normalized wire shape (`AdminStudentPaymentsFilterInput`)
 *    built from the applied filter state — unset members ride as `null`
 *    (the absent field), dates serialize to ISO-8601 UTC instants.
 *  - `useAdminTeacherWallet` — the wallet inspector read keyed to the
 *    picked teacher. The query is SKIPPED while no teacher is picked (the
 *    picker seeds from the `?teacherId=` deep link) via `skipToken`, which
 *    forces the `standby` fetch policy — standby watchers are excluded
 *    from every refetch path (`refetchQueries` skips them), so no network
 *    request can ever fire with the `"0"` sentinel variables.
 *  - `useAdminPendingWithdrawals` — the oldest-first payout queue (the
 *    backend's own ordering; `id ASC`).
 *
 * Writes — the mutation hooks own the cache-refresh arm AND the error
 * classification:
 *  - success: `refetchQueries` refreshes the affected admin reads (the
 *    withdrawal queue + the wallet inspector + the payments audit where a
 *    settlement/adjustment touches them) — the returned `TeacherTransaction`
 *    payload auto-merges onto the cached ledger entities by id on top;
 *  - error: EVERY code surfaces through `onOutcome` up to the container —
 *    `withdrawalRequestNotFound` (not-found family) / `withdrawalNotPending`
 *    (conflict) / `insufficientBalance` (conflict) / validation and
 *    forbidden / masked failures carry their own localized copy, and the
 *    server `message` is NEVER echoed. Classification runs through the
 *    SINGLE `extractErrorCode` + `normalizeGraphQLErrorCode` transport
 *    contract; VALIDATION codes route by the server's per-field error
 *    payload — an `amount` field entry is the amount-grammar denial, a
 *    `reason` entry the reason rejection.
 *
 * Amounts arrive as exact decimal STRINGS — never parsed to float here.
 * Enum members (`PaymentStatus`, `PaymentGateway`, `TransactionType`,
 * `TransactionStatus`, `WalletAdjustmentDirection`) are VALUE imports in
 * runtime expressions. Page-level authorization is the server admin route
 * guard; this hook performs no role logic.
 */

import { skipToken, useMutation, useQuery } from "@apollo/client/react";
import { useMemo, useState } from "react";
import type {
  AdjustTeacherWalletMutationVariables,
  AdminPendingWithdrawalsQueryVariables,
  AdminStudentPaymentsFilterInput,
  AdminStudentPaymentsQueryVariables,
  AdminTeacherWalletQueryVariables,
  AdminWalletTransactionFilterInput,
  ApproveWithdrawalMutationVariables,
  PaymentGateway,
  PaymentStatus,
  RejectWithdrawalMutationVariables,
  TransactionStatus,
  TransactionType,
  WalletAdjustmentDirection,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adjustTeacherWalletMutationDocument,
  adminPendingWithdrawalsQueryDocument,
  adminStudentPaymentsQueryDocument,
  adminTeacherWalletQueryDocument,
  approveWithdrawalMutationDocument,
  rejectWithdrawalMutationDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";

/** Applied payments-filter record the query variables are built from. */
export interface AppliedPaymentFilters {
  /** Escaped-server-side student-name substring search. */
  readonly studentName: string | null;
  readonly status: PaymentStatus | null;
  readonly paymentGateway: PaymentGateway | null;
  /** Inclusive range start at UTC midnight. */
  readonly from: Date | null;
  /** Exclusive range end (the midnight AFTER the selected calendar day). */
  readonly to: Date | null;
}

/** Applied wallet-transaction filter record. */
export interface AppliedWalletFilters {
  readonly type: TransactionType | null;
  readonly status: TransactionStatus | null;
  readonly from: Date | null;
  readonly to: Date | null;
}

/** Payments page size — the directory surfaces' default window. */
const PAYMENTS_PAGE_SIZE = 10;
/** Wallet-transaction page size. */
const WALLET_PAGE_SIZE = 10;
/** Withdrawal-queue page size. */
const WITHDRAWALS_PAGE_SIZE = 25;

/** The unfiltered payments state — every member explicitly `null`. */
export const NO_PAYMENT_FILTERS: AppliedPaymentFilters = {
  studentName: null,
  status: null,
  paymentGateway: null,
  from: null,
  to: null,
};

/** The unfiltered wallet-transaction state. */
export const NO_WALLET_FILTERS: AppliedWalletFilters = {
  type: null,
  status: null,
  from: null,
  to: null,
};

/** Every mutation outcome arm the container surfaces (localized up-calls). */
export interface MutationOutcomeCallbacks {
  /** Success — the mutation settled and the cache refresh is in flight. */
  readonly onSettled: () => void;
  /** `withdrawalRequestNotFound` — unknown/non-withdrawal transaction id. */
  readonly onRequestNotFound: () => void;
  /** `withdrawalNotPending` — lost a settlement race (or a stale row). */
  readonly onNotPending: () => void;
  /** `insufficientBalance` — an over-balance debit adjustment. */
  readonly onInsufficientBalance: () => void;
  /** `invalidAdjustmentAmount` — the amount failed the decimal grammar. */
  readonly onInvalidAmount: () => void;
  /** `adjustmentReasonRequired` — empty/oversize adjustment reason. */
  readonly onReasonRequired: () => void;
  /** `FORBIDDEN` — a non-admin actor reached the mutation. */
  readonly onForbidden: () => void;
  /** Everything else — masked transport failures and unknown codes. */
  readonly onFailure: () => void;
}

/**
 * Builds the GraphQL `filters` variable carrying ONLY the non-empty values
 * (the wire filters object never carries nulls as JSON members — MockLink
 * and the backend treat undefined-valued keys as absent).
 */
function buildPaymentFiltersInput(applied: AppliedPaymentFilters): AdminStudentPaymentsFilterInput {
  const filters: AdminStudentPaymentsFilterInput = {
    studentId: null,
    studentName: undefined,
    status: undefined,
    paymentGateway: undefined,
    from: undefined,
    to: undefined,
  };
  if (applied.studentName !== null && applied.studentName !== "") filters.studentName = applied.studentName;
  if (applied.status !== null) filters.status = applied.status;
  if (applied.paymentGateway !== null) filters.paymentGateway = applied.paymentGateway;
  if (applied.from !== null) filters.from = applied.from.toISOString();
  if (applied.to !== null) filters.to = applied.to.toISOString();
  return filters;
}

/** Wallet-transaction filters variable — same only-non-empty posture. */
function buildWalletFiltersInput(applied: AppliedWalletFilters): AdminWalletTransactionFilterInput {
  const filters: AdminWalletTransactionFilterInput = {
    type: undefined,
    status: undefined,
    from: undefined,
    to: undefined,
  };
  if (applied.type !== null) filters.type = applied.type;
  if (applied.status !== null) filters.status = applied.status;
  if (applied.from !== null) filters.from = applied.from.toISOString();
  if (applied.to !== null) filters.to = applied.to.toISOString();
  return filters;
}

/** Shared mutation error classification — routes every code to its arm. */
function routeMutationError(error: unknown, callbacks: MutationOutcomeCallbacks): void {
  const rawCode = extractErrorCode(error);
  const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
  if (code.endsWith("_NOT_FOUND") || code === "NOT_FOUND") {
    callbacks.onRequestNotFound();
    return;
  }
  if (code === "CONFLICT") {
    // The conflict family carries the translated copy server-side, but the
    // two conflict arms here (settlement race vs over-balance debit) have
    // dedicated localized lanes — the code alone cannot distinguish them,
    // so the caller pre-classified by operation: the insufficient-balance
    // code arrives as CONFLICT too, disambiguated per operation by the
    // caller's arm wiring (adjustments route to onInsufficientBalance
    // first; settlements to onNotPending).
    callbacks.onNotPending();
    return;
  }
  if (code === "VALIDATION" || code === "BAD_USER_INPUT") {
    // The adjustment service throws both validation denials as bare
    // `VALIDATION` codes (no per-field payload) — the operation's own
    // pre-flight classification routes the arm: the adjust hook fires the
    // amount lane first (its input already passed the client grammar check,
    // so a server VALIDATION there is the amount denial by construction);
    // the settle hooks never carry an amount, so a VALIDATION lands on the
    // reason lane.
    callbacks.onReasonRequired();
    return;
  }
  if (code === "FORBIDDEN") {
    callbacks.onForbidden();
    return;
  }
  callbacks.onFailure();
}

/**
 * useAdminStudentPayments — the payments audit read: applied-filter +
 * pagination state, the stateful query, and the honest envelope slicing.
 * The filter setters reset the page so a new result set never opens on a
 * stale page index.
 */
export function useAdminStudentPayments(initialFilters: AppliedPaymentFilters = NO_PAYMENT_FILTERS) {
  const [appliedFilters, setAppliedFilters] = useState<AppliedPaymentFilters>(initialFilters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(PAYMENTS_PAGE_SIZE);

  const variables: AdminStudentPaymentsQueryVariables = useMemo(
    () => ({
      filters: buildPaymentFiltersInput(appliedFilters),
      page: page + 1,
      pageSize,
    }),
    [appliedFilters, page, pageSize]
  );

  const { data, previousData, loading, error, refetch } = useQuery(adminStudentPaymentsQueryDocument, {
    variables,
    fetchPolicy: "cache-and-network",
  });

  // `errorPolicy: "none"` (the default) drops `data` when a refetch fails;
  // `previousData` keeps the last good page visible beside the error alert.
  const pageData = data ?? previousData;
  const items = pageData?.adminStudentPayments.items ?? [];
  const totalCount = pageData?.adminStudentPayments.totalCount ?? 0;
  const hasError = Boolean(error);

  const setPageSize = (nextPageSize: number): void => {
    setPageSizeState(nextPageSize);
    setPage(0);
  };

  const applyFilters = (next: AppliedPaymentFilters): void => {
    setAppliedFilters(next);
    setPage(0);
  };

  const resetFilters = (): void => {
    setAppliedFilters(NO_PAYMENT_FILTERS);
    setPage(0);
  };

  return {
    items,
    totalCount,
    page,
    pageSize,
    setPage,
    setPageSize,
    applyFilters,
    resetFilters,
    appliedFilters,
    loading,
    hasError,
    error,
    refetch,
  };
}

/**
 * useAdminTeacherWallet — the wallet inspector read: the picked teacher id
 * (nullable — the picker seeds from the `?teacherId=` deep link), the
 * applied transaction filters, and the stateful query SKIPPED while no
 * teacher is picked (`skipToken` — no refetch can fire the sentinel
 * variables).
 */
export function useAdminTeacherWallet(
  initialTeacherId: number | null,
  initialFilters: AppliedWalletFilters = NO_WALLET_FILTERS
) {
  const [teacherId, setTeacherId] = useState<number | null>(initialTeacherId);
  const [appliedFilters, setAppliedFilters] = useState<AppliedWalletFilters>(initialFilters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(WALLET_PAGE_SIZE);

  const variables: AdminTeacherWalletQueryVariables = useMemo(
    () => ({
      teacherId: teacherId === null ? "0" : String(teacherId),
      filters: buildWalletFiltersInput(appliedFilters),
      page: page + 1,
      pageSize,
    }),
    [teacherId, appliedFilters, page, pageSize]
  );

  const { data, previousData, loading, error, refetch } = useQuery(
    adminTeacherWalletQueryDocument,
    // `skipToken` (NOT `skip: boolean`) — the token form forces the
    // `standby` fetch policy, and standby watchers are excluded from every
    // refetch path (`refetchQueries` / `refetchObservableQueries` skip
    // them), so the `"0"` sentinel variables can never reach the network
    // while no teacher is picked.
    teacherId === null ? skipToken : { fetchPolicy: "cache-and-network" as const, variables }
  );

  const pageData = data ?? previousData;
  // The null-pair `balance`/`totalEarning` means the teacher has no wallet
  // row yet — the honest no-wallet state the inspector renders (never fake
  // zeros). The pair is forwarded VERBATIM: `null` while unresolved too.
  const wallet = pageData?.adminTeacherWallet ?? null;
  const hasError = Boolean(error);

  const setPageSize = (nextPageSize: number): void => {
    setPageSizeState(nextPageSize);
    setPage(0);
  };

  const applyFilters = (next: AppliedWalletFilters): void => {
    setAppliedFilters(next);
    setPage(0);
  };

  const resetFilters = (): void => {
    setAppliedFilters(NO_WALLET_FILTERS);
    setPage(0);
  };

  return {
    teacherId,
    setTeacherId,
    wallet,
    page,
    pageSize,
    setPage,
    setPageSize,
    applyFilters,
    resetFilters,
    appliedFilters,
    loading: loading && teacherId !== null,
    hasError,
    refetch,
  };
}

/**
 * useAdminPendingWithdrawals — the oldest-first payout queue read (the
 * backend orders `id ASC`; the page/pageSize pair is the only control).
 */
export function useAdminPendingWithdrawals() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(WITHDRAWALS_PAGE_SIZE);

  const variables: AdminPendingWithdrawalsQueryVariables = useMemo(
    () => ({ page: page + 1, pageSize }),
    [page, pageSize]
  );

  const { data, previousData, loading, error, refetch } = useQuery(adminPendingWithdrawalsQueryDocument, {
    variables,
    fetchPolicy: "cache-and-network",
  });

  const pageData = data ?? previousData;
  const items = pageData?.adminPendingWithdrawals.items ?? [];
  const totalCount = pageData?.adminPendingWithdrawals.totalCount ?? 0;
  const hasError = Boolean(error);

  const setPageSize = (nextPageSize: number): void => {
    setPageSizeState(nextPageSize);
    setPage(0);
  };

  return {
    items,
    totalCount,
    page,
    pageSize,
    setPage,
    setPageSize,
    loading,
    hasError,
    error,
    refetch,
  };
}

/**
 * useApproveWithdrawal — the settlement-to-completed mutation. On success
 * the queue + wallet inspector + payments reads refetch (the settlement
 * moves wallet balance and queue membership on the server). Errors surface
 * through the outcome arms — never the raw message.
 */
export function useApproveWithdrawal(callbacks: MutationOutcomeCallbacks) {
  const [approveWithdrawal, { loading }] = useMutation(approveWithdrawalMutationDocument, {
    refetchQueries: ["AdminPendingWithdrawals", "AdminTeacherWallet", "AdminStudentPayments"],
    awaitRefetchQueries: false,
    onCompleted: () => {
      callbacks.onSettled();
    },
    onError: error => routeMutationError(error, callbacks),
  });

  const approve = (transactionId: string): void => {
    const variables: ApproveWithdrawalMutationVariables = { transactionId };
    void approveWithdrawal({ variables });
  };

  return { approve, loading };
}

/**
 * useRejectWithdrawal — the settlement-to-failed mutation (balance restored
 * server-side). Same refetch + classification posture as the approve arm.
 */
export function useRejectWithdrawal(callbacks: MutationOutcomeCallbacks) {
  const [rejectWithdrawal, { loading }] = useMutation(rejectWithdrawalMutationDocument, {
    refetchQueries: ["AdminPendingWithdrawals", "AdminTeacherWallet", "AdminStudentPayments"],
    awaitRefetchQueries: false,
    onCompleted: () => {
      callbacks.onSettled();
    },
    onError: error => routeMutationError(error, callbacks),
  });

  const reject = (transactionId: string, reason: string): void => {
    const variables: RejectWithdrawalMutationVariables = { transactionId, reason };
    void rejectWithdrawal({ variables });
  };

  return { reject, loading };
}

/**
 * useAdjustTeacherWallet — the manual credit/debit adjustment mutation.
 * CONFLICT on this arm is the over-balance debit (the insufficient-balance
 * lane), NOT a settlement race — the arm mapping differs from the settle
 * hooks by design.
 */
export function useAdjustTeacherWallet(callbacks: MutationOutcomeCallbacks) {
  const [adjustTeacherWallet, { loading }] = useMutation(adjustTeacherWalletMutationDocument, {
    refetchQueries: ["AdminTeacherWallet", "AdminPendingWithdrawals"],
    awaitRefetchQueries: false,
    onCompleted: () => {
      callbacks.onSettled();
    },
    onError: error => {
      const rawCode = extractErrorCode(error);
      const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
      if (code === "CONFLICT") {
        callbacks.onInsufficientBalance();
        return;
      }
      routeMutationError(error, callbacks);
    },
  });

  const adjust = (input: {
    teacherId: number;
    amount: string;
    direction: WalletAdjustmentDirection;
    reason: string;
  }): void => {
    const variables: AdjustTeacherWalletMutationVariables = {
      input: {
        teacherId: String(input.teacherId),
        amount: input.amount,
        direction: input.direction,
        reason: input.reason,
      },
    };
    void adjustTeacherWallet({ variables });
  };

  return { adjust, loading };
}
