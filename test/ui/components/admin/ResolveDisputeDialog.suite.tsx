/**
 * ResolveDisputeDialog — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `ResolveDisputeDialog.test.tsx` (the same two-phase Happy-DOM bootstrap
 * the sessions-family entries use — see that file for WHY).
 *
 * Happy DOM + Apollo `MockedProvider` tier, driven across BOTH locales,
 * directly against the dialog (NOT through the queue container — the
 * container's own suite owns the full-queue matrix):
 *
 *   escrow-class option mapping (held → Cancel/Complete ONLY; consumed →
 *   Refund/PartialRefund/Uphold ONLY — the wrong class is never offered) ·
 *   selection passthrough (every picked value arms the submit as itself,
 *   with no collapse target to fall back to) · partial-amount field
 *   visibility (renders ONLY while PARTIAL_REFUND is selected) · the
 *   amount validation matrix (two-decimal money, 0 < amount < fee, null
 *   fee fails closed; invalid values raise the errors-namespace copy +
 *   aria-invalid; blocked submits stay on the client — NO wire call) ·
 *   wire-shape parity (PartialRefund submits the validated amount,
 *   held-escrow outcomes submit the explicit `partialAmount: null`) ·
 *   the classification-mismatch guard (a selection that no longer belongs
 *   to the row's class surfaces the localized mismatch copy, disarms the
 *   submit and never reaches the wire).
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the scaffold's `sessionSuiteLabels` (Sessions /
 * Errors namespaces) — ZERO hardcoded Arabic/English copy lives here. The
 * exception class is fixture DATA (ids, enum values, decimal strings).
 *
 * Callback spies are plain closures (arrays the callbacks append to) —
 * no `console.*`, no `any`, no `.skip(`/`test.only(` markers.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, fireEvent, type RenderResult, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  type AdminDisputedSessionsQuery_adminDisputedSessions_items,
  DisputeResolution,
  SessionIntent,
  SessionStatus,
  SessionType,
} from "@/frontend/graphql/generated/gql/graphql";
import { resolveSessionDisputeMutationDocument } from "@/frontend/graphql/sharedDocuments";
import { ResolveDisputeDialog } from "@/frontend/views/admin/disputes/ResolveDisputeDialog";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { componentSuiteLocales, liveScreen, renderWithMocks, sessionSuiteLabels } from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** All-fields wire row (`__typename` mirrors what Apollo Server puts on the wire). */
interface DialogRowFixture extends AdminDisputedSessionsQuery_adminDisputedSessions_items {
  readonly __typename: "Session";
}

/** The dialog's session id (DATA). */
const DIALOG_SESSION_ID = "9301";

/** Verbatim fee string shared by the classification + validation fixtures (DATA). */
const HELD_FEE = "150.50";

/** The arbitration moment stamped on resolved mutation payloads (DATA). */
const RESOLVED_ISO = "2099-01-10T15:05:00.000Z";

/** Deterministic payload builder mirroring the closed 20-field wire shape. */
function dialogRowFixture(
  overrides?: Partial<AdminDisputedSessionsQuery_adminDisputedSessions_items>
): DialogRowFixture {
  return {
    __typename: "Session",
    id: DIALOG_SESSION_ID,
    status: SessionStatus.Completed,
    intent: SessionIntent.Hifz,
    sessionType: SessionType.StudentSession,
    fee: HELD_FEE,
    feeHeld: false,
    studentId: "401",
    teacherId: "802",
    startedAt: "2099-01-10T09:00:00.000Z",
    endedAt: "2099-01-10T10:30:00.000Z",
    confirmationDeadline: null,
    confirmedByStudentAt: "2099-01-10T11:00:00.000Z",
    confirmedByTeacherAt: "2099-01-10T11:00:00.000Z",
    createdAt: "2099-01-09T08:45:00.000Z",
    updatedAt: RESOLVED_ISO,
    cancelReason: null,
    disputeReason: "Teacher ended the session early.",
    disputedAt: "2099-01-10T13:20:00.000Z",
    resolutionNote: null,
    resolvedAt: RESOLVED_ISO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Callback spies (plain closures — appended-to arrays) + render helpers

/** The dialog's outcome callbacks, recorded as plain arrays for assertions. */
interface DialogCallbackSpies {
  readonly resolvedIds: string[];
  readonly sessionMissingIds: string[];
  readonly invalidTransitionIds: string[];
  readonly failures: string[];
}

function makeSpies(): DialogCallbackSpies {
  return { resolvedIds: [], sessionMissingIds: [], invalidTransitionIds: [], failures: [] };
}

interface DialogElementArgs {
  readonly feeHeld: boolean;
  readonly fee: string | null;
}

/** The dialog element bound to the recording spies — the SHARED arrangement for the render + rerender sites. */
function disputeDialog({ feeHeld, fee }: DialogElementArgs, spies: DialogCallbackSpies): ReactElement {
  return (
    <ResolveDisputeDialog
      sessionId={DIALOG_SESSION_ID}
      feeHeld={feeHeld}
      fee={fee}
      open
      onClose={() => {}}
      onResolved={sessionId => {
        spies.resolvedIds.push(sessionId);
      }}
      onSessionMissing={sessionId => {
        spies.sessionMissingIds.push(sessionId);
      }}
      onInvalidTransition={sessionId => {
        spies.invalidTransitionIds.push(sessionId);
      }}
      onFailure={message => {
        spies.failures.push(message);
      }}
    />
  );
}

interface RenderDialogArgs {
  readonly feeHeld: boolean;
  readonly fee: string | null;
  readonly mocks?: ReadonlyArray<MockLink.MockedResponse>;
}

/** Renders the dialog under TestWrapper + MockedProvider with recording callbacks. */
function renderDialog(
  { feeHeld, fee, mocks = [] }: RenderDialogArgs,
  locale: AppLocale,
  spies: DialogCallbackSpies
): RenderResult {
  return renderWithMocks(disputeDialog({ feeHeld, fee }, spies), mocks, locale);
}

/** Single-operation resolve mock with the EXACT variables the dialog must send. */
function resolveMock(
  resolution: DisputeResolution,
  partialAmount: string | null,
  outcome: { kind: "success"; payload: DialogRowFixture } | { kind: "error"; code: string }
): MockLink.MockedResponse {
  return {
    request: {
      query: resolveSessionDisputeMutationDocument,
      variables: { id: DIALOG_SESSION_ID, resolution, note: null, partialAmount },
    },
    ...(outcome.kind === "success"
      ? { result: { data: { resolveSessionDispute: outcome.payload } } }
      : {
          result: {
            errors: [{ message: `${outcome.code} (masked transport surface)`, extensions: { code: outcome.code } }],
          },
        }),
  };
}

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the full branch
// matrix (STUI_LOCALE split-run guard, shared with the sibling suites).
for (const locale of componentSuiteLocales) {
  const { t, te } = sessionSuiteLabels(locale);

  describe(`ResolveDisputeDialog (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("held row offers EXACTLY the Cancel/Complete vocabulary — the consumed family is never rendered", () => {
      const spies = makeSpies();
      renderDialog({ feeHeld: true, fee: HELD_FEE }, locale, spies);

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("radio", { name: t.resolutionCancelLabel })).toBeDefined();
      expect(within(dialog).getByRole("radio", { name: t.resolutionCompleteLabel })).toBeDefined();
      expect(within(dialog).queryByRole("radio", { name: t.resolutionRefundLabel })).toBeNull();
      expect(within(dialog).queryByRole("radio", { name: t.resolutionPartialRefundLabel })).toBeNull();
      expect(within(dialog).queryByRole("radio", { name: t.resolutionUpholdLabel })).toBeNull();
      // The amount field belongs to the consumed family only — a held row
      // can never render it, whichever held outcome gets picked.
      expect(within(dialog).queryByTestId("resolve-dispute-amount-field")).toBeNull();
    });

    test("consumed row offers EXACTLY the Refund/PartialRefund/Uphold family — the held pair is never rendered", () => {
      const spies = makeSpies();
      renderDialog({ feeHeld: false, fee: HELD_FEE }, locale, spies);

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("radio", { name: t.resolutionRefundLabel })).toBeDefined();
      expect(within(dialog).getByRole("radio", { name: t.resolutionPartialRefundLabel })).toBeDefined();
      expect(within(dialog).getByRole("radio", { name: t.resolutionUpholdLabel })).toBeDefined();
      expect(within(dialog).queryByRole("radio", { name: t.resolutionCancelLabel })).toBeNull();
      expect(within(dialog).queryByRole("radio", { name: t.resolutionCompleteLabel })).toBeNull();
    });

    test("selection passes through AS-IS — every offered outcome checks and arms the submit (no collapse target exists)", () => {
      const spies = makeSpies();
      renderDialog({ feeHeld: false, fee: HELD_FEE }, locale, spies);

      const dialog = screen.getByRole("dialog");
      const submit = within(dialog).getByTestId("resolve-dispute-submit");
      expect(submit.getAttribute("disabled")).not.toBeNull();

      const partialRadio = within(dialog).getByRole("radio", { name: t.resolutionPartialRefundLabel });
      fireEvent.click(partialRadio);
      expect(partialRadio.matches(":checked")).toBe(true);
      expect(submit.getAttribute("disabled")).toBeNull();

      const refundRadio = within(dialog).getByRole("radio", { name: t.resolutionRefundLabel });
      fireEvent.click(refundRadio);
      expect(refundRadio.matches(":checked")).toBe(true);
      expect(partialRadio.matches(":checked")).toBe(false);

      const upholdRadio = within(dialog).getByRole("radio", { name: t.resolutionUpholdLabel });
      fireEvent.click(upholdRadio);
      expect(upholdRadio.matches(":checked")).toBe(true);
      // No wire call — mere selection never fires the mutation.
      expect(spies.resolvedIds).toEqual([]);
      expect(spies.failures).toEqual([]);
    });

    test("partial-amount field renders ONLY while PARTIAL_REFUND is selected", () => {
      const spies = makeSpies();
      renderDialog({ feeHeld: false, fee: HELD_FEE }, locale, spies);

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).queryByTestId("resolve-dispute-amount-field")).toBeNull();
      fireEvent.click(within(dialog).getByRole("radio", { name: t.resolutionPartialRefundLabel }));
      expect(within(dialog).getByTestId("resolve-dispute-amount-field")).toBeDefined();
      fireEvent.click(within(dialog).getByRole("radio", { name: t.resolutionRefundLabel }));
      expect(within(dialog).queryByTestId("resolve-dispute-amount-field")).toBeNull();
    });

    test("amount validation matrix — invalid money raises the localized error + aria-invalid, valid money clears it", () => {
      const spies = makeSpies();
      renderDialog({ feeHeld: false, fee: HELD_FEE }, locale, spies);

      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("radio", { name: t.resolutionPartialRefundLabel }));
      const amountInput = within(dialog).getByTestId("resolve-dispute-amount-input");

      const invalidAmounts = ["abc", "0", HELD_FEE, "151", "12.505", "-5", "12,50", " 12.50"];
      for (const amount of invalidAmounts) {
        fireEvent.change(amountInput, { target: { value: amount } });
        expect(amountInput.getAttribute("aria-invalid")).toBe("true");
        expect(within(dialog).getByText(te.partialRefundAmountInvalid)).toBeDefined();
      }

      const validAmounts = ["12.5", "12.50", "0.01", "149.99"];
      for (const amount of validAmounts) {
        fireEvent.change(amountInput, { target: { value: amount } });
        expect(amountInput.getAttribute("aria-invalid")).not.toBe("true");
        expect(within(dialog).queryByText(te.partialRefundAmountInvalid)).toBeNull();
      }
      expect(spies.resolvedIds).toEqual([]);
      expect(spies.failures).toEqual([]);
    });

    test("null fee fails the amount gate CLOSED — even a well-formed amount cannot arm the wire", () => {
      const spies = makeSpies();
      renderDialog({ feeHeld: false, fee: null }, locale, spies);

      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("radio", { name: t.resolutionPartialRefundLabel }));
      fireEvent.change(within(dialog).getByTestId("resolve-dispute-amount-input"), { target: { value: "12.50" } });
      expect(within(dialog).getByTestId("resolve-dispute-amount-input").getAttribute("aria-invalid")).toBe("true");
      expect(within(dialog).getByText(te.partialRefundAmountInvalid)).toBeDefined();

      // The blocked submit never reaches the wire and never surfaces a
      // snackbar failure — the correction happens inside the dialog.
      fireEvent.submit(dialog);
      expect(spies.resolvedIds).toEqual([]);
      expect(spies.failures).toEqual([]);
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    test("PARTIAL_REFUND submit sends the validated amount on the wire — exact-variable mock proves the shape", async () => {
      const spies = makeSpies();
      renderDialog(
        {
          feeHeld: false,
          fee: HELD_FEE,
          mocks: [
            resolveMock(DisputeResolution.PartialRefund, "12.50", {
              kind: "success",
              payload: dialogRowFixture(),
            }),
          ],
        },
        locale,
        spies
      );

      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("radio", { name: t.resolutionPartialRefundLabel }));
      fireEvent.change(within(dialog).getByTestId("resolve-dispute-amount-input"), { target: { value: "12.50" } });
      fireEvent.submit(dialog);

      // The dialog stays mounted (the parent owns `open`) — the success arm
      // is observable through the resolved-id spy; a variable mismatch would
      // have produced an unmatched-mock error and the failure arm instead.
      await waitFor(() => {
        expect(spies.resolvedIds).toEqual([DIALOG_SESSION_ID]);
      });
      expect(spies.failures).toEqual([]);
      expect(spies.sessionMissingIds).toEqual([]);
      expect(spies.invalidTransitionIds).toEqual([]);
    });

    test("held-escrow outcome submits the explicit partialAmount null — the amount never rides with Cancel", async () => {
      const spies = makeSpies();
      renderDialog(
        {
          feeHeld: true,
          fee: HELD_FEE,
          mocks: [
            resolveMock(DisputeResolution.Cancel, null, {
              kind: "success",
              payload: dialogRowFixture({ status: SessionStatus.Cancelled, resolvedAt: RESOLVED_ISO }),
            }),
          ],
        },
        locale,
        spies
      );

      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("radio", { name: t.resolutionCancelLabel }));
      fireEvent.submit(dialog);

      await waitFor(() => {
        expect(spies.resolvedIds).toEqual([DIALOG_SESSION_ID]);
      });
      expect(spies.failures).toEqual([]);
    });

    test("classification-mismatch guard — a stale off-class selection surfaces the localized mismatch copy and never reaches the wire", () => {
      const spies = makeSpies();
      const view = renderDialog({ feeHeld: false, fee: HELD_FEE }, locale, spies);

      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("radio", { name: t.resolutionRefundLabel }));

      // The row's escrow class flips under the open dialog (cache
      // convergence / stale payload) — the previously legal selection is
      // now off-class and MUST be surfaced, never silently reclassified.
      view.rerender(
        <MockedProvider mocks={[]}>{disputeDialog({ feeHeld: true, fee: HELD_FEE }, spies)}</MockedProvider>
      );

      const flippedDialog = screen.getByRole("dialog");
      expect(within(flippedDialog).getByTestId("resolve-dispute-mismatch").textContent).toContain(
        te.disputeResolutionMismatch
      );
      expect(within(flippedDialog).getByTestId("resolve-dispute-submit").getAttribute("disabled")).not.toBeNull();
      fireEvent.submit(flippedDialog);
      expect(spies.resolvedIds).toEqual([]);
      expect(spies.failures).toEqual([]);

      // Returning to the consumed class clears the guard and re-arms the
      // previously selected outcome — no state was rewritten behind the
      // admin's back.
      view.rerender(
        <MockedProvider mocks={[]}>{disputeDialog({ feeHeld: false, fee: HELD_FEE }, spies)}</MockedProvider>
      );
      expect(screen.queryByTestId("resolve-dispute-mismatch")).toBeNull();
      expect(
        within(screen.getByRole("dialog")).getByTestId("resolve-dispute-submit").getAttribute("disabled")
      ).toBeNull();
    });
  });
}
