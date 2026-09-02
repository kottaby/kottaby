"use client";

/**
 * Header bar for the platform-analytics dashboard (DEV3-022c): title,
 * subtitle, last-updated stamp, in-flight refresh chip, and the manual
 * Refresh control (≥44px touch target; labels via the `analytics`
 * namespace; logical spacing for RTL).
 */

import { InsightsOutlined, RefreshOutlined } from "@mui/icons-material";
import { Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import type { ReactElement } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { useAppTranslation } from "@/shared/locale/client/use-app-translation";
import { useAppLocale } from "@/shared/locale/localeContext";
import { Analytics } from "@/shared/locale/namespaces/analytics";

export interface AnalyticsHeaderBarProps {
  readonly refreshing: boolean;
  readonly initialLoading: boolean;
  readonly generatedAt: string | Date | null;
  readonly onRefresh: () => void;
}

export function AnalyticsHeaderBar({
  refreshing,
  initialLoading,
  generatedAt,
  onRefresh,
}: AnalyticsHeaderBarProps): ReactElement {
  const t = useAppTranslation(Analytics);
  const locale = useAppLocale();
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      sx={{
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", sm: "center" },
        gapBlock: { xs: 1, sm: 0 },
        gapInline: 2,
        marginBlockEnd: 3,
      }}
    >
      <Stack>
        <Stack direction="row" sx={{ alignItems: "center", gapInline: 1 }}>
          <InsightsOutlined sx={theme => ({ color: theme.palette.primary.main })} aria-hidden="true" />
          <Typography variant="h5" component="h1">
            {t.title}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={({ palette }) => ({ color: palette.text.secondary })}>
          {t.subtitle}
        </Typography>
      </Stack>
      <Stack direction="row" sx={{ alignItems: "center", gapInline: 1 }}>
        {generatedAt !== null ? (
          <Typography variant="caption" sx={({ palette }) => ({ color: palette.text.secondary })}>
            {t.lastUpdatedLabel(
              formatApplicantDate(generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt, locale)
            )}
          </Typography>
        ) : null}
        {refreshing ? <Chip size="small" label={t.refreshingLabel} icon={<CircularProgress size={12} />} /> : null}
        <Button
          variant="outlined"
          startIcon={<RefreshOutlined />}
          onClick={onRefresh}
          disabled={initialLoading || refreshing}
          sx={{ minHeight: 44 }}
        >
          {t.refreshAction}
        </Button>
      </Stack>
    </Stack>
  );
}
