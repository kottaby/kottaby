"use client";

import {
  InsightsOutlined as AnalyticsIcon,
  CancelOutlined as CancelIcon,
  CheckCircleOutlined as CompleteIcon,
  ScheduleOutlined as OpenIcon,
  CallSplitOutlined as PartialRefundIcon,
  AssignmentReturnOutlined as RefundIcon,
  type SvgIconComponent,
  GavelOutlined as UpholdIcon,
} from "@mui/icons-material";
import { Box, Card, Chip, Divider, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminDisputeAnalyticsQuery_adminDisputeAnalytics } from "@/frontend/graphql/generated/gql/graphql";
import { type StatusTone, TONE_COLORS } from "@/frontend/views/student/sessions/sessionRowPresentation";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * AdminDisputeAnalyticsCard — the aggregate dispute snapshot on the admin
 * arbitration queue (`/disputes`): the open (queued) count, the resolved
 * total, and the per-outcome breakdown across BOTH escrow generations.
 *
 * The card is SUPPLEMENTARY by contract: the queue above it must keep
 * working when analytics fails, so an error renders NOTHING here (the
 * container decides via `hasError`) — never a fabricated zero snapshot.
 * While loading it renders an honest skeleton; while loaded every value
 * is the server's honest count — a zero outcome chip is a legitimate
 * state, and the full five-member vocabulary renders ALWAYS (a
 * vocabulary-stability display: the analytics snapshot is the one surface
 * where "zero Cancel arbitrations ever" is itself the fact).
 *
 * Styling (MUI v9 discipline: `sx`-only, `theme.palette.*` exclusively):
 * the two headline stats paint the shared session-row tone pairs
 * (`TONE_COLORS` — warning for the awaiting work, success for the decided
 * total) as quiet value blocks; the outcome chips reuse the same
 * Material 3 container/on-container pairing as the escrow chip, each
 * keyed to its outcome's financial direction (refunds land on the
 * error/warning family, standing decisions on success). RTL-safe logical
 * composition throughout — no direction-dependent CSS.
 */

/** One outcome chip's presentation row: icon + localized label + tone + count key. */
interface OutcomePresentation {
  readonly icon: SvgIconComponent;
  readonly labelKey: keyof Pick<
    SessionsLabels,
    "outcomeCancel" | "outcomeComplete" | "outcomeRefund" | "outcomePartialRefund" | "outcomeUphold"
  >;
  readonly tone: StatusTone;
  readonly countKey: keyof AdminDisputeAnalyticsQuery_adminDisputeAnalytics;
  readonly testid: string;
}

/** The five-member outcome vocabulary in canonical enum order (Cancel first). */
const OUTCOME_PRESENTATION: readonly OutcomePresentation[] = [
  {
    icon: CancelIcon,
    labelKey: "outcomeCancel",
    tone: "error",
    countKey: "cancelCount",
    testid: "admin-dispute-analytics-outcome-Cancel",
  },
  {
    icon: CompleteIcon,
    labelKey: "outcomeComplete",
    tone: "success",
    countKey: "completeCount",
    testid: "admin-dispute-analytics-outcome-Complete",
  },
  {
    icon: RefundIcon,
    labelKey: "outcomeRefund",
    tone: "error",
    countKey: "refundCount",
    testid: "admin-dispute-analytics-outcome-Refund",
  },
  {
    icon: PartialRefundIcon,
    labelKey: "outcomePartialRefund",
    tone: "warning",
    countKey: "partialRefundCount",
    testid: "admin-dispute-analytics-outcome-PartialRefund",
  },
  {
    icon: UpholdIcon,
    labelKey: "outcomeUphold",
    tone: "success",
    countKey: "upholdCount",
    testid: "admin-dispute-analytics-outcome-Uphold",
  },
];

interface AdminDisputeAnalyticsCardProps {
  /** The settled analytics snapshot (honest zeros included). */
  readonly analytics: AdminDisputeAnalyticsQuery_adminDisputeAnalytics | null | undefined;
  /** True while the snapshot query is in flight — renders the skeleton. */
  readonly loading: boolean;
  /** True when the snapshot query failed — renders NOTHING (supplementary by contract). */
  readonly hasError: boolean;
  /** Localized sessions-namespace labels. */
  readonly t: SessionsLabels;
}

/** The aggregate dispute snapshot card on the admin arbitration queue. */
export function AdminDisputeAnalyticsCard({
  analytics,
  loading,
  hasError,
  t,
}: Readonly<AdminDisputeAnalyticsCardProps>): ReactNode {
  // Supplementary-by-contract: an analytics failure must never paint a
  // fabricated zero snapshot next to a working queue — it simply renders
  // nothing.
  if (hasError) {
    return null;
  }

  if (loading || analytics === null || analytics === undefined) {
    return (
      <Card
        variant="outlined"
        data-testid="admin-dispute-analytics-loading"
        sx={theme => ({ borderColor: theme.palette.outlineVariant })}
      >
        <Stack sx={{ gap: 2, p: 3 }}>
          <Skeleton variant="rectangular" width={220} height={28} />
          <Stack direction="row" sx={{ gap: 3 }}>
            <Skeleton variant="rectangular" width={140} height={56} />
            <Skeleton variant="rectangular" width={140} height={56} />
          </Stack>
          <Skeleton variant="rectangular" height={32} />
        </Stack>
      </Card>
    );
  }

  return (
    <Card
      variant="outlined"
      data-testid="admin-dispute-analytics"
      aria-label={t.adminDisputeAnalyticsTitle}
      sx={theme => ({ borderColor: theme.palette.outlineVariant })}
    >
      <Stack sx={{ gap: 2.5, p: 3 }}>
        {/* Title row */}
        <Stack direction="row" sx={{ gap: 1.5, alignItems: "center" }}>
          <Box
            sx={theme => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: theme.palette.primaryContainer,
              color: theme.palette.onPrimaryContainer,
            })}
          >
            <AnalyticsIcon fontSize="small" />
          </Box>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
            {t.adminDisputeAnalyticsTitle}
          </Typography>
        </Stack>

        {/* Headline stats: the open work + the decided total */}
        <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap" }}>
          <StatBlock
            testid="admin-dispute-analytics-open"
            value={analytics.openDisputes}
            label={t.adminDisputeAnalyticsOpen}
            tone="warning"
            icon={OpenIcon}
          />
          <StatBlock
            testid="admin-dispute-analytics-resolved"
            value={analytics.resolvedDisputes}
            label={t.adminDisputeAnalyticsResolved}
            tone="success"
            icon={CompleteIcon}
          />
        </Stack>

        <Divider sx={theme => ({ borderColor: theme.palette.outlineVariant })} />

        {/* Per-outcome breakdown — the full five-member vocabulary, always */}
        <Stack sx={{ gap: 1.5 }}>
          <Typography
            variant="overline"
            component="h3"
            sx={theme => ({ color: theme.palette.text.secondary, lineHeight: 1.5 })}
          >
            {t.adminDisputeAnalyticsOutcomes}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            {OUTCOME_PRESENTATION.map(outcome => {
              const count = analytics[outcome.countKey];
              const toneColors = TONE_COLORS[outcome.tone] ?? TONE_COLORS.info;
              const Icon = outcome.icon;
              return (
                <Chip
                  key={outcome.testid}
                  icon={<Icon fontSize="small" />}
                  label={`${t[outcome.labelKey]} · ${count}`}
                  size="small"
                  data-testid={outcome.testid}
                  sx={theme => ({
                    fontWeight: 600,
                    bgcolor: toneColors.bg(theme.palette),
                    color: toneColors.fg(theme.palette),
                    border: "1px solid",
                    borderColor: theme.palette.outlineVariant,
                    "& .MuiChip-icon": {
                      color: toneColors.fg(theme.palette),
                    },
                  })}
                />
              );
            })}
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}

/** One headline stat: a tone-painted value block (count over its label). */
function StatBlock({
  value,
  label,
  tone,
  icon: Icon,
  testid,
}: Readonly<{
  value: number;
  label: string;
  tone: StatusTone;
  icon: SvgIconComponent;
  testid: string;
}>): ReactNode {
  const toneColors = TONE_COLORS[tone] ?? TONE_COLORS.info;
  return (
    <Stack
      direction="row"
      data-testid={testid}
      sx={theme => ({
        gap: 1.5,
        alignItems: "center",
        px: 2,
        py: 1.5,
        borderRadius: 2,
        bgcolor: toneColors.bg(theme.palette),
        color: toneColors.fg(theme.palette),
        minWidth: 160,
      })}
    >
      <Icon fontSize="small" />
      <Stack sx={{ minWidth: 0 }}>
        <Typography variant="h6" component="p" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {value}
        </Typography>
        <Typography variant="caption" sx={{ lineHeight: 1.3 }}>
          {label}
        </Typography>
      </Stack>
    </Stack>
  );
}
