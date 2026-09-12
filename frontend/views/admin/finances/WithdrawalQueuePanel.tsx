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
import { Alert, AlertTitle, Box, Card, Skeleton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { TonalChip } from "@/frontend/views/admin/users/ui";
import { DirectoryHeaderCell } from "@/frontend/views/admin/directory-shared/DirectoryHeaderCell";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { formatMoneyAmount } from "@/frontend/views/admin/analytics/platform-analytics-display";
import { ApproveWithdrawalDialog } from "@/frontend/views/admin/finances/ApproveWithdrawalDialog";
import { RejectWithdrawalDialog } from "@/frontend/views/admin/finances/RejectWithdrawalDialog";
import {
  useAdminPendingWithdrawals,
  useApproveWithdrawal,
  useRejectWithdrawal,
} from "@/frontend/views/admin/finances/useAdminFinanceQueries";
import { NoticeSnackbar } from "@/frontend/components/ui/NoticeSnackbar";
import { directoryTableCardSx } from "@/frontend/views/admin/directory-shared/directory-skins";
import { type DirectoryTone } from "@/frontend/views/admin/users/utils";
import { Common, Errors, useAppLocale, useAppTranslation } from "@/shared/locale";
import type { AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items } from "@/frontend/graphql/generated/gql/graphql";

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
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}`, fontVariantNumeric: "tabular-nums" })}>
        <Typography variant="body2">{formatMoneyAmount(item.transaction.amount)}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}`, fontVariantNumeric: "tabular-nums" })}>
        <Typography variant="body2">{formatMoneyAmount(item.walletBalance)}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Typography variant="body2">{formatApplicantDate(item.transaction.createdAt, locale)}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <TonalChip tone={withdrawalStatusTone(item.transaction.status)} label={item.transaction.status} />
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Stack direction="row" spacing={1}>
          <Box
            component="button"
            type="button"
            onClick={() => {
              onApprove(item);
            }}
            data-testid={`admin-finances-approve-${item.transaction.id}`}
            sx={theme => ({
              minHeight: 44,
              px: 2,
              borderRadius: 2,
              border: "1px solid",
              borderColor: theme.palette.outline,
              bgcolor: "transparent",
              color: theme.palette.text.primary,
              cursor: "pointer",
              "&:hover": { borderColor: theme.palette.primary.main },
            })}
          >
            {t.approveAction}
          </Box>
          <Box
            component="button"
            type="button"
            onClick={() => {
              onReject(item);
            }}
            data-testid={`admin-finances-reject-${item.transaction.id}`}
            sx={theme => ({
              minHeight: 44,
              px: 2,
              borderRadius: 2,
              border: "1px solid",
              borderColor: theme.palette.outline,
              bgcolor: "transparent",
              color: theme.palette.text.primary,
              cursor: "pointer",
              "&:hover": { borderColor: theme.palette.error.main },
            })}
          >
            {t.rejectAction}
          </Box>
        </Stack>
      </TableCell>
    </TableRow>
  );
}

import { AdminFinance as AdminFinanceNs } from "@/shared/locale/namespaces/adminFinance";

/** Desktop (≥md) withdrawal-queue table card — the hand-rolled MUI table. */
function WithdrawalTableCard({
  items,
  loading,
  locale,
  totalCount,
  page,
  totalPages,
  onApprove,
  onReject,
}: Readonly<{
  items: readonly AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items[];
  loading: boolean;
  locale: string;
  totalCount: number;
  page: number;
  totalPages: number;
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
      <Stack
        direction="row"
        sx={theme => ({
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          py: 2,
          px: 2.5,
          borderTop: `1px solid ${theme.palette.border.light}`,
        })}
      >
        <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.pendingWithdrawalsCount(totalCount)}
        </Typography>
        <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {page + 1} / {totalPages}
        </Typography>
      </Stack>
    </Card>
  );
}

/** The withdrawal payout queue panel: rows + settle dialogs + snackbar. */
export function WithdrawalQueuePanel(): ReactNode {
  const t = useAppTranslation(AdminFinanceNs);
  const tc = useAppTranslation(Common);
  const te = useAppTranslation(Errors);
  const locale = useAppLocale();
  const queue = useAdminPendingWithdrawals();

  // Single dialog slot — re-keyed per transaction id (a stale dialog never
  // survives a row change).
  const [approveTarget, setApproveTarget] = useState<AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items | null>(null);

  const [notice, setNotice] = useState<{ message: string; severity: "success" | "info" | "error" } | null>(null);
  const dismissNotice = (): void => {
    setNotice(null);
  };

  const outcomeCallbacks = {
    onSettled: () => {
      setApproveTarget(null);
      setRejectTarget(null);
      setNotice({ message: te.validation, severity: "success" });
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

  const errorCode = queue.error ? extractErrorCode(queue.error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";

  const totalPages = Math.max(1, Math.ceil(queue.totalCount / queue.pageSize));

  return (
    <Stack spacing={3} data-testid="admin-finances-withdrawals-panel">
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
          {t.pendingWithdrawalsCount(queue.totalCount)}
        </Typography>
      </Stack>

      {(() => {
        if (denied) {
          return (
            <Alert severity="error" variant="outlined" sx={{ borderRadius: "12px" }} data-testid="admin-finances-withdrawals-denied">
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
              totalPages={totalPages}
              onApprove={setApproveTarget}
              onReject={setRejectTarget}
            />
          </Box>
          {/* Mobile (<md): per-request cards. */}
          <Box sx={{ display: { xs: "block", md: "none" } }}>
            <Stack spacing={2}>
              {queue.loading && queue.items.length === 0
                ? WITHDRAWALS_SKELETON_KEYS.slice(0, 4).map(rowKey => (
                    <Card key={rowKey} sx={theme => ({ borderRadius: "12px", border: `1px solid ${theme.palette.border.light}`, boxShadow: theme.palette.shadow.card, p: 2, height: 132 })} />
                  ))
                : null}
              {!queue.loading && queue.items.length === 0 ? (
                <Card sx={theme => ({ borderRadius: "12px", border: `1px solid ${theme.palette.border.light}`, boxShadow: theme.palette.shadow.card })}>
                  <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
                    <EmptyIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {t.withdrawalsEmpty}
                    </Typography>
                  </Stack>
                </Card>
              ) : null}
              {queue.items.map((item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => (
                <Card
                  key={item.transaction.id}
                  sx={theme => ({ borderRadius: "12px", border: `1px solid ${theme.palette.border.light}`, boxShadow: theme.palette.shadow.card, p: 2 })}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.teacherName}
                      </Typography>
                      <TonalChip tone={withdrawalStatusTone(item.transaction.status)} label={item.transaction.status} />
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
                    <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => {
                          setApproveTarget(item);
                        }}
                        data-testid={`admin-finances-approve-${item.transaction.id}`}
                        sx={theme => ({
                          minHeight: 44,
                          px: 2,
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: theme.palette.outline,
                          bgcolor: "transparent",
                          color: theme.palette.text.primary,
                          cursor: "pointer",
                          "&:hover": { borderColor: theme.palette.primary.main },
                        })}
                      >
                        {t.approveAction}
                      </Box>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => {
                          setRejectTarget(item);
                        }}
                        data-testid={`admin-finances-reject-${item.transaction.id}`}
                        sx={theme => ({
                          minHeight: 44,
                          px: 2,
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: theme.palette.outline,
                          bgcolor: "transparent",
                          color: theme.palette.text.primary,
                          cursor: "pointer",
                          "&:hover": { borderColor: theme.palette.error.main },
                        })}
                      >
                        {t.rejectAction}
                      </Box>
                    </Stack>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Box>
        </>
        );
      })()}

      {approveTarget !== null ? (
        <ApproveWithdrawalDialog
          key={`approve-${approveTarget.transaction.id}`}
          teacherName={approveTarget.teacherName}
          open
          onClose={() => {
            setApproveTarget(null);
          }}
          onSubmit={() => {
            approve.approve(String(approveTarget.transaction.id));
          }}
          loading={approve.loading}
          submitTestId={`approve-withdrawal-submit-${approveTarget.transaction.id}`}
        />
      ) : null}

      {rejectTarget !== null ? (
        <RejectWithdrawalDialog
          key={`reject-${rejectTarget.transaction.id}`}
          transactionId={String(rejectTarget.transaction.id)}
          open
          onClose={() => {
            setRejectTarget(null);
          }}
          onSubmit={reason => {
            reject.reject(String(rejectTarget.transaction.id), reason);
          }}
          loading={reject.loading}
          submitTestId={`reject-withdrawal-submit-${rejectTarget.transaction.id}`}
        />
      ) : null}

      <NoticeSnackbar notice={notice} autoHideDuration={NOTICE_AUTOHIDE_MS} onClose={dismissNotice} />
    </Stack>
  );
}
