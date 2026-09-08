"use client";

/**
 * AdminStudentRowCells — shared cell-level components for the admin student
 * directory surfaces (desktop table + mobile card list).
 *
 * Both surfaces render the SAME semantic content per row — balance badges,
 * parent identity, language chips, trial state, joined timestamp — so the
 * rendering lives in this component family and each surface composes it.
 *
 * Structure (the two largest members live beside this file to hold the
 * 150-line module convention):
 *  - `AdminStudentIdentityCell.tsx`  → the desktop-only `TableCell`
 *    (avatar + name + email + copy-email/view-details quick actions),
 *  - `AdminStudentParentContent.tsx` → the parent-placement content cell,
 *  - this module → the compact content cells: `StudentBalancesBadges` /
 *    `StudentLanguageChips` / `StudentTrialContent` / `StudentJoinedText`,
 *    reused by the desktop row and the mobile body rows.
 *
 * Balance badges paint from four DISTINCT M3 container lanes (hifz =
 * primary, reviews = secondary, tajweed = success, trial = warning) via the
 * shared `TonalChip` utility imported from the users directory (single
 * tonal-lane mapping across the admin domain).
 */

import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminStudentsQuery } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { TonalChip } from "@/frontend/views/admin/users/ui";
import type { AppLocale } from "@/shared/locale";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

/** Directory list-item row consumed by the cell components. */
export type StudentDirectoryItem = AdminStudentsQuery["adminStudents"]["items"][number];

interface StudentBalancesBadgesProps {
  readonly student: StudentDirectoryItem;
  readonly labels: Pick<AdminStudentsLabels, "balances">;
}

/**
 * Balances content — four compact badges in the backend's canonical lane
 * order, each composed as `label + count` and painted from its own M3
 * container lane: hifz = primary, reviews = secondary, tajweed = success,
 * trial = warning. The row wraps so a 390px viewport keeps all four
 * visible.
 */
export function StudentBalancesBadges({ student, labels }: StudentBalancesBadgesProps): ReactNode {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, minWidth: 0 }}>
      <TonalChip tone="primary" label={`${labels.balances.hifz} ${student.balanceHifz}`} />
      <TonalChip tone="secondary" label={`${labels.balances.reviews} ${student.balanceReviews}`} />
      <TonalChip tone="success" label={`${labels.balances.tajweed} ${student.balanceTajweed}`} />
      <TonalChip tone="warning" label={`${labels.balances.trial} ${student.balanceTrial}`} />
    </Box>
  );
}

interface StudentLanguageChipsProps {
  readonly student: StudentDirectoryItem;
}

/** Languages content — primary + another chips (neutral lane), em-dash when unset. */
export function StudentLanguageChips({ student }: StudentLanguageChipsProps): ReactNode {
  const languages = [student.primaryLanguage, student.anotherLanguage].filter(
    (language): language is string => language !== null
  );
  if (languages.length === 0) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, minWidth: 0 }}>
      {languages.map(language => (
        <LanguageChip key={language} label={language} />
      ))}
    </Box>
  );
}

/** Small neutral language chip (surface-container lane, 26px tall). */
function LanguageChip({ label }: { readonly label: string }): ReactNode {
  return (
    <Box
      component="span"
      sx={theme => ({
        display: "inline-flex",
        alignItems: "center",
        px: 1,
        height: 26,
        borderRadius: "999px",
        bgcolor: theme.palette.surfaceContainerHighest,
        color: theme.palette.onSurfaceVariant,
        fontSize: 12,
        fontWeight: 600,
        maxWidth: 120,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      })}
    >
      {label}
    </Box>
  );
}

interface StudentTrialContentProps {
  readonly student: StudentDirectoryItem;
  readonly locale: AppLocale;
  readonly labels: Pick<AdminStudentsLabels, "trialBadge">;
}

/**
 * Trial content — the trial chip above the localized granted timestamp when
 * a trial was granted, the em-dash otherwise.
 */
export function StudentTrialContent({ student, locale, labels }: StudentTrialContentProps): ReactNode {
  if (student.trialGrantedAt === null) {
    return (
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        —
      </Typography>
    );
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.5 }}>
      <TonalChip tone="warning" label={labels.trialBadge} />
      <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
        {formatApplicantDate(student.trialGrantedAt, locale)}
      </Typography>
    </Box>
  );
}

interface StudentJoinedTextProps {
  readonly student: StudentDirectoryItem;
  readonly locale: AppLocale;
}

/** Joined content — localized timestamp via the shared frontend date util. */
export function StudentJoinedText({ student, locale }: StudentJoinedTextProps): ReactNode {
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
      {formatApplicantDate(student.createdAt, locale)}
    </Typography>
  );
}
