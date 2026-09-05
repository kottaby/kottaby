"use client";

/**
 * RevenueSectionCard — the revenue metric section. Per-currency rows render
 * in a raw-MUI `Table` (currency, lifetime total, trailing-30-days total,
 * paid-payments count) where the money columns keep the snapshot's exact
 * decimal STRINGS — grouped by `formatMoneyAmount` for display only, never
 * parsed to float for any math. An EMPTY `gatewayRevenueByCurrency` array
 * renders the `noRevenueYet` empty-state copy — never a fabricated
 * zero-currency row. `offlineActivationsCount` renders below the table as
 * its own honestly-separate labeled row (offline activations are NOT
 * gateway revenue).
 *
 * MUI v9 discipline: `sx`-only styling, `theme.palette.*` tokens only,
 * start-aligned cells (RTL-safe — no physical direction anywhere).
 */

import { PaymentsOutlined } from "@mui/icons-material";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { CSSObject, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import type { AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenue } from "@/frontend/graphql/generated/gql/graphql";
import { MetricCard, MetricRow } from "@/frontend/views/admin/analytics/MetricCard";
import { formatCount, formatMoneyAmount } from "@/frontend/views/admin/analytics/platform-analytics-display";
import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

interface RevenueSectionCardProps {
  readonly snapshot: AdminPlatformAnalyticsQuery_adminPlatformAnalytics_revenue;
  readonly labels: AnalyticsLabels;
  readonly locale: string;
}

/** Shared cell skin — hairline separators, start-aligned, top-anchored. */
function cellSx(theme: Theme): CSSObject {
  return {
    borderBottom: `1px solid ${theme.palette.border.light}`,
    padding: theme.spacing(1, 1.5),
    textAlign: "start",
  };
}

export function RevenueSectionCard({ snapshot, labels, locale }: Readonly<RevenueSectionCardProps>): ReactNode {
  const rows = snapshot.gatewayRevenueByCurrency;

  return (
    <MetricCard icon={<PaymentsOutlined />} title={labels.revenueSection}>
      {rows.length === 0 ? (
        <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {labels.noRevenueYet}
        </Typography>
      ) : (
        <TableContainer sx={theme => ({ border: `1px solid ${theme.palette.border.light}`, borderRadius: "8px" })}>
          <Table size="small" aria-label={labels.revenueSection}>
            <TableHead>
              <TableRow>
                <TableCell sx={cellSx}>{labels.currencyHeader}</TableCell>
                <TableCell sx={cellSx}>{labels.totalAmountHeader}</TableCell>
                <TableCell sx={cellSx}>{labels.last30DaysAmountHeader}</TableCell>
                <TableCell sx={cellSx}>{labels.paidPaymentsCountHeader}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.currency}>
                  <TableCell sx={cellSx}>{row.currency}</TableCell>
                  <TableCell sx={cellSx}>{formatMoneyAmount(row.totalAmount)}</TableCell>
                  <TableCell sx={cellSx}>{formatMoneyAmount(row.last30DaysAmount)}</TableCell>
                  <TableCell sx={cellSx}>{formatCount(row.paidPaymentsCount, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <MetricRow label={labels.offlineActivationsLabel} value={snapshot.offlineActivationsCount} locale={locale} />
    </MetricCard>
  );
}
