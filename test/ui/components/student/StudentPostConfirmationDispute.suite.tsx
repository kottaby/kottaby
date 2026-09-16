/**
 * StudentPostConfirmationDispute — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `StudentPostConfirmationDispute.test.tsx` (see that file for the
 * two-phase Happy-DOM bootstrap rationale — the TYPED dialog submits of the
 * wire arms below depend on it).
 *
 * Covers the student post-confirmation dispute action across the shared
 * sessions surfaces (student + teacher rows over the SAME row parts):
 *
 *   1. role-scoped dispute-affordance matrix — student rows: the shipped
 *      pre-completion CTA (Scheduled/Started) PLUS the post-confirmation
 *      escalation (completed ∧ student-stamped ∧ hold consumed); held,
 *      unstamped, cancelled and disputed rows render NO dispute CTA.
 *   2. teacher rows — the post-confirmation CTA NEVER renders (role-leak
 *      prevention): the pre-completion path stays, every completed shape is
 *      undisputable from this surface.
 *   3. the shared `DISPUTABLE_STATUSES` vocabulary byte-stability pin (the
 *      role scoping is the predicate's job, never a set widening).
 *   4. the dialog's MUTATION BINDING selection — `resolveStudentDisputeMutation`
 *      hands the post-confirmation document to the post-confirmation row
 *      and keeps the shipped held-escrow document for every other shape
 *      (predicate-level pins over the exact document instances).
 *   5. the post-confirmation dialog denial arm — a typed submit rides the
 *      post-confirmation document on the wire (the MockLink document match
 *      pins the operation + exact variables) and SESSION_INVALID_TRANSITION
 *      surfaces the dialog's snackbar-mapped error vocabulary; the row
 *      stays completed with a live CTA.
 *   6. the typed SUCCESS arms are the documented environment deferrals (see
 *      the `test.skip` comments — the ONLY skip markers in this suite).
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { cleanup, waitFor, within } from "@testing-library/react";
import {
  type MyStudentSessionsQuery_myStudentSessions_items,
  type OpenSessionDisputeMutation,
  SessionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  myStudentSessionsQueryDocument,
  myTeacherSessionsQueryDocument,
  openPostConfirmationDisputeMutationDocument,
  openSessionDisputeMutationDocument,
} from "@/frontend/graphql/sharedDocuments";
import { MAX_DISPUTE_REASON_LENGTH } from "@/frontend/views/student/sessions/SessionDisputeConfirmDialog";
import { StudentSessionsContainer } from "@/frontend/views/student/sessions/StudentSessionsContainer";
import { resolveStudentDisputeMutation } from "@/frontend/views/student/sessions/sessionDisputeMutations";
import { DISPUTABLE_STATUSES, isDisputable } from "@/frontend/views/student/sessions/sessionRowPresentation";
import { TeacherSessionsContainer } from "@/frontend/views/teacher/sessions/TeacherSessionsContainer";
import {
  ALL_SESSIONS_LIST_VARIABLES,
  buildSessionWireRow,
  clickRowActionAndAwaitDialog,
  componentSuiteLocales,
  expectDialogClosedAndSnackbar,
  expectDisputedChipFlip,
  liveScreen,
  renderWithMocks,
  type SessionWireRow,
  sessionSuiteLabels,
  snackbarSeverityClass,
  submitDialogWithTypedReason,
} from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Fixtures

const CREATED_ISO = "2099-01-05T08:00:00.000Z";
const CONFIRMED_ISO = "2099-01-09T16:00:00.000Z";
const RESOLVED_ISO = "2099-01-11T10:00:00.000Z";
const ENDED_ISO = "2099-01-09T17:30:00.000Z";
const DISPUTED_ISO = "2099-01-10T13:20:00.000Z";

/** Student-page row ids (one per affordance-matrix shape). */
const SCHEDULED_ID = "9401";
const STARTED_ID = "9402";
const POST_CONFIRMED_ID = "9403";
const HELD_CONFIRMED_ID = "9404";
const SETTLED_UNCONFIRMED_ID = "9405";
const CANCELLED_ID = "9406";
const DISPUTED_ROW_ID = "9407";

/** Teacher-page row ids (the same component, the teacher surface). */
const TEACHER_SCHEDULED_ID = "9411";
const TEACHER_STARTED_ID = "9412";
const TEACHER_POST_CONFIRMED_ID = "9413";
const TEACHER_SETTLED_ID = "9414";

/** Flow row ids (the typed-dialog wire arms). */
const POST_CONFIRMATION_FLOW_ID = "9421";
const PRE_COMPLETION_FLOW_ID = "9422";

/** Raw text typed into the dialog (padded — proves the UI-seam trim). */
const DISPUTE_REASON_TYPED = "  Teacher never showed up  ";

/** The trimmed value the dialog sends on the wire (reason REQUIRED). */
const DISPUTE_REASON_SENT = DISPUTE_REASON_TYPED.trim();

/** Deterministic payload builder over the shared closed-session wire shape. */
function wireRow(id: string, overrides?: Partial<MyStudentSessionsQuery_myStudentSessions_items>): SessionWireRow {
  return buildSessionWireRow({ id, createdIso: CREATED_ISO, deadlineIso: null }, overrides);
}

/** The dual-confirmed, hold-consumed row — the post-confirmation shape. */
function postConfirmedRow(id: string): SessionWireRow {
  return wireRow(id, {
    status: SessionStatus.Completed,
    fee: "180.00",
    feeHeld: false,
    confirmedByStudentAt: CONFIRMED_ISO,
    confirmedByTeacherAt: CONFIRMED_ISO,
    startedAt: CONFIRMED_ISO,
    endedAt: ENDED_ISO,
  });
}

/** One populated student page: one row per dispute-affordance shape. */
const STUDENT_MATRIX_ROWS: ReadonlyArray<SessionWireRow> = [
  wireRow(SCHEDULED_ID, { fee: "150.50", feeHeld: true }),
  wireRow(STARTED_ID, { status: SessionStatus.Started, fee: "200.00" }),
  postConfirmedRow(POST_CONFIRMED_ID),
  // The held boundary: completed + student-stamped but the fee STILL held —
  // the exactly-once confirm-pending shape stays undisputable.
  wireRow(HELD_CONFIRMED_ID, {
    status: SessionStatus.Completed,
    fee: "175.00",
    feeHeld: true,
    confirmedByStudentAt: CONFIRMED_ISO,
    confirmedByTeacherAt: CONFIRMED_ISO,
  }),
  // The consumed but unstamped shape — the student confirmation never
  // landed, so the post-confirmation escalation does not apply.
  wireRow(SETTLED_UNCONFIRMED_ID, {
    status: SessionStatus.Completed,
    fee: "90.00",
    feeHeld: false,
  }),
  wireRow(CANCELLED_ID, { status: SessionStatus.Cancelled, fee: null, feeHeld: false }),
  wireRow(DISPUTED_ROW_ID, {
    status: SessionStatus.Disputed,
    fee: "60.00",
    feeHeld: false,
    confirmedByStudentAt: CONFIRMED_ISO,
    disputeReason: "Escalated for arbitration",
    disputedAt: DISPUTED_ISO,
  }),
];

/** One populated teacher page: pre-completion rows + every completed shape. */
const TEACHER_MATRIX_ROWS: ReadonlyArray<SessionWireRow> = [
  wireRow(TEACHER_SCHEDULED_ID, { fee: "150.50", feeHeld: true }),
  wireRow(TEACHER_STARTED_ID, { status: SessionStatus.Started, fee: "200.00" }),
  postConfirmedRow(TEACHER_POST_CONFIRMED_ID),
  wireRow(TEACHER_SETTLED_ID, {
    status: SessionStatus.Completed,
    fee: "90.00",
    feeHeld: false,
  }),
];

// ---------------------------------------------------------------------------
// Mock builders

/** Single-operation Apollo mock answering the student list with a page. */
function studentListPageMock(items: ReadonlyArray<SessionWireRow>): MockLink.MockedResponse {
  return {
    request: { query: myStudentSessionsQueryDocument, variables: ALL_SESSIONS_LIST_VARIABLES },
    result: {
      data: {
        myStudentSessions: { items: [...items], page: 1, pageSize: 25, totalCount: items.length },
      },
    },
  };
}

/** Single-operation Apollo mock answering the teacher list with a page. */
function teacherListPageMock(items: ReadonlyArray<SessionWireRow>): MockLink.MockedResponse {
  return {
    request: { query: myTeacherSessionsQueryDocument, variables: ALL_SESSIONS_LIST_VARIABLES },
    result: {
      data: {
        myTeacherSessions: { items: [...items], page: 1, pageSize: 25, totalCount: items.length },
      },
    },
  };
}

/** The disputed wire payload the dispute success mocks return. */
function disputedPayload(id: string): SessionWireRow {
  return wireRow(id, {
    status: SessionStatus.Disputed,
    feeHeld: false,
    confirmedByStudentAt: CONFIRMED_ISO,
    confirmedByTeacherAt: CONFIRMED_ISO,
    disputeReason: DISPUTE_REASON_SENT,
    disputedAt: DISPUTED_ISO,
  });
}

/** Post-confirmation dispute mock resolving the disputed payload. */
function postConfirmationSuccessMock(id: string): MockLink.MockedResponse {
  return {
    request: {
      query: openPostConfirmationDisputeMutationDocument,
      variables: { id, reason: DISPUTE_REASON_SENT },
    },
    result: { data: { openPostConfirmationDispute: disputedPayload(id) } },
  };
}

/** Post-confirmation dispute mock failing with a transport-shaped code. */
function postConfirmationErrorMock(id: string, code: string): MockLink.MockedResponse {
  return {
    request: {
      query: openPostConfirmationDisputeMutationDocument,
      variables: { id, reason: DISPUTE_REASON_SENT },
    },
    result: {
      errors: [{ message: `${code} (masked transport surface)`, extensions: { code } }],
    },
  };
}

/** Shipped held-escrow dispute mock resolving the disputed payload. */
function shippedDisputeSuccessMock(id: string): MockLink.MockedResponse {
  return {
    request: {
      query: openSessionDisputeMutationDocument,
      variables: { id, reason: DISPUTE_REASON_SENT },
    },
    result: { data: { openSessionDispute: disputedPayload(id) } },
  };
}

// ---------------------------------------------------------------------------
// Predicate-level byte-stability pins (locale-independent)

/** A minimal dispute-shape row for the predicate pins (resolved stamp defaults to unset). */
function disputeShape(
  status: SessionStatus,
  confirmedByStudentAt: string | null,
  feeHeld: boolean,
  resolvedAt: string | null = null
): {
  status: SessionStatus;
  confirmedByStudentAt: string | null;
  feeHeld: boolean;
  resolvedAt: string | null;
} {
  return { status, confirmedByStudentAt, feeHeld, resolvedAt };
}

describe("shared dispute status vocabulary (byte-stable)", () => {
  test("DISPUTABLE_STATUSES keeps its shipped members exactly — post-confirmation scoping is the role clause, never a set widening", () => {
    expect(Object.keys(DISPUTABLE_STATUSES).toSorted((a, b) => a.localeCompare(b))).toEqual(["Scheduled", "Started"]);
    expect("Completed" in DISPUTABLE_STATUSES).toBe(false);
    expect("Disputed" in DISPUTABLE_STATUSES).toBe(false);
  });

  test("isDisputable — the role-scoped eligibility matrix over the three post-confirmation clauses", () => {
    // Pre-completion rows: BOTH roles keep the shipped dispute path.
    expect(isDisputable(disputeShape(SessionStatus.Scheduled, null, true), "student")).toBe(true);
    expect(isDisputable(disputeShape(SessionStatus.Scheduled, null, true), "teacher")).toBe(true);
    expect(isDisputable(disputeShape(SessionStatus.Started, null, true), "teacher")).toBe(true);
    // Post-confirmation shape: the student surface ONLY.
    expect(isDisputable(disputeShape(SessionStatus.Completed, CONFIRMED_ISO, false), "student")).toBe(true);
    expect(isDisputable(disputeShape(SessionStatus.Completed, CONFIRMED_ISO, false), "teacher")).toBe(false);
    // Clause boundaries: hold NOT consumed (completed+stamped+held) and
    // stamp unset (consumed but unconfirmed) stay undisputable for both.
    expect(isDisputable(disputeShape(SessionStatus.Completed, CONFIRMED_ISO, true), "student")).toBe(false);
    expect(isDisputable(disputeShape(SessionStatus.Completed, CONFIRMED_ISO, true), "teacher")).toBe(false);
    expect(isDisputable(disputeShape(SessionStatus.Completed, null, false), "student")).toBe(false);
    // Terminal non-completed statuses never reach the escalation.
    expect(isDisputable(disputeShape(SessionStatus.Cancelled, null, false), "student")).toBe(false);
    expect(isDisputable(disputeShape(SessionStatus.Disputed, null, false), "student")).toBe(false);
    // Arbitration terminality: the resolved stamp disarms the escalation
    // even on the exact consumed-completed shape (the admin's decision is
    // binding — no re-dispute affordance).
    expect(isDisputable(disputeShape(SessionStatus.Completed, CONFIRMED_ISO, false, RESOLVED_ISO), "student")).toBe(
      false
    );
    expect(isDisputable(disputeShape(SessionStatus.Completed, CONFIRMED_ISO, false, RESOLVED_ISO), "teacher")).toBe(
      false
    );
  });

  test("resolveStudentDisputeMutation — the post-confirmation row binds the post-confirmation document; every other shape keeps the shipped document", () => {
    // The post-confirmation shape escalates through the post-confirmation
    // operation (the exact document instance the student arm must pass).
    expect(
      resolveStudentDisputeMutation(disputeShape(SessionStatus.Completed, CONFIRMED_ISO, false)).mutationDocument
    ).toBe(openPostConfirmationDisputeMutationDocument);
    // Pre-completion rows, terminal rows, and an unresolved id while the
    // dialog slot mounts keep the SHIPPED held-escrow document byte-stable.
    for (const shape of [
      disputeShape(SessionStatus.Scheduled, null, true),
      disputeShape(SessionStatus.Started, null, true),
      disputeShape(SessionStatus.Completed, CONFIRMED_ISO, true),
      disputeShape(SessionStatus.Completed, null, false),
      disputeShape(SessionStatus.Cancelled, null, false),
    ]) {
      expect(resolveStudentDisputeMutation(shape).mutationDocument).toBe(openSessionDisputeMutationDocument);
    }
    expect(resolveStudentDisputeMutation(null).mutationDocument).toBe(openSessionDisputeMutationDocument);
    expect(resolveStudentDisputeMutation(undefined).mutationDocument).toBe(openSessionDisputeMutationDocument);
  });

  test("resultAccessor — the dispute-family projection is drift-proof: EITHER binding projects EITHER generation's payload (CR-10 completion-time binding drift)", () => {
    // The container re-binds the dialog while the mutation is in flight
    // (the mutation's own cache update flips the row to Disputed, which
    // re-resolves the binding to the other generation before onCompleted
    // fires). The projection must therefore accept BOTH envelope keys —
    // exactly the live-found defect this pin locks out.
    const postBinding = resolveStudentDisputeMutation(disputeShape(SessionStatus.Completed, CONFIRMED_ISO, false));
    const heldBinding = resolveStudentDisputeMutation(disputeShape(SessionStatus.Scheduled, null, true));

    // Each binding projects its OWN payload...
    expect(postBinding.resultAccessor({ openPostConfirmationDispute: disputedPayload("901") })?.id).toBe("901");
    expect(heldBinding.resultAccessor({ openSessionDispute: disputedPayload("902") })?.id).toBe("902");
    // ...AND the cross-generation envelopes (the drift the live run hit).
    expect(postBinding.resultAccessor({ openSessionDispute: disputedPayload("903") })?.id).toBe("903");
    expect(heldBinding.resultAccessor({ openPostConfirmationDispute: disputedPayload("904") })?.id).toBe("904");
    // Honest edges: null data → null (dialog's cache arm skips), an EMPTY
    // envelope (neither key — a foreign operation's shape) → undefined
    // (onCompleted skips without throwing).
    expect(postBinding.resultAccessor(null)).toBeNull();
    expect(postBinding.resultAccessor(undefined)).toBeNull();
    const foreignEnvelope = ((): OpenSessionDisputeMutation => Object.create(null))();
    expect(heldBinding.resultAccessor(foreignEnvelope)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Component-tier suites (both locales)

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the affordance
// matrix and the typed wire arms (STUI_LOCALE split-run guard shared with
// the sibling sessions suites).
for (const locale of componentSuiteLocales) {
  const { t, te } = sessionSuiteLabels(locale);

  /** Renders the student container under TestWrapper (locale-bound). */
  function renderStudentSessions(mocks: ReadonlyArray<MockLink.MockedResponse>) {
    return renderWithMocks(<StudentSessionsContainer />, mocks, locale);
  }

  /** Renders the teacher container under TestWrapper (locale-bound). */
  function renderTeacherSessions(mocks: ReadonlyArray<MockLink.MockedResponse>) {
    return renderWithMocks(<TeacherSessionsContainer />, mocks, locale);
  }

  describe(`StudentPostConfirmationDispute (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("student rows — the dispute affordance matrix spans both generations on the student surface", async () => {
      renderStudentSessions([studentListPageMock(STUDENT_MATRIX_ROWS)]);

      await waitFor(() => {
        expect(liveScreen.getByTestId(`session-row-${POST_CONFIRMED_ID}`)).toBeDefined();
      });

      // The shipped pre-completion CTA AND the post-confirmation escalation
      // render on student rows.
      for (const id of [SCHEDULED_ID, STARTED_ID, POST_CONFIRMED_ID]) {
        const row = liveScreen.getByTestId(`session-row-${id}`);
        expect(within(row).getByRole("button", { name: t.openDispute })).toBeDefined();
      }
      // Held (confirm-pending), consumed-unstamped, cancelled and disputed
      // rows render NO dispute CTA via this path.
      for (const id of [HELD_CONFIRMED_ID, SETTLED_UNCONFIRMED_ID, CANCELLED_ID, DISPUTED_ROW_ID]) {
        const row = liveScreen.getByTestId(`session-row-${id}`);
        expect(within(row).queryByRole("button", { name: t.openDispute })).toBeNull();
      }
    });

    test("teacher rows — the post-confirmation dispute CTA never renders on the teacher surface", async () => {
      renderTeacherSessions([teacherListPageMock(TEACHER_MATRIX_ROWS)]);

      await waitFor(() => {
        expect(liveScreen.getByTestId(`session-row-${TEACHER_POST_CONFIRMED_ID}`)).toBeDefined();
      });

      // The pre-completion dispute path stays byte-stable on teacher rows.
      for (const id of [TEACHER_SCHEDULED_ID, TEACHER_STARTED_ID]) {
        const row = liveScreen.getByTestId(`session-row-${id}`);
        expect(within(row).getByRole("button", { name: t.openDispute })).toBeDefined();
      }
      // EVERY completed shape — dual-confirmed consumed or unstamped — is
      // undisputable from the teacher surface (role-leak prevention).
      for (const id of [TEACHER_POST_CONFIRMED_ID, TEACHER_SETTLED_ID]) {
        const row = liveScreen.getByTestId(`session-row-${id}`);
        expect(within(row).queryByRole("button", { name: t.openDispute })).toBeNull();
      }
    });

    // Environment deferral (the sibling container suites' documented skip
    // family — `StudentSessionsContainer.suite.tsx` branch 6c,
    // `TeacherSessionsContainer.suite.tsx` branch 21): the SUCCESS arm's
    // cache-modify convergence broadcasts into the ACTIVE list observer,
    // which runs away under bun 1.3.14 + React 19 + Happy DOM — the process
    // balloons to multi-GB RSS and is OOM-killed (exit 137)
    // deterministically, even with this test run SOLO via `-t`. Body
    // INTACT — one-line flip re-enables. Compensating controls kept GREEN
    // here: the denial arm below proves the typed submit rides the
    // post-confirmation document with exact variables (the MockLink
    // document match), and the binding pins prove which document the
    // student surface passes; the success convergence itself is the same
    // cache-normalize mechanism the shipped held-escrow arm documents.
    test.skip("post-confirmation dispute flow — typed submit rides the post-confirmation document, then the list converges via the cache", async () => {
      renderStudentSessions([
        studentListPageMock([postConfirmedRow(POST_CONFIRMATION_FLOW_ID)]),
        postConfirmationSuccessMock(POST_CONFIRMATION_FLOW_ID),
      ]);

      const dialog = await clickRowActionAndAwaitDialog(POST_CONFIRMATION_FLOW_ID, t.openDispute);
      expect(within(dialog).getByText(t.disputeConfirmTitle)).toBeDefined();

      // Type the (padded) reason — the live counter counts RAW characters —
      // then submit through the dialog's form (React.SubmitEvent path).
      submitDialogWithTypedReason(dialog, DISPUTE_REASON_TYPED, MAX_DISPUTE_REASON_LENGTH);

      // Dialog closes + success snackbar with the dispute-opened copy.
      await expectDialogClosedAndSnackbar(t.disputeOpenedNotice, "MuiAlert-colorSuccess");

      // The row converges via the normalized cache (same id, NO refetch):
      // the chip flips to DISPUTED and the dispute affordance leaves with
      // the lifecycle (the disabled Cancel pill takes over).
      await expectDisputedChipFlip(POST_CONFIRMATION_FLOW_ID, t);
    });

    test("post-confirmation dispute denial — SESSION_INVALID_TRANSITION surfaces the dialog's error snackbar and the row stays completed", async () => {
      renderStudentSessions([
        studentListPageMock([postConfirmedRow(POST_CONFIRMATION_FLOW_ID)]),
        postConfirmationErrorMock(POST_CONFIRMATION_FLOW_ID, "SESSION_INVALID_TRANSITION"),
      ]);

      const dialog = await clickRowActionAndAwaitDialog(POST_CONFIRMATION_FLOW_ID, t.openDispute);
      submitDialogWithTypedReason(dialog, DISPUTE_REASON_TYPED);

      // The dispute vocabulary is snackbar-mapped: localized error snackbar,
      // dialog closes, row stays completed with a live dispute CTA.
      await waitFor(() => {
        expect(liveScreen.getByText(te.sessionInvalidTransition)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.sessionInvalidTransition)).toContain("MuiAlert-colorError");
      expect(liveScreen.queryByRole("dialog")).toBeNull();
      const settledRow = liveScreen.getByTestId(`session-row-${POST_CONFIRMATION_FLOW_ID}`);
      expect(within(settledRow).getByText(t.statusCompleted)).toBeDefined();
      expect(within(settledRow).getByRole("button", { name: t.openDispute }).getAttribute("disabled")).toBeNull();
    });

    // Environment deferral — same cache-modify success arm as the
    // post-confirmation flow above (deterministic exit 137 under bun 1.3.14
    // + React 19 + Happy DOM, even solo). Body INTACT — one-line flip
    // re-enables. Compensating controls: the binding pins prove the
    // pre-completion row keeps the shipped held-escrow document, and the
    // shipped held-escrow UI is the sibling container suites' surface.
    test.skip("pre-completion dispute arm — a scheduled row's dispute still rides the shipped held-escrow document", async () => {
      renderStudentSessions([
        studentListPageMock([wireRow(PRE_COMPLETION_FLOW_ID, { fee: "150.00" })]),
        shippedDisputeSuccessMock(PRE_COMPLETION_FLOW_ID),
      ]);

      const dialog = await clickRowActionAndAwaitDialog(PRE_COMPLETION_FLOW_ID, t.openDispute);
      submitDialogWithTypedReason(dialog, DISPUTE_REASON_TYPED, MAX_DISPUTE_REASON_LENGTH);

      // Same success convergence as the shipped flow — the wire document is
      // pinned by the mock match (a post-confirmation document here would
      // leave the mutation unmatched and fail the arm).
      await expectDialogClosedAndSnackbar(t.disputeOpenedNotice, "MuiAlert-colorSuccess");
      await expectDisputedChipFlip(PRE_COMPLETION_FLOW_ID, t);
    });
  });
}
