"use client";

/**
 * DirectoryToneChip — the small tonal pill the directory row cells share
 * (role pill, per-role status/details chips). Painted from a M3
 * container/`on<Color>Container` pair via `directoryToneColors`.
 *
 * The chip NEVER flex-shrinks: width-capped wrapping flex rows (students
 * balances cell, mobile-card status rows) would otherwise squeeze the pill
 * below its content size while the MUI label keeps `overflow: hidden` —
 * clipping the trailing digit ("الحفظ 0" → "الحفظ"). Shrinking is replaced
 * by wrapping, so every pill always renders its full label.
 */

import { Chip } from "@mui/material";
import type { ReactNode } from "react";
import { type DirectoryTone, toneColors } from "@/frontend/views/admin/users/utils";

interface TonalChipProps {
  readonly tone: DirectoryTone;
  readonly label: string;
  /**
   * Outlined lane — transparent fill with a `tone.main` border/text instead
   * of the container pair. Lets one surface run TWO chip families (e.g. the
   * wallet ledger's outlined type chips over filled status chips) without
   * hue collisions between the dark container pairs.
   */
  readonly outlined?: boolean;
}

/** Small pill chip painted from a M3 container/`on<Color>Container` pair. */
export function TonalChip({ tone, label, outlined = false }: TonalChipProps): ReactNode {
  return (
    <Chip
      size="small"
      label={label}
      sx={theme => {
        const colors = toneColors(theme, tone);
        return {
          height: 26,
          borderRadius: "999px",
          fontWeight: 600,
          ...(outlined
            ? { bgcolor: "transparent", border: `1px solid ${colors.dot}`, color: colors.dot }
            : { bgcolor: colors.bg, color: colors.fg }),
          flexShrink: 0,
        };
      }}
    />
  );
}
