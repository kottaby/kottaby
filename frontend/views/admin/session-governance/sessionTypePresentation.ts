import { SessionIntent, SessionType } from "@/frontend/graphql/generated/gql/graphql";

/**
 * Shared label-key tables for the admin session-governance surface's
 * wire-enum meta cells (`AdminSessionRow` + `AdminSessionDetailDrawer`).
 *
 * Every table is keyed by the server enum member STRINGS through
 * `Record<string, …>` lookups (the `sessionRowPresentation` convention —
 * oxlint `no-unsafe-enum-comparison` bans direct enum comparisons), so raw
 * wire tokens NEVER reach the rendered copy: both namespaces carry the
 * human labels (`typeStudentSession` … / `intentHifz` …).
 */

/** Governance-namespace type option label keys (the filter select's vocabulary). */
type SessionTypeLabelKey = "typeStudentSession" | "typeTeacherEvaluation" | "typeReEvaluation";

/** Type-cell label key per wire token. */
export const SESSION_TYPE_LABEL_KEY: Record<string, SessionTypeLabelKey> = {
  [SessionType.StudentSession]: "typeStudentSession",
  [SessionType.TeacherEvaluation]: "typeTeacherEvaluation",
  [SessionType.ReEvaluation]: "typeReEvaluation",
};

/** Governance-namespace intent value label keys. */
type SessionIntentLabelKey = "intentHifz" | "intentTajweed" | "intentEvaluation";

/** Intent-cell label key per wire token (the wire member is nullable — callers render the placeholder). */
export const SESSION_INTENT_LABEL_KEY: Record<string, SessionIntentLabelKey> = {
  [SessionIntent.Hifz]: "intentHifz",
  [SessionIntent.Tajweed]: "intentTajweed",
  [SessionIntent.Evaluation]: "intentEvaluation",
};
