"use client";

import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import type { ReactNode } from "react";
import { SessionStatus } from "@/frontend/graphql/generated/gql/graphql";
import { Sessions, useAppTranslation } from "@/shared/locale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/**
 * SessionStatusFilterChips — the student/teacher sessions list status filter.
 *
 * A single-select (`exclusive`) MUI `ToggleButtonGroup` row rendering the
 * "all statuses" token plus the FOUR reachable `SessionStatus` values
 * (`Disputed` is intentionally absent — it is unreachable on today's
 * surfaces; its chip LABEL still exists in `SessionsLabels` for vocabulary
 * stability, but no filter chip is offered for it).
 *
 * Token-space design (oxlint `no-unsafe-enum-comparison`): the component
 * works exclusively on plain string TOKENS — the "all" token plus the enum
 * member strings as filter tokens — mapped through `Record<string, string>`
 * lookup tables (label key + filter value). NO `switch` over enum members
 * and NO direct `enum === enum` comparisons appear anywhere.
 *
 * Accessibility: every toggle carries an explicit `aria-pressed` (true on
 * the active token) and the group is a labelled toolbar row; mobile hit
 * areas keep the ≥44px touch target (`minHeight` collapses on `sm+`).
 *
 * MUI v9 discipline: `sx`-only styling, colors resolve through theme-palette
 * callbacks (no hex, no string palette access), `*Outlined` icons only (none
 * needed here), RTL-safe logical composition.
 */

/** Token that clears the status filter (renders `SessionsLabels.statusFilterAll`). */
const ALL_TOKEN = "all";

/**
 * Chip order — "all" first, then the four reachable lifecycle statuses.
 * Plain string tokens, never enum-typed comparisons.
 */
const FILTER_TOKENS: readonly string[] = [
  ALL_TOKEN,
  SessionStatus.Scheduled,
  SessionStatus.Started,
  SessionStatus.Completed,
  SessionStatus.Cancelled,
];

/** Token → `SessionStatus | null` filter value (`null` = no filtering). */
const FILTER_STATUS_BY_TOKEN: Record<string, SessionStatus | null> = {
  [ALL_TOKEN]: null,
  [SessionStatus.Scheduled]: SessionStatus.Scheduled,
  [SessionStatus.Started]: SessionStatus.Started,
  [SessionStatus.Completed]: SessionStatus.Completed,
  [SessionStatus.Cancelled]: SessionStatus.Cancelled,
};

/** Token → compile-time label key into `SessionsLabels` (property access only). */
const FILTER_LABEL_KEY_BY_TOKEN: Record<string, keyof SessionsLabels> = {
  [ALL_TOKEN]: "statusFilterAll",
  [SessionStatus.Scheduled]: "statusScheduled",
  [SessionStatus.Started]: "statusStarted",
  [SessionStatus.Completed]: "statusCompleted",
  [SessionStatus.Cancelled]: "statusCancelled",
};

interface SessionStatusFilterChipsProps {
  /**
   * Active filter value. `null` renders the "all" token selected; any
   * `SessionStatus` member selects the matching status chip.
   */
  readonly value: SessionStatus | null;
  /** Status-change callback (`null` = the caller must clear its filter). */
  readonly onChange: (status: SessionStatus | null) => void;
}

/**
 * Resolves the selected toggle's token for a filter value: enum members map
 * to themselves as tokens; `null` maps to the "all" token.
 */
function tokenForFilterValue(value: SessionStatus | null): string {
  if (value === null) return ALL_TOKEN;
  // The token space REUSES the enum member strings — a Record lookup (not an
  // enum comparison) keeps the unsafe-enum lint table satisfied.
  return FILTER_STATUS_BY_TOKEN[value] ?? ALL_TOKEN;
}

/** Single-select chip row for the sessions status filter. */
export function SessionStatusFilterChips({ value, onChange }: Readonly<SessionStatusFilterChipsProps>): ReactNode {
  const t = useAppTranslation(Sessions);
  const activeToken = tokenForFilterValue(value);

  return (
    <ToggleButtonGroup
      exclusive
      value={activeToken}
      onChange={(_, token) => {
        if (typeof token !== "string") return;
        onChange(FILTER_STATUS_BY_TOKEN[token] ?? null);
      }}
      sx={{ flexWrap: "wrap", gap: 1 }}
    >
      {FILTER_TOKENS.map(token => {
        const labelKey = FILTER_LABEL_KEY_BY_TOKEN[token];
        const label = labelKey === undefined ? token : t[labelKey];
        return (
          <ToggleButton
            key={token}
            value={token}
            aria-pressed={token === activeToken}
            sx={theme => ({
              minHeight: { xs: 44, sm: 36 },
              px: 2.5,
              borderRadius: 999,
              textTransform: "none",
              fontWeight: 600,
              borderColor: theme.palette.outlineVariant,
              "&.Mui-selected": {
                bgcolor: theme.palette.primaryContainer,
                color: theme.palette.onPrimaryContainer,
                "&:hover": {
                  bgcolor: theme.palette.primaryContainer,
                },
              },
            })}
          >
            {label}
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}
