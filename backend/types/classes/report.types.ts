import type { reports } from "@/backend/db/schema/classes/reports";
import type { SurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";

export type ReportSelectType = typeof reports.$inferSelect;
export type ReportInsertType = typeof reports.$inferInsert;

/**
 * Canonical GraphQL/API read shape for a report row — row-shaped, id-first
 * consumer contract, derived straight from the table's select row (identical
 * to `ReportSelectType`). Every column is consumer-safe by construction: the
 * teacher identity is reached through the session, never denormalized onto
 * the row.
 */
export type ReportReturnType = typeof reports.$inferSelect;

/**
 * Grade pair for one homework track: both members are integers in [0, 100].
 * The service validates the range pre-DB (the table CHECK constraints are a
 * backstop, never the primary error path).
 */
export type HomeWorkGradeFieldsInput = { currentGrade: number; revisionGrade: number };

/**
 * One cohesive homework assignment block: the ayah span plus the surah/juz
 * reference classifying it. `surahJuz` must be a shipped `SurahJuzRef`
 * member — rejected pre-DB by the fail-closed `isSurahJuzRef` guard when it
 * is not.
 */
export type HomeWorkBlockInput = { fromAyah: number; toAyah: number; surahJuz: SurahJuzRef };

/**
 * The two parallel homework tracks a report may assign: Jadid (the new
 * memorization) and Madi (the revision). Each block is optional and
 * self-contained; the producing service maps blocks onto the `home_work`
 * columns inside the submission transaction.
 */
export type HomeWorkAssignInput = { jadid?: HomeWorkBlockInput; madi?: HomeWorkBlockInput };

/**
 * Session report submission input: the client-controlled whitelist ONLY
 * (BOPLA). Row identity, the session join, and both timestamps are
 * structurally absent — the session id arrives as the mutation argument and
 * every server-controlled column is written by the producing service inside
 * its transaction. Grades are integers in [0, 100], the rating an integer in
 * [0, 5], and the notes a non-empty trimmed string (all validated pre-DB).
 */
export interface SessionReportSubmitInput {
  readonly teacherNotes: string;
  readonly studentRatingByTeacher: number;
  readonly homework?: HomeWorkAssignInput;
  readonly previousGrades?: HomeWorkGradeFieldsInput;
}
