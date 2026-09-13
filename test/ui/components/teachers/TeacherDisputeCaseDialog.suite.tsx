/**
 * TeacherDisputeCaseDialog — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `TeacherDisputeCaseDialog.test.tsx` (the same two-phase Happy-DOM
 * bootstrap the sessions-family entries use — see that file for WHY).
 *
 * Happy DOM + Apollo `MockedProvider` tier, driven across BOTH locales,
 * directly against the teacher case dialog (mirroring the admin case-review
 * suite's branch matrix, minus the audit trail — the teacher bundle carries
 * none): one render case per branch of the dialog's visual state matrix —
 *
 *   `aria-busy` loading skeleton (no fabricated section shells) ·
 *   FORBIDDEN → the shared `PermissionDeniedFallback` (the participant
 *   gate is SERVER-owned — the surface renders whatever the wire's code
 *   classification dictates, no client role logic) · masked transport
 *   failure → the generic inline alert · the settled bundle (verbatim fee
 *   + currency, the dispute moment through the locale date formatter, the
 *   FULL filed reason, the escrow chip, the student display name, the
 *   teacher's own report + rating, homework evidence lines, recitation
 *   record) · the RESOLVED decision block (outcome label + FULL note +
 *   decided-on moment) · the PENDING decision block (the honest pending
 *   line — nothing decided yet) · the HONEST empty states (null report /
 *   homework / recitation render ONLY the localized empty-state copy —
 *   nothing is fabricated) · the close affordance routes the dismissal
 *   intent to the caller.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the scaffold's `sessionSuiteLabels` (Sessions /
 * Errors / Common namespaces) — ZERO hardcoded Arabic/English copy lives
 * here. The exception class is fixture DATA (ids, enum values, decimal
 * strings, ASCII note text) plus timestamps recomputed with the scaffold's
 * `expectedStamp` oracle. No `console.*`, no `any`, no `.skip(`
 * /`test.only(` markers.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import {
  DisputeResolution,
  SessionIntent,
  SessionStatus,
  SessionType,
  SurahJuzRef,
  type TeacherDisputeCaseQuery_teacherDisputeCase,
} from "@/frontend/graphql/generated/gql/graphql";
import { teacherDisputeCaseQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { TeacherDisputeCaseDialog } from "@/frontend/views/teacher/disputes/TeacherDisputeCaseDialog";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import type { AppLocale } from "@/shared/locale/AppLocale";
import {
  componentSuiteLocales,
  expectedStamp,
  liveScreen,
  renderWithMocks,
  sessionSuiteLabels,
} from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** The case dialog's session id (DATA). */
const CASE_SESSION_ID = "8801";

/** Verbatim fee + moments shared by the case fixtures (DATA). */
const CASE_FEE = "60.00";
const CREATED_ISO = "2099-02-03T08:00:00.000Z";
const DISPUTED_ISO = "2099-02-03T15:45:00.000Z";
const RESOLVED_ISO = "2099-02-04T09:10:00.000Z";

/** ASCII note texts the fixtures carry (DATA, not locale copy). */
const TEACHER_NOTES = "Student reviewed Surah Al-Baqarah; solid recitation.";
const RESOLUTION_NOTE = "Partial refund granted: the final third of the session was cut short.";

/** ASCII participant display name the case fixture resolves (DATA, not locale copy). */
const STUDENT_NAME = "Fixture Student S";

/** Deterministic case payload builder mirroring the teacher bundle envelope. */
function caseFixture(
  overrides?: Partial<TeacherDisputeCaseQuery_teacherDisputeCase>
): TeacherDisputeCaseQuery_teacherDisputeCase {
  return {
    session: {
      id: CASE_SESSION_ID,
      status: SessionStatus.Disputed,
      intent: SessionIntent.Hifz,
      sessionType: SessionType.StudentSession,
      fee: CASE_FEE,
      feeHeld: false,
      studentId: "611",
      teacherId: "902",
      startedAt: "2099-02-03T09:00:00.000Z",
      endedAt: "2099-02-03T10:00:00.000Z",
      confirmationDeadline: null,
      confirmedByStudentAt: "2099-02-03T10:30:00.000Z",
      confirmedByTeacherAt: "2099-02-03T10:30:00.000Z",
      createdAt: CREATED_ISO,
      updatedAt: DISPUTED_ISO,
      cancelReason: null,
      disputeReason: "The session was interrupted and the final third was not taught.",
      disputedAt: DISPUTED_ISO,
      resolutionNote: null,
      resolutionOutcome: null,
      resolvedAt: null,
    },
    studentName: STUDENT_NAME,
    report: {
      id: "74001",
      sessionId: Number(CASE_SESSION_ID),
      teacherNotes: TEACHER_NOTES,
      studentRatingByTeacher: 5,
      createdAt: CREATED_ISO,
      updatedAt: CREATED_ISO,
    },
    homework: {
      id: "75001",
      sessionId: Number(CASE_SESSION_ID),
      currentFromAyah: 1,
      currentToAyah: 10,
      currentGrade: 8,
      currentSurahJuz: SurahJuzRef.SurahAlBaqarah,
      revisionFromAyah: 20,
      revisionToAyah: 34,
      revisionGrade: 9,
      revisionSurahJuz: SurahJuzRef.SurahAlBaqarah,
      createdAt: CREATED_ISO,
      updatedAt: CREATED_ISO,
    },
    recitation: {
      id: "76001",
      sessionId: CASE_SESSION_ID,
      name: "Surah Al-Baqarah 20-34",
      description: "Memorization check with tajweed correction.",
      createdAt: CREATED_ISO,
      updatedAt: CREATED_ISO,
    },
    ...overrides,
  };
}

/** Single-operation case mock answering the shared document with one envelope. */
function caseMock(
  payload: TeacherDisputeCaseQuery_teacherDisputeCase,
  options?: { readonly delay?: number }
): MockLink.MockedResponse {
  return {
    request: { query: teacherDisputeCaseQueryDocument, variables: { id: CASE_SESSION_ID } },
    result: { data: { teacherDisputeCase: payload } },
    ...(options?.delay === undefined ? {} : { delay: options.delay }),
  };
}

/** Permanently in-flight query (`delay: Infinity`) — the honest pending state. */
function pendingCaseMock(): MockLink.MockedResponse {
  return {
    request: { query: teacherDisputeCaseQueryDocument, variables: { id: CASE_SESSION_ID } },
    delay: Infinity,
  };
}

/** Single-operation mock denying the caller at the scope layer (raw `extensions.code`). */
function deniedCaseError(code: string): MockLink.MockedResponse {
  return {
    request: { query: teacherDisputeCaseQueryDocument, variables: { id: CASE_SESSION_ID } },
    result: {
      errors: [{ message: `${code} (masked transport surface)`, extensions: { code } }],
    },
  };
}

// ---------------------------------------------------------------------------
// Render + expectation helpers

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

/** Renders the case dialog under TestWrapper (LocaleProvider → emotion → theme). */
function renderCaseDialog(mocks: ReadonlyArray<MockLink.MockedResponse>, locale: AppLocale, onClose: () => void): void {
  renderWithMocks(<TeacherDisputeCaseDialog sessionId={CASE_SESSION_ID} open onClose={onClose} />, mocks, locale);
}

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the full branch
// matrix (STUI_LOCALE split-run guard, shared with the sibling suites).
for (const locale of componentSuiteLocales) {
  const { t, te, tc } = sessionSuiteLabels(locale);

  describe(`TeacherDisputeCaseDialog (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("query in flight renders the aria-busy skeleton — no fabricated section shells", () => {
      renderCaseDialog([pendingCaseMock()], locale, () => {});

      const skeleton = screen.getByTestId("teacher-dispute-case-loading");
      expect(skeleton.getAttribute("aria-busy")).toBe("true");
      // No settled surface may leak into the skeleton.
      expect(screen.queryByTestId("teacher-dispute-case-session")).toBeNull();
      expect(screen.queryByTestId("teacher-dispute-case-report")).toBeNull();
      expect(screen.queryByTestId("teacher-dispute-case-resolution")).toBeNull();
      expect(screen.queryByTestId("teacher-dispute-case-error")).toBeNull();
    });

    test("FORBIDDEN renders the shared permission fallback — the participant gate stays server-owned", async () => {
      renderCaseDialog([deniedCaseError("FORBIDDEN")], locale, () => {});

      await waitFor(() => {
        expect(screen.getByText(te.forbiddenRole)).toBeDefined();
      });
      expect(screen.getByText(te.forbidden)).toBeDefined();
      expect(screen.queryByTestId("teacher-dispute-case-error")).toBeNull();
    });

    test("masked transport failure surfaces the generic inline alert", async () => {
      renderCaseDialog([deniedCaseError("INTERNAL_SERVER_ERROR")], locale, () => {});

      await waitFor(() => {
        expect(screen.getByTestId("teacher-dispute-case-error")).toBeDefined();
      });
      expect(screen.getByText(t.genericError)).toBeDefined();
      // The deny surface must NOT appear for non-deny codes.
      expect(screen.queryByText(te.forbiddenRole)).toBeNull();
    });

    test("settled bundle renders session facts, the filed reason, and the participant-owned artifacts", async () => {
      renderCaseDialog([caseMock(caseFixture())], locale, () => {});

      await waitFor(() => {
        expect(screen.getByTestId("teacher-dispute-case-session")).toBeDefined();
      });
      // Title + session facts: verbatim fee + currency, the dispute moment
      // through the locale formatter, the student display name, the consumed
      // chip.
      expect(screen.getByText(t.teacherCaseTitle)).toBeDefined();
      expect(screen.getAllByText(`${CASE_FEE} ${SESSION_FEE_CURRENCY}`).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(expectedStamp(DISPUTED_ISO, locale)).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(STUDENT_NAME)).toBeDefined();
      expect(screen.getByText(t.teacherCaseStudentLabel)).toBeDefined();
      expect(screen.getByTestId("admin-dispute-escrow-chip-consumed")).toBeDefined();

      // The FULL filed reason (never truncated inside the case dialog).
      expect(screen.getByTestId("teacher-dispute-case-reason")).toBeDefined();
      expect(screen.getByText("The session was interrupted and the final third was not taught.")).toBeDefined();

      // Pending decision block: the honest pending line, no fabricated outcome.
      expect(screen.getByTestId("teacher-dispute-case-resolution")).toBeDefined();
      expect(screen.getByTestId("teacher-dispute-case-pending")).toBeDefined();
      expect(screen.getByText(t.teacherCasePendingLine)).toBeDefined();

      // Report: the teacher's OWN notes + the owner-tone rating label.
      expect(screen.getByTestId("teacher-dispute-case-report")).toBeDefined();
      expect(screen.getByText(TEACHER_NOTES)).toBeDefined();
      expect(screen.getByText(t.teacherCaseRatingLabel)).toBeDefined();
      expect(screen.getByText("5")).toBeDefined();

      // Homework: current + revision evidence lines (verbatim numbers/ref).
      expect(screen.getByTestId("teacher-dispute-case-homework")).toBeDefined();
      expect(screen.getByText(t.caseReviewHomeworkCurrentLabel)).toBeDefined();
      expect(screen.getByText(t.caseReviewHomeworkRevisionLabel)).toBeDefined();
      expect(screen.getByText(`1 – 10 · 8 · ${SurahJuzRef.SurahAlBaqarah}`)).toBeDefined();
      expect(screen.getByText(`20 – 34 · 9 · ${SurahJuzRef.SurahAlBaqarah}`)).toBeDefined();

      // Recitation: name + description verbatim.
      expect(screen.getByTestId("teacher-dispute-case-recitation")).toBeDefined();
      expect(screen.getByText("Surah Al-Baqarah 20-34")).toBeDefined();
      expect(screen.getByText("Memorization check with tajweed correction.")).toBeDefined();
    });

    test("resolved decision block renders the outcome label, the FULL note, and the decided-on moment", async () => {
      renderCaseDialog(
        [
          caseMock(
            caseFixture({
              session: {
                ...caseFixture().session,
                status: SessionStatus.Completed,
                resolutionOutcome: DisputeResolution.PartialRefund,
                resolutionNote: RESOLUTION_NOTE,
                resolvedAt: RESOLVED_ISO,
                updatedAt: RESOLVED_ISO,
              },
            })
          ),
        ],
        locale,
        () => {}
      );

      await waitFor(() => {
        expect(screen.getByTestId("teacher-dispute-case-session")).toBeDefined();
      });
      const decision = screen.getByTestId("teacher-dispute-case-resolution");
      expect(decision.textContent).toContain(t.outcomePartialRefund);
      expect(decision.textContent).toContain(RESOLUTION_NOTE);
      expect(decision.textContent).toContain(expectedStamp(RESOLVED_ISO, locale));
      expect(decision.textContent).toContain(t.teacherCaseResolvedAtLabel);
      // The pending line must NOT coexist with a decided outcome.
      expect(screen.queryByTestId("teacher-dispute-case-pending")).toBeNull();
    });

    test("honest empty states — absent artifacts render ONLY the localized empty copy, nothing fabricated", async () => {
      renderCaseDialog(
        [
          caseMock(
            caseFixture({
              report: null,
              homework: null,
              recitation: null,
            })
          ),
        ],
        locale,
        () => {}
      );

      await waitFor(() => {
        expect(screen.getByTestId("teacher-dispute-case-session")).toBeDefined();
      });
      expect(screen.getByText(t.caseReviewEmptyReport)).toBeDefined();
      expect(screen.getByText(t.caseReviewEmptyHomework)).toBeDefined();
      expect(screen.getByText(t.caseReviewEmptyRecitation)).toBeDefined();
      // No fabricated placeholders anywhere.
      expect(screen.queryByText(TEACHER_NOTES)).toBeNull();
      expect(screen.queryByText("Surah Al-Baqarah 20-34")).toBeNull();
      expect(screen.queryByText(t.teacherCaseRatingLabel)).toBeNull();
    });

    test("close routes the dismissal intent to the caller", async () => {
      let closed = false;
      renderCaseDialog([caseMock(caseFixture())], locale, () => {
        closed = true;
      });

      await waitFor(() => {
        expect(screen.getByTestId("teacher-dispute-case-session")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("teacher-dispute-case-close"));
      expect(closed).toBe(true);
      // The caller owns `open` — the dialog stays mounted until it flips.
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByRole("button", { name: tc.close })).toBeDefined();
    });
  });
}
