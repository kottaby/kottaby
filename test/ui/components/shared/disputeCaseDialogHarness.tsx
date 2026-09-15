/**
 * ParticipantDisputeCaseDialog shared suite harness — the fixtures, mocks,
 * and per-locale test registration the student and teacher case-dialog
 * suites share verbatim (jscpd clone elimination). The two suites exercise
 * the SAME shared dialog core (the surface binding differs: query document,
 * testid prefix, perspective attribution labels, display-name fixture), so
 * this module owns every byte that would otherwise fork.
 *
 * Happy DOM + Apollo `MockedProvider` tier, driven across BOTH locales —
 * one render case per branch of the dialog's visual state matrix:
 *
 *   `aria-busy` loading skeleton (no fabricated section shells) ·
 *   FORBIDDEN → the shared `PermissionDeniedFallback` (the participant
 *   gate is SERVER-owned — the surface renders whatever the wire's code
 *   classification dictates, no client role logic) · masked transport
 *   failure → the generic inline alert · the settled bundle (verbatim fee
 *   + currency, the dispute moment through the locale date formatter, the
 *   FULL filed reason, the escrow chip, the counterparty display name, the
 *   authored report + the surface's rating attribution, homework evidence
 *   lines, recitation record) · the RESOLVED decision block (outcome label
 *   + FULL note + decided-on moment) · the PENDING decision block (the
 *   honest pending line — nothing decided yet) · the HONEST empty states
 *   (null report / homework / recitation render ONLY the localized
 *   empty-state copy — nothing is fabricated) · the close affordance
 *   routes the dismissal intent to the caller.
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
import type { ReactElement } from "react";
import {
  DisputeResolution,
  SessionIntent,
  SessionStatus,
  SessionType,
  type StudentDisputeCaseQuery_studentDisputeCase,
  SurahJuzRef,
} from "@/frontend/graphql/generated/gql/graphql";
import type { TeacherDisputeCaseQuery_teacherDisputeCase } from "@/frontend/graphql/generated/gql/graphql";
import { studentDisputeCaseQueryDocument, teacherDisputeCaseQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import type { AppLocale } from "@/shared/locale/AppLocale";
import {
  componentSuiteLocales,
  expectedStamp,
  liveScreen,
  renderWithMocks,
  sessionSuiteLabels,
  type SessionSuiteLabels,
} from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** The surface-neutral fixture data each suite binds (ids, stamps, note text). */
export interface DisputeCaseFixtureData {
  readonly sessionId: string;
  readonly fee: string;
  readonly createdIso: string;
  readonly disputedIso: string;
  readonly resolvedIso: string;
  readonly startedIso: string;
  readonly endedIso: string;
  readonly confirmedIso: string;
  readonly disputeReason: string;
  readonly teacherNotes: string;
  readonly resolutionNote: string;
}

/** The recitation evidence strings (DATA — identical across both suites). */
const RECITATION_NAME = "Surah Al-Baqarah 20-34";
const RECITATION_DESCRIPTION = "Memorization check with tajweed correction.";

/** The dispute-case session row fixture (surface-neutral structure, suite-bound data). */
export function disputeCaseSessionFixture(
  data: DisputeCaseFixtureData,
): StudentDisputeCaseQuery_studentDisputeCase["session"] {
  return {
    id: data.sessionId,
    status: SessionStatus.Disputed,
    intent: SessionIntent.Hifz,
    sessionType: SessionType.StudentSession,
    fee: data.fee,
    feeHeld: false,
    studentId: "611",
    teacherId: "902",
    startedAt: data.startedIso,
    endedAt: data.endedIso,
    confirmationDeadline: null,
    confirmedByStudentAt: data.confirmedIso,
    confirmedByTeacherAt: data.confirmedIso,
    createdAt: data.createdIso,
    updatedAt: data.disputedIso,
    cancelReason: null,
    disputeReason: data.disputeReason,
    disputedAt: data.disputedIso,
    resolutionNote: null,
    resolutionOutcome: null,
    resolvedAt: null,
  };
}

/** The participant-owned artifact payloads (surface-neutral; suite-bound rating). */
export function disputeCaseArtifactsFixture(
  data: DisputeCaseFixtureData,
  rating: number,
): {
  report: StudentDisputeCaseQuery_studentDisputeCase["report"];
  homework: StudentDisputeCaseQuery_studentDisputeCase["homework"];
  recitation: StudentDisputeCaseQuery_studentDisputeCase["recitation"];
} {
  return {
    report: {
      id: "74001",
      sessionId: Number(data.sessionId),
      teacherNotes: data.teacherNotes,
      studentRatingByTeacher: rating,
      createdAt: data.createdIso,
      updatedAt: data.createdIso,
    },
    homework: {
      id: "75001",
      sessionId: Number(data.sessionId),
      currentFromAyah: 1,
      currentToAyah: 10,
      currentGrade: 8,
      currentSurahJuz: SurahJuzRef.SurahAlBaqarah,
      revisionFromAyah: 20,
      revisionToAyah: 34,
      revisionGrade: 9,
      revisionSurahJuz: SurahJuzRef.SurahAlBaqarah,
      createdAt: data.createdIso,
      updatedAt: data.createdIso,
    },
    recitation: {
      id: "76001",
      sessionId: data.sessionId,
      name: RECITATION_NAME,
      description: RECITATION_DESCRIPTION,
      createdAt: data.createdIso,
      updatedAt: data.createdIso,
    },
  };
}

/** The resolved-decision session override (status + outcome + note + stamps). */
export function resolvedSessionOverride(
  data: DisputeCaseFixtureData,
): Partial<StudentDisputeCaseQuery_studentDisputeCase> {
  return {
    session: {
      ...disputeCaseSessionFixture(data),
      status: SessionStatus.Completed,
      resolutionOutcome: DisputeResolution.PartialRefund,
      resolutionNote: data.resolutionNote,
      resolvedAt: data.resolvedIso,
      updatedAt: data.resolvedIso,
    },
  };
}

// ---------------------------------------------------------------------------
// Mocks (document-parameterized — one wire document per surface)

/** Both participant case documents (the harness binds one per surface). */
type ParticipantCaseDocument =
  | typeof studentDisputeCaseQueryDocument
  | typeof teacherDisputeCaseQueryDocument;

/** The union of both participant wire envelopes. */
type ParticipantCaseEnvelope =
  | StudentDisputeCaseQuery_studentDisputeCase
  | TeacherDisputeCaseQuery_teacherDisputeCase;

/** Single-operation case mock answering the surface document with one envelope. */
function caseMock(
  sessionId: string,
  document: ParticipantCaseDocument,
  rootKey: "studentDisputeCase" | "teacherDisputeCase",
  payload: ParticipantCaseEnvelope,
  options?: { readonly delay?: number },
): MockLink.MockedResponse {
  return {
    request: { query: document, variables: { id: sessionId } },
    result: { data: { [rootKey]: payload } },
    ...(options?.delay === undefined ? {} : { delay: options.delay }),
  };
}

/** Permanently in-flight query (`delay: Infinity`) — the honest pending state. */
function pendingCaseMock(sessionId: string, document: ParticipantCaseDocument): MockLink.MockedResponse {
  return {
    request: { query: document, variables: { id: sessionId } },
    delay: Infinity,
  };
}

/** Single-operation mock denying the caller at the scope layer (raw `extensions.code`). */
function deniedCaseError(
  sessionId: string,
  document: ParticipantCaseDocument,
  code: string,
): MockLink.MockedResponse {
  return {
    request: { query: document, variables: { id: sessionId } },
    result: {
      errors: [{ message: `${code} (masked transport surface)`, extensions: { code } }],
    },
  };
}

// ---------------------------------------------------------------------------
// Shared registration

/** Everything the shared suite needs from the binding surface. */
export interface ParticipantDisputeCaseSuiteContext {
  /** The surface identity: testid prefix + describe title. */
  readonly surface: "student" | "teacher";
  readonly describeTitle: string;
  /** The dialog element under test (the suite's surface binding). */
  readonly element: (onClose: () => void) => ReactElement;
  /** The suite's fixture data (ids, stamps, note text — DATA, never copy). */
  readonly data: DisputeCaseFixtureData;
  /** The counterparty display-name fixture + the report rating it carries (DATA). */
  readonly counterpartyName: string;
  readonly rating: number;
  /** The perspective attribution keys (the surface's vocabulary seam). */
  readonly counterpartyLabel: (t: SessionSuiteLabels["t"]) => string;
  readonly ratingLabel: (t: SessionSuiteLabels["t"]) => string;
  /** The settled test's perspective tail (e.g. owner-tone non-leak pins). */
  readonly settledPerspectiveAssertions?: (
    t: SessionSuiteLabels["t"],
    screen: ReturnType<typeof liveScreen>,
  ) => void;
  /** The surface's envelope builder (neutral fixtures + surface identity). */
  readonly fixture: (
    overrides?: Partial<StudentDisputeCaseQuery_studentDisputeCase>,
  ) => ParticipantCaseEnvelope;
}

/**
 * Registers the participant case-dialog suite for one surface: one test per
 * branch of the dialog's visual state matrix, driven across BOTH locales
 * (one describe block per locale keeps RTL/LTR both exercised — the
 * STUI_LOCALE split-run guard shared with the sibling suites).
 */
export function registerParticipantDisputeCaseSuite(ctx: ParticipantDisputeCaseSuiteContext): void {
  const screen = liveScreen;
  const caseDocument =
    ctx.surface === "student" ? studentDisputeCaseQueryDocument : teacherDisputeCaseQueryDocument;
  const rootKey = ctx.surface === "student" ? ("studentDisputeCase" as const) : ("teacherDisputeCase" as const);
  const tid = (suffix: string) => `${ctx.surface}-dispute-case-${suffix}`;

  afterEach(cleanup);

  for (const locale of componentSuiteLocales) {
    const { t, te, tc } = sessionSuiteLabels(locale);

    describe(`${ctx.describeTitle} (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
      test("query in flight renders the aria-busy skeleton — no fabricated section shells", () => {
        renderWithMocks(ctx.element(() => {}), [pendingCaseMock(ctx.data.sessionId, caseDocument)], locale);

        const skeleton = screen.getByTestId(tid("loading"));
        expect(skeleton.getAttribute("aria-busy")).toBe("true");
        // No settled surface may leak into the skeleton.
        expect(screen.queryByTestId(tid("session"))).toBeNull();
        expect(screen.queryByTestId(tid("report"))).toBeNull();
        expect(screen.queryByTestId(tid("resolution"))).toBeNull();
        expect(screen.queryByTestId(tid("error"))).toBeNull();
      });

      test("FORBIDDEN renders the shared permission fallback — the participant gate stays server-owned", async () => {
        renderWithMocks(ctx.element(() => {}), [deniedCaseError(ctx.data.sessionId, caseDocument, "FORBIDDEN")], locale);

        await waitFor(() => {
          expect(screen.getByText(te.forbiddenRole)).toBeDefined();
        });
        expect(screen.getByText(te.forbidden)).toBeDefined();
        expect(screen.queryByTestId(tid("error"))).toBeNull();
      });

      test("masked transport failure surfaces the generic inline alert", async () => {
        renderWithMocks(
          ctx.element(() => {}),
          [deniedCaseError(ctx.data.sessionId, caseDocument, "INTERNAL_SERVER_ERROR")],
          locale,
        );

        await waitFor(() => {
          expect(screen.getByTestId(tid("error"))).toBeDefined();
        });
        expect(screen.getByText(t.genericError)).toBeDefined();
        // The deny surface must NOT appear for non-deny codes.
        expect(screen.queryByText(te.forbiddenRole)).toBeNull();
      });

      test("settled bundle renders session facts, the filed reason, and the participant-owned artifacts", async () => {
        renderWithMocks(
          ctx.element(() => {}),
          [caseMock(ctx.data.sessionId, caseDocument, rootKey, ctx.fixture())],
          locale,
        );

        await waitFor(() => {
          expect(screen.getByTestId(tid("session"))).toBeDefined();
        });
        // Title + session facts: verbatim fee + currency, the dispute moment
        // through the locale formatter, the counterparty display name, the
        // consumed chip.
        expect(screen.getByText(t.teacherCaseTitle)).toBeDefined();
        expect(screen.getAllByText(`${ctx.data.fee} ${SESSION_FEE_CURRENCY}`).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(expectedStamp(ctx.data.disputedIso, locale)).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(ctx.counterpartyName)).toBeDefined();
        expect(screen.getByText(ctx.counterpartyLabel(t))).toBeDefined();
        expect(screen.getByTestId("admin-dispute-escrow-chip-consumed")).toBeDefined();

        // The FULL filed reason (never truncated inside the case dialog).
        expect(screen.getByTestId(tid("reason"))).toBeDefined();
        expect(screen.getByText(ctx.data.disputeReason)).toBeDefined();

        // Pending decision block: the honest pending line, no fabricated outcome.
        expect(screen.getByTestId(tid("resolution"))).toBeDefined();
        expect(screen.getByTestId(tid("pending"))).toBeDefined();
        expect(screen.getByText(t.teacherCasePendingLine)).toBeDefined();

        // Report: the authored notes + the surface's rating attribution.
        expect(screen.getByTestId(tid("report"))).toBeDefined();
        expect(screen.getByText(ctx.data.teacherNotes)).toBeDefined();
        expect(screen.getByText(ctx.ratingLabel(t))).toBeDefined();
        expect(screen.getByText(String(ctx.rating))).toBeDefined();
        ctx.settledPerspectiveAssertions?.(t, screen);

        // Homework: current + revision evidence lines (verbatim numbers/ref).
        expect(screen.getByTestId(tid("homework"))).toBeDefined();
        expect(screen.getByText(t.caseReviewHomeworkCurrentLabel)).toBeDefined();
        expect(screen.getByText(t.caseReviewHomeworkRevisionLabel)).toBeDefined();
        expect(screen.getByText(`1 – 10 · 8 · ${SurahJuzRef.SurahAlBaqarah}`)).toBeDefined();
        expect(screen.getByText(`20 – 34 · 9 · ${SurahJuzRef.SurahAlBaqarah}`)).toBeDefined();

        // Recitation: name + description verbatim.
        expect(screen.getByTestId(tid("recitation"))).toBeDefined();
        expect(screen.getByText(RECITATION_NAME)).toBeDefined();
        expect(screen.getByText(RECITATION_DESCRIPTION)).toBeDefined();
      });

      test("resolved decision block renders the outcome label, the FULL note, and the decided-on moment", async () => {
        renderWithMocks(
          ctx.element(() => {}),
          [caseMock(ctx.data.sessionId, caseDocument, rootKey, ctx.fixture(resolvedSessionOverride(ctx.data)))],
          locale,
        );

        await waitFor(() => {
          expect(screen.getByTestId(tid("session"))).toBeDefined();
        });
        const decision = screen.getByTestId(tid("resolution"));
        expect(decision.textContent).toContain(t.outcomePartialRefund);
        expect(decision.textContent).toContain(ctx.data.resolutionNote);
        expect(decision.textContent).toContain(expectedStamp(ctx.data.resolvedIso, locale));
        expect(decision.textContent).toContain(t.teacherCaseResolvedAtLabel);
        // The pending line must NOT coexist with a decided outcome.
        expect(screen.queryByTestId(tid("pending"))).toBeNull();
      });

      test("honest empty states — absent artifacts render ONLY the localized empty copy, nothing fabricated", async () => {
        renderWithMocks(
          ctx.element(() => {}),
          [caseMock(ctx.data.sessionId, caseDocument, rootKey, ctx.fixture({ report: null, homework: null, recitation: null }))],
          locale,
        );

        await waitFor(() => {
          expect(screen.getByTestId(tid("session"))).toBeDefined();
        });
        expect(screen.getByText(t.caseReviewEmptyReport)).toBeDefined();
        expect(screen.getByText(t.caseReviewEmptyHomework)).toBeDefined();
        expect(screen.getByText(t.caseReviewEmptyRecitation)).toBeDefined();
        // No fabricated placeholders anywhere.
        expect(screen.queryByText(ctx.data.teacherNotes)).toBeNull();
        expect(screen.queryByText(RECITATION_NAME)).toBeNull();
        expect(screen.queryByText(ctx.ratingLabel(t))).toBeNull();
      });

      test("close routes the dismissal intent to the caller", async () => {
        let closed = false;
        renderWithMocks(
          ctx.element(() => {
            closed = true;
          }),
          [caseMock(ctx.data.sessionId, caseDocument, rootKey, ctx.fixture())],
          locale,
        );

        await waitFor(() => {
          expect(screen.getByTestId(tid("session"))).toBeDefined();
        });
        fireEvent.click(screen.getByTestId(tid("close")));
        expect(closed).toBe(true);
        // The caller owns `open` — the dialog stays mounted until it flips.
        expect(screen.getByRole("dialog")).toBeDefined();
        expect(screen.getByRole("button", { name: tc.close })).toBeDefined();
      });
    });
  }
}
