"use client";

/**
 * WithdrawalQueuePanel — the withdrawal payout queue tab of the admin
 * financial auditing console (`/admin/finances`): the oldest-first queue of
 * pending withdrawal requests over the settle (approve / reject) and
 * wallet-inspection actions.
 *
 * Queue columns (desktop table + mobile cards): teacher, amount (the
 * requester's reserved wallet balance at read time), requested-at
 * timestamp, and the row's status headline. The row actions are the
 * Approve confirm dialog (no reason field) and the Reject dialog (mandatory
 * reason) — the mutations live in the panel's own
 * `useApproveWithdrawal` / `useRejectWithdrawal` seams, and EVERY outcome
 * surfaces a container-level snackbar (success / error lanes — the raw
 * server `message` is NEVER echoed). On success the affected admin reads
 * refetch (the settlement moves wallet balance and queue membership on the
 * server).
 *
 * Loading renders stable-key skeleton rows/cards; a zero queue renders the
 * empty state (`withdrawalsEmpty`); a failed query renders the shared
 * retry alert; a FORBIDDEN denial renders the shared denied-notice
 * fallback.
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors, `*Outlined` icons.
 */

import { PendingActionsOutlined as EmptyIcon } from "@mui/icons-material";
import {
  Alert,
  AlertTitle,
  Box,
  Card,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { type ReactNode, useState } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { NoticeSnackbar } from "@/frontend/components/ui/NoticeSnackbar";
import type { AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items } from "@/frontend/graphql/generated/gql/graphql";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { formatMoneyAmount } from "@/frontend/views/admin/analytics/platform-analytics-display";
import { DirectoryHeaderCell } from "@/frontend/views/admin/directory-shared/DirectoryHeaderCell";
import {
  directoryPanelCardSx,
  directorySkeletonCardSx,
  directoryTableCardSx,
} from "@/frontend/views/admin/directory-shared/directory-skins";
import { AdminFinancePaginationBar } from "@/frontend/views/admin/finances/AdminFinancePaginationBar";
import { ApproveWithdrawalDialog } from "@/frontend/views/admin/finances/ApproveWithdrawalDialog";
import { FinanceTableFooter } from "@/frontend/views/admin/finances/FinanceTableFooter";
import { RejectWithdrawalDialog } from "@/frontend/views/admin/finances/RejectWithdrawalDialog";
import {
  useAdminPendingWithdrawals,
  useApproveWithdrawal,
  useRejectWithdrawal,
} from "@/frontend/views/admin/finances/useAdminFinanceQueries";
import { TonalChip } from "@/frontend/views/admin/users/ui";
import type { DirectoryTone } from "@/frontend/views/admin/users/utils";
import { Common, Errors, useAppLocale, useAppTranslation } from "@/shared/locale";
import { AdminFinance as AdminFinanceNs } from "@/shared/locale/namespaces/adminFinance";
import type { AdminFinanceLabels } from "@/shared/locale/types/adminFinance";

/** The stable skeleton row keys of the queue's loading state. */
const WITHDRAWALS_SKELETON_KEYS = [
  "admin-withdrawal-skeleton-1",
  "admin-withdrawal-skeleton-2",
  "admin-withdrawal-skeleton-3",
  "admin-withdrawal-skeleton-4",
  "admin-withdrawal-skeleton-5",
  "admin-withdrawal-skeleton-6",
] as const;

/** Snackbar autohide — the shared container-notice cadence. */
const NOTICE_AUTOHIDE_MS = 4000;

/** The shared settle action button skin — theme-palette colors only. */
function settleButtonSx(hoverLane: "approve" | "reject"): SxProps<Theme> {
  return theme => ({
    minHeight: 44,
    px: 2,
    borderRadius: 2,
    border: "1px solid",
    borderColor: theme.palette.outline,
    bgcolor: "transparent",
    color: theme.palette.text.primary,
    cursor: "pointer",
    "&:hover": { borderColor: hoverLane === "reject" ? theme.palette.error.main : theme.palette.primary.main },
  });
}

interface QueueSettleButtonsProps {
  /** The transaction id (both testids key on it). */
  readonly transactionId: string;
  /** Approve intent — opens the approve confirm dialog. */
  readonly onApprove: () => void;
  /** Reject intent — opens the reject dialog (mandatory reason). */
  readonly onReject: () => void;
  /** Localized approve CTA copy. */
  readonly approveLabel: string;
  /** Localized reject CTA copy. */
  readonly rejectLabel: string;
  /** Extra row alignment (the mobile cards right-align the pair). */
  readonly justifyContent?: "flex-end";
}

/** The approve/reject settle-button pair (shared by the desktop rows and the mobile cards). */
function QueueSettleButtons({
  transactionId,
  onApprove,
  onReject,
  approveLabel,
  rejectLabel,
  justifyContent,
}: Readonly<QueueSettleButtonsProps>): ReactNode {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent }}>
      <Box
        component="button"
        type="button"
        onClick={onApprove}
        data-testid={`admin-finances-approve-${transactionId}`}
        sx={settleButtonSx("approve")}
      >
        {approveLabel}
      </Box>
      <Box
        component="button"
        type="button"
        onClick={onReject}
        data-testid={`admin-finances-reject-${transactionId}`}
        sx={settleButtonSx("reject")}
      >
        {rejectLabel}
      </Box>
    </Stack>
  );
}

/** Mobile queue row card skin — the panel card recipe plus 16px padding. */
function mobileQueueRowCardSx(): SxProps<Theme> {
  return theme => ({
    borderRadius: "12px",
    border: `1px solid ${theme.palette.border.light}`,
    boxShadow: theme.palette.shadow.card,
    p: 2,
  });
}

/** Settlement status → tonal lane (pending = warning; settled = terminal). */
function withdrawalStatusTone(status: string): DirectoryTone {
  switch (status) {
    case "pending":
      return "warning";
    case "completed":
      return "success";
    default:
      return "error";
  }
}

/**
 * Localized withdrawal-status label — mapped lookup over the canonical
 * `TransactionStatus` wire values; any unknown wire value renders VERBATIM.
 */
function withdrawalStatusLabel(status: string, labels: AdminFinanceLabels): string {
  switch (status) {
    case "pending":
      return labels.statusPending;
    case "completed":
      return labels.statusCompleted;
    case "failed":
      return labels.statusFailed;
    default:
      return status;
  }
}

/** One queue row of the desktop table. */
function WithdrawalRow({
  item,
  locale,
  striped,
  onApprove,
  onReject,
}: Readonly<{
  item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items;
  locale: string;
  striped: boolean;
  onApprove: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
  onReject: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
}>): ReactNode {
  const t = useAppTranslation(AdminFinanceNs);
  return (
    <TableRow
      sx={theme => ({
        ...(striped && { backgroundColor: theme.palette.action.hover }),
        "&:hover": { backgroundColor: theme.palette.action.selected },
      })}
    >
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {item.teacherName}
        </Typography>
      </TableCell>
      <TableCell
        sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}`, fontVariantNumeric: "tabular-nums" })}
      >
        <Typography variant="body2">{formatMoneyAmount(item.transaction.amount)}</Typography>
      </TableCell>
      <TableCell
        sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}`, fontVariantNumeric: "tabular-nums" })}
      >
        <Typography variant="body2">{formatMoneyAmount(item.walletBalance)}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Typography variant="body2">{formatApplicantDate(item.transaction.createdAt, locale)}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <TonalChip
          tone={withdrawalStatusTone(item.transaction.status)}
          label={withdrawalStatusLabel(item.transaction.status, t)}
        />
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <QueueSettleButtons
          transactionId={item.transaction.id}
          onApprove={() => {
            onApprove(item);
          }}
          onReject={() => {
            onReject(item);
          }}
          approveLabel={t.approveAction}
          rejectLabel={t.rejectAction}
        />
      </TableCell>
    </TableRow>
  );
}

/** Desktop (≥md) withdrawal-queue table card — the hand-rolled MUI table. */
function WithdrawalTableCard({
  items,
  loading,
  locale,
  totalCount,
  page,
  pageSize,
  onPageChange,
  onApprove,
  onReject,
}: Readonly<{
  items: readonly AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items[];
  loading: boolean;
  locale: string;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onApprove: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
  onReject: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
}>): ReactNode {
  const t = useAppTranslation(AdminFinanceNs);
  return (
    <Card sx={directoryTableCardSx()}>
      <Table sx={{ tableLayout: "fixed" }} aria-label={t.withdrawalsTab}>
        <TableHead>
          <TableRow sx={theme => ({ bgcolor: theme.palette.surfaceContainerHigh })}>
            <DirectoryHeaderCell width="24%">{t.teacherHeader}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="16%">{t.amountHeader}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="16%">{t.walletBalanceHeader}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="16%">{t.requestedAtHeader}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="13%">{t.statusHeader}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="15%">{t.approveAction}</DirectoryHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody aria-label={loading && items.length === 0 ? t.loadingLabel : undefined}>
          {loading && items.length === 0
            ? WITHDRAWALS_SKELETON_KEYS.map(rowKey => (
                <TableRow key={rowKey}>
                  <TableCell colSpan={6} sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
                    <Skeleton variant="text" />
                  </TableCell>
                </TableRow>
              ))
            : null}
          {!loading && items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} sx={{ borderBottom: 0 }}>
                <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
                  <EmptyIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {t.withdrawalsEmpty}
                  </Typography>
                </Stack>
              </TableCell>
            </TableRow>
          ) : null}
          {items.map((item, index) => (
            <WithdrawalRow
              key={item.transaction.id}
              item={item}
              locale={locale}
              striped={index % 2 === 1}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}
        </TableBody>
      </Table>
      <FinanceTableFooter
        countLine={t.pendingWithdrawalsCount(totalCount)}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
      />
    </Card>
  );
}

/** One queue row of the mobile card stack. */
function WithdrawalMobileCardRow({
  item,
  locale,
  onApprove,
  onReject,
}: Readonly<{
  item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items;
  locale: string;
  onApprove: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
  onReject: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
}>): ReactNode {
  const t = useAppTranslation(AdminFinanceNs);
  return (
    <Card sx={mobileQueueRowCardSx()}>
      <Stack spacing={1}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {item.teacherName}
          </Typography>
          <TonalChip
            tone={withdrawalStatusTone(item.transaction.status)}
            label={withdrawalStatusLabel(item.transaction.status, t)}
          />
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.amountHeader}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {formatMoneyAmount(item.transaction.amount)}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.walletBalanceHeader}
          </Typography>
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {formatMoneyAmount(item.walletBalance)}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.requestedAtHeader}
          </Typography>
          <Typography variant="body2">{formatApplicantDate(item.transaction.createdAt, locale)}</Typography>
        </Stack>
        <QueueSettleButtons
          transactionId={item.transaction.id}
          onApprove={() => {
            onApprove(item);
          }}
          onReject={() => {
            onReject(item);
          }}
          approveLabel={t.approveAction}
          rejectLabel={t.rejectAction}
          justifyContent="flex-end"
        />{" "}
      </Stack>
    </Card>
  );
}

/**
 * Mobile (<md) withdrawal-queue card stack: stable-key skeleton cards while
 * loading, the honest empty state, and one card per pending request with
 * the same settle actions as the desktop rows.
 */
function WithdrawalMobileCards({
  items,
  loading,
  locale,
  onApprove,
  onReject,
}: Readonly<{
  items: readonly AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items[];
  loading: boolean;
  locale: string;
  onApprove: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
  onReject: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
}>): ReactNode {
  const t = useAppTranslation(AdminFinanceNs);
  return (
    <Stack spacing={2}>
      {loading && items.length === 0
        ? WITHDRAWALS_SKELETON_KEYS.slice(0, 4).map(rowKey => <Card key={rowKey} sx={directorySkeletonCardSx()} />)
        : null}
      {!loading && items.length === 0 ? (
        <Card sx={directoryPanelCardSx()}>
          <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
            <EmptyIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {t.withdrawalsEmpty}
            </Typography>
          </Stack>
        </Card>
      ) : null}
      {items.map(item => (
        <WithdrawalMobileCardRow
          key={item.transaction.id}
          item={item}
          locale={locale}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </Stack>
  );
}

/**
 * The settle dialogs slot of the panel: the Approve confirm dialog and the
 * Reject reason dialog, each keyed per transaction id so a stale dialog
 * never survives a row change.
 */
function WithdrawalSettleDialogs({
  approveTarget,
  rejectTarget,
  approve,
  reject,
  onCloseApprove,
  onCloseReject,
}: Readonly<{
  approveTarget: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items | null;
  rejectTarget: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items | null;
  approve: { approve: (id: string) => void; loading: boolean };
  reject: { reject: (id: string, reason: string) => void; loading: boolean };
  onCloseApprove: () => void;
  onCloseReject: () => void;
}>): ReactNode {
  return (
    <>
      {approveTarget !== null ? (
        <ApproveWithdrawalDialog
          key={`approve-${approveTarget.transaction.id}`}
          teacherName={approveTarget.teacherName}
          open
          onClose={onCloseApprove}
          onSubmit={() => {
            approve.approve(approveTarget.transaction.id);
          }}
          loading={approve.loading}
          submitTestId={`approve-withdrawal-submit-${approveTarget.transaction.id}`}
        />
      ) : null}

      {rejectTarget !== null ? (
        <RejectWithdrawalDialog
          key={`reject-${rejectTarget.transaction.id}`}
          transactionId={rejectTarget.transaction.id}
          open
          onClose={onCloseReject}
          onSubmit={reason => {
            reject.reject(rejectTarget.transaction.id, reason);
          }}
          loading={reject.loading}
          submitTestId={`reject-withdrawal-submit-${rejectTarget.transaction.id}`}
        />
      ) : null}
    </>
  );
}

/**
 * The queue's status body: the FORBIDDEN denied-notice alert, the shared
 * retry alert on a failed query, or the desktop table + mobile cards with
 * pagination.
 */
function WithdrawalQueueStatusBody({
  queue,
  locale,
  onApprove,
  onReject,
}: Readonly<{
  queue: ReturnType<typeof useAdminPendingWithdrawals>;
  locale: string;
  onApprove: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
  onReject: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
}>): ReactNode {
  const t = useAppTranslation(AdminFinanceNs);
  const tc = useAppTranslation(Common);
  const handlePageChange = (nextPage: number): void => {
    queue.setPage(nextPage);
  };
  const errorCode = queue.error ? extractErrorCode(queue.error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";

  if (denied) {
    return (
      <Alert
        severity="error"
        variant="outlined"
        sx={{ borderRadius: "12px" }}
        data-testid="admin-finances-withdrawals-denied"
      >
        <AlertTitle sx={{ fontWeight: 700 }}>{t.forbiddenTitle}</AlertTitle>
        <Typography variant="body2" component="p">
          {t.forbiddenBody}
        </Typography>
      </Alert>
    );
  }
  if (queue.hasError) {
    return (
      <ErrorRetryAlert
        title={t.errorTitle}
        retryLabel={tc.retry}
        retryPending={queue.loading}
        onRetry={() => {
          void queue.refetch();
        }}
      >
        <Typography variant="body2" component="p">
          {errorCode === null ? "" : `(${errorCode})`}
        </Typography>
      </ErrorRetryAlert>
    );
  }
  return (
    <>
      {/* Desktop (≥md): the hand-rolled queue table card. */}
      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <WithdrawalTableCard
          items={queue.items}
          loading={queue.loading}
          locale={locale}
          totalCount={queue.totalCount}
          page={queue.page}
          pageSize={queue.pageSize}
          onPageChange={handlePageChange}
          onApprove={onApprove}
          onReject={onReject}
        />
      </Box>
      {/* Mobile (<md): per-request cards + pagination. */}
      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <WithdrawalMobileCards
          items={queue.items}
          loading={queue.loading}
          locale={locale}
          onApprove={onApprove}
          onReject={onReject}
        />
        <Stack
          direction="row"
          sx={theme => ({
            justifyContent: "flex-end",
            mt: 2,
            pt: 2,
            borderTop: `1px solid ${theme.palette.border.light}`,
          })}
        >
          <AdminFinancePaginationBar
            page={queue.page}
            pageSize={queue.pageSize}
            totalCount={queue.totalCount}
            onPageChange={handlePageChange}
          />
        </Stack>
      </Box>
    </>
  );
}

/** The withdrawal payout queue panel: rows + settle dialogs + snackbar. */
export function WithdrawalQueuePanel(): ReactNode {
  const t = useAppTranslation(AdminFinanceNs);
  const te = useAppTranslation(Errors);
  const locale = useAppLocale();
  const queue = useAdminPendingWithdrawals();

  // Single dialog slot — re-keyed per transaction id (a stale dialog never
  // survives a row change).
  const [approveTarget, setApproveTarget] = useState<AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items | null>(
    null
  );
  const [rejectTarget, setRejectTarget] = useState<AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items | null>(
    null
  );

  const [notice, setNotice] = useState<{ message: string; severity: "success" | "info" | "error" } | null>(null);
  const dismissNotice = (): void => {
    setNotice(null);
  };

  const outcomeCallbacks = {
    onSettled: () => {
      setApproveTarget(null);
      setRejectTarget(null);
      setNotice({ message: t.settlementSuccessMessage, severity: "success" });
    },
    onRequestNotFound: () => {
      setApproveTarget(null);
      setRejectTarget(null);
      setNotice({ message: te.withdrawalRequestNotFound, severity: "error" });
    },
    onNotPending: () => {
      setApproveTarget(null);
      setRejectTarget(null);
      setNotice({ message: te.withdrawalNotPending, severity: "error" });
    },
    onInsufficientBalance: () => {
      setNotice({ message: te.insufficientBalance, severity: "error" });
    },
    onInvalidAmount: () => {
      setNotice({ message: te.invalidAdjustmentAmount, severity: "error" });
    },
    onReasonRequired: () => {
      setNotice({ message: te.adjustmentReasonRequired, severity: "error" });
    },
    onForbidden: () => {
      setNotice({ message: te.forbidden, severity: "error" });
    },
    onFailure: () => {
      setNotice({ message: t.errorTitle, severity: "error" });
    },
  };

  const approve = useApproveWithdrawal(outcomeCallbacks);
  const reject = useRejectWithdrawal(outcomeCallbacks);

  return (
    <Stack spacing={3} data-testid="admin-finances-withdrawals-panel">
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
          {t.pendingWithdrawalsCount(queue.totalCount)}
        </Typography>
      </Stack>

      <WithdrawalQueueStatusBody
        queue={queue}
        locale={locale}
        onApprove={setApproveTarget}
        onReject={setRejectTarget}
      />

      <WithdrawalSettleDialogs
        approveTarget={approveTarget}
        rejectTarget={rejectTarget}
        approve={approve}
        reject={reject}
        onCloseApprove={() => {
          setApproveTarget(null);
        }}
        onCloseReject={() => {
          setRejectTarget(null);
        }}
      />

      <NoticeSnackbar notice={notice} autoHideDuration={NOTICE_AUTOHIDE_MS} onClose={dismissNotice} />
    </Stack>
  );
}
