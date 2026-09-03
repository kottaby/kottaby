"use client";

/**
 * Section primitives for the platform-analytics dashboard (DEV3-022c) —
 * the labelled metric row, the section card shell, the loading skeleton,
 * and the honest trend-empty panel. All styling is `sx`-only with theme
 * tokens; spacing uses logical properties (RTL-safe).
 */

import { TrendingFlatOutlined } from "@mui/icons-material";
import { Box, Card, CardContent, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import type { ReactElement, ReactNode } from "react";

/** One labelled metric row inside a section card. */
export function MetricRow({ label, value }: { readonly label: string; readonly value: string | number }): ReactElement {
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      sx={{
        justifyContent: "space-between",
        alignItems: "baseline",
        gapInline: 2,
        paddingBlock: 0.5,
        borderBottom: `1px solid ${theme.palette.divider}`,
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      <Typography variant="body2" sx={({ palette }) => ({ color: palette.text.secondary })}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
    </Stack>
  );
}

/** One metric section card (icon + title + rows). */
export function SectionCard({
  title,
  icon,
  children,
}: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ p: 3, "&:last-child": { paddingBottom: 3 } }}>
        <Stack direction="row" sx={{ alignItems: "center", gapInline: 1, marginBlockEnd: 2 }}>
          <Box sx={theme => ({ display: "inline-flex", color: theme.palette.primary.main })} aria-hidden="true">
            {icon}
          </Box>
          <Typography variant="h6" component="h2">
            {title}
          </Typography>
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

/** Skeleton placeholder matching the final card shape (no layout shift). */
export function SectionCardSkeleton(): ReactElement {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3, "&:last-child": { paddingBottom: 3 } }}>
        <Stack direction="row" sx={{ alignItems: "center", gapInline: 1, marginBlockEnd: 2 }}>
          <Skeleton variant="circular" sx={{ width: 24, height: 24 }} />
          <Skeleton variant="text" sx={{ width: "45%", fontSize: "1.25rem" }} />
        </Stack>
        <Stack sx={{ gapInline: 2 }}>
          {[0, 1, 2, 3].map(row => (
            <Skeleton key={row} variant="text" sx={{ width: "100%" }} />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Honest empty state for a trend card — an all-zero (or currency-less)
 * 30-day window renders this centered icon + copy panel INSTEAD of a bare
 * axis (or a fabricated flat line). Same footprint as the chart so the
 * card never shifts between loading and empty states.
 */
export function TrendEmptyPanel({ message }: { readonly message: string }): ReactElement {
  const theme = useTheme();
  return (
    <Stack
      sx={{
        alignItems: "center",
        justifyContent: "center",
        gapInline: 1,
        minHeight: 220,
        border: `1px dashed ${theme.palette.divider}`,
        borderRadius: 1,
      }}
    >
      <TrendingFlatOutlined sx={theme => ({ color: theme.palette.text.disabled, fontSize: 28 })} aria-hidden="true" />
      <Typography variant="body2" sx={({ palette }) => ({ color: palette.text.secondary })}>
        {message}
      </Typography>
    </Stack>
  );
}
