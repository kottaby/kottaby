"use client";

import type { SvgIconComponent } from "@mui/icons-material";
/**
 * AdminDisputeAnalyticsCard parts — the analytics card's presentational
 * halves carved out of `AdminDisputeAnalyticsCard` for the function-size
 * tier: the outcome presentation table, the headline stat block, the
 * honest loading skeleton, and the five-member outcome chip breakdown.
 * The supplementary-by-contract honesty (no fabricated zeros) rides the
 * same components.
 */
import {
  CancelOutlined as CancelIcon,
  CheckCircleOutlined as CompleteIcon,
  CallSplitOutlined as PartialRefundIcon,
  AssignmentReturnOutlined as RefundIcon,
  GavelOutlined as UpholdIcon,
} from "@mui/icons-material";
import { Card, Chip, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminDisputeAnalyticsQuery_adminDisputeAnalytics } from "@/frontend/graphql/generated/gql/graphql";
import { type StatusTone, TONE_COLORS } from "@/frontend/views/student/sessions/sessionRowPresentation";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

export /** One outcome chip's presentation row: icon + localized label + tone + count key. */
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

/** One headline stat: a tone-painted value block (count over its label). */
export function StatBlock({
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

/** The analytics card's honest loading skeleton — no fabricated zero snapshot. */
export function AnalyticsLoadingCard(): ReactNode {
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

/** The per-outcome chip breakdown — the full five-member vocabulary, always. */
export function AnalyticsOutcomeBreakdown({
  analytics,
  t,
}: Readonly<{
  analytics: AdminDisputeAnalyticsQuery_adminDisputeAnalytics;
  t: SessionsLabels;
}>): ReactNode {
  return (
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
  );
}
