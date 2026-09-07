/**
 * SessionReportService — pure pre-DB guards for the report + homework write
 * surface (module extraction, behavior identical to the session-lifecycle
 * guards idiom): the payload vocabulary every submission flow re-asserts
 * BEFORE any database work. Nothing here touches the database, opens a
 * transaction, logs, or reads environment state — every function is pure
 * (or throws the canonical typed `VALIDATION` denial) and the only
 * throwable error class is the localized `ValidationError`.
 *
 * The public surface stays the `SessionReportService` namespace in
 * `session-report.service.ts`: the flow methods delegate here for the
 * shared pre-DB checks so the entry points can never drift apart.
 *
 * Members:
 *  - id-shape guard (`assertPositiveSessionId`) — the session-id shape check
 *    reuses the exported session-lifecycle id-guard helper verbatim (the
 *    same helper the four non-create lifecycle paths apply) instead of a
 *    drifted duplicate, so a NaN, fractional, out-of-safe-range,
 *    non-positive, or non-number runtime identifier fails closed before
 *    any database work;
 *  - notes normalizer (`assertTeacherNotes`) — trim + required + length
 *    bound (counted, never pattern-matched), returning the trimmed value
 *    that the guarded INSERT persists verbatim;
 *  - numeric range guards (`assertRating0To5` / `assertGrade0To100`) —
 *    integer-only inclusive ranges; the table CHECK constraints stay a
 *    backstop, never the primary error path;
 *  - homework block guard (`assertHomeWorkBlock`) — a cohesive ayah span
 *    (both endpoints positive safe integers capped at the storage bound,
 *    from ≤ to) classified by a shipped `SurahJuzRef` member via the
 *    fail-closed `isSurahJuzRef` enum guard (never string equality against
 *    literals);
 *  - assignment + grade validators (`validateAssignment` /
 *    `validatePreviousGrades`) — the ≥1-block presence rule and the
 *    previous-grades range rule over the multi-field inputs.
 *
 * Every guard receives the SAME translations handle: the localized
 * `errors` namespace slice resolved ONCE at the service flow head
 * (`getServerTranslations(locale).errorsTranslations`) and passed down
 * unchanged — guards never re-resolve translations themselves.
 */

import { isSurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
import { ValidationError } from "@/backend/lib/errors";
import {
  assertPositiveSafeSessionId,
  isPositiveSafeInteger,
} from "@/backend/services/classes/session-lifecycle.guards";
import type { HomeWorkAssignInput, HomeWorkBlockInput, HomeWorkGradeFieldsInput } from "@/backend/types";
import type { getServerTranslations } from "@/shared/locale/server-graphql";

/** A free-text report note longer than this is rejected before any DB work. */
const MAX_TEACHER_NOTES_LENGTH = 2000;

/**
 * Upper bound for a homework block's ayah endpoint: the `home_work` ayah
 * columns are PostgreSQL 4-byte integers, so a larger value can never persist
 * — bounding here routes overflow into the typed `homeworkAyahRangeInvalid`
 * denial before any database work instead of an unmapped storage error.
 */
const MAX_AYAH_VALUE = 2_147_483_647;

/**
 * The localized `errors` namespace slice every guard accepts — the exact
 * handle shape `session-lifecycle.guards.ts` passes down. The service flow
 * resolves it ONCE per request (`getServerTranslations(locale)
 * .errorsTranslations`) and threads the same value through every guard, so
 * a submission never pays a second locale resolution and can never mix
 * locales mid-flow.
 */
type ErrorsTranslations = ReturnType<typeof getServerTranslations>["errorsTranslations"];

/**
 * Pre-DB `VALIDATION` denial for a malformed target session id on the
 * report submission path — delegates to the exported session-lifecycle
 * id-guard (`assertPositiveSafeSessionId`) so the id vocabulary stays in
 * exactly one module. The `unknown` parameter type is honest: the GraphQL
 * boundary parses the `ID` argument shape-only, so the runtime value may
 * be the NaN, fractional, or overflow shape that parse yields for a
 * malformed string. The throw happens BEFORE any database work, so a
 * garbage id can never reach SQL and never spends a probe read.
 */
export function assertPositiveSessionId(id: unknown, t: ErrorsTranslations): asserts id is number {
  assertPositiveSafeSessionId(id, t);
}

/**
 * Normalizes the required free-text report notes: trims, then rejects a
 * whitespace-only value and over-limit content with the pre-DB `VALIDATION`
 * denial. The length bound is enforced by counting characters (never by
 * pattern-matching, so no regex backtracking surface exists) and the
 * trimmed value is what the guarded INSERT persists verbatim — no other
 * sanitization is applied (rendering is inert client-side).
 */
export function assertTeacherNotes(notes: string, t: ErrorsTranslations): string {
  const trimmed = notes.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(t.sessionReportNotesRequired);
  }
  if (trimmed.length > MAX_TEACHER_NOTES_LENGTH) {
    throw new ValidationError(t.sessionReportNotesTooLong);
  }
  return trimmed;
}

/**
 * Pre-DB `VALIDATION` denial for a student rating outside the integer
 * window 0..5: a NaN, fractional, infinite, out-of-range, or unsafe
 * runtime value fails closed before any database work.
 */
export function assertRating0To5(rating: number, t: ErrorsTranslations): void {
  if (!Number.isSafeInteger(rating) || rating < 0 || rating > 5) {
    throw new ValidationError(t.sessionRatingRange);
  }
}

/**
 * Pre-DB `VALIDATION` denial for a homework grade outside the integer
 * window 0..100 — the same fail-closed integer rule the rating guard
 * applies; both grade fields of the previous-grades input funnel through
 * this single guard.
 *
 * Exported as the module's validator vocabulary: consumed by the sibling
 * composite validator `validatePreviousGrades` and asserted directly by
 * callers/tests.
 */
export function assertGrade0To100(grade: number, t: ErrorsTranslations): void {
  if (!Number.isSafeInteger(grade) || grade < 0 || grade > 100) {
    throw new ValidationError(t.homeworkGradeRange);
  }
}

/**
 * Validates ONE cohesive homework assignment block before any database
 * work: both ayah endpoints must be positive safe integers no larger than
 * the storage bound with `fromAyah ≤ toAyah` (a single dedicated denial
 * key covers the whole ayah-shape family), and the classifying surah/juz
 * reference must be a shipped `SurahJuzRef` member — checked through the
 * fail-closed `isSurahJuzRef` enum guard, never by string equality against
 * literals, so a wire value that only LOOKS like a member (wrong case,
 * whitespace, near-miss) is rejected.
 *
 * Exported as the module's validator vocabulary: consumed by the sibling
 * composite validator `validateAssignment` and asserted directly by
 * callers/tests.
 */
export function assertHomeWorkBlock(block: HomeWorkBlockInput, t: ErrorsTranslations): void {
  if (
    !isPositiveSafeInteger(block.fromAyah) ||
    !isPositiveSafeInteger(block.toAyah) ||
    block.fromAyah > MAX_AYAH_VALUE ||
    block.toAyah > MAX_AYAH_VALUE ||
    block.fromAyah > block.toAyah
  ) {
    throw new ValidationError(t.homeworkAyahRangeInvalid);
  }
  if (!isSurahJuzRef(block.surahJuz)) {
    throw new ValidationError(t.homeworkSurahJuzInvalid);
  }
}

/**
 * Runtime honesty for a wire-delivered homework block leg: the canonical
 * input type says `jadid?/madi?: HomeWorkBlockInput`, but a transport
 * payload can still deliver `null` (or any non-object) for an optional
 * member. The predicate fails closed — only a real object ever counts as
 * "supplied", so the block guard can never receive a null and a garbage
 * leg can only ever produce the typed `VALIDATION` denial. Exported from
 * this payload-vocabulary module as the SINGLE definition: the sibling
 * service's insert mapping consumes the identical predicate instead of a
 * drifted copy.
 */
export function isSuppliedBlock(value: unknown): value is HomeWorkBlockInput {
  return typeof value === "object" && value !== null;
}

/**
 * Validates the two-track homework assignment input: at least one block
 * (Jadid or Madi) must be supplied, and every supplied block must pass
 * `assertHomeWorkBlock`. A runtime `null` leg (a wire payload can deliver
 * null for an optional input member even though the canonical input type
 * says `undefined`) counts as ABSENT, so a null-only payload lands on the
 * "at least one block" denial and a null leg beside a valid leg validates
 * the valid leg — the fail-closed `isSuppliedBlock` predicate means a null
 * never reaches the block guard as a "present" value and can never surface
 * as anything but the typed `VALIDATION` denial.
 */
export function validateAssignment(input: HomeWorkAssignInput, t: ErrorsTranslations): void {
  const jadid = input.jadid;
  const madi = input.madi;
  if (!isSuppliedBlock(jadid) && !isSuppliedBlock(madi)) {
    throw new ValidationError(t.homeworkAssignmentBlocksRequired);
  }
  if (isSuppliedBlock(jadid)) {
    assertHomeWorkBlock(jadid, t);
  }
  if (isSuppliedBlock(madi)) {
    assertHomeWorkBlock(madi, t);
  }
}

/**
 * Validates the optional previous-grades input before any database work:
 * both fields funnel through `assertGrade0To100`, current grade first so
 * the denial order is deterministic for a payload that breaks both.
 */
export function validatePreviousGrades(g: HomeWorkGradeFieldsInput, t: ErrorsTranslations): void {
  assertGrade0To100(g.currentGrade, t);
  assertGrade0To100(g.revisionGrade, t);
}
