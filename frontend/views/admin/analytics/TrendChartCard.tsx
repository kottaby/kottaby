"use client";

/**
 * TrendChartCard — the shared shell of the two trend charts: `*Outlined`
 * glyph, the chart title, the daily-granularity chip, and the plot body
 * slot (the body arrives through a `next/dynamic` import, so while the
 * chunk loads the same-height skeleton renders — no layout shift). The
 * card body owns the horizontal-scroll region that preserves the plot's
 * min-width on narrow viewports.
 *
 * MUI v9 discipline: `sx`-only styling, `theme.palette.*` tokens only.
 */

import { Box, Card, Chip, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface TrendChartCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  /** Granularity caption (the `dailyLabel` chip). */
  readonly caption: string;
  readonly children: ReactNode;
}

export function TrendChartCard({ icon, title, caption, children }: Readonly<TrendChartCardProps>): ReactNode {
  return (
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
      })}
    >
      <Stack spacing={2} sx={{ padding: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Box
              aria-hidden="true"
              sx={theme => ({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: "10px",
                backgroundColor: theme.palette.primaryContainer,
                color: theme.palette.onPrimaryContainer,
              })}
            >
              {icon}
            </Box>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
          </Stack>
          <Chip label={caption} size="small" />
        </Stack>
        <Box sx={{ overflowX: "auto" }}>{children}</Box>
      </Stack>
    </Card>
  );
}
