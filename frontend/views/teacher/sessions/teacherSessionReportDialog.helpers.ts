/**
 * Pure helpers for the teacher session-report submission dialog. Three
 * responsibilities, all client-side and pure (NO DB, NO network, NO
 * React state):
 *  1. `buildSubmitPayload(form)` — builds `SubmitSessionReportInput`
 *     field-by-field (BOPLA — never a `{...form}` spread).
 *  2. `validateReportForm(form, t)` — mirrors `session-report.guards.ts`:
 *     trim+required+2000-char notes, 0–5 rating, positive-safe-integer
 *     ayahs from≤to, ≥1 assignment block, 0–100 grade range.
 *  3. `resolveNewestRow(page)` + `isNewestRowUngraded(row)` — derive the
 *     grade-previous block's pre-fill shape.
 * The server is the authority on every bound; the client mirror is UX
 * only. The hook's `onError` arm maps by `extensions.code` only — never
 * echoes server strings.
 */

import { isSurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
import type {
  HomeWorkAssignInput,
  HomeWorkBlockInput,
  HomeWorkGradeFieldsInput,
  SessionReportSubmitInput,
} from "@/backend/types";
import type { StudentHomeworkHistoryQuery } from "@/frontend/graphql/generated/gql/graphql";
import type { SessionsLabels } from "@/shared/locale/types/sessions";

const MAX_TEACHER_NOTES_LENGTH = 2000;
const MIN_AYAH_VALUE = 1;
const MIN_RATING = 0;
const MAX_RATING = 5;
const MIN_GRADE = 0;
const MAX_GRADE = 100;

/** The form's grade-previous pair — both grades nullable. */
export interface FormGradeFields {
  readonly currentGrade: number | null;
  readonly revisionGrade: number | null;
}

/** The dialog's form state (carries partial values the builder normalizes). */
export interface SessionReportFormState {
  readonly teacherNotes: string;
  readonly studentRatingByTeacher: number | null;
  readonly jadid?: HomeWorkBlockInput | null;
  readonly madi?: HomeWorkBlockInput | null;
  readonly previousGrades?: FormGradeFields | null;
}

type HistoryItem = StudentHomeworkHistoryQuery["studentHomeworkHistory"]["items"][number];

/** Field-keyed validation messages — empty record means the form is submittable. */
export type ReportFormErrors = Readonly<Record<string, string>>;

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= MIN_AYAH_VALUE;
}

function isValidBlock(block: HomeWorkBlockInput | null | undefined): boolean {
  if (block === null || block === undefined) {
    return false;
  }
  if (!isPositiveSafeInteger(block.fromAyah) || !isPositiveSafeInteger(block.toAyah)) {
    return false;
  }
  if (block.fromAyah > block.toAyah) {
    return false;
  }
  return isSurahJuzRef(block.surahJuz);
}

function normalizeBlock(block: HomeWorkBlockInput | null | undefined): HomeWorkBlockInput | undefined {
  if (block === null || block === undefined) {
    return undefined;
  }
  if (!isPositiveSafeInteger(block.fromAyah) || !isPositiveSafeInteger(block.toAyah)) {
    return undefined;
  }
  if (!isSurahJuzRef(block.surahJuz)) {
    return undefined;
  }
  return { fromAyah: block.fromAyah, toAyah: block.toAyah, surahJuz: block.surahJuz };
}

function buildAssignmentBlock(form: SessionReportFormState): HomeWorkAssignInput | undefined {
  const jadid = normalizeBlock(form.jadid);
  const madi = normalizeBlock(form.madi);
  if (jadid === undefined && madi === undefined) {
    return undefined;
  }
  return {
    ...(jadid !== undefined ? { jadid } : {}),
    ...(madi !== undefined ? { madi } : {}),
  };
}

/** Builds `SubmitSessionReportInput` field-by-field (BOPLA — no spread).
 *  Grades are absent on the assignment blocks (Jadid/Madi carry only the
 *  ayah span + SurahJuz ref). `previousGrades` rides only when BOTH
 *  grades are set (first-session → field absent). */
export function buildSubmitPayload(form: SessionReportFormState): SessionReportSubmitInput {
  const homework = buildAssignmentBlock(form);
  const previousGrades: HomeWorkGradeFieldsInput | undefined =
    form.previousGrades?.currentGrade != null && form.previousGrades?.revisionGrade != null
      ? {
          currentGrade: form.previousGrades.currentGrade,
          revisionGrade: form.previousGrades.revisionGrade,
        }
      : undefined;
  return {
    teacherNotes: form.teacherNotes.trim(),
    studentRatingByTeacher: form.studentRatingByTeacher ?? 0,
    ...(homework !== undefined ? { homework } : {}),
    ...(previousGrades !== undefined ? { previousGrades } : {}),
  };
}

function validateNotes(notes: string, t: SessionsLabels, errors: Record<string, string>): void {
  const trimmed = notes.trim();
  if (trimmed.length < 1) errors.teacherNotes = t.reportNotesRequiredMessage;
  else if (trimmed.length > MAX_TEACHER_NOTES_LENGTH) errors.teacherNotes = t.reportNotesTooLongMessage;
}

function validateRating(rating: number | null, t: SessionsLabels, errors: Record<string, string>): void {
  if (rating === null || !Number.isSafeInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    errors.studentRatingByTeacher = t.reportRatingRequiredMessage;
  }
}

function validateAssignmentBlocks(
  form: SessionReportFormState,
  t: SessionsLabels,
  errors: Record<string, string>
): void {
  const jadidPresent = form.jadid != null;
  const madiPresent = form.madi != null;
  if (!jadidPresent && !madiPresent) {
    errors.homework = t.reportBlocksRequiredMessage;
    return;
  }
  if (jadidPresent && !isValidBlock(form.jadid)) errors.jadid = t.reportSurahJuzRequiredMessage;
  if (madiPresent && !isValidBlock(form.madi)) errors.madi = t.reportSurahJuzRequiredMessage;
}

function validateGradeField(
  value: number | null,
  key: string,
  t: SessionsLabels,
  errors: Record<string, string>
): void {
  if (value === null) return;
  if (!Number.isSafeInteger(value) || value < MIN_GRADE || value > MAX_GRADE) errors[key] = t.reportGradeRangeMessage;
}

function validatePreviousGrades(
  grades: FormGradeFields | null | undefined,
  t: SessionsLabels,
  errors: Record<string, string>
): void {
  if (!grades) return;
  validateGradeField(grades.currentGrade, "previousGradeJadid", t, errors);
  validateGradeField(grades.revisionGrade, "previousGradeMadi", t, errors);
}

/** Validates the form state against the server vocabulary. Returns the
 *  field-keyed error record (empty when the form is submittable). */
export function validateReportForm(form: SessionReportFormState, t: SessionsLabels): ReportFormErrors {
  const errors: Record<string, string> = {};
  validateNotes(form.teacherNotes, t, errors);
  validateRating(form.studentRatingByTeacher, t, errors);
  validateAssignmentBlocks(form, t, errors);
  validatePreviousGrades(form.previousGrades, t, errors);
  return errors;
}

/** Resolves the newest row of the student's homework history page
 *  (`items[0]`, newest-first per the server) or `null` when empty
 *  (first-session case — grade-previous hides + first-session hint shows). */
export function resolveNewestRow(page: StudentHomeworkHistoryQuery | undefined): HistoryItem | null {
  if (!page) {
    return null;
  }
  const items = page.studentHomeworkHistory.items;
  return items.length === 0 ? null : (items[0] ?? null);
}

/** Returns `true` when BOTH grade columns are `null` — the one-shot
 *  predicate `gradeHomeWorkOnce` guards on (`home-work.repository.ts:185`).
 *  A graded row returns `false` — the grade-previous renders read-only
 *  with the `reportAlreadyGradedLabel` chip. */
export function isNewestRowUngraded(row: HistoryItem | null): boolean {
  if (row === null) {
    return false;
  }
  return row.currentGrade === null && row.revisionGrade === null;
}
