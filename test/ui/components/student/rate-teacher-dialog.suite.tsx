/**
 * RateTeacherDialog + student rate CTA — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `rate-teacher-dialog.test.tsx` (the same two-phase react-dom eval-order
 * split as `StudentSessionsContainer.suite.tsx` — see that entry for WHY).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components/student`):
 * the teacher-rating CTA + dialog matrix of the student sessions surface,
 * driven across BOTH locales:
 *
 *   · Rate CTA HIDDEN on every pre-confirmation shape (Scheduled · completed
 *     awaiting the student stamp · completed without the teacher stamp)
 *   · Rate CTA HIDDEN once the session sits in the rated set (the read-only
 *     rated chip renders instead — never an interactive button)
 *   · Rate CTA VISIBLE on the dual-confirmed shape whose id is absent from
 *     the rated set
 *   · dialog opens with the 1..5 whole-star scale, submit is DISABLED until
 *     a star is chosen (an empty submit can never reach the wire), then the
 *     submit dispatches the write-once mutation with the selected rating —
 *     mid-scale + the 1-star and 5-star boundary choices
 *   · server VALIDATION addressed at the `rating` field renders the
 *     server-localized wire message INLINE under the stars (error tone) and
 *     keeps the dialog open for a retry — no generic toast fires
 *   · the write-once rejection (EVALUATION_ALREADY_SUBMITTED) closes the
 *     dialog, flips the row to its rated state through the local marker,
 *     and NEVER duplicates the mapped app-scope notice locally (nor fires a
 *     success/error snackbar of its own)
 *
 * Network-call posture (the suite's wire-hygiene proof): every render
 * supplies EXACTLY the mock list the branch needs. The CTA-matrix renders
 * carry NO mutation mock at all — a leaked submit (or any extra operation)
 * would surface as an unmatched MockLink operation and fail the branch; the
 * deny paths assert their convergence with the mock list fully exhausted,
 * so no second wire call can hide behind them.
 *
 * Environment constraint (documented deferral, same class as the sibling
 * suite's cache-surgery notes): polling the dialog's ABSENCE
 * (`waitFor(() => queryByRole("dialog") === null)`) AFTER a mutation has
 * settled runs away under Happy DOM — bun balloons to multiple GB RSS and is
 * OOM-killed (exit 137) deterministically, even run ALONE via `-t`. The
 * dialog slot unmounts in the SAME commit as the outcome it belongs to (the
 * arms run setNotice/closeRateDialog back-to-back), so every terminal-arm
 * branch here waits on the poll-safe SAME-COMMIT signal instead (the
 * snackbar copy or the rated chip — both proven poll-safe in the sibling
 * suites) and pins the dialog's absence with a single query afterwards. The
 * plain open→cancel-close path (no mutation) polls fine.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the scaffold's `sessionSuiteLabels` (Sessions /
 * Errors namespaces) — ZERO hardcoded Arabic/English copy lives here. The
 * exception class is fixture DATA (session/evaluation ids, the two wire
 * moments, the server-localized VALIDATION field pair echoed verbatim from
 * the mocked wire error).
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { cleanup, fireEvent, type RenderResult, waitFor, within } from "@testing-library/react";
import {
  type MyStudentSessionsQuery_myStudentSessions_items,
  type MyTeacherEvaluationsQuery_myTeacherEvaluations,
  type SubmitTeacherEvaluationMutation_submitTeacherEvaluation,
  SessionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  myStudentSessionsQueryDocument,
  myTeacherEvaluationsQueryDocument,
  submitTeacherEvaluationMutationDocument,
} from "@/frontend/graphql/sharedDocuments";
import { StudentSessionsContainer } from "@/frontend/views/student/sessions/StudentSessionsContainer";
import type { AppLocale } from "@/shared/locale/AppLocale";
import {
  ALL_SESSIONS_LIST_VARIABLES,
  buildSessionWireRow,
  clickRowActionAndAwaitDialog,
  componentSuiteLocales,
  liveScreen,
  renderWithMocks,
  sessionSuiteLabels,
  snackbarSeverityClass,
  waitForSessionRow,
} from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

/** The dual-confirmed Completed row exercised by every rate-dialog flow. */
const RATE_SESSION_ID = "9211";

/** Row-creation moment shared by every fixture row (deterministic formatting). */
const CREATED_ISO = "2099-01-09T08:45:00.000Z";

/** Confirmation moments on the dual-confirmed fixtures (both stamps). */
const CONFIRMED_ISO = "2099-01-10T12:00:00.000Z";

/** Teacher-rating moment returned by the submit success mock. */
const EVALUATED_ISO = "2099-01-10T16:40:00.000Z";

/**
 * The server-localized `rating` field pair echoed verbatim from the mocked
 * VALIDATION wire error. The mapping contract echoes ONLY this server-owned
 * `message` onto the field — fixture DATA by the translation rules, never
 * locale copy.
 */
const RATING_FIELD_MESSAGE = "rating field server-localized wire pair (masked transport surface)";

/** The boundary star choices both driven through the dialog to the wire. */
const BOUNDARY_RATINGS: readonly number[] = [1, 5];

interface SessionFixture extends MyStudentSessionsQuery_myStudentSessions_items {
  readonly __typename: "Session";
}

/** Deterministic payload builder over the shared closed-session wire shape. */
function sessionFixture(overrides?: Partial<MyStudentSessionsQuery_myStudentSessions_items>): SessionFixture {
  return buildSessionWireRow({ id: RATE_SESSION_ID, createdIso: CREATED_ISO, deadlineIso: null }, overrides);
}

/** The dual-confirmed shape the Rate CTA renders on (BOTH stamps present). */
const DUAL_CONFIRMED_SESSION = sessionFixture({
  status: SessionStatus.Completed,
  fee: "175.00",
  feeHeld: false,
  confirmedByStudentAt: CONFIRMED_ISO,
  confirmedByTeacherAt: CONFIRMED_ISO,
});

interface EvaluationFixture extends MyTeacherEvaluationsQuery_myTeacherEvaluations {
  readonly __typename: "Evaluation";
}

/** Deterministic rating-history row builder (one persisted teacher rating). */
function evaluationFixture(sessionId: number, id: string): EvaluationFixture {
  return {
    __typename: "Evaluation",
    id,
    evaluatedId: 802,
    evaluatorId: 401,
    sessionId,
    score: 80,
    createdAt: EVALUATED_ISO,
  };
}

interface SubmittedEvaluationFixture extends SubmitTeacherEvaluationMutation_submitTeacherEvaluation {
  readonly __typename: "Evaluation";
}

// ---------------------------------------------------------------------------
// Mock builders

/** Sessions-list mock answering the stateful query with `items`. */
function listPageMock(items: ReadonlyArray<SessionFixture>): MockLink.MockedResponse {
  return {
    request: { query: myStudentSessionsQueryDocument, variables: ALL_SESSIONS_LIST_VARIABLES },
    result: {
      data: {
        myStudentSessions: {
          items: [...items],
          page: 1,
          pageSize: 25,
          totalCount: items.length,
        },
      },
    },
  };
}

/**
 * Rated-history mock answering the container's parallel read with `rows`
 * (the empty list is the settled EMPTY rated set — no session rated yet).
 */
function ratedHistoryMock(rows: ReadonlyArray<EvaluationFixture>): MockLink.MockedResponse {
  return {
    request: { query: myTeacherEvaluationsQueryDocument },
    result: { data: { myTeacherEvaluations: [...rows] } },
  };
}

/** Submit-success mock returning the created rating row (score = rating × 20). */
function rateSuccessMock(rating: number): MockLink.MockedResponse {
  const submitted: SubmittedEvaluationFixture = {
    __typename: "Evaluation",
    id: `eval-rating-${rating}`,
    evaluatedId: 802,
    evaluatorId: 401,
    sessionId: Number(RATE_SESSION_ID),
    score: rating * 20,
    createdAt: EVALUATED_ISO,
  };
  return {
    request: {
      query: submitTeacherEvaluationMutationDocument,
      variables: { input: { rating }, sessionId: RATE_SESSION_ID },
    },
    result: { data: { submitTeacherEvaluation: submitted } },
  };
}

/** Submit-error mock failing with a transport-shaped `extensions.code` error. */
function rateErrorMock(code: string, rating: number): MockLink.MockedResponse {
  return {
    request: {
      query: submitTeacherEvaluationMutationDocument,
      variables: { input: { rating }, sessionId: RATE_SESSION_ID },
    },
    result: {
      errors: [{ message: `${code} (masked transport surface)`, extensions: { code } }],
    },
  };
}

/** Submit-error mock failing VALIDATION with a `rating`-addressed field pair. */
function rateValidationFieldErrorMock(rating: number): MockLink.MockedResponse {
  return {
    request: {
      query: submitTeacherEvaluationMutationDocument,
      variables: { input: { rating }, sessionId: RATE_SESSION_ID },
    },
    result: {
      errors: [
        {
          message: "VALIDATION (masked transport surface)",
          extensions: {
            code: "VALIDATION",
            fields: [{ field: "rating", code: "RATING_OUT_OF_RANGE", message: RATING_FIELD_MESSAGE }],
          },
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Render + interaction helpers

/** Renders the container with the branch's EXACT mock supply (no spare slots). */
function renderRateFlow(mocks: ReadonlyArray<MockLink.MockedResponse>, locale: AppLocale): RenderResult {
  return renderWithMocks(<StudentSessionsContainer />, mocks, locale);
}

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the FULL rating
// matrix while every case stays independently readable. STUI_LOCALE
// split-run guard: `componentSuiteLocales` carries the shared ar/en
// filtering (the sanctioned OOM relief for the sessions-family suites).
for (const locale of componentSuiteLocales) {
  const { t, te } = sessionSuiteLabels(locale);

  /**
   * Renders the rate flow with `mocks`, waits for the dual-confirmed row and
   * clicks its Rate CTA — the shared prologue of the dialog branches.
   */
  async function openRateDialog(mocks: ReadonlyArray<MockLink.MockedResponse>): Promise<HTMLElement> {
    renderRateFlow(mocks, locale);
    return await clickRowActionAndAwaitDialog(RATE_SESSION_ID, t.rateTeacher);
  }

  /** Picks the star whose accessible name is the localized per-star label. */
  function chooseStar(dialog: HTMLElement, rating: number): void {
    fireEvent.click(within(dialog).getByRole("radio", { name: t.ratingStarAriaLabel(rating) }));
  }

  describe(`RateTeacherDialog (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("rate CTA hidden on every pre-confirmation shape — scheduled, student stamp pending, teacher stamp missing", async () => {
      const scheduledId = "9210";
      const studentStampPendingId = "9212";
      const teacherStampMissingId = "9213";
      // NO mutation mock exists in this list — a leaked submit (or any extra
      // operation at all) surfaces as an unmatched MockLink operation and
      // fails this branch (the wire-hygiene proof for the unrated render).
      renderRateFlow(
        [
          listPageMock([
            sessionFixture({ id: scheduledId }),
            sessionFixture({ id: studentStampPendingId, status: SessionStatus.Completed }),
            sessionFixture({
              id: teacherStampMissingId,
              status: SessionStatus.Completed,
              fee: "60.00",
              feeHeld: false,
              confirmedByStudentAt: CONFIRMED_ISO,
            }),
          ]),
          ratedHistoryMock([]),
        ],
        locale
      );

      await waitFor(() => {
        expect(screen.getByTestId(`session-row-${scheduledId}`)).toBeDefined();
      });

      for (const id of [scheduledId, studentStampPendingId, teacherStampMissingId]) {
        const row = screen.getByTestId(`session-row-${id}`);
        expect(within(row).queryByTestId(`session-action-${id}-rate`)).toBeNull();
        expect(within(row).queryByRole("button", { name: t.rateTeacher })).toBeNull();
      }
      // The student-stamp-pending row is NOT an actionless blank — its
      // confirm affordance is live, so the hidden Rate CTA is a real gate
      // decision, not an empty matrix.
      expect(
        within(screen.getByTestId(`session-row-${studentStampPendingId}`)).getByRole("button", {
          name: t.confirmCompletion,
        })
      ).toBeDefined();
      // No dialog slot opened with the render.
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("rate CTA hidden once the session sits in the rated set — read-only rated chip renders instead", async () => {
      renderRateFlow(
        [listPageMock([DUAL_CONFIRMED_SESSION]), ratedHistoryMock([evaluationFixture(Number(RATE_SESSION_ID), "eval-existing")])],
        locale
      );

      const row = await waitForSessionRow(RATE_SESSION_ID);
      expect(within(row).queryByRole("button", { name: t.rateTeacher })).toBeNull();
      // The write-once end-state: the readOnly descriptor renders as a
      // NON-interactive chip carrying the rated copy.
      expect(within(row).getByText(t.teacherRatedChip)).toBeDefined();
      expect(within(row).getByTestId(`session-action-${RATE_SESSION_ID}-rate`).closest("button")).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("rate CTA visible on the dual-confirmed shape whose id is absent from the rated set", async () => {
      renderRateFlow([listPageMock([DUAL_CONFIRMED_SESSION]), ratedHistoryMock([])], locale);

      const row = await waitForSessionRow(RATE_SESSION_ID);
      const cta = within(row).getByRole("button", { name: t.rateTeacher });
      expect(within(row).getByTestId(`session-action-${RATE_SESSION_ID}-rate`)).toBeDefined();
      expect(cta.getAttribute("disabled")).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("dialog dispatch — submit gated until a star is chosen, then the mutation fires with the selected rating", async () => {
      const dialog = await openRateDialog([
        listPageMock([DUAL_CONFIRMED_SESSION]),
        ratedHistoryMock([]),
        rateSuccessMock(4),
      ]);

      // Shell: the localized title + actions, and the 1..5 whole-star scale
      // (five star radios + MUI's clear radio — never a decimal scale).
      expect(within(dialog).getByText(t.rateTeacherDialogTitle)).toBeDefined();
      expect(within(dialog).getByRole("button", { name: t.rateTeacherDialogCancel })).toBeDefined();
      expect(within(dialog).getAllByRole("radio").length).toBe(6);

      // Submit is DISABLED while no star is chosen — an empty submit can
      // never reach the wire.
      const submit = () => within(dialog).getByRole("button", { name: t.rateTeacherDialogSubmit });
      expect(submit().getAttribute("disabled")).not.toBeNull();

      chooseStar(dialog, 4);
      expect(submit().getAttribute("disabled")).toBeNull();
      fireEvent.submit(dialog);

      // Success arm: the success snackbar (the local arm's own copy) + the
      // dialog-slot close + the cache prepend land in ONE commit — wait on
      // the poll-safe snackbar copy, then pin severity and the dialog's
      // absence in that settled commit.
      await waitFor(() => {
        expect(screen.getByText(t.rateTeacherSuccess)).toBeDefined();
      });
      expect(snackbarSeverityClass(t.rateTeacherSuccess)).toContain("MuiAlert-colorSuccess");
      expect(screen.queryByRole("dialog")).toBeNull();
      // The cache prepend converged the rated set — the CTA yields to the
      // rated chip WITHOUT a refetch.
      await waitFor(() => {
        expect(
          within(screen.getByTestId(`session-row-${RATE_SESSION_ID}`)).getByText(t.teacherRatedChip)
        ).toBeDefined();
      });
      expect(within(screen.getByTestId(`session-row-${RATE_SESSION_ID}`)).queryByRole("button", { name: t.rateTeacher })).toBeNull();
    });

    test("boundary dispatch — the 1-star and 5-star choices both reach the wire", async () => {
      for (const rating of BOUNDARY_RATINGS) {
        const { unmount } = renderRateFlow(
          [listPageMock([DUAL_CONFIRMED_SESSION]), ratedHistoryMock([]), rateSuccessMock(rating)],
          locale
        );
        const dialog = await clickRowActionAndAwaitDialog(RATE_SESSION_ID, t.rateTeacher);
        chooseStar(dialog, rating);
        fireEvent.submit(dialog);
        await waitFor(() => {
          expect(screen.getByText(t.rateTeacherSuccess)).toBeDefined();
        });
        expect(snackbarSeverityClass(t.rateTeacherSuccess)).toContain("MuiAlert-colorSuccess");
        expect(screen.queryByRole("dialog")).toBeNull();
        unmount();
      }
    });

    test("server VALIDATION addressed at the rating field renders inline under the stars and keeps the dialog open", async () => {
      const dialog = await openRateDialog([
        listPageMock([DUAL_CONFIRMED_SESSION]),
        ratedHistoryMock([]),
        rateValidationFieldErrorMock(3),
      ]);

      chooseStar(dialog, 3);
      fireEvent.submit(dialog);

      // The server-localized wire pair renders INLINE under the stars (error
      // tone) — the dialog stays open for a retry.
      await waitFor(() => {
        expect(within(dialog).getByText(RATING_FIELD_MESSAGE)).toBeDefined();
      });
      const fieldError = within(dialog).getByText(RATING_FIELD_MESSAGE);
      expect((fieldError.closest(".MuiFormHelperText-root")?.className ?? "").includes("Mui-error")).toBe(true);
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(within(dialog).getByRole("button", { name: t.rateTeacherDialogSubmit }).getAttribute("disabled")).toBeNull();
      // No local fallback fired: the field pair suppresses the generic
      // validation toast, no failure snackbar, and the row stays un-rated.
      expect(screen.queryByText(te.validation)).toBeNull();
      expect(screen.queryByText(t.genericError)).toBeNull();
      expect(screen.queryByText(t.rateTeacherSuccess)).toBeNull();
      expect(within(screen.getByTestId(`session-row-${RATE_SESSION_ID}`)).queryByText(t.teacherRatedChip)).toBeNull();
    });

    test("write-once rejection — dialog closes, the row flips to its rated state, the app-scope notice stays mapped-only", async () => {
      const dialog = await openRateDialog([
        listPageMock([DUAL_CONFIRMED_SESSION]),
        ratedHistoryMock([]),
        rateErrorMock("EVALUATION_ALREADY_SUBMITTED", 5),
      ]);

      chooseStar(dialog, 5);
      fireEvent.submit(dialog);

      // The rejection PROVES the rating exists: the dialog-slot close and
      // the local marker's rated flip land in ONE commit — wait on the
      // poll-safe chip signal, then pin the dialog's absence in that settled
      // commit. No refetch, no second submit possible (the mock list is
      // exhausted).
      await waitFor(() => {
        const row = screen.getByTestId(`session-row-${RATE_SESSION_ID}`);
        expect(within(row).getByText(t.teacherRatedChip)).toBeDefined();
        expect(within(row).queryByRole("button", { name: t.rateTeacher })).toBeNull();
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      // The localized notice renders app-scope through the mapped error
      // surface — the local arm must NOT duplicate it, and no success or
      // failure snackbar may fire either.
      expect(screen.queryByText(te.evaluationAlreadySubmitted)).toBeNull();
      expect(screen.queryByText(t.rateTeacherSuccess)).toBeNull();
      expect(screen.queryByText(t.genericError)).toBeNull();
    });
  });
}
