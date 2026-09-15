/**
 * TeacherDisputeCaseDialog — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite binding on behalf of the sibling bootstrap
 * `TeacherDisputeCaseDialog.test.tsx` (the same two-phase Happy-DOM
 * bootstrap the sessions-family entries use — see that file for WHY).
 *
 * The behavioral matrix itself (loading skeleton · FORBIDDEN fallback ·
 * masked failure · settled bundle · resolved + pending decision · honest
 * empty states · close affordance, across BOTH locales) lives in the shared
 * `registerParticipantDisputeCaseSuite` harness — the teacher surface binds
 * its identity on top of the shared core: the `teacherDisputeCase` query
 * (via the dialog), the STUDENT display-name fixture, the teacher
 * owner-tone attribution labels, and the `teacher-dispute-case-*` testid
 * prefix.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the scaffold's `sessionSuiteLabels` — ZERO
 * hardcoded Arabic/English copy lives here. The exception class is fixture
 * DATA (ids, enum values, decimal strings, ASCII note text). No
 * `console.*`, no `any`, no `.skip(`/`test.only(` markers.
 */

import type { ReactElement } from "react";
import type { TeacherDisputeCaseQuery_teacherDisputeCase } from "@/frontend/graphql/generated/gql/graphql";
import { TeacherDisputeCaseDialog } from "@/frontend/views/teacher/disputes/TeacherDisputeCaseDialog";
import {
  type DisputeCaseFixtureData,
  disputeCaseArtifactsFixture,
  disputeCaseSessionFixture,
  type ParticipantDisputeCaseSuiteContext,
  registerParticipantDisputeCaseSuite,
} from "@/test/ui/components/shared/disputeCaseDialogHarness";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** Verbatim fee + moments + note text the teacher fixtures carry (DATA). */
const DATA: DisputeCaseFixtureData = {
  sessionId: "8801",
  fee: "60.00",
  createdIso: "2099-02-03T08:00:00.000Z",
  disputedIso: "2099-02-03T15:45:00.000Z",
  resolvedIso: "2099-02-04T09:10:00.000Z",
  startedIso: "2099-02-03T09:00:00.000Z",
  endedIso: "2099-02-03T10:00:00.000Z",
  confirmedIso: "2099-02-03T10:30:00.000Z",
  disputeReason: "The session was interrupted and the final third was not taught.",
  teacherNotes: "Student reviewed Surah Al-Baqarah; solid recitation.",
  resolutionNote: "Partial refund granted: the final third of the session was cut short.",
};

/** ASCII participant display name the case fixture resolves (DATA, not locale copy). */
const STUDENT_NAME = "Fixture Student S";

/** The report fixture's rating (DATA — the attribution the dialog renders). */
const RATING = 5;

/** Deterministic case payload builder mirroring the teacher bundle envelope. */
function caseFixture(
  overrides?: Partial<TeacherDisputeCaseQuery_teacherDisputeCase>
): TeacherDisputeCaseQuery_teacherDisputeCase {
  return {
    session: disputeCaseSessionFixture(DATA),
    studentName: STUDENT_NAME,
    ...disputeCaseArtifactsFixture(DATA, RATING),
    ...overrides,
  };
}

/** Binds the shared harness to the teacher surface (query + labels + testids). */
const CONTEXT: ParticipantDisputeCaseSuiteContext = {
  surface: "teacher",
  describeTitle: "TeacherDisputeCaseDialog",
  element: (onClose: () => void): ReactElement => (
    <TeacherDisputeCaseDialog sessionId={DATA.sessionId} open onClose={onClose} />
  ),
  data: DATA,
  counterpartyName: STUDENT_NAME,
  rating: RATING,
  counterpartyLabel: t => t.teacherCaseStudentLabel,
  ratingLabel: t => t.teacherCaseRatingLabel,
  fixture: caseFixture,
};

registerParticipantDisputeCaseSuite(CONTEXT);
