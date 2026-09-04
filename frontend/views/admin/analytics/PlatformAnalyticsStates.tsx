"use client";

/**
 * Platform-analytics state surfaces: the card-shaped `aria-busy` skeleton
 * grid (mirrors the populated layout — no shift when data lands), the
 * load-failure `Alert` with its retry CTA, and the query-context FORBIDDEN
 * denied notice (the governed-admin edge the page guard cannot see — the
 * server guard passed, the read model denied). Every string comes from the
 * `Analytics` labels; the raw server `message` is NEVER rendered.
 *
 * MUI v9 discipline: `sx`-only styling, `theme.palette.*` tokens only,
 * `*Outlined` icons, ≥44px touch target on the retry CTA.
 */

import { RefreshOutlined } from "@mui/icons-material";
import { Alert, AlertTitle, Box, Button, Card, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { METRIC_GRID_SX, TREND_CHART_BODY_HEIGHT } from "@/frontend/views/admin/analytics/platform-analytics-display";
import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

/** Skeleton rows per metric card — title line + three value lines. */
const SKELETON_ROWS_PER_CARD = 4;

/**
 * Initial-load skeleton: the metric grid + two chart slots, card-shaped and
 * wrapped in a `component="output" aria-busy` output region.
 */
export function PlatformAnalyticsSkeleton(): ReactNode {
  return (
    <Box component="output" aria-busy sx={METRIC_GRID_SX}>
      {Array.from({ length: 9 }, (_unused, index) => `platform-analytics-skeleton-${index + 1}`).map(key => (
        <Card
          key={key}
          sx={theme => ({
            borderRadius: "12px",
            border: `1px solid ${theme.palette.border.light}`,
            boxShadow: theme.palette.shadow.card,
          })}
        >
          <Stack spacing={2} sx={{ padding: 2.5 }}>
            <Skeleton variant="rounded" height={28} width="55%" />
            {Array.from({ length: SKELETON_ROWS_PER_CARD }, (_unused, rowIndex) => rowIndex + 1).map(rowIndex => (
              <Skeleton key={`${key}-row-${rowIndex}`} variant="rounded" height={20} />
            ))}
          </Stack>
        </Card>
      ))}
    </Box>
  );
}

interface PlatformAnalyticsLoadErrorProps {
  readonly labels: AnalyticsLabels;
  readonly onRetry: () => void;
  readonly retryPending: boolean;
}

/**
 * Load-failure surface — inline `Alert severity="error"` with the localized
 * title/body and the Retry CTA (disabled while the retry is in flight).
 */
export function PlatformAnalyticsLoadError({
  labels,
  onRetry,
  retryPending,
}: Readonly<PlatformAnalyticsLoadErrorProps>): ReactNode {
  return (
    <Alert
      severity="error"
      variant="outlined"
      sx={theme => ({ borderRadius: "12px", borderColor: theme.palette.border.main })}
      action={
        <Button
          color="error"
          size="small"
          disabled={retryPending}
          onClick={onRetry}
          startIcon={<RefreshOutlined />}
          sx={{ ...focusVisibleRingSx, flexShrink: 0, minHeight: 44 }}
        >
          {labels.retryAction}
        </Button>
      }
    >
      <AlertTitle sx={{ fontWeight: 700 }}>{labels.loadErrorTitle}</AlertTitle>
      <Typography variant="body2" component="p">
        {labels.loadErrorBody}
      </Typography>
    </Alert>
  );
}

interface PlatformAnalyticsDeniedNoticeProps {
  readonly labels: AnalyticsLabels;
}

/**
 * Query-context FORBIDDEN notice — the localized denied copy IN-container.
 * No retry CTA: a permission denial is not retryable (the errorLink table
 * marks the FORBIDDEN row non-retryable).
 */
export function PlatformAnalyticsDeniedNotice({ labels }: Readonly<PlatformAnalyticsDeniedNoticeProps>): ReactNode {
  return (
    <Alert severity="error" variant="outlined" sx={{ borderRadius: "12px" }}>
      <AlertTitle sx={{ fontWeight: 700 }}>{labels.deniedTitle}</AlertTitle>
      <Typography variant="body2" component="p">
        {labels.deniedBody}
      </Typography>
    </Alert>
  );
}

/** Chart-slot skeleton used while the dynamic trend-chart chunk loads. */
export function TrendChartBodySkeleton(): ReactNode {
  return <Skeleton variant="rounded" height={TREND_CHART_BODY_HEIGHT} />;
}
