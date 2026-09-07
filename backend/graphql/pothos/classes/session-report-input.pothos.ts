/**
 * Session report submission inputs — Pothos input types for the
 * teacher-only `submitSessionReport` mutation.
 *
 * SDL names (`HomeWorkBlockInput`, `HomeWorkGradeInput`,
 * `HomeWorkAssignmentInput`, `SubmitSessionReportInput`) are pinned by the
 * report-submission contract;
 * the exported consts carry the `PothosInput` suffix because the canonical
 * backend input shapes (`HomeWorkBlockInput`, `SessionReportSubmitInput`)
 * already live in `backend/types/classes/report.types.ts` and the bare names
 * would collide at the resolver's import site (the
 * `SessionListFilterPothosInput` disambiguation precedent). The Pothos field
 * shape is a structural map of those backend types, per the Input Exception
 * Policy in `backend/graphql/AGENTS.md` — no local type is declared here.
 *
 * Closed whitelists (BOPLA): every field below is client-controlled; the
 * unknown members die as `GRAPHQL_VALIDATION_FAILED` pre-resolver. NO
 * server-derivable field is exposed — no `id`, no `sessionId` (arrives as
 * the mutation argument), no grades at the assignment level (grades are set
 * by the grading flow, not the assignment payload), no timestamps, no
 * teacher identity (resolved server-side from `ctx.user.id`).
 *
 * Lives in `backend/graphql/pothos/classes/` per `backend/graphql/mutation/
 * AGENTS.md` ("input types live in the pothos layer — mutation files only
 * register root fields"). Consumed by
 * `backend/graphql/mutation/classes/session-report.mutation.ts` through the
 * side-effect import chain.
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { SurahJuzRefPothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";

/**
 * One cohesive homework assignment block: the ayah span plus the surah/juz
 * reference classifying it. The registered `SurahJuzRef` enum rejects any
 * out-of-vocabulary value at GraphQL validation, before any resolver runs;
 * the service's `isSurahJuzRef` guard remains the fail-closed backstop.
 */
export const HomeWorkBlockPothosInput = gqlSchemaBuilder.inputType("HomeWorkBlockInput", {
  fields: t => ({
    fromAyah: t.int({ required: true }),
    toAyah: t.int({ required: true }),
    surahJuz: t.field({ type: SurahJuzRefPothosEnum, required: true }),
  }),
});

/**
 * Grade pair applied to the PREVIOUS homework row (the grading legs of the
 * submission): both members are integers in [0, 100] — validated pre-DB by
 * the service (the table CHECK constraints are a backstop, never the
 * primary error path).
 */
export const HomeWorkGradePothosInput = gqlSchemaBuilder.inputType("HomeWorkGradeInput", {
  fields: t => ({
    currentGrade: t.int({ required: true }),
    revisionGrade: t.int({ required: true }),
  }),
});

/**
 * The two parallel homework tracks a report may assign: Jadid (the new
 * memorization) and Madi (the revision). Each block is optional and
 * self-contained; the producing service maps blocks onto the `home_work`
 * columns inside the submission transaction.
 */
export const HomeWorkAssignmentPothosInput = gqlSchemaBuilder.inputType("HomeWorkAssignmentInput", {
  fields: t => ({
    jadid: t.field({ type: HomeWorkBlockPothosInput, required: false }),
    madi: t.field({ type: HomeWorkBlockPothosInput, required: false }),
  }),
});

/**
 * The teacher-controlled submission whitelist (BOPLA): notes, the student
 * rating, the optional new assignment, and the optional previous-row grades.
 * Row identity, the session join, and both timestamps are structurally
 * absent — the session id arrives as the mutation argument and every
 * server-controlled column is written by the producing service inside its
 * transaction.
 */
export const SubmitSessionReportPothosInput = gqlSchemaBuilder.inputType("SubmitSessionReportInput", {
  fields: t => ({
    teacherNotes: t.string({ required: true }),
    studentRatingByTeacher: t.int({ required: true }),
    homework: t.field({ type: HomeWorkAssignmentPothosInput, required: false }),
    previousGrades: t.field({ type: HomeWorkGradePothosInput, required: false }),
  }),
});
