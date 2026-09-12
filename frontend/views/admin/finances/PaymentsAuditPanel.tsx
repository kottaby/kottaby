"use client";

/**
 * PaymentsAuditPanel — the payments-audit tab of the admin financial
 * auditing console (`/admin/finances`): the filter bar over the paginated
 * payments table.
 *
 * Layout (mirrors the admin directories' table/list split): the desktop
 * (≥`md`) hand-rolled MUI `Table` card and the mobile (<`md`) per-payment
 * card stack on the shared `DirectoryMobileCardList`. Columns: student
 * (name + id), amount (exact decimal string, grouped for display only),
 * currency, gateway, status (tonal chip), date.
 *
 * Loading renders stable-key skeleton rows/cards; a zero page renders the
 * empty state (the `paymentsEmpty` copy — filters explain a bare page);
 * a failed query renders the shared retry alert (the stale page stays
 * visible beside it when one exists); a FORBIDDEN denial renders the
 * shared denied-notice fallback.
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors, `*Outlined` icons.
 */

import { ReceiptLongOutlined as EmptyIcon } from "@mui/icons-material";
import { Alert, AlertTitle, Box, Card, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { TonalChip } from "@/frontend/views/admin/users/ui";
import { DirectoryHeaderCell } from "@/frontend/views/admin/directory-shared/DirectoryHeaderCell";
import { DirectoryMobileCardList } from "@/frontend/views/admin/directory-shared/DirectoryMobileCardList";
import type { DirectoryTableHeader } from "@/frontend/views/admin/directory-shared/DirectoryTableScaffold";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { formatMoneyAmount } from "@/frontend/views/admin/analytics/platform-analytics-display";
import { PaymentsFilterBar } from "@/frontend/views/admin/finances/PaymentsFilterBar";
import {
  useAdminStudentPayments,
  type AppliedPaymentFilters,
} from "@/frontend/views/admin/finances/useAdminFinanceQueries";
import { directoryTableCardSx } from "@/frontend/views/admin/directory-shared/directory-skins";
import { type DirectoryTone } from "@/frontend/views/admin/users/utils";
import { Common, useAppLocale, useAppTranslation } from "@/shared/locale";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";
import type { AdminStudentPaymentsQuery_adminStudentPayments_items } from "@/frontend/graphql/generated/gql/graphql";

/** The stable skeleton row/card keys of the payments loading state. */
const PAYMENTS_SKELETON_KEYS = [
  "admin-payment-skeleton-1",
  "admin-payment-skeleton-2",
  "admin-payment-skeleton-3",
  "admin-payment-skeleton-4",
  "admin-payment-skeleton-5",
  "admin-payment-skeleton-6",
  "admin-payment-skeleton-7",
  "admin-payment-skeleton-8",
] as const;

/** Payment lifecycle → tonal lane (paid = success, pending = warning, failed/refunded = error/neutral). */
function paymentStatusTone(status: string): DirectoryTone {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
      return "warning";
    case "failed":
      return "error";
    default:
      return "neutral";
  }
}

/** One payment status chip — tone-mapped with the verbatim wire value. */
function PaymentStatusChip({ status }: Readonly<{ status: string }>): ReactNode {
  return <TonalChip tone={paymentStatusTone(status)} label={status} />;
}

/** One body row of the desktop payments table. */
function PaymentRow({
  payment,
  locale,
  striped,
}: Readonly<{
  payment: AdminStudentPaymentsQuery_adminStudentPayments_items;
  locale: string;
  striped: boolean;
}>): ReactNode {
  return (
    <TableRow
      sx={theme => ({
        ...(striped && { backgroundColor: theme.palette.action.hover }),
        "&:hover": { backgroundColor: theme.palette.action.selected },
      })}
    >
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {payment.studentName}
          </Typography>
          <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
            {payment.studentId}
          </Typography>
        </Stack>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}`, fontVariantNumeric: "tabular-nums" })}>
        <Typography variant="body2">{formatMoneyAmount(payment.amount)}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Typography variant="body2">{payment.currency}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Typography variant="body2">{payment.paymentGateway}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <PaymentStatusChip status={payment.status} />
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Typography variant="body2">{formatApplicantDate(payment.createdAt, locale)}</Typography>
      </TableCell>
    </TableRow>
  );
}

/** One mobile payment card — mirrors the desktop row's cell semantics. */
interface PaymentCellLabels {
  readonly amountHeader: string;
  readonly gatewayHeader: string;
  readonly dateHeader: string;
}

function PaymentMobileCard({
  payment,
  locale,
  labels,
}: Readonly<{
  payment: AdminStudentPaymentsQuery_adminStudentPayments_items;
  locale: string;
  labels: PaymentCellLabels;
}>): ReactNode {
  return (
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        p: 2,
      })}
    >
      <Stack spacing={1}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {payment.studentName}
          </Typography>
          <PaymentStatusChip status={payment.status} />
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {labels.amountHeader}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {formatMoneyAmount(payment.amount)} {payment.currency}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {labels.gatewayHeader}
          </Typography>
          <Typography variant="body2">{payment.paymentGateway}</Typography>
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {labels.dateHeader}
          </Typography>
          <Typography variant="body2">{formatApplicantDate(payment.createdAt, locale)}</Typography>
        </Stack>
      </Stack>
    </Card>
  );
}

/** Desktop (≥md) payments table card — the hand-rolled MUI table. */
function PaymentsTableCard({
  items,
  loading,
  locale,
  labels,
  totalCount,
  page,
  totalPages,
}: Readonly<{
  items: readonly AdminStudentPaymentsQuery_adminStudentPayments_items[];
  loading: boolean;
  locale: string;
  labels: {
    readonly paymentsTab: string;
    readonly loadingLabel: string;
    readonly paymentsEmpty: string;
    readonly paymentsResultCount: (count: number) => string;
    readonly studentHeader: string;
    readonly amountHeader: string;
    readonly currencyHeader: string;
    readonly gatewayHeader: string;
    readonly statusHeader: string;
    readonly dateHeader: string;
  };
  totalCount: number;
  page: number;
  totalPages: number;
}>): ReactNode {
  const headers: readonly DirectoryTableHeader[] = [
    { id: "student", width: "30%", label: labels.studentHeader },
    { id: "amount", width: "15%", label: labels.amountHeader },
    { id: "currency", width: "11%", label: labels.currencyHeader },
    { id: "gateway", width: "16%", label: labels.gatewayHeader },
    { id: "status", width: "13%", label: labels.statusHeader },
    { id: "date", width: "15%", label: labels.dateHeader },
  ];
  return (
    <Card sx={directoryTableCardSx()}>
      <TableContainer>
        <Table sx={{ tableLayout: "fixed" }} aria-label={labels.paymentsTab}>
          <TableHead>
            <TableRow sx={theme => ({ bgcolor: theme.palette.surfaceContainerHigh })}>
              {headers.map(header => (
                <DirectoryHeaderCell key={header.id} width={header.width}>
                  {header.label}
                </DirectoryHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody aria-label={loading && items.length === 0 ? labels.loadingLabel : undefined}>
            {loading && items.length === 0
              ? PAYMENTS_SKELETON_KEYS.map(rowKey => (
                  <TableRow key={rowKey}>
                    <TableCell colSpan={headers.length} sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
                      <Skeleton variant="text" />
                    </TableCell>
                  </TableRow>
                ))
              : null}
            {!loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={headers.length} sx={{ borderBottom: 0 }}>
                  {paymentsEmptyState(labels.paymentsEmpty)}
                </TableCell>
              </TableRow>
            ) : null}
            {items.map((payment, index) => (
              <PaymentRow key={payment.id} payment={payment} locale={locale} striped={index % 2 === 1} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
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
          {labels.paymentsResultCount(totalCount)}
        </Typography>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
          <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {page + 1} / {totalPages}
          </Typography>
        </Stack>
      </Stack>
    </Card>
  );
}

/** The honest empty state of the payments panel (shared by both layouts). */
function paymentsEmptyState(emptyCopy: string): ReactNode {
  return (
    <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
      <EmptyIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {emptyCopy}
      </Typography>
    </Stack>
  );
}

/**
 * The payments audit panel: filter bar over the swapping body — loading
 * skeleton / denial / retryable error / empty / rows + pagination.
 */
export function PaymentsAuditPanel(): ReactNode {
  const t = useAppTranslation(AdminFinance);
  const tc = useAppTranslation(Common);
  const locale = useAppLocale();
  const payments = useAdminStudentPayments();

  const handleApply = (applied: AppliedPaymentFilters): void => {
    payments.applyFilters(applied);
  };

  const handleReset = (): void => {
    payments.resetFilters();
  };

  // Query-context denial classification — FORBIDDEN maps to the shared
  // denied notice; every other code falls to the generic retry alert.
  const errorCode = payments.error ? extractErrorCode(payments.error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";

  const totalPages = Math.max(1, Math.ceil(payments.totalCount / payments.pageSize));


  const mobileList = (
    <DirectoryMobileCardList
      loading={payments.loading}
      loadingLabel={t.loadingLabel}
      skeletonKeys={PAYMENTS_SKELETON_KEYS}
      empty={paymentsEmptyState(t.paymentsEmpty)}
      cards={payments.items.map((payment: AdminStudentPaymentsQuery_adminStudentPayments_items) => (
        <PaymentMobileCard
          key={payment.id}
          payment={payment}
          locale={locale}
          labels={{ amountHeader: t.amountHeader, gatewayHeader: t.gatewayHeader, dateHeader: t.dateHeader }}
        />
      ))}
    />
  );

  // Statements, not a nested ternary — denial / error / settled results.
  let body: ReactNode;
  if (denied) {
    body = (
      <Alert severity="error" variant="outlined" sx={{ borderRadius: "12px" }} data-testid="admin-finances-payments-denied">
        <AlertTitle sx={{ fontWeight: 700 }}>{t.forbiddenTitle}</AlertTitle>
        <Typography variant="body2" component="p">
          {t.forbiddenBody}
        </Typography>
      </Alert>
    );
  } else if (payments.hasError) {
    body = (
      <ErrorRetryAlert
        title={t.errorTitle}
        retryLabel={tc.retry}
        retryPending={payments.loading}
        onRetry={() => {
          void payments.refetch();
        }}
      >
        <Typography variant="body2" component="p">
          {errorCode === null ? "" : `(${errorCode})`}
        </Typography>
      </ErrorRetryAlert>
    );
  } else {
    body = (
      <>
        {/* Desktop (≥md): the hand-rolled table card. */}
        <Box sx={{ display: { xs: "none", md: "block" } }}>
          <PaymentsTableCard
            items={payments.items}
            loading={payments.loading}
            locale={locale}
            labels={{
              paymentsTab: t.paymentsTab,
              loadingLabel: t.loadingLabel,
              paymentsEmpty: t.paymentsEmpty,
              paymentsResultCount: t.paymentsResultCount,
              studentHeader: t.studentHeader,
              amountHeader: t.amountHeader,
              currencyHeader: t.currencyHeader,
              gatewayHeader: t.gatewayHeader,
              statusHeader: t.statusHeader,
              dateHeader: t.dateHeader,
            }}
            totalCount={payments.totalCount}
            page={payments.page}
            totalPages={totalPages}
          />
        </Box>
        {/* Mobile (<md): the per-payment card stack. */}
        <Box sx={{ display: { xs: "block", md: "none" } }}>{mobileList}</Box>
      </>
    );
  }

  return (
    <Stack spacing={3} data-testid="admin-finances-payments-panel">
      <PaymentsFilterBar onApply={handleApply} onReset={handleReset} />
      {body}
    </Stack>
  );
}


