/**
 * AdminSessionDialogs — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `AdminSessionDialogs.test.tsx` (see that file for WHY the suite is split —
 * short version: react-dom must first evaluate with the Happy-DOM document
 * already registered, or controlled `onChange` dies with
 * `isInputEventSupported === false`).
 *
 * The COMPONENT-CONTRACT tier of the four admin session-governance
 * interaction surfaces (DEV3-021 / tasks 5.2.4 "ALL dialog open/confirm/
 * submit paths"): the reschedule, cancel and reassign dialogs plus the
 * join-observation banner render HERE IN ISOLATION — props in, callbacks
 * out — while every confirm/submit path additionally fires the REAL 5.1
 * mutation document through a tiny `useMutation` harness under
 * `MockedProvider`, so the wire contract (exact document + exact variables)
 * is proven at the component seam, not only through the container:
 *
 *   reschedule — closed mount renders nothing · open shell (title, warning
 *   callout body, prefilled `datetime-local` pair) · valid-pair submit →
 *   ISO-8601 instants on the callback AND `AdminSessionReschedule` matched
 *   with `{ sessionId, startedAt, endedAt }` · unordered-window submit
 *   BLOCKED before the wire (localized helper + `aria-invalid`, callback
 *   never fires) · past-start submit blocked before the wire (the 5-minute
 *   grace mirror) · empty token disables the submit affordance · loading
 *   gates both actions · dismissal through the Common-namespace cancel.
 *
 *   cancel — open shell (optional-reason seam, `0/<cap>` counter, hard
 *   `maxlength` clamp attribute, submit ENABLED with an empty reason) ·
 *   empty submit sends `reason: null` on the wire · typed reason submits
 *   VERBATIM-TRIMMED with the live raw-character counter · loading gates.
 *
 *   reassign — open shell with the plain whole-number id input (the 5.2
 *   plain-id-input decision) and a submit DISABLED until a token exists ·
 *   numeric token → parsed `Int` on the callback and `AdminSessionReassign`
 *   matched with `{ sessionId, newTeacherUserId }` · padded numeric token
 *   trims to the same Int · non-numeric token BLOCKED before the wire
 *   (`aria-invalid` + the localized filter-id helper) · loading gates.
 *
 *   join — the single-click banner (title, body, confirm) fires
 *   `AdminSessionJoin` with `{ sessionId }` · loading disables the confirm ·
 *   `joined` unmounts the banner entirely.
 *
 * Validation-blocked arms chain NO mutation mock and pin the harness marker
 * STAYS idle: a leaked wire call would surface as an unmatched MockLink
 * operation and flip the marker to `failed`, failing the branch — the same
 * no-leak discipline the container suite's gated-submit branch uses.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects (`AdminSessionGovernance` / `Sessions` / `Errors` / `Common`
 * namespaces, warmed at load via the shared scaffold) — zero hardcoded
 * Arabic/English copy. The exception class is fixture DATA (ids, ISO
 * instants, an ASCII reason) with the reschedule instants recomputed through
 * the dialog's own token converter.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { useMutation } from "@apollo/client/react";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { SessionStatus } from "@/frontend/graphql/generated/gql/graphql";
import {
  adminSessionCancelMutationDocument,
  adminSessionJoinMutationDocument,
  adminSessionReassignMutationDocument,
  adminSessionRescheduleMutationDocument,
} from "@/frontend/graphql/sharedDocuments";
import {
  CancelSessionDialog,
  MAX_CANCEL_REASON_LENGTH,
} from "@/frontend/views/admin/session-governance/CancelSessionDialog";
import { JoinObservationAction } from "@/frontend/views/admin/session-governance/JoinObservationAction";
import { ReassignTeacherDialog } from "@/frontend/views/admin/session-governance/ReassignTeacherDialog";
import {
  type ReschedulePair,
  RescheduleSessionDialog,
} from "@/frontend/views/admin/session-governance/RescheduleSessionDialog";
import { isoToDatetimeLocalToken } from "@/frontend/views/admin/session-governance/sessionTypePresentation";
import { AdminSessionGovernance as AdminSessionGovernanceNs } from "@/shared/locale/namespaces/adminSessionGovernance";
import { getTranslations } from "@/shared/locale/server";
import type { AdminSessionGovernanceLabels } from "@/shared/locale/types/adminSessionGovernance";
import {
  type AdminSessionRowFixture,
  buildAdminSessionRowFixture,
  componentSuiteLocales,
  FUTURE_END_ISO,
  FUTURE_START_ISO,
  liveScreen,
  muiLabelPattern,
  PAST_START_ISO,
  sessionSuiteLabels,
  warmSessionSuiteNamespaces,
} from "@/test/ui/components/helpers";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ---------------------------------------------------------------------------
// Eager namespace warming (missing-key drift surfaces at LOAD, not in an arm)

warmSessionSuiteNamespaces();

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

type RowFixture = AdminSessionRowFixture;

/** Deterministic payload builder — the shared 21-field governance wire shape. */
const rowFixture = buildAdminSessionRowFixture;

/**
 * Stable default for the mutation harnesses' optional `mocks` prop — the
 * shared empty-reference the no-object-type-as-default-prop rule mandates
 * (a fresh array literal per render would churn the harness identity).
 */
const NO_MUTATION_MOCKS: ReadonlyArray<MockLink.MockedResponse> = [];

/** An end BEFORE the start — the unordered-window validation arm. */
const EARLIER_END_ISO = "2099-01-10T08:00:00.000Z";

const RESCHEDULE_ID = "7401";
const CANCEL_ID = "7402";
const REASSIGN_ID = "7403";
const JOIN_ID = "7404";

/** Fixture DATA reason (never locale copy) — padded to pin the trim seam. */
const CANCEL_REASON_RAW = "  Duplicate booking.  ";
const CANCEL_REASON_TRIMMED = "Duplicate booking.";

/**
 * The submit instants the dialog's own token converter produces for a
 * fixture ISO (prefill → `datetime-local` token → ISO-8601 wire instant).
 * The SAME oracle the container suite pins, recomputed independently here.
 */
function expectedSubmitIso(fixtureIso: string): string {
  return new Date(isoToDatetimeLocalToken(fixtureIso)).toISOString();
}

/**
 * Assertion-free `HTMLInputElement` access for the `datetime-local` prefill
 * pins — the MUI labelled control is typed as a bare `HTMLElement`, and a
 * narrowing `as` cast trips the unsafe-assertion lint (same guard shape the
 * container suite uses).
 */
function inputElementOrThrow(element: HTMLElement): HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("expected the labelled element to be an HTMLInputElement");
  }
  return element;
}

// ---------------------------------------------------------------------------
// Mock builder (the confirm arms' exact-variables mutation mocks)

type MutationOutcome =
  | { readonly kind: "success"; readonly payload: RowFixture }
  | { readonly kind: "error"; readonly code: string };

function rescheduleMock(
  sessionId: string,
  startedAtIso: string,
  endedAtIso: string,
  outcome: MutationOutcome
): MockLink.MockedResponse {
  return {
    request: {
      query: adminSessionRescheduleMutationDocument,
      variables: { input: { sessionId, startedAt: startedAtIso, endedAt: endedAtIso } },
    },
    result:
      outcome.kind === "success"
        ? { data: { adminRescheduleSession: outcome.payload } }
        : { errors: [{ message: `${outcome.code} (masked transport surface)`, extensions: { code: outcome.code } }] },
  };
}

function cancelMock(sessionId: string, reason: string | null, outcome: MutationOutcome): MockLink.MockedResponse {
  return {
    request: { query: adminSessionCancelMutationDocument, variables: { input: { sessionId, reason } } },
    result:
      outcome.kind === "success"
        ? { data: { adminCancelSession: outcome.payload } }
        : { errors: [{ message: `${outcome.code} (masked transport surface)`, extensions: { code: outcome.code } }] },
  };
}

function reassignMock(sessionId: string, newTeacherUserId: number, outcome: MutationOutcome): MockLink.MockedResponse {
  return {
    request: { query: adminSessionReassignMutationDocument, variables: { input: { sessionId, newTeacherUserId } } },
    result:
      outcome.kind === "success"
        ? { data: { adminReassignTeacher: outcome.payload } }
        : { errors: [{ message: `${outcome.code} (masked transport surface)`, extensions: { code: outcome.code } }] },
  };
}

function joinMock(sessionId: string, outcome: MutationOutcome): MockLink.MockedResponse {
  return {
    request: { query: adminSessionJoinMutationDocument, variables: { input: { sessionId } } },
    result:
      outcome.kind === "success"
        ? { data: { adminJoinSession: outcome.payload } }
        : { errors: [{ message: `${outcome.code} (masked transport surface)`, extensions: { code: outcome.code } }] },
  };
}

// ---------------------------------------------------------------------------
// Mutation harnesses (the wire tier of each confirm path)

/** Harness phase marker — rendered as a data-testid tri-state on the body. */
type HarnessPhase = "idle" | "ok" | "failed";

/**
 * Reschedule dialog wired to the REAL `AdminSessionReschedule` document:
 * the dialog's validated submit intent forwards verbatim into the mutation
 * variables the container sends (`{ sessionId, startedAt, endedAt }`); the
 * MockLink match flips the marker to `ok`, an unmatched operation to
 * `failed`.
 */
function RescheduleMutationHarness({
  session,
  loading,
  onSubmitSpy,
  mocks = NO_MUTATION_MOCKS,
}: {
  readonly session: RowFixture;
  readonly loading: boolean;
  readonly onSubmitSpy: (pair: ReschedulePair) => void;
  readonly mocks?: ReadonlyArray<MockLink.MockedResponse>;
}): ReactNode {
  return (
    <MockedProvider mocks={[...mocks]}>
      <RescheduleMutationHarnessInner session={session} loading={loading} onSubmitSpy={onSubmitSpy} />
    </MockedProvider>
  );
}

/**
 * INNER — the hooks live INSIDE the provider (a `useMutation` caller above
 * the `MockedProvider` boundary would miss the client context entirely).
 */
function RescheduleMutationHarnessInner({
  session,
  loading,
  onSubmitSpy,
}: {
  readonly session: RowFixture;
  readonly loading: boolean;
  readonly onSubmitSpy: (pair: ReschedulePair) => void;
}): ReactNode {
  const [phase, setPhase] = useState<HarnessPhase>("idle");
  const [commit] = useMutation(adminSessionRescheduleMutationDocument, {
    onCompleted: () => setPhase("ok"),
    onError: () => setPhase("failed"),
  });
  return (
    <>
      <RescheduleSessionDialog
        session={session}
        open
        loading={loading}
        onClose={() => {}}
        onSubmit={pair => {
          onSubmitSpy(pair);
          void commit({
            variables: { input: { sessionId: session.id, startedAt: pair.startedAt, endedAt: pair.endedAt } },
          });
        }}
      />
      <div data-testid={`dialog-harness-${phase}`} />
    </>
  );
}

/** Closed-mount arm of the reschedule dialog (the `open={false}` contract). */
function RescheduleClosedHarness({ session }: { readonly session: RowFixture }): ReactNode {
  return (
    <MockedProvider>
      <RescheduleSessionDialog session={session} open={false} loading={false} onClose={() => {}} onSubmit={() => {}} />
    </MockedProvider>
  );
}

/**
 * Cancel dialog wired to the REAL `AdminSessionCancel` document with the
 * container's variable shape (`reason: null` for the empty-submit arm).
 */
function CancelMutationHarness({
  session,
  loading,
  onSubmitSpy,
  mocks = NO_MUTATION_MOCKS,
}: {
  readonly session: RowFixture;
  readonly loading: boolean;
  readonly onSubmitSpy: (reason: string | null) => void;
  readonly mocks?: ReadonlyArray<MockLink.MockedResponse>;
}): ReactNode {
  return (
    <MockedProvider mocks={[...mocks]}>
      <CancelMutationHarnessInner session={session} loading={loading} onSubmitSpy={onSubmitSpy} />
    </MockedProvider>
  );
}

/** INNER — the hooks live INSIDE the provider (see the reschedule note). */
function CancelMutationHarnessInner({
  session,
  loading,
  onSubmitSpy,
}: {
  readonly session: RowFixture;
  readonly loading: boolean;
  readonly onSubmitSpy: (reason: string | null) => void;
}): ReactNode {
  const [phase, setPhase] = useState<HarnessPhase>("idle");
  const [commit] = useMutation(adminSessionCancelMutationDocument, {
    onCompleted: () => setPhase("ok"),
    onError: () => setPhase("failed"),
  });
  return (
    <>
      <CancelSessionDialog
        session={session}
        open
        loading={loading}
        onClose={() => {}}
        onSubmit={reason => {
          onSubmitSpy(reason);
          void commit({ variables: { input: { sessionId: session.id, reason } } });
        }}
      />
      <div data-testid={`dialog-harness-${phase}`} />
    </>
  );
}

/**
 * Reassign dialog wired to the REAL `AdminSessionReassign` document — the
 * dialog parses the whole-number token, the harness proves the `Int` rides
 * the wire (`newTeacherUserId`), never a string.
 */
function ReassignMutationHarness({
  session,
  loading,
  onSubmitSpy,
  mocks = NO_MUTATION_MOCKS,
}: {
  readonly session: RowFixture;
  readonly loading: boolean;
  readonly onSubmitSpy: (newTeacherUserId: number) => void;
  readonly mocks?: ReadonlyArray<MockLink.MockedResponse>;
}): ReactNode {
  return (
    <MockedProvider mocks={[...mocks]}>
      <ReassignMutationHarnessInner session={session} loading={loading} onSubmitSpy={onSubmitSpy} />
    </MockedProvider>
  );
}

/** INNER — the hooks live INSIDE the provider (see the reschedule note). */
function ReassignMutationHarnessInner({
  session,
  loading,
  onSubmitSpy,
}: {
  readonly session: RowFixture;
  readonly loading: boolean;
  readonly onSubmitSpy: (newTeacherUserId: number) => void;
}): ReactNode {
  const [phase, setPhase] = useState<HarnessPhase>("idle");
  const [commit] = useMutation(adminSessionReassignMutationDocument, {
    onCompleted: () => setPhase("ok"),
    onError: () => setPhase("failed"),
  });
  return (
    <>
      <ReassignTeacherDialog
        session={session}
        open
        loading={loading}
        onClose={() => {}}
        onSubmit={newTeacherUserId => {
          onSubmitSpy(newTeacherUserId);
          void commit({ variables: { input: { sessionId: session.id, newTeacherUserId } } });
        }}
      />
      <div data-testid={`dialog-harness-${phase}`} />
    </>
  );
}

/** Join banner wired to the REAL `AdminSessionJoin` document. */
function JoinMutationHarness({
  sessionId,
  loading,
  joined,
  onJoinSpy,
  mocks = NO_MUTATION_MOCKS,
}: {
  readonly sessionId: string;
  readonly loading: boolean;
  readonly joined: boolean;
  readonly onJoinSpy: () => void;
  readonly mocks?: ReadonlyArray<MockLink.MockedResponse>;
}): ReactNode {
  return (
    <MockedProvider mocks={[...mocks]}>
      <JoinMutationHarnessInner sessionId={sessionId} loading={loading} joined={joined} onJoinSpy={onJoinSpy} />
    </MockedProvider>
  );
}

/** INNER — the hooks live INSIDE the provider (see the reschedule note). */
function JoinMutationHarnessInner({
  sessionId,
  loading,
  joined,
  onJoinSpy,
}: {
  readonly sessionId: string;
  readonly loading: boolean;
  readonly joined: boolean;
  readonly onJoinSpy: () => void;
}): ReactNode {
  const [phase, setPhase] = useState<HarnessPhase>("idle");
  const [commit] = useMutation(adminSessionJoinMutationDocument, {
    onCompleted: () => setPhase("ok"),
    onError: () => setPhase("failed"),
  });
  return (
    <>
      <JoinObservationAction
        sessionId={sessionId}
        joined={joined}
        loading={loading}
        onJoin={() => {
          onJoinSpy();
          void commit({ variables: { input: { sessionId } } });
        }}
      />
      <div data-testid={`dialog-harness-${phase}`} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Small shared assertions

async function expectDialogOpen(): Promise<HTMLElement> {
  return await waitFor(() => liveScreen.getByRole("dialog"));
}

/** The mutation harness marker must STILL be idle (no wire call leaked). */
function expectHarnessIdle(): void {
  expect(liveScreen.getByTestId("dialog-harness-idle")).not.toBeNull();
  expect(liveScreen.queryByTestId("dialog-harness-ok")).toBeNull();
  expect(liveScreen.queryByTestId("dialog-harness-failed")).toBeNull();
}

/** Waits for the harness mutation to be MATCHED by the MockLink (ok). */
async function expectHarnessMutationOk(): Promise<void> {
  await waitFor(() => {
    expect(liveScreen.getByTestId("dialog-harness-ok")).not.toBeNull();
  });
}

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the FULL dialog
// matrix. STUI_LOCALE split-run guard: `componentSuiteLocales` carries the
// shared ar/en filtering (unset runs BOTH locales).
for (const locale of componentSuiteLocales) {
  const { te, tc } = sessionSuiteLabels(locale);
  const t: AdminSessionGovernanceLabels = AdminSessionGovernanceNs.getLabels(getTranslations(locale));

  describe(`AdminSessionDialogs — reschedule (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("closed mount renders nothing — no dialog role leaks into the DOM", () => {
      renderWithWrapper(<RescheduleClosedHarness session={rowFixture({ id: RESCHEDULE_ID })} />, { locale });
      expect(liveScreen.queryByRole("dialog")).toBeNull();
    });

    test("open path — title, warning-callout body, prefilled datetime pair, submit enabled", async () => {
      renderWithWrapper(
        <RescheduleMutationHarness
          session={rowFixture({ id: RESCHEDULE_ID })}
          loading={false}
          onSubmitSpy={() => {}}
        />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      expect(within(dialog).getByRole("heading", { name: t.rescheduleTitle })).not.toBeNull();
      expect(within(dialog).getByText(t.rescheduleBody)).not.toBeNull();
      const startInput = inputElementOrThrow(within(dialog).getByLabelText(muiLabelPattern(t.rescheduleStartLabel)));
      const endInput = inputElementOrThrow(within(dialog).getByLabelText(muiLabelPattern(t.rescheduleEndLabel)));
      expect(startInput.value).toBe(isoToDatetimeLocalToken(FUTURE_START_ISO));
      expect(endInput.value).toBe(isoToDatetimeLocalToken(FUTURE_END_ISO));
      expect(within(dialog).getByTestId("reschedule-session-submit").getAttribute("disabled")).toBeNull();
    });

    test("confirm path — valid pair → ISO instants on the callback AND AdminSessionReschedule matched", async () => {
      const submitted: ReschedulePair[] = [];
      renderWithWrapper(
        <RescheduleMutationHarness
          session={rowFixture({ id: RESCHEDULE_ID })}
          loading={false}
          onSubmitSpy={pair => submitted.push(pair)}
          mocks={[
            rescheduleMock(RESCHEDULE_ID, expectedSubmitIso(FUTURE_START_ISO), expectedSubmitIso(FUTURE_END_ISO), {
              kind: "success",
              payload: rowFixture({ id: RESCHEDULE_ID }),
            }),
          ]}
        />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      fireEvent.click(within(dialog).getByTestId("reschedule-session-submit"));

      // The exact-variables mock matching IS the wire assertion: a variables
      // drift would surface as an unmatched operation (failed marker).
      await expectHarnessMutationOk();
      expect(submitted).toHaveLength(1);
      expect(submitted[0].startedAt).toBe(expectedSubmitIso(FUTURE_START_ISO));
      expect(submitted[0].endedAt).toBe(expectedSubmitIso(FUTURE_END_ISO));
    });

    test("unordered window blocked BEFORE the wire — localized helper, aria-invalid, no callback", async () => {
      const submitted: ReschedulePair[] = [];
      renderWithWrapper(
        <RescheduleMutationHarness
          session={rowFixture({ id: RESCHEDULE_ID })}
          loading={false}
          onSubmitSpy={pair => submitted.push(pair)}
        />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      // End moved BEFORE the (prefilled, future) start → the ordered-pair
      // rule fails with the localized window message.
      const endInput = within(dialog).getByLabelText(muiLabelPattern(t.rescheduleEndLabel));
      fireEvent.change(endInput, { target: { value: isoToDatetimeLocalToken(EARLIER_END_ISO) } });
      fireEvent.click(within(dialog).getByTestId("reschedule-session-submit"));

      expect(within(dialog).getByText(te.sessionRescheduleWindowInvalid)).not.toBeNull();
      const startInput = within(dialog).getByLabelText(muiLabelPattern(t.rescheduleStartLabel));
      expect(startInput.getAttribute("aria-invalid")).toBe("true");
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
      expect(submitted).toHaveLength(0);
      expectHarnessIdle();
    });

    test("past start blocked BEFORE the wire — grace-window mirror, localized helper, no callback", async () => {
      const submitted: ReschedulePair[] = [];
      renderWithWrapper(
        <RescheduleMutationHarness
          session={rowFixture({ id: RESCHEDULE_ID })}
          loading={false}
          onSubmitSpy={pair => submitted.push(pair)}
        />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      const startInput = within(dialog).getByLabelText(muiLabelPattern(t.rescheduleStartLabel));
      fireEvent.change(startInput, { target: { value: isoToDatetimeLocalToken(PAST_START_ISO) } });
      fireEvent.click(within(dialog).getByTestId("reschedule-session-submit"));

      expect(within(dialog).getByText(te.sessionRescheduleStartInPast)).not.toBeNull();
      expect(startInput.getAttribute("aria-invalid")).toBe("true");
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
      expect(submitted).toHaveLength(0);
      expectHarnessIdle();
    });

    test("empty start token disables the submit affordance", async () => {
      renderWithWrapper(
        <RescheduleMutationHarness
          session={rowFixture({ id: RESCHEDULE_ID })}
          loading={false}
          onSubmitSpy={() => {}}
        />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      const startInput = within(dialog).getByLabelText(muiLabelPattern(t.rescheduleStartLabel));
      fireEvent.change(startInput, { target: { value: "" } });
      expect(within(dialog).getByTestId("reschedule-session-submit").getAttribute("disabled")).not.toBeNull();
    });

    test("loading gates BOTH actions; dismissal rides the Common-namespace cancel", async () => {
      const dismissals: number[] = [];
      renderWithWrapper(
        <MockedProvider>
          <RescheduleSessionDialog
            session={rowFixture({ id: RESCHEDULE_ID })}
            open
            loading
            onClose={() => {
              dismissals.push(1);
            }}
            onSubmit={() => {}}
          />
        </MockedProvider>,
        { locale }
      );
      const dialog = await expectDialogOpen();

      expect(within(dialog).getByTestId("reschedule-session-submit").getAttribute("disabled")).not.toBeNull();
      const cancelButton = within(dialog).getByRole("button", { name: tc.cancel });
      expect(cancelButton.getAttribute("disabled")).not.toBeNull();
      expect(dismissals).toHaveLength(0);
    });

    test("dismissal path — the cancel button fires onClose while idle", async () => {
      const dismissals: number[] = [];
      renderWithWrapper(
        <MockedProvider>
          <RescheduleSessionDialog
            session={rowFixture({ id: RESCHEDULE_ID })}
            open
            loading={false}
            onClose={() => {
              dismissals.push(1);
            }}
            onSubmit={() => {}}
          />
        </MockedProvider>,
        { locale }
      );
      const dialog = await expectDialogOpen();

      fireEvent.click(within(dialog).getByRole("button", { name: tc.cancel }));
      expect(dismissals).toHaveLength(1);
    });
  });

  describe(`AdminSessionDialogs — cancel (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("open path — shell, optional-reason seam live counter, maxlength clamp, submit ENABLED when empty", async () => {
      renderWithWrapper(
        <CancelMutationHarness session={rowFixture({ id: CANCEL_ID })} loading={false} onSubmitSpy={() => {}} />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      expect(within(dialog).getByRole("heading", { name: t.cancelTitle })).not.toBeNull();
      expect(within(dialog).getByText(t.cancelBody)).not.toBeNull();
      const reasonInput = within(dialog).getByRole("textbox");
      expect(reasonInput.getAttribute("maxlength")).toBe(String(MAX_CANCEL_REASON_LENGTH));
      expect(within(dialog).getByText(`0/${MAX_CANCEL_REASON_LENGTH}`)).not.toBeNull();
      // The reason is OPTIONAL — the confirm affordance stays live.
      expect(within(dialog).getByTestId(`cancel-session-submit-${CANCEL_ID}`).getAttribute("disabled")).toBeNull();
    });

    test("confirm path — empty reason submits reason:null on AdminSessionCancel", async () => {
      const submitted: Array<string | null> = [];
      renderWithWrapper(
        <CancelMutationHarness
          session={rowFixture({ id: CANCEL_ID })}
          loading={false}
          onSubmitSpy={reason => submitted.push(reason)}
          mocks={[
            cancelMock(CANCEL_ID, null, {
              kind: "success",
              payload: rowFixture({ id: CANCEL_ID, status: SessionStatus.Cancelled, feeHeld: false }),
            }),
          ]}
        />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      fireEvent.click(within(dialog).getByTestId(`cancel-session-submit-${CANCEL_ID}`));

      await expectHarnessMutationOk();
      expect(submitted).toHaveLength(1);
      expect(submitted[0]).toBeNull();
    });

    test("confirm path — typed reason submits VERBATIM-TRIMMED with the live raw counter", async () => {
      const submitted: Array<string | null> = [];
      renderWithWrapper(
        <CancelMutationHarness
          session={rowFixture({ id: CANCEL_ID })}
          loading={false}
          onSubmitSpy={reason => submitted.push(reason)}
          mocks={[
            cancelMock(CANCEL_ID, CANCEL_REASON_TRIMMED, {
              kind: "success",
              payload: rowFixture({ id: CANCEL_ID, status: SessionStatus.Cancelled, feeHeld: false }),
            }),
          ]}
        />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      const reasonInput = within(dialog).getByRole("textbox");
      fireEvent.change(reasonInput, { target: { value: CANCEL_REASON_RAW } });
      // The counter reads RAW characters (pre-trim).
      expect(within(dialog).getByText(`${CANCEL_REASON_RAW.length}/${MAX_CANCEL_REASON_LENGTH}`)).not.toBeNull();

      fireEvent.click(within(dialog).getByTestId(`cancel-session-submit-${CANCEL_ID}`));

      await expectHarnessMutationOk();
      expect(submitted).toHaveLength(1);
      expect(submitted[0]).toBe(CANCEL_REASON_TRIMMED);
    });

    test("loading gates BOTH actions", async () => {
      renderWithWrapper(
        <CancelMutationHarness session={rowFixture({ id: CANCEL_ID })} loading onSubmitSpy={() => {}} />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      expect(within(dialog).getByTestId(`cancel-session-submit-${CANCEL_ID}`).getAttribute("disabled")).not.toBeNull();
      expect(within(dialog).getByRole("button", { name: tc.cancel }).getAttribute("disabled")).not.toBeNull();
    });
  });

  /**
   * The reassign confirm arms' shared prologue: render the harness, open the
   * dialog, type the RAW token and fire the submit affordance. When
   * `waitForEnabled` is set, the token gate's disabled→enabled transition is
   * awaited before the click (the arm that pins the gate release); the padded
   * arm clicks directly on the flushed state update, as authored.
   */
  async function renderReassignAndSubmitToken(
    rawToken: string,
    submitted: number[],
    mocks: ReadonlyArray<MockLink.MockedResponse>,
    waitForEnabled: boolean
  ): Promise<void> {
    renderWithWrapper(
      <ReassignMutationHarness
        session={rowFixture({ id: REASSIGN_ID })}
        loading={false}
        onSubmitSpy={id => submitted.push(id)}
        mocks={mocks}
      />,
      { locale }
    );
    const dialog = await expectDialogOpen();

    fireEvent.change(within(dialog).getByLabelText(muiLabelPattern(t.reassignTeacherIdLabel)), {
      target: { value: rawToken },
    });
    const submit = within(dialog).getByTestId(`reassign-teacher-submit-${REASSIGN_ID}`);
    if (waitForEnabled) {
      await waitFor(() => {
        expect(submit.getAttribute("disabled")).toBeNull();
      });
    }
    fireEvent.click(submit);
  }

  describe(`AdminSessionDialogs — reassign (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("open path — shell, plain whole-number id input, submit DISABLED until a token exists", async () => {
      renderWithWrapper(
        <ReassignMutationHarness session={rowFixture({ id: REASSIGN_ID })} loading={false} onSubmitSpy={() => {}} />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      expect(within(dialog).getByRole("heading", { name: t.reassignTitle })).not.toBeNull();
      expect(within(dialog).getByText(t.reassignBody)).not.toBeNull();
      const idInput = within(dialog).getByLabelText(muiLabelPattern(t.reassignTeacherIdLabel));
      expect(idInput).not.toBeNull();
      expect(
        within(dialog).getByTestId(`reassign-teacher-submit-${REASSIGN_ID}`).getAttribute("disabled")
      ).not.toBeNull();
    });

    test("confirm path — numeric token → parsed Int on the callback AND AdminSessionReassign matched", async () => {
      const submitted: number[] = [];
      await renderReassignAndSubmitToken(
        "907",
        submitted,
        [
          reassignMock(REASSIGN_ID, 907, {
            kind: "success",
            payload: rowFixture({ id: REASSIGN_ID, teacherId: "907" }),
          }),
        ],
        true
      );

      await expectHarnessMutationOk();
      expect(submitted).toHaveLength(1);
      expect(submitted[0]).toBe(907);
    });

    test("padded numeric token trims to the same Int", async () => {
      const submitted: number[] = [];
      await renderReassignAndSubmitToken(
        "  907  ",
        submitted,
        [
          reassignMock(REASSIGN_ID, 907, {
            kind: "success",
            payload: rowFixture({ id: REASSIGN_ID, teacherId: "907" }),
          }),
        ],
        false
      );

      await expectHarnessMutationOk();
      expect(submitted).toEqual([907]);
    });

    test("non-numeric token blocked BEFORE the wire — aria-invalid + localized helper, no callback", async () => {
      const submitted: number[] = [];
      renderWithWrapper(
        <ReassignMutationHarness
          session={rowFixture({ id: REASSIGN_ID })}
          loading={false}
          onSubmitSpy={id => submitted.push(id)}
        />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      fireEvent.change(within(dialog).getByLabelText(muiLabelPattern(t.reassignTeacherIdLabel)), {
        target: { value: "abc" },
      });
      fireEvent.click(within(dialog).getByTestId(`reassign-teacher-submit-${REASSIGN_ID}`));

      const idInput = within(dialog).getByLabelText(muiLabelPattern(t.reassignTeacherIdLabel));
      expect(idInput.getAttribute("aria-invalid")).toBe("true");
      expect(within(dialog).getByText(t.filterInvalidId)).not.toBeNull();
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
      expect(submitted).toHaveLength(0);
      expectHarnessIdle();
    });

    test("loading gates BOTH actions", async () => {
      renderWithWrapper(
        <ReassignMutationHarness session={rowFixture({ id: REASSIGN_ID })} loading onSubmitSpy={() => {}} />,
        { locale }
      );
      const dialog = await expectDialogOpen();

      expect(
        within(dialog).getByTestId(`reassign-teacher-submit-${REASSIGN_ID}`).getAttribute("disabled")
      ).not.toBeNull();
      expect(within(dialog).getByRole("button", { name: tc.cancel }).getAttribute("disabled")).not.toBeNull();
    });
  });

  describe(`AdminSessionDialogs — join observation (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("confirm path — the single-click banner fires AdminSessionJoin with { sessionId }", async () => {
      const joins: number[] = [];
      renderWithWrapper(
        <JoinMutationHarness
          sessionId={JOIN_ID}
          loading={false}
          joined={false}
          onJoinSpy={() => {
            joins.push(1);
          }}
          mocks={[
            joinMock(JOIN_ID, { kind: "success", payload: rowFixture({ id: JOIN_ID, status: SessionStatus.Started }) }),
          ]}
        />,
        { locale }
      );

      const banner = liveScreen.getByTestId(`join-observation-banner-${JOIN_ID}`);
      expect(within(banner).getByText(t.joinBannerTitle)).not.toBeNull();
      expect(within(banner).getByText(t.joinBannerBody)).not.toBeNull();

      fireEvent.click(liveScreen.getByTestId(`join-observation-confirm-${JOIN_ID}`));

      await expectHarnessMutationOk();
      expect(joins).toHaveLength(1);
    });

    test("loading disables the confirm affordance", () => {
      renderWithWrapper(<JoinMutationHarness sessionId={JOIN_ID} loading joined={false} onJoinSpy={() => {}} />, {
        locale,
      });
      expect(liveScreen.getByTestId(`join-observation-confirm-${JOIN_ID}`).getAttribute("disabled")).not.toBeNull();
    });

    test("joined unmounts the banner entirely — observation continues", () => {
      renderWithWrapper(<JoinMutationHarness sessionId={JOIN_ID} loading={false} joined onJoinSpy={() => {}} />, {
        locale,
      });
      expect(liveScreen.queryByTestId(`join-observation-banner-${JOIN_ID}`)).toBeNull();
      expect(liveScreen.queryByTestId(`join-observation-confirm-${JOIN_ID}`)).toBeNull();
    });
  });
}
