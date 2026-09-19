/**
 * sessionReportConversions — runtime-validated conversions between the
 * backend `SessionReportSubmitInput` (uses backend `SurahJuzRef` enum)
 * and the codegen `SubmitSessionReportInput` (uses codegen `SurahJuzRef`
 * enum). The two enums carry the same underlying string values but
 * TypeScript treats them as distinct nominal types. The exhaustive
 * switches below perform a real per-branch mapping — no `as unknown as`
 * cast (which would trip `no-unsafe-type-assertion`). Pattern mirrors
 * `frontend/views/admin/users/utils/directoryConversions.ts`.
 */

import { SurahJuzRef as BackendSurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
import type {
  HomeWorkBlockInput as BackendHomeWorkBlockInput,
  HomeWorkAssignInput,
  HomeWorkGradeFieldsInput,
  SessionReportSubmitInput,
} from "@/backend/types";
import {
  SurahJuzRef as CodegenSurahJuzRef,
  type HomeWorkAssignmentInput,
  type HomeWorkBlockInput,
  type HomeWorkGradeInput,
  type SubmitSessionReportInput,
} from "@/frontend/graphql/generated/gql/graphql";

/** Converts a backend SurahJuzRef value to the codegen enum value.
 *  Backend values are snake_case (`surah_al_fatihah`); codegen values
 *  are PascalCase (`SurahAlFatihah`). The 5 surah legs use early-return
 *  equality guards ahead of the 30-case juz switch (the
 *  `max-switch-cases` rule caps at 30). No `as` cast — exhaustive. */
function toCodegenSurahJuzRef(value: BackendSurahJuzRef): CodegenSurahJuzRef {
  if (value === BackendSurahJuzRef.SurahAlFatihah) return CodegenSurahJuzRef.SurahAlFatihah;
  if (value === BackendSurahJuzRef.SurahAlBaqarah) return CodegenSurahJuzRef.SurahAlBaqarah;
  if (value === BackendSurahJuzRef.SurahAalImran) return CodegenSurahJuzRef.SurahAalImran;
  if (value === BackendSurahJuzRef.SurahAnNisa) return CodegenSurahJuzRef.SurahAnNisa;
  if (value === BackendSurahJuzRef.SurahAlMaidah) return CodegenSurahJuzRef.SurahAlMaidah;
  switch (value) {
    case BackendSurahJuzRef.Juz1:
      return CodegenSurahJuzRef.Juz1;
    case BackendSurahJuzRef.Juz2:
      return CodegenSurahJuzRef.Juz2;
    case BackendSurahJuzRef.Juz3:
      return CodegenSurahJuzRef.Juz3;
    case BackendSurahJuzRef.Juz4:
      return CodegenSurahJuzRef.Juz4;
    case BackendSurahJuzRef.Juz5:
      return CodegenSurahJuzRef.Juz5;
    case BackendSurahJuzRef.Juz6:
      return CodegenSurahJuzRef.Juz6;
    case BackendSurahJuzRef.Juz7:
      return CodegenSurahJuzRef.Juz7;
    case BackendSurahJuzRef.Juz8:
      return CodegenSurahJuzRef.Juz8;
    case BackendSurahJuzRef.Juz9:
      return CodegenSurahJuzRef.Juz9;
    case BackendSurahJuzRef.Juz10:
      return CodegenSurahJuzRef.Juz10;
    case BackendSurahJuzRef.Juz11:
      return CodegenSurahJuzRef.Juz11;
    case BackendSurahJuzRef.Juz12:
      return CodegenSurahJuzRef.Juz12;
    case BackendSurahJuzRef.Juz13:
      return CodegenSurahJuzRef.Juz13;
    case BackendSurahJuzRef.Juz14:
      return CodegenSurahJuzRef.Juz14;
    case BackendSurahJuzRef.Juz15:
      return CodegenSurahJuzRef.Juz15;
    case BackendSurahJuzRef.Juz16:
      return CodegenSurahJuzRef.Juz16;
    case BackendSurahJuzRef.Juz17:
      return CodegenSurahJuzRef.Juz17;
    case BackendSurahJuzRef.Juz18:
      return CodegenSurahJuzRef.Juz18;
    case BackendSurahJuzRef.Juz19:
      return CodegenSurahJuzRef.Juz19;
    case BackendSurahJuzRef.Juz20:
      return CodegenSurahJuzRef.Juz20;
    case BackendSurahJuzRef.Juz21:
      return CodegenSurahJuzRef.Juz21;
    case BackendSurahJuzRef.Juz22:
      return CodegenSurahJuzRef.Juz22;
    case BackendSurahJuzRef.Juz23:
      return CodegenSurahJuzRef.Juz23;
    case BackendSurahJuzRef.Juz24:
      return CodegenSurahJuzRef.Juz24;
    case BackendSurahJuzRef.Juz25:
      return CodegenSurahJuzRef.Juz25;
    case BackendSurahJuzRef.Juz26:
      return CodegenSurahJuzRef.Juz26;
    case BackendSurahJuzRef.Juz27:
      return CodegenSurahJuzRef.Juz27;
    case BackendSurahJuzRef.Juz28:
      return CodegenSurahJuzRef.Juz28;
    case BackendSurahJuzRef.Juz29:
      return CodegenSurahJuzRef.Juz29;
    case BackendSurahJuzRef.Juz30:
      return CodegenSurahJuzRef.Juz30;
  }
  // Exhaustive-switch fallback — TS knows BackendSurahJuzRef is fully
  // covered. Throwing on a future enum member addition without a case
  // update is the canonical fail-closed posture.
  throw new Error(`Unmapped SurahJuzRef value: ${String(value)}`);
}

/** Converts a backend HomeWorkBlockInput to the codegen HomeWorkBlockInput. */
function toCodegenBlock(block: BackendHomeWorkBlockInput): HomeWorkBlockInput {
  return {
    fromAyah: block.fromAyah,
    toAyah: block.toAyah,
    surahJuz: toCodegenSurahJuzRef(block.surahJuz),
  };
}

/** Converts a backend HomeWorkAssignInput (optional tracks) to codegen
 *  HomeWorkAssignmentInput (nullable tracks). */
function toCodegenAssignment(assignment: HomeWorkAssignInput | undefined): HomeWorkAssignmentInput | null {
  if (assignment === undefined) return null;
  return {
    jadid: assignment.jadid ? toCodegenBlock(assignment.jadid) : null,
    madi: assignment.madi ? toCodegenBlock(assignment.madi) : null,
  };
}

/** Converts a backend HomeWorkGradeFieldsInput to codegen HomeWorkGradeInput. */
function toCodegenGradeFields(grades: HomeWorkGradeFieldsInput | undefined): HomeWorkGradeInput | null {
  if (grades === undefined) return null;
  return { currentGrade: grades.currentGrade, revisionGrade: grades.revisionGrade };
}

/**
 * Converts a backend SessionReportSubmitInput to the codegen
 * SubmitSessionReportInput. Field-by-field — no spread, no cast.
 */
export function toCodegenSubmitInput(payload: SessionReportSubmitInput): SubmitSessionReportInput {
  return {
    teacherNotes: payload.teacherNotes,
    studentRatingByTeacher: payload.studentRatingByTeacher,
    homework: toCodegenAssignment(payload.homework),
    previousGrades: toCodegenGradeFields(payload.previousGrades),
  };
}
