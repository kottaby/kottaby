"use client";

/**
 * SubscriptionSummaryStats — the summary strip of the admin student
 * drawer's subscription-management section: three clickable status
 * mini-cards (the `SubscriptionSummaryStatCard` lenses) above the
 * next-expiry banner. The banner's value is the soonest open bound among
 * the active rows, resolved through the namespace's counted `expiryBadge`
 * forms so the relative copy never drifts between the row badges and the
 * strip; the absolute bound rides the tooltip. The strip mounts only
 * while the student HAS rows — the empty state owns the zero-rows case —
 * and shares the chip row's lens selection without owning it.
 *
 * Presentational: counts + the next bound arrive pre-computed (the pure
 * `countByStatus`/`nextExpiryBound` helpers run in the owning section).
 * MUI v9 `sx`-only styling, theme tokens only; RTL/LTR discipline is
 * inherited from the drawer (the grid/stack reading order does the
 * mirroring).
 */

import { EventAvailableOutlined as NextExpiryIcon } from "@mui/icons-material";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { SubscriptionStatus } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { SubscriptionSummaryStatCard } from "@/frontend/views/admin/students/subscriptions/SubscriptionSummaryStatCard";
import {
  daysUntil,
  expiryBadgeKind,
  type SubscriptionStatusFilter,
} from "@/frontend/views/admin/students/subscriptions/subscriptionAdmin.helpers";
import type { AppLocale } from "@/shared/locale";
import type { SubscriptionAdminLabels } from "@/shared/locale/types/subscriptionAdmin";

interface SubscriptionSummaryStatsProps {
  /** Per-status tallies from the pure helper (the wire-enum-keyed table). */
  readonly counts: Record<SubscriptionStatus, number>;
  /** The soonest active-row bound, or `null` (pre-computed by the section). */
  readonly nextBound: string | null;
  readonly selected: SubscriptionStatusFilter;
  readonly onSelect: (filter: SubscriptionStatusFilter) => void;
  readonly labels: SubscriptionAdminLabels;
  readonly locale: AppLocale;
}

/** The strip's status order — the count-bearing lenses the cards filter by. */
const STRIP_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.Active,
  SubscriptionStatus.Expired,
  SubscriptionStatus.Cancelled,
];

/** The strip: three count cards + the next-expiry banner. */
export function SubscriptionSummaryStats({
  counts,
  nextBound,
  selected,
  onSelect,
  labels,
  locale,
}: SubscriptionSummaryStatsProps): ReactNode {
  const statusLabels: Record<SubscriptionStatus, string> = {
    [SubscriptionStatus.Active]: labels.status.active,
    [SubscriptionStatus.Expired]: labels.status.expired,
    [SubscriptionStatus.Pending]: labels.status.pending,
    [SubscriptionStatus.Cancelled]: labels.status.cancelled,
    [SubscriptionStatus.Suspended]: labels.status.suspended,
  };

  const days = nextBound === null ? null : daysUntil(nextBound);
  const kind = nextBound === null ? null : expiryBadgeKind(nextBound);
  let boundValue = labels.summary.nextExpiryNone;
  if (nextBound !== null && days !== null && kind !== null) {
    boundValue = kind === "past" ? labels.expiryBadge.past(Math.abs(days)) : labels.expiryBadge.upcoming(days);
  }

  return (
    <Stack sx={{ gap: 1, mb: 1.5 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
        {STRIP_STATUSES.map(status => (
          <SubscriptionSummaryStatCard
            key={status}
            status={status}
            count={counts[status]}
            label={statusLabels[status]}
            selected={selected === status}
            onSelect={onSelect}
          />
        ))}
      </Box>
      <Tooltip title={nextBound === null ? "" : formatApplicantDate(nextBound, locale)} placement="top">
        <Stack
          direction="row"
          sx={theme => ({
            alignItems: "center",
            gap: 1,
            px: 1.25,
            py: 0.75,
            borderRadius: "10px",
            bgcolor: theme.palette.action.hover,
            border: `1px solid ${theme.palette.border.light}`,
          })}
        >
          <NextExpiryIcon sx={theme => ({ fontSize: 18, color: theme.palette.text.secondary })} />
          <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
            {labels.summary.nextExpiry}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
            data-testid="subscription-next-expiry-value"
          >
            {boundValue}
          </Typography>
        </Stack>
      </Tooltip>
    </Stack>
  );
}
