/**
 * AdminDisputeCaseDialog — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `AdminDisputeCaseDialog.test.tsx` (the same two-phase Happy-DOM bootstrap
 * the sessions-family entries use — see that file for WHY).
 *
 * Happy DOM + Apollo `MockedProvider` tier, driven across BOTH locales,
 * directly against the case-review dialog (the queue container's own suite
 * owns the full-queue matrix): one render case per branch of the dialog's
 * visual state matrix —
 *
 *   `aria-busy` loading skeleton (no fabricated section shells) ·
 *   FORBIDDEN → the shared `PermissionDeniedFallback` (the admin gate is
 *   SERVER-owned — the surface renders whatever the wire's code
 *   classification dictates, no client role logic) · masked transport
 *   failure → the generic inline alert · the settled bundle (verbatim fee
 *   + currency, the dispute moment through the locale date formatter, the
 *   filed reason, the escrow chip, report notes + rating, homework
 *   evidence lines, recitation record, audit-trail entries with verbatim
 *   action types/actors/details) · the HONEST empty states (null report /
 *   homework / recitation and an empty audit trail render ONLY the
 *   localized empty-state copy — nothing is fabricated) · the close
 *   affordance routes the dismissal intent to the caller.
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
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import {
  type AdminDisputeCaseQuery_adminDisputeCase,
  AuditActionType,
  SessionIntent,
  SessionStatus,
  SessionType,
  SurahJuzRef,
} from "@/frontend/graphql/generated/gql/graphql";
import { adminDisputeCaseQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { AdminDisputeCaseDialog } from "@/frontend/views/admin/disputes/AdminDisputeCaseDialog";
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
const CASE_SESSION_ID = "9407";

/** Verbatim fee + moments shared by the case fixtures (DATA). */
const CASE_FEE = "75.00";
const CREATED_ISO = "2099-01-12T08:00:00.000Z";
const DISPUTED_ISO = "2099-01-12T14:30:00.000Z";

/** ASCII note text the report fixture carries (DATA, not locale copy). */
const TEACHER_NOTES = "Student performed well; session ended early.";

/** ASCII participant display names the case fixture resolves (DATA, not locale copy). */
const STUDENT_NAME = "Fixture Student A";
const TEACHER_NAME = "Fixture Teacher T";

/** ASCII audit details payload (DATA, not locale copy). */
const AUDIT_DETAILS = '{"resolution":"PartialRefund","partialAmount":"20.00","notePresent":false}';

/** Deterministic case payload builder mirroring the closed five-member envelope. */
function caseFixture(
  overrides?: Partial<AdminDisputeCaseQuery_adminDisputeCase>
): AdminDisputeCaseQuery_adminDisputeCase {
  return {
    session: {
      id: CASE_SESSION_ID,
      status: SessionStatus.Disputed,
      intent: SessionIntent.Tajweed,
      sessionType: SessionType.StudentSession,
      fee: CASE_FEE,
      feeHeld: false,
      studentId: "512",
      teacherId: "903",
      startedAt: "2099-01-12T09:00:00.000Z",
      endedAt: "2099-01-12T10:00:00.000Z",
      confirmationDeadline: null,
      confirmedByStudentAt: "2099-01-12T10:30:00.000Z",
      confirmedByTeacherAt: "2099-01-12T10:30:00.000Z",
      createdAt: CREATED_ISO,
      updatedAt: DISPUTED_ISO,
      cancelReason: null,
      disputeReason: "Session ended before the full recitation review.",
      disputedAt: DISPUTED_ISO,
      resolutionNote: null,
      resolvedAt: null,
    },
    studentName: STUDENT_NAME,
    teacherName: TEACHER_NAME,
    report: {
      id: "71001",
      sessionId: Number(CASE_SESSION_ID),
      teacherNotes: TEACHER_NOTES,
      studentRatingByTeacher: 4,
      createdAt: CREATED_ISO,
      updatedAt: CREATED_ISO,
    },
    homework: {
      id: "72001",
      sessionId: Number(CASE_SESSION_ID),
      currentFromAyah: 3,
      currentToAyah: 7,
      currentGrade: 9,
      currentSurahJuz: SurahJuzRef.SurahAlBaqarah,
      revisionFromAyah: 1,
      revisionToAyah: 20,
      revisionGrade: 8,
      revisionSurahJuz: SurahJuzRef.SurahAlBaqarah,
      createdAt: CREATED_ISO,
      updatedAt: CREATED_ISO,
    },
    recitation: {
      id: "73001",
      sessionId: CASE_SESSION_ID,
      name: "Surah Al-Baqarah 1-20",
      description: "Memorization check with tajweed review.",
      createdAt: CREATED_ISO,
      updatedAt: CREATED_ISO,
    },
    auditTrail: [
      {
        id: "88001",
        actionType: AuditActionType.Create,
        actorId: Number(CASE_SESSION_ID),
        actorName: "admin@app.local",
        createdAt: CREATED_ISO,
        details: AUDIT_DETAILS,
        entityId: Number(CASE_SESSION_ID),
        entityType: "session",
      },
    ],
    ...overrides,
  };
}

/** Single-operation case mock answering the shared document with one envelope. */
function caseMock(
  payload: AdminDisputeCaseQuery_adminDisputeCase,
  options?: { readonly delay?: number }
): MockLink.MockedResponse {
  return {
    request: { query: adminDisputeCaseQueryDocument, variables: { id: CASE_SESSION_ID } },
    result: { data: { adminDisputeCase: payload } },
    ...(options?.delay === undefined ? {} : { delay: options.delay }),
  };
}

/** Permanently in-flight query (`delay: Infinity`) — the honest pending state. */
function pendingCaseMock(): MockLink.MockedResponse {
  return {
    request: { query: adminDisputeCaseQueryDocument, variables: { id: CASE_SESSION_ID } },
    delay: Infinity,
  };
}

/** Single-operation mock denying the caller at the scope layer (raw `extensions.code`). */
function deniedCaseError(code: string): MockLink.MockedResponse {
  return {
    request: { query: adminDisputeCaseQueryDocument, variables: { id: CASE_SESSION_ID } },
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
  renderWithMocks(<AdminDisputeCaseDialog sessionId={CASE_SESSION_ID} open onClose={onClose} />, mocks, locale);
}

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the full branch
// matrix (STUI_LOCALE split-run guard, shared with the sibling suites).
for (const locale of componentSuiteLocales) {
  const { t, te, tc } = sessionSuiteLabels(locale);

  describe(`AdminDisputeCaseDialog (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("query in flight renders the aria-busy skeleton — no fabricated section shells", () => {
      renderCaseDialog([pendingCaseMock()], locale, () => {});

      const skeleton = screen.getByTestId("admin-dispute-case-loading");
      expect(skeleton.getAttribute("aria-busy")).toBe("true");
      // No settled surface may leak into the skeleton.
      expect(screen.queryByTestId("admin-dispute-case-session")).toBeNull();
      expect(screen.queryByTestId("admin-dispute-case-report")).toBeNull();
      expect(screen.queryByTestId("admin-dispute-case-audit")).toBeNull();
      expect(screen.queryByTestId("admin-dispute-case-error")).toBeNull();
    });

    test("FORBIDDEN renders the shared permission fallback — the admin gate stays server-owned", async () => {
      renderCaseDialog([deniedCaseError("FORBIDDEN")], locale, () => {});

      await waitFor(() => {
        expect(screen.getByText(te.forbiddenRole)).toBeDefined();
      });
      expect(screen.getByText(te.forbidden)).toBeDefined();
      expect(screen.queryByTestId("admin-dispute-case-error")).toBeNull();
    });

    test("masked transport failure surfaces the generic inline alert", async () => {
      renderCaseDialog([deniedCaseError("INTERNAL_SERVER_ERROR")], locale, () => {});

      await waitFor(() => {
        expect(screen.getByTestId("admin-dispute-case-error")).toBeDefined();
      });
      expect(screen.getByText(t.genericError)).toBeDefined();
      // The deny surface must NOT appear for non-deny codes.
      expect(screen.queryByText(te.forbiddenRole)).toBeNull();
    });

    test("settled bundle renders every evidence section with verbatim values", async () => {
      renderCaseDialog([caseMock(caseFixture())], locale, () => {});

      await waitFor(() => {
        expect(screen.getByTestId("admin-dispute-case-session")).toBeDefined();
      });
      // Title + session facts: verbatim fee + currency, the dispute moment
      // through the locale formatter, the filed reason, the consumed chip.
      expect(screen.getByText(t.caseReviewTitle)).toBeDefined();
      expect(screen.getAllByText(`${CASE_FEE} ${SESSION_FEE_CURRENCY}`).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(expectedStamp(DISPUTED_ISO, locale)).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Session ended before the full recitation review.")).toBeDefined();
      expect(screen.getByTestId("admin-dispute-escrow-chip-consumed")).toBeDefined();

      // Report: the teacher's notes + the rating verbatim.
      expect(screen.getByTestId("admin-dispute-case-report")).toBeDefined();
      expect(screen.getByText(TEACHER_NOTES)).toBeDefined();
      expect(screen.getByText(t.caseReviewRatingLabel)).toBeDefined();
      expect(screen.getByText("4")).toBeDefined();

      // Homework: current + revision evidence lines (verbatim numbers/ref).
      expect(screen.getByTestId("admin-dispute-case-homework")).toBeDefined();
      expect(screen.getByText(t.caseReviewHomeworkCurrentLabel)).toBeDefined();
      expect(screen.getByText(t.caseReviewHomeworkRevisionLabel)).toBeDefined();
      expect(screen.getByText(`3 – 7 · 9 · ${SurahJuzRef.SurahAlBaqarah}`)).toBeDefined();
      expect(screen.getByText(`1 – 20 · 8 · ${SurahJuzRef.SurahAlBaqarah}`)).toBeDefined();

      // Recitation: name + description verbatim.
      expect(screen.getByTestId("admin-dispute-case-recitation")).toBeDefined();
      expect(screen.getByText("Surah Al-Baqarah 1-20")).toBeDefined();
      expect(screen.getByText("Memorization check with tajweed review.")).toBeDefined();

      // Audit trail: action type + actor + moment + serialized details.
      const audit = screen.getByTestId("admin-dispute-case-audit");
      expect(within(audit).getByText(AuditActionType.Create)).toBeDefined();
      expect(within(audit).getByText("admin@app.local")).toBeDefined();
      expect(within(audit).getByText(expectedStamp(CREATED_ISO, locale))).toBeDefined();
      expect(within(audit).getByText(AUDIT_DETAILS)).toBeDefined();
    });

    test("honest empty states — absent artifacts render ONLY the localized empty copy, nothing fabricated", async () => {
      renderCaseDialog(
        [
          caseMock(
            caseFixture({
              report: null,
              homework: null,
              recitation: null,
              auditTrail: [],
            })
          ),
        ],
        locale,
        () => {}
      );

      await waitFor(() => {
        expect(screen.getByTestId("admin-dispute-case-session")).toBeDefined();
      });
      expect(screen.getByText(t.caseReviewEmptyReport)).toBeDefined();
      expect(screen.getByText(t.caseReviewEmptyHomework)).toBeDefined();
      expect(screen.getByText(t.caseReviewEmptyRecitation)).toBeDefined();
      expect(screen.getByText(t.caseReviewEmptyAudit)).toBeDefined();
      // No fabricated placeholders anywhere.
      expect(screen.queryByText(TEACHER_NOTES)).toBeNull();
      expect(screen.queryByText("Surah Al-Baqarah 1-20")).toBeNull();
      expect(screen.queryByText(AUDIT_DETAILS)).toBeNull();
      expect(screen.queryByText(t.caseReviewRatingLabel)).toBeNull();
    });

    test("close routes the dismissal intent to the caller", async () => {
      let closed = false;
      renderCaseDialog([caseMock(caseFixture())], locale, () => {
        closed = true;
      });

      await waitFor(() => {
        expect(screen.getByTestId("admin-dispute-case-session")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("admin-dispute-case-close"));
      expect(closed).toBe(true);
      // The caller owns `open` — the dialog stays mounted until it flips.
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByRole("button", { name: tc.close })).toBeDefined();
    });
  });
}
