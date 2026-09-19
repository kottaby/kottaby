"use client";

/**
 * Presentational parts for the teacher session-report submission dialog.
 * Mode-resolved sections rendered by `TeacherSessionReportDialog`:
 *  - `AssignmentBlock` — Jadid/Madi sub-forms (ayah span + SurahJuz picker)
 *  - `ReviewState` — read-only report display
 * The grade-previous block and history list are kept inline in the dialog
 * because they share the form-state setters the dialog owns.
 */

import { MenuItem, Rating, Select, Stack, TextField, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { SurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
import type { HomeWorkBlockInput } from "@/backend/types";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

/** The 35-member Surah/Juz vocabulary for the dialog's `Select`. */
const SURAH_JUZ_OPTIONS: readonly SurahJuzRef[] = Object.values(SurahJuzRef);

interface AssignmentBlockProps {
  readonly title: string;
  readonly fromAyahLabel: string;
  readonly toAyahLabel: string;
  readonly surahJuzPickerLabel: string;
  readonly block: HomeWorkBlockInput | null;
  readonly onChange: (block: HomeWorkBlockInput | null) => void;
  readonly t: SessionsLabels;
}

export function AssignmentBlock({
  title,
  fromAyahLabel,
  toAyahLabel,
  surahJuzPickerLabel,
  block,
  onChange,
  t,
}: Readonly<AssignmentBlockProps>): ReactNode {
  const defaultSurah = SurahJuzRef.SurahAlFatihah;
  return (
    <Stack sx={{ gap: 1 }}>
      <Typography variant="subtitle2">{title}</Typography>
      <Stack sx={{ flexDirection: "row", gap: 1 }}>
        <TextField
          label={fromAyahLabel}
          type="number"
          value={block?.fromAyah ?? ""}
          onChange={event => handleAyahChange(event.target.value, "fromAyah", block, onChange, defaultSurah)}
        />
        <TextField
          label={toAyahLabel}
          type="number"
          value={block?.toAyah ?? ""}
          onChange={event => handleAyahChange(event.target.value, "toAyah", block, onChange, defaultSurah)}
        />
      </Stack>
      <Select
        label={surahJuzPickerLabel}
        value={block?.surahJuz ?? ""}
        onChange={event => handleSurahChange(event.target.value, block, onChange)}
      >
        {SURAH_JUZ_OPTIONS.map(option => (
          <MenuItem key={option} value={option}>
            {t.surahJuzLabel(option)}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  );
}

function handleAyahChange(
  value: string,
  field: "fromAyah" | "toAyah",
  block: HomeWorkBlockInput | null,
  onChange: (block: HomeWorkBlockInput | null) => void,
  defaultSurah: SurahJuzRef
): void {
  if (value === "") {
    onChange(null);
    return;
  }
  const num = Number(value);
  if (!Number.isSafeInteger(num)) return;
  const base = block ?? { fromAyah: 0, toAyah: 0, surahJuz: defaultSurah };
  onChange({ ...base, [field]: num });
}

function handleSurahChange(
  value: SurahJuzRef | "",
  block: HomeWorkBlockInput | null,
  onChange: (block: HomeWorkBlockInput | null) => void
): void {
  if (value === "") {
    onChange(null);
    return;
  }
  const base = block ?? { fromAyah: 0, toAyah: 0, surahJuz: SurahJuzRef.SurahAlFatihah };
  onChange({ ...base, surahJuz: value });
}

interface ReviewStateProps {
  readonly report: { readonly teacherNotes: string; readonly studentRatingByTeacher: number };
  readonly t: SessionsLabels;
}

export function ReviewState({ report, t }: Readonly<ReviewStateProps>): ReactNode {
  return (
    <Stack sx={{ gap: 1 }}>
      <Typography variant="subtitle2">{t.reportReviewedNotesLabel}</Typography>
      <Typography variant="body2">{report.teacherNotes}</Typography>
      <Typography variant="subtitle2">{t.reportReviewedRatingLabel}</Typography>
      <Rating value={report.studentRatingByTeacher} readOnly />
    </Stack>
  );
}
