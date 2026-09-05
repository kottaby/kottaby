"use client";

/**
 * PlatformAnalyticsChrome — the always-on chrome of the analytics surface:
 * the page heading (glyph + localized title/subtitle) and the toolbar row
 * (the `lastUpdatedLabel` staleness caption over the snapshot's
 * `generatedAt`, the in-flight `refreshingLabel` chip + spinner, and the
 * ≥44px manual Refresh CTA). While a refresh/poll is in flight the region
 * carries `aria-busy`; stale data stays on screen underneath.
 *
 * MUI v9 discipline: `sx`-only styling, `theme.palette.*` tokens only,
 * `*Outlined` icons, RTL-safe logical composition.
 */

import { InsightsOutlined, RefreshOutlined } from "@mui/icons-material";
import { Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

interface PlatformAnalyticsHeaderProps {
  readonly labels: AnalyticsLabels;
}

/** Page heading: the localized title with its subtitle beside the glyph. */
export function PlatformAnalyticsHeader({ labels }: Readonly<PlatformAnalyticsHeaderProps>): ReactNode {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
      <Box
        aria-hidden="true"
        sx={theme => ({
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          borderRadius: "12px",
          backgroundColor: theme.palette.primaryContainer,
          color: theme.palette.onPrimaryContainer,
        })}
      >
        <InsightsOutlined />
      </Box>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1">
          {labels.title}
        </Typography>
        <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {labels.subtitle}
        </Typography>
      </Stack>
    </Stack>
  );
}

interface PlatformAnalyticsToolbarProps {
  readonly labels: AnalyticsLabels;
  readonly locale: string;
  /** The snapshot's `generatedAt` stamp; `null` while no snapshot exists. */
  readonly generatedAt: string | null;
  readonly refreshing: boolean;
  readonly refreshDisabled: boolean;
  readonly onRefresh: () => void;
}

/** Toolbar row: staleness caption + in-flight refresh chip + Refresh CTA. */
export function PlatformAnalyticsToolbar({
  labels,
  locale,
  generatedAt,
  refreshing,
  refreshDisabled,
  onRefresh,
}: Readonly<PlatformAnalyticsToolbarProps>): ReactNode {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      aria-busy={refreshing || undefined}
      sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 1 }}
    >
      {generatedAt !== null ? (
        <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
          {labels.lastUpdatedLabel(formatApplicantDate(generatedAt, locale))}
        </Typography>
      ) : null}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        {refreshing ? (
          <Chip
            icon={<CircularProgress size={16} color="inherit" />}
            label={labels.refreshingLabel}
            variant="outlined"
            size="small"
            sx={theme => ({
              color: theme.palette.text.secondary,
              borderColor: theme.palette.border.main,
              "& .MuiChip-icon": { color: theme.palette.text.secondary },
            })}
          />
        ) : null}
        <Button
          variant="outlined"
          startIcon={<RefreshOutlined />}
          onClick={onRefresh}
          disabled={refreshDisabled}
          sx={{ ...focusVisibleRingSx, minHeight: 44 }}
        >
          {labels.refreshAction}
        </Button>
      </Stack>
    </Stack>
  );
}
