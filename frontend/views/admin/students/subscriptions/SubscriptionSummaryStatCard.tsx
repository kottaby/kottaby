"use client";

/**
 * SubscriptionSummaryStatCard — one status mini-card of the drawer's
 * subscription summary strip: the tone-lane glyph, the big tabular count,
 * and the status label. Pressing the card selects its lifecycle lens
 * (the chip row's shared selection) — the pressed card carries the
 * container tint + ring while the rest stay outlined with a hover tint.
 * An unselected card's glyph rides the tone's dot lane; a pressed card's
 * whole body rides the on-container lane.
 *
 * Presentational: the count + resolved label arrive via props (the
 * per-status labels reuse the namespace's `status` slots — single-sourced,
 * never re-translated). MUI v9 `sx`-only styling, theme tokens only; the
 * `button` reset keeps the 44px touch discipline without UA chrome.
 */

import {
  CheckCircleOutlined as ActiveIcon,
  CancelOutlined as CancelledIcon,
  EventBusyOutlined as ExpiredIcon,
} from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { SubscriptionStatus } from "@/frontend/graphql/generated/gql/graphql";
import {
  STATUS_TONE,
  type SubscriptionStatusFilter,
} from "@/frontend/views/admin/students/subscriptions/subscriptionAdmin.helpers";
import { type DirectoryTone, toneColors } from "@/frontend/views/admin/users/utils";

interface SubscriptionSummaryStatCardProps {
  readonly status: SubscriptionStatus;
  readonly count: number;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (filter: SubscriptionStatusFilter) => void;
}

export function SubscriptionSummaryStatCard({
  status,
  count,
  label,
  selected,
  onSelect,
}: SubscriptionSummaryStatCardProps): ReactNode {
  const tone: DirectoryTone = STATUS_TONE[status];
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(status)}
      aria-pressed={selected}
      sx={theme => {
        const colors = toneColors(theme, tone);
        return {
          all: "unset",
          boxSizing: "border-box",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 1.25,
          borderRadius: "12px",
          textAlign: "center",
          width: "100%",
          transition: theme.transitions.create(["background-color", "border-color", "box-shadow"], {
            duration: theme.transitions.duration.shorter,
          }),
          border: `1px solid ${theme.palette.border.light}`,
          ...(selected
            ? { bgcolor: colors.bg, borderColor: colors.dot, color: colors.fg, boxShadow: theme.shadows[1] }
            : {
                color: theme.palette.text.primary,
                "& .subscription-strip-icon": { color: colors.dot },
                "&:hover": { bgcolor: colors.bg },
              }),
          "&:focus-visible": { outline: `2px solid ${colors.dot}`, outlineOffset: 2 },
        };
      }}
    >
      <Box aria-hidden className="subscription-strip-icon" sx={{ display: "flex" }}>
        {STAT_GLYPHS[status]}
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
        {count}
      </Typography>
      <Typography
        variant="caption"
        sx={theme => ({
          lineHeight: 1.3,
          ...(selected ? { color: "inherit", opacity: 0.75 } : { color: theme.palette.text.secondary }),
        })}
      >
        {label}
      </Typography>
    </Box>
  );
}

/** The lifecycle lens glyphs — the same icon set the chip row rides. */
const STAT_GLYPHS: Partial<Record<SubscriptionStatus, ReactNode>> = {
  [SubscriptionStatus.Active]: <ActiveIcon sx={{ fontSize: 20 }} />,
  [SubscriptionStatus.Expired]: <ExpiredIcon sx={{ fontSize: 20 }} />,
  [SubscriptionStatus.Cancelled]: <CancelledIcon sx={{ fontSize: 20 }} />,
};
