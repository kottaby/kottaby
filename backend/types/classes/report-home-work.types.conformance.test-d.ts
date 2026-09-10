/**
 * Type-Level Conformance Suite — report & homework canonical types.
 * Validated by `bun tsgo` (the compiler is the test runner).
 * `.test-d.ts` suffix = outside bun test runner glob.
 *
 * POSITIVES use `satisfies` — must compile.
 * NEGATIVES use `@ts-expect-error` directly before the offending line.
 */
import { SurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
import type {
  HomeWorkInsertType,
  HomeWorkReturnType,
  HomeWorkSelectType,
} from "@/backend/types/classes/home-work.types";
import type {
  HomeWorkAssignInput,
  HomeWorkBlockInput,
  HomeWorkGradeFieldsInput,
  ReportInsertType,
  ReportReturnType,
  ReportSelectType,
  SessionReportSubmitInput,
} from "@/backend/types/classes/report.types";
import type {
  SessionReportWaveContext,
  SessionReportWaveContextRow,
  SessionReportWaveParticipant,
  SessionWaveParticipantContext,
} from "@/backend/types/classes/session-notification.types";
import type { AppLocale } from "@/shared/locale/AppLocale";

/** Helper to consume variables for TS6133. */
const v = (x: unknown): boolean => Boolean(x);

/** Exact type-identity probe: tuple-wrapped mutual assignability (no widening, no distribution). */
type Equals<A, B> = [A, B] extends [B, A] ? true : false;

// ========== REPORT READ SHAPE (ReportReturnType) ==========

// Positive — the read shape IS the derived select row (never re-declared, never forked)
const sameRow: Equals<ReportReturnType, ReportSelectType> = true;
v(sameRow);

// Negative — the read shape must stay the derived select row
// @ts-expect-error — ReportReturnType must remain the derived select row
const forkedRow: Equals<ReportReturnType, ReportSelectType> = false;
v(forkedRow);

// Positive — full canonical read shape (every column, exact nullability)
v({
  id: 1,
  sessionId: 2,
  teacherNotes: "Strong recitation this session",
  studentRatingByTeacher: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies ReportReturnType);

// Positive — the notes and rating columns are nullable until the report is written
v({
  id: 1,
  sessionId: 2,
  teacherNotes: null,
  studentRatingByTeacher: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies ReportReturnType);

// Positive — column typings
const reportIdTyped: Equals<ReportReturnType["id"], number> = true;
const reportSessionTyped: Equals<ReportReturnType["sessionId"], number> = true;
const reportNotesTyped: Equals<ReportReturnType["teacherNotes"], string | null> = true;
const reportRatingTyped: Equals<ReportReturnType["studentRatingByTeacher"], number | null> = true;
v(reportIdTyped);
v(reportSessionTyped);
v(reportNotesTyped);
v(reportRatingTyped);

// Negative — the notes column stays nullable, never non-null
// @ts-expect-error — teacherNotes is string | null
const notesNotNull: Equals<ReportReturnType["teacherNotes"], string> = true;
v(notesNotNull);

// ========== REPORT INSERT (round-trip) ==========

// Positive — minimal insert: the identity column and both timestamps carry server defaults
v({ sessionId: 2 } satisfies ReportInsertType);

// Positive — typical insert: notes plus rating
v({
  sessionId: 2,
  teacherNotes: "Needs revision on madd rules",
  studentRatingByTeacher: 4,
} satisfies ReportInsertType);

// Negative — the session join is mandatory
// @ts-expect-error — sessionId mandatory
const noSessionReport: ReportInsertType = { teacherNotes: "orphan note" };
v(noSessionReport);

// Negative — reports carry NO teacher_id column (the teacher is reached via the session)
v({
  sessionId: 2,
  // @ts-expect-error — teacherId is not a reports column
  teacherId: 9,
} satisfies ReportInsertType);

// Negative — homework columns do not exist on the reports insert
v({
  sessionId: 2,
  // @ts-expect-error — currentGrade belongs to home_work, not reports
  currentGrade: 90,
} satisfies ReportInsertType);

// Negative — the session join is a number, never a string
v({
  // @ts-expect-error — sessionId is number
  sessionId: "2",
} satisfies ReportInsertType);

// ========== HOMEWORK READ SHAPE (HomeWorkReturnType) ==========

// Positive — the read shape IS the derived select row (never re-declared, never forked)
const sameHomeWorkRow: Equals<HomeWorkReturnType, HomeWorkSelectType> = true;
v(sameHomeWorkRow);

// Negative — the read shape must stay the derived select row
// @ts-expect-error — HomeWorkReturnType must remain the derived select row
const forkedHomeWorkRow: Equals<HomeWorkReturnType, HomeWorkSelectType> = false;
v(forkedHomeWorkRow);

// Positive — full canonical read shape: assigned Jadid, ungraded, no revision track
v({
  id: 1,
  sessionId: 2,
  currentFromAyah: 1,
  currentToAyah: 7,
  currentGrade: null,
  currentSurahJuz: "surah_al_fatihah",
  revisionFromAyah: null,
  revisionToAyah: null,
  revisionGrade: null,
  revisionSurahJuz: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies HomeWorkSelectType);

// Positive — fully graded row on both tracks
v({
  id: 1,
  sessionId: 2,
  currentFromAyah: 1,
  currentToAyah: 10,
  currentGrade: 95,
  currentSurahJuz: "juz_2",
  revisionFromAyah: 1,
  revisionToAyah: 7,
  revisionGrade: 88,
  revisionSurahJuz: "surah_al_baqarah",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies HomeWorkSelectType);

// Positive — grade columns stay nullable in the read shape (assigned-but-ungraded is normal)
const currentGradeTyped: Equals<HomeWorkSelectType["currentGrade"], number | null> = true;
const revisionGradeTyped: Equals<HomeWorkSelectType["revisionGrade"], number | null> = true;
v(currentGradeTyped);
v(revisionGradeTyped);

// Positive — the surah/juz reference column is the pgEnum's closed literal union
const surahJuzUnionAligned: Equals<
  NonNullable<HomeWorkSelectType["currentSurahJuz"]>,
  NonNullable<HomeWorkInsertType["currentSurahJuz"]>
> = true;
v(surahJuzUnionAligned);

// ========== HOMEWORK INSERT (round-trip) ==========

// Positive — minimal insert: identity, join, and timestamps carry server defaults
v({ sessionId: 2 } satisfies HomeWorkInsertType);

// Positive — full two-track assignment insert
v({
  sessionId: 2,
  currentFromAyah: 1,
  currentToAyah: 7,
  currentSurahJuz: "surah_al_fatihah",
  revisionFromAyah: 8,
  revisionToAyah: 20,
  revisionSurahJuz: "juz_1",
} satisfies HomeWorkInsertType);

// Negative — the session join is mandatory
// @ts-expect-error — sessionId mandatory
const noSessionHomeWork: HomeWorkInsertType = { currentGrade: 90 };
v(noSessionHomeWork);

// Negative — the surah/juz reference union is closed (no invented members)
v({
  sessionId: 2,
  // @ts-expect-error — juz_31 is not a surahJuzRef member
  currentSurahJuz: "juz_31",
} satisfies HomeWorkInsertType);

// Negative — unknown columns are rejected on the homework insert
v({
  sessionId: 2,
  // @ts-expect-error — teacherNotes belongs to reports, not home_work
  teacherNotes: "wrong table",
} satisfies HomeWorkInsertType);

// ========== SUBMIT INPUT (closed client whitelist) ==========

// Positive — the bare whitelist: notes plus rating
v({ teacherNotes: "Excellent tajweed progress", studentRatingByTeacher: 4 } satisfies SessionReportSubmitInput);

// Positive — rating at the lower boundary
v({ teacherNotes: "n", studentRatingByTeacher: 0 } satisfies SessionReportSubmitInput);

// Positive — homework with a single Jadid block
v({
  teacherNotes: "Keep revising madd",
  studentRatingByTeacher: 5,
  homework: { jadid: { fromAyah: 1, toAyah: 7, surahJuz: SurahJuzRef.SurahAlFatihah } },
} satisfies SessionReportSubmitInput);

// Positive — homework with both tracks plus previous grades
v({
  teacherNotes: "Good session",
  studentRatingByTeacher: 3,
  homework: {
    jadid: { fromAyah: 1, toAyah: 7, surahJuz: SurahJuzRef.SurahAlBaqarah },
    madi: { fromAyah: 8, toAyah: 20, surahJuz: SurahJuzRef.Juz1 },
  },
  previousGrades: { currentGrade: 95, revisionGrade: 88 },
} satisfies SessionReportSubmitInput);

// Positive — the whitelist is exactly the four client-owned members
type SubmitKeys = keyof SessionReportSubmitInput;
const closedKeys: Equals<SubmitKeys, "teacherNotes" | "studentRatingByTeacher" | "homework" | "previousGrades"> = true;
v(closedKeys);

// Negative — the session join arrives as the mutation argument, never on the input
v({
  teacherNotes: "n",
  studentRatingByTeacher: 1,
  // @ts-expect-error — sessionId is server-controlled
  sessionId: 2,
} satisfies SessionReportSubmitInput);

// Negative — row identity is server-generated
v({
  teacherNotes: "n",
  studentRatingByTeacher: 1,
  // @ts-expect-error — id is server-controlled
  id: 99,
} satisfies SessionReportSubmitInput);

// Negative — timestamps are server-written
v({
  teacherNotes: "n",
  studentRatingByTeacher: 1,
  // @ts-expect-error — createdAt is server-controlled
  createdAt: new Date(),
} satisfies SessionReportSubmitInput);

v({
  teacherNotes: "n",
  studentRatingByTeacher: 1,
  // @ts-expect-error — updatedAt is server-controlled
  updatedAt: new Date(),
} satisfies SessionReportSubmitInput);

// Negative — grade fields live inside previousGrades, never at the top level
v({
  teacherNotes: "n",
  studentRatingByTeacher: 1,
  // @ts-expect-error — currentGrade belongs inside previousGrades
  currentGrade: 90,
} satisfies SessionReportSubmitInput);

// Negative — the rating is a number, never a string
v({
  teacherNotes: "n",
  // @ts-expect-error — studentRatingByTeacher is number
  studentRatingByTeacher: "5",
} satisfies SessionReportSubmitInput);

// ========== HOMEWORK INPUT ALIASES ==========

// Positive — grade pair at both range boundaries
v({ currentGrade: 0, revisionGrade: 100 } satisfies HomeWorkGradeFieldsInput);

const grades: HomeWorkGradeFieldsInput = { currentGrade: 90, revisionGrade: 80 };
v(grades);

// Positive — the grade pair is exactly the two members
type GradeKeys = keyof HomeWorkGradeFieldsInput;
const gradeKeys: Equals<GradeKeys, "currentGrade" | "revisionGrade"> = true;
v(gradeKeys);

// Negative — a string grade is rejected
v({
  currentGrade: 90,
  // @ts-expect-error — revisionGrade is number
  revisionGrade: "80",
} satisfies HomeWorkGradeFieldsInput);

// Positive — a complete block with every shipped SurahJuzRef member shape
const block: HomeWorkBlockInput = { fromAyah: 1, toAyah: 7, surahJuz: SurahJuzRef.Juz2 };
v(block);

// Positive — both blocks are optional
v({} satisfies HomeWorkAssignInput);
v({ jadid: { fromAyah: 1, toAyah: 7, surahJuz: SurahJuzRef.SurahAalImran } } satisfies HomeWorkAssignInput);
v({ madi: { fromAyah: 1, toAyah: 5, surahJuz: SurahJuzRef.SurahAnNisa } } satisfies HomeWorkAssignInput);

// Negative — a block without its surah/juz reference is incomplete
v({
  fromAyah: 1,
  toAyah: 7,
  // @ts-expect-error — surahJuz is mandatory on the block
} satisfies HomeWorkBlockInput);

// Negative — a raw member string is rejected on the block (string-enum closedness)
v({
  fromAyah: 1,
  toAyah: 7,
  // @ts-expect-error — surahJuz must be a SurahJuzRef member, never a raw string
  surahJuz: "juz_1",
} satisfies HomeWorkBlockInput);

// Negative — ayah endpoints are numbers, never strings
v({
  // @ts-expect-error — fromAyah is number
  fromAyah: "1",
  toAyah: 7,
  surahJuz: SurahJuzRef.SurahAlMaidah,
} satisfies HomeWorkBlockInput);

// Negative — the assign input carries only the two tracks (no invented blocks)
v({
  jadid: { fromAyah: 1, toAyah: 7, surahJuz: SurahJuzRef.Juz3 },
  // @ts-expect-error — manzil is not an assignment track
  manzil: { fromAyah: 1, toAyah: 7, surahJuz: SurahJuzRef.Juz4 },
} satisfies HomeWorkAssignInput);

// ========== REPORT WAVE CONTEXT (notification seam) ==========

// Positive — a participant with a persisted locale
const participant: SessionReportWaveParticipant = { userId: 1, fullName: "Sara", locale: "en" };
v(participant);

// Positive — a participant without a persisted locale
const localelessParticipant: SessionReportWaveParticipant = { userId: 2, fullName: "Umar", locale: null };
v(localelessParticipant);

// Positive — the report-wave participant is the request-wave participant shape, unchanged
const participantAligned: Equals<SessionReportWaveParticipant, SessionWaveParticipantContext> = true;
v(participantAligned);

// Positive — parent leg null (unlinked parent account)
v({
  sessionId: 7,
  student: { userId: 1, fullName: "Sara", locale: "ar" },
  teacher: { userId: 2, fullName: "Ustadh Ahmad", locale: "en" },
  parent: null,
} satisfies SessionReportWaveContext);

// Positive — parent leg present (linked parent account)
v({
  sessionId: 7,
  student: { userId: 1, fullName: "Sara", locale: "ar" },
  teacher: { userId: 2, fullName: "Ustadh Ahmad", locale: "en" },
  parent: { userId: 3, fullName: "Abu Sara", locale: null },
} satisfies SessionReportWaveContext);

// Negative — absence is not the unlinked state; the parent leg must be explicit
// @ts-expect-error — parent leg required (null when unlinked)
const noParentLeg: SessionReportWaveContext = {
  sessionId: 7,
  student: { userId: 1, fullName: "Sara", locale: "ar" },
  teacher: { userId: 2, fullName: "Ustadh Ahmad", locale: "en" },
};
v(noParentLeg);

// Negative — the student leg is mandatory
// @ts-expect-error — student leg required
const noStudentLeg: SessionReportWaveContext = {
  sessionId: 7,
  teacher: { userId: 2, fullName: "Ustadh Ahmad", locale: "en" },
  parent: null,
};
v(noStudentLeg);

// Positive — the raw joined row with a linked parent
v({
  sessionId: 7,
  studentUserId: 1,
  studentFullName: "Sara",
  studentLocale: "ar",
  teacherUserId: 2,
  teacherFullName: "Ustadh Ahmad",
  teacherLocale: "en",
  parentUserId: 3,
  parentFullName: "Abu Sara",
  parentLocale: "en",
} satisfies SessionReportWaveContextRow);

// Positive — the raw joined row with an unlinked parent (all parent legs null)
v({
  sessionId: 7,
  studentUserId: 1,
  studentFullName: "Sara",
  studentLocale: null,
  teacherUserId: 2,
  teacherFullName: "Ustadh Ahmad",
  teacherLocale: null,
  parentUserId: null,
  parentFullName: null,
  parentLocale: null,
} satisfies SessionReportWaveContextRow);

// Positive — participant locale typing matches the app-locale vocabulary
const localeTyped: Equals<SessionReportWaveContextRow["studentLocale"], AppLocale | null> = true;
v(localeTyped);

// Negative — the parent identity is nullable, never a plain number
v({
  sessionId: 7,
  studentUserId: 1,
  studentFullName: "Sara",
  studentLocale: null,
  teacherUserId: 2,
  teacherFullName: "Ustadh Ahmad",
  teacherLocale: null,
  // @ts-expect-error — parentUserId is number | null
  parentUserId: "3",
  parentFullName: null,
  parentLocale: null,
} satisfies SessionReportWaveContextRow);

// Negative — the raw row is joined around the session id
v({
  studentUserId: 1,
  studentFullName: "Sara",
  studentLocale: null,
  teacherUserId: 2,
  teacherFullName: "Ustadh Ahmad",
  teacherLocale: null,
  parentUserId: null,
  parentFullName: null,
  parentLocale: null,
  // @ts-expect-error — sessionId mandatory on the raw row
} satisfies SessionReportWaveContextRow);
