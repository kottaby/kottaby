/**
 * StudentDisputeCaseDialog — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite binding on behalf of the sibling bootstrap
 * `StudentDisputeCaseDialog.test.tsx` (the same two-phase Happy-DOM
 * bootstrap the sessions-family entries use — see that file for WHY).
 *
 * The behavioral matrix itself (loading skeleton · FORBIDDEN fallback ·
 * masked failure · settled bundle · resolved + pending decision · honest
 * empty states · close affordance, across BOTH locales) lives in the shared
 * `registerParticipantDisputeCaseSuite` harness — the student surface binds
 * its identity on top of the shared core: the `studentDisputeCase` query
 * (via the dialog), the TEACHER display-name fixture, the
 * student-perspective attribution labels, and the `student-dispute-case-*`
 * testid prefix.
 *
 * Perspective contract pinned here: the student-surface report-title label
 * renders, and the teacher-surface owner-tone labels must NOT leak into
 * the student surface.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the scaffold's `sessionSuiteLabels` — ZERO
 * hardcoded Arabic/English copy lives here. The exception class is fixture
 * DATA (ids, enum values, decimal strings, ASCII note text). No
 * `console.*`, no `any`, no `.skip(`/`test.only(` markers.
 */

import { expect } from "bun:test";
import type { ReactElement } from "react";
import type { StudentDisputeCaseQuery_studentDisputeCase } from "@/frontend/graphql/generated/gql/graphql";
import { StudentDisputeCaseDialog } from "@/frontend/views/student/disputes/StudentDisputeCaseDialog";
import {
  type DisputeCaseFixtureData,
  disputeCaseArtifactsFixture,
  disputeCaseSessionFixture,
  type ParticipantDisputeCaseSuiteContext,
  registerParticipantDisputeCaseSuite,
} from "@/test/ui/components/shared/disputeCaseDialogHarness";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** Verbatim fee + moments + note text the student fixtures carry (DATA). */
const DATA: DisputeCaseFixtureData = {
  sessionId: "9901",
  fee: "45.00",
  createdIso: "2099-03-04T08:00:00.000Z",
  disputedIso: "2099-03-04T16:20:00.000Z",
  resolvedIso: "2099-03-05T10:05:00.000Z",
  startedIso: "2099-03-04T09:00:00.000Z",
  endedIso: "2099-03-04T10:00:00.000Z",
  confirmedIso: "2099-03-04T10:30:00.000Z",
  disputeReason: "The session was interrupted and the final third was not taught.",
  teacherNotes: "Student memorized the target range; tajweed needs work on madd.",
  resolutionNote: "Partial refund granted: the review ended twenty minutes early.",
};

/** ASCII participant display name the case fixture resolves (DATA, not locale copy). */
const TEACHER_NAME = "Fixture Teacher T";

/** The report fixture's rating (DATA — the attribution the dialog renders). */
const RATING = 4;

/** Deterministic case payload builder mirroring the student bundle envelope. */
function caseFixture(
  overrides?: Partial<StudentDisputeCaseQuery_studentDisputeCase>
): StudentDisputeCaseQuery_studentDisputeCase {
  return {
    session: disputeCaseSessionFixture(DATA),
    teacherName: TEACHER_NAME,
    ...disputeCaseArtifactsFixture(DATA, RATING),
    ...overrides,
  };
}

/** Binds the shared harness to the student surface (query + labels + testids). */
const CONTEXT: ParticipantDisputeCaseSuiteContext = {
  surface: "student",
  describeTitle: "StudentDisputeCaseDialog",
  element: (onClose: () => void): ReactElement => (
    <StudentDisputeCaseDialog sessionId={DATA.sessionId} open onClose={onClose} />
  ),
  data: DATA,
  counterpartyName: TEACHER_NAME,
  rating: RATING,
  counterpartyLabel: t => t.studentCaseTeacherLabel,
  ratingLabel: t => t.studentCaseRatingLabel,
  settledPerspectiveAssertions: (t, screen) => {
    expect(screen.getByText(t.studentCaseReportTitle)).toBeDefined();
    // The teacher-surface owner-tone labels must NOT leak here.
    expect(screen.queryByText(t.teacherCaseRatingLabel)).toBeNull();
  },
  fixture: caseFixture,
};

registerParticipantDisputeCaseSuite(CONTEXT);
