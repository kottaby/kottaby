"use client";

/**
 * MetricCard — the shared shell of the seven metric sections: a tinted
 * `*Outlined` section glyph, the section title, and the label/value rows
 * (or a section-specific body, e.g. the revenue table). `MetricRow` keeps
 * every counter honest: the label is a translation-handle string, the value
 * renders exactly what the snapshot carries (numbers localized for digit
 * display, money strings pre-grouped by the caller, `—` for honest nulls).
 *
 * MUI v9 discipline: `sx`-only styling; colors exclusively through
 * `theme.palette.*` callbacks; RTL-safe logical composition.
 */

import { Box, Card, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { cardHoverSx, formatCount, TABULAR_NUMS_SX } from "@/frontend/views/admin/analytics/platform-analytics-display";

interface MetricCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly children: ReactNode;
  /** Optional extra `sx` (e.g. a responsive grid span), composed after the shell styles. */
  readonly sx?: SxProps<Theme>;
}

/**
 * Card shell — glyph + section title over the section body. Hover lifts the
 * card 2px with a border/shadow upgrade (`cardHoverSx`) — the grid reads as
 * a set of interactive surfaces without any layout shift.
 */
export function MetricCard({ icon, title, children, sx }: Readonly<MetricCardProps>): ReactNode {
  // Extra styles resolve against the SAME theme callback as the shell so a
  // responsive span (`{ sm: ..., lg: ... }`) rides the normal sx pipeline.
  // The narrow Record cast keeps the union's array/pseudo variants out of
  // the spread while the PUBLIC prop type (`SxProps<Theme>`) stays strict.
  const resolveExtra = (theme: Theme): Record<string, unknown> =>
    typeof sx === "function"
      ? (sx(theme) as Record<string, unknown>)
      : ((sx as Record<string, unknown> | undefined) ?? {});
  return (
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        height: "100%",
        ...cardHoverSx(theme),
        ...resolveExtra(theme),
      })}
    >
      <Stack spacing={2} sx={{ padding: { xs: 2, md: 2.5 }, height: "100%" }}>
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
        {children}
      </Stack>
    </Card>
  );
}

interface MetricRowProps {
  readonly label: string;
  /** Number → locale digit display; string → rendered verbatim (pre-grouped money, `—`). */
  readonly value: number | string;
  readonly locale: string;
}

/** One label/value row — the label sits at the line start, the value at the end. */
export function MetricRow({ label, value, locale }: Readonly<MetricRowProps>): ReactNode {
  const display = typeof value === "number" ? formatCount(value, locale) : value;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
      <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
        {label}
      </Typography>
      <Typography variant="body2" component="p" sx={{ fontWeight: 600, ...TABULAR_NUMS_SX }}>
        {display}
      </Typography>
    </Stack>
  );
}
