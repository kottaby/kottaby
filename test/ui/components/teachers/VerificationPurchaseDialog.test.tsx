/**
 * VerificationPurchaseDialog — component suite.
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components`), mirroring
 * the `OutgoingLinkRequestsSection` dialog-suite harness: every outcome lane
 * of the verification-plan purchase confirm gate gets ONE render case,
 * driven across BOTH locales (the `ar` block renders through the RTL stylis
 * cache — the RTL render case):
 *
 *   plan-line render (title-matched planCatalog row, template expanded) ·
 *   missing-plan posture (confirm disabled + localized error alert) ·
 *   confirm success → profile refetch + success snackbar + dialog closed ·
 *   APPLICANT_COOLDOWN_ACTIVE → server-localized message + refetch + closed ·
 *   DUPLICATE_REQUEST → info snackbar + closed · generic error → localized
 *   error snackbar, dialog stays open, SAME per-attempt idempotency key
 *   replayed on the retry (kept across domain rejections) · success ROTATES
 *   the key for the next attempt.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through `Applicant.getLabels(getTranslations(locale))`,
 * `Common.getLabels(...)` and `Errors.getLabels(...)` — ZERO hardcoded
 * Arabic/English copy lives here. The exception class is fixture DATA (the
 * canonical plan row sourced from the shared `VERIFICATION_PLAN_TITLE`
 * constant + technical tokens: operation names, error codes, testids) plus
 * the cooldown SERVER message, derived exactly the way the server derives
 * it (errors template expanded at the `{cooldownUntil}` placeholder).
 *
 * Network discipline: every render mounts a RECORDING `ApolloLink` in front
 * of the `MockLink`; the wire proofs read the operation names AND the
 * `x-idempotency-key` context header the traffic actually carried.
 *
 * Static discipline verified alongside (grep): `useLazyQuery` appears
 * NOWHERE in the dialog; no `.skip(`/`.only(` markers exist in this suite.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { ApolloLink } from "@apollo/client";
import { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, fireEvent, type RenderResult, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import {
  PaymentGateway,
  PaymentStatus,
  type PlanCatalogQuery_planCatalog,
  type PurchaseVerificationPlanMutation,
  SubscriptionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import { planCatalogQueryDocument, purchaseVerificationPlanMutationDocument } from "@/frontend/graphql/sharedDocuments";
import { VerificationPurchaseDialog } from "@/frontend/views/teachers/dashboard/VerificationPurchaseDialog";
import { VERIFICATION_PLAN_TITLE } from "@/shared/constants";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Applicant as ApplicantNs } from "@/shared/locale/namespaces/applicant";
import { Common as CommonNs } from "@/shared/locale/namespaces/common";
import { Errors as ErrorsNs } from "@/shared/locale/namespaces/errors";
import { getTranslations } from "@/shared/locale/server";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ----------------------------------------------------------------------------
// Fixtures — data only; the verification row is sourced from the shared
// resolution constant so the dialog's title-match logic is exercised
// against the SAME canonical key the server resolves purchases by.
// ----------------------------------------------------------------------------

/** A non-verification catalog member (fixture data) proving the title match. */
const OTHER_PLAN_TITLE = "Quran Revision Plan — Monthly";

/** The ACTIVE verification plan row, exactly the planCatalog selection. */
const PLAN_ROW: PlanCatalogQuery_planCatalog = {
  id: "77",
  title: VERIFICATION_PLAN_TITLE,
  sessionCount: 5,
  price: "150.00",
  currency: "EGP",
  intervalDays: 14,
  isActive: true,
  deactivatedAt: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

/** The catalog mock — one row list, either containing the verification plan or not. */
function planCatalogMock(rows: ReadonlyArray<PlanCatalogQuery_planCatalog>): MockLink.MockedResponse {
  return {
    request: { query: planCatalogQueryDocument, variables: {} },
    result: { data: { planCatalog: [...rows] } },
  };
}

/** The canonical purchase payload (pending pair + mock-gateway checkout). */
function purchasePayload(): PurchaseVerificationPlanMutation["purchaseVerificationPlan"] {
  return {
    subscription: { id: "901", status: SubscriptionStatus.Pending, planId: 77 },
    payment: { id: "902", amount: PLAN_ROW.price, currency: PLAN_ROW.currency, status: PaymentStatus.Pending },
    checkout: { provider: PaymentGateway.Mock, providerReference: "mock_verification_checkout", checkoutUrl: null },
  };
}

/** Success mock — echoes the canonical pending purchase pair. */
function purchaseSuccessMock(): MockLink.MockedResponse {
  return {
    request: { query: purchaseVerificationPlanMutationDocument, variables: {} },
    result: { data: { purchaseVerificationPlan: purchasePayload() } },
  };
}

/** Denial mock — `extensions.code` exactly where the wire puts it. */
function purchaseFailureMock(errorCode: string, message: string): MockLink.MockedResponse {
  return {
    request: { query: purchaseVerificationPlanMutationDocument, variables: {} },
    result: {
      errors: [
        {
          message,
          extensions: { code: errorCode },
        },
      ],
    },
  };
}

// ----------------------------------------------------------------------------
// Recording link + render harness
// ----------------------------------------------------------------------------

/** Captured network traffic — the wire proofs (operation order + header keys). */
interface NetworkTraffic {
  readonly operationNames: string[];
  readonly idempotencyKeys: string[];
}

function createNetworkTraffic(): NetworkTraffic {
  return { operationNames: [], idempotencyKeys: [] };
}

/** Refetch-profile spy — the dialog's post-outcome profile refresh contract. */
function createRefetchSpy(): { state: { calls: number }; refetch: () => Promise<undefined> } {
  const state = { calls: 0 };
  return {
    state,
    refetch: async () => {
      state.calls += 1;
      return undefined;
    },
  };
}

/**
 * Stateful open/close harness — mirrors the card's real wiring: the dialog
 * asks the parent to close via `onClose` and the parent flips `open`. The
 * bare reopen affordance re-opens the dialog for the post-success rotation
 * probe (the dialog component instance — and its key ref — stays mounted,
 * exactly like the card keeps it mounted).
 */
function DialogHarness(props: Readonly<{ onCloseSpy: () => void; refetchProfile: () => Promise<unknown> }>): ReactNode {
  const [open, setOpen] = useState(true);
  const handleClose = (): void => {
    props.onCloseSpy();
    setOpen(false);
  };
  return (
    <>
      <VerificationPurchaseDialog open={open} onClose={handleClose} refetchProfile={props.refetchProfile} />
      <button
        type="button"
        data-testid="verification-purchase-harness-reopen"
        aria-label="re-open purchase dialog"
        onClick={() => setOpen(true)}
      />
    </>
  );
}

/**
 * Reads the `x-idempotency-key` context header off a captured operation with
 * type-guard narrowing (no type assertions) — `""` when absent.
 */
function capturedIdempotencyKey(operation: ApolloLink.Operation): string {
  const context: unknown = operation.getContext();
  if (typeof context === "object" && context !== null && "headers" in context) {
    const headers: unknown = context.headers;
    if (typeof headers === "object" && headers !== null && "x-idempotency-key" in headers) {
      const key: unknown = headers["x-idempotency-key"];
      return typeof key === "string" ? key : "";
    }
  }
  return "";
}

/** Renders the dialog under a RECORDING link + MockLink composition. */
function renderPurchaseDialog(
  traffic: NetworkTraffic,
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale,
  onCloseSpy: () => void = () => undefined,
  refetchProfile: () => Promise<unknown> = async () => undefined
): RenderResult {
  const mockLink = new MockLink([...mocks]);
  const recordingLink = new ApolloLink((operation, forward) => {
    traffic.operationNames.push(operation.operationName ?? "");
    traffic.idempotencyKeys.push(capturedIdempotencyKey(operation));
    return forward(operation);
  });
  return renderWithWrapper(
    <MockedProvider link={ApolloLink.from([recordingLink, mockLink])}>
      <DialogHarness onCloseSpy={onCloseSpy} refetchProfile={refetchProfile} />
    </MockedProvider>,
    { locale }
  );
}

/** Derives the expected expanded plan line exactly like the dialog does. */
function expectedPlanLine(template: string): string {
  return template
    .replace("{title}", PLAN_ROW.title)
    .replace("{price}", PLAN_ROW.price)
    .replace("{currency}", PLAN_ROW.currency)
    .replace("{sessions}", String(PLAN_ROW.sessionCount))
    .replace("{days}", String(PLAN_ROW.intervalDays));
}

/** Opens-and-settles: waits for the dialog and the plan descriptor. */
async function openDialogWithPlan(t: ReturnType<typeof ApplicantNs.getLabels>): Promise<HTMLElement> {
  const dialog = await screen.findByTestId("verification-purchase-dialog");
  await waitFor(() => {
    expect(within(dialog).getByText(expectedPlanLine(t.purchasePlanLine))).toBeDefined();
  });
  return dialog;
}

afterEach(() => {
  cleanup();
});

// ----------------------------------------------------------------------------
// Suite — one block per locale keeps RTL (ar) / LTR (en) both exercised over
// the full outcome matrix while every case stays independently readable.
// ----------------------------------------------------------------------------

for (const locale of ["ar", "en"] as AppLocale[]) {
  const t = ApplicantNs.getLabels(getTranslations(locale));
  const te = ErrorsNs.getLabels(getTranslations(locale));
  const tc = CommonNs.getLabels(getTranslations(locale));

  describe(`VerificationPurchaseDialog (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("renders the plan descriptor line from the title-matched planCatalog row (AR snapshot: exact expanded copy)", async () => {
      const traffic = createNetworkTraffic();
      renderPurchaseDialog(traffic, [planCatalogMock([PLAN_ROW])], locale);

      const dialog = await openDialogWithPlan(t);
      expect(within(dialog).getByText(t.purchaseDialogTitle)).toBeDefined();
      expect(within(dialog).getByText(expectedPlanLine(t.purchasePlanLine))).toBeDefined();
      // Dialog chrome: cancel + confirm affordances, confirm enabled.
      expect(within(dialog).getByRole("button", { name: t.purchaseCancelCta })).toBeDefined();
      const confirm = within(dialog).getByRole("button", { name: t.purchaseConfirmCta });
      expect(confirm.getAttribute("disabled")).toBeNull();
      // No error posture on the found-plan happy render.
      expect(within(dialog).queryByTestId("verification-purchase-missing-plan")).toBeNull();
      // Exactly one wire operation — the ACTIVE catalog snapshot query.
      expect(traffic.operationNames).toEqual(["PlanCatalog"]);
    });

    test("missing plan in the catalog → confirm disabled + localized error posture", async () => {
      const traffic = createNetworkTraffic();
      renderPurchaseDialog(traffic, [planCatalogMock([{ ...PLAN_ROW, id: "78", title: OTHER_PLAN_TITLE }])], locale);

      const dialog = await screen.findByTestId("verification-purchase-dialog");
      await waitFor(() => {
        expect(within(dialog).getByTestId("verification-purchase-missing-plan")).toBeDefined();
      });
      expect(within(dialog).getByText(t.purchaseGenericError)).toBeDefined();
      // The confirm affordance is DISABLED — no purchase without the plan.
      const confirm = within(dialog).getByRole("button", { name: t.purchaseConfirmCta });
      expect(confirm.getAttribute("disabled")).not.toBeNull();
      // No plan line may render for a catalog without the verification plan.
      expect(within(dialog).queryByText(expectedPlanLine(t.purchasePlanLine))).toBeNull();
      expect(traffic.operationNames).toEqual(["PlanCatalog"]);
    });

    test("confirm success → profile refetch + success snackbar + dialog closed", async () => {
      const traffic = createNetworkTraffic();
      const onCloseSpy = (() => {
        const calls = 0;
        const probe = { calls };
        const spy = (): void => {
          probe.calls += 1;
        };
        return { probe, spy };
      })();
      const refetch = createRefetchSpy();
      renderPurchaseDialog(
        traffic,
        [planCatalogMock([PLAN_ROW]), purchaseSuccessMock()],
        locale,
        onCloseSpy.spy,
        refetch.refetch
      );
      const dialog = await openDialogWithPlan(t);
      fireEvent.click(within(dialog).getByRole("button", { name: t.purchaseConfirmCta }));

      // The profile refetch handle fired (the card re-renders its branch).
      await waitFor(() => {
        expect(refetch.state.calls).toBe(1);
      });
      // Success snackbar carries the localized success copy (filled success).
      await waitFor(() => {
        expect(screen.getByText(t.purchaseSuccess)).toBeDefined();
      });
      const toastAlert = screen.getByText(t.purchaseSuccess).closest(".MuiAlert-root");
      expect(toastAlert?.className.includes("MuiAlert-colorSuccess")).toBe(true);
      // The dialog asked to close and the harness flipped it closed.
      expect(onCloseSpy.probe.calls).toBe(1);
      await waitFor(() => {
        expect(screen.queryByTestId("verification-purchase-dialog")).toBeNull();
      });
      // Wire: catalog query → purchase mutation.
      expect(traffic.operationNames).toEqual(["PlanCatalog", "PurchaseVerificationPlan"]);
    });

    test("APPLICANT_COOLDOWN_ACTIVE → server-localized message rendered + profile refetch + dialog closed", async () => {
      const traffic = createNetworkTraffic();
      // The server derives the cooldown copy from the SAME shared catalog:
      // template expanded at the {cooldownUntil} placeholder (fixture instant).
      const cooldownInstant = "2026-09-20T10:00:00.000Z";
      const serverCooldownMessage = te.applicantCooldownActive.replace("{cooldownUntil}", cooldownInstant);
      const refetch = createRefetchSpy();
      renderPurchaseDialog(
        traffic,
        [planCatalogMock([PLAN_ROW]), purchaseFailureMock("APPLICANT_COOLDOWN_ACTIVE", serverCooldownMessage)],
        locale,
        () => undefined,
        refetch.refetch
      );
      const dialog = await openDialogWithPlan(t);
      fireEvent.click(within(dialog).getByRole("button", { name: t.purchaseConfirmCta }));

      // The SERVER-provided localized message renders verbatim (the ONE
      // code whose raw server message may surface) — error-filled toast.
      await waitFor(() => {
        expect(screen.getByText(serverCooldownMessage)).toBeDefined();
      });
      const toastAlert = screen.getByText(serverCooldownMessage).closest(".MuiAlert-root");
      expect(toastAlert?.className.includes("MuiAlert-colorError")).toBe(true);
      // The cooldown rejection refetches the profile (card flips branches).
      await waitFor(() => {
        expect(refetch.state.calls).toBe(1);
      });
      await waitFor(() => {
        expect(screen.queryByTestId("verification-purchase-dialog")).toBeNull();
      });
      expect(traffic.operationNames).toEqual(["PlanCatalog", "PurchaseVerificationPlan"]);
    });

    test("DUPLICATE_REQUEST → info snackbar (already received) + dialog closed", async () => {
      const traffic = createNetworkTraffic();
      const refetch = createRefetchSpy();
      renderPurchaseDialog(
        traffic,
        [planCatalogMock([PLAN_ROW]), purchaseFailureMock("DUPLICATE_REQUEST", "duplicate (masked transport surface)")],
        locale,
        () => undefined,
        refetch.refetch
      );
      const dialog = await openDialogWithPlan(t);
      fireEvent.click(within(dialog).getByRole("button", { name: t.purchaseConfirmCta }));

      // The calm info lane: the localized purchase-received copy at INFO
      // severity — never the raw code.
      await waitFor(() => {
        expect(screen.getByText(t.purchaseSuccess)).toBeDefined();
      });
      const toastAlert = screen.getByText(t.purchaseSuccess).closest(".MuiAlert-root");
      expect(toastAlert?.className.includes("MuiAlert-colorInfo")).toBe(true);
      // The duplicate lane does NOT refetch and does NOT stay open.
      expect(refetch.state.calls).toBe(0);
      await waitFor(() => {
        expect(screen.queryByTestId("verification-purchase-dialog")).toBeNull();
      });
      expect(traffic.operationNames).toEqual(["PlanCatalog", "PurchaseVerificationPlan"]);
    });

    test("generic error → purchaseGenericError snackbar, dialog STAYS open, SAME idempotency key replayed", async () => {
      const traffic = createNetworkTraffic();
      renderPurchaseDialog(
        traffic,
        [
          planCatalogMock([PLAN_ROW]),
          purchaseFailureMock("INTERNAL_SERVER_ERROR", "internal (masked transport surface)"),
          purchaseFailureMock("INTERNAL_SERVER_ERROR", "internal (masked transport surface)"),
        ],
        locale
      );
      const dialog = await openDialogWithPlan(t);
      const confirm = within(dialog).getByRole("button", { name: t.purchaseConfirmCta });
      fireEvent.click(confirm);

      // The generic lane carries the localized fallback copy — no server
      // message ever leaks through it.
      await waitFor(() => {
        expect(screen.getByText(t.purchaseGenericError)).toBeDefined();
      });
      const toastAlert = screen.getByText(t.purchaseGenericError).closest(".MuiAlert-root");
      expect(toastAlert?.className.includes("MuiAlert-colorError")).toBe(true);
      // Retryable-in-place: the dialog remains mounted for the same-key retry.
      expect(screen.queryByTestId("verification-purchase-dialog")).not.toBeNull();

      fireEvent.click(
        within(screen.getByTestId("verification-purchase-dialog")).getByRole("button", { name: t.purchaseConfirmCta })
      );

      // Two mutation attempts on the wire, BOTH carrying the SAME
      // per-attempt key (kept across domain rejections).
      await waitFor(() => {
        expect(traffic.operationNames).toEqual(["PlanCatalog", "PurchaseVerificationPlan", "PurchaseVerificationPlan"]);
      });
      expect(traffic.idempotencyKeys).toHaveLength(3);
      expect(traffic.idempotencyKeys[0]).toBe("");
      expect(traffic.idempotencyKeys[1]).not.toBe("");
      expect(traffic.idempotencyKeys[2]).toBe(traffic.idempotencyKeys[1]);
      // The retry posture keeps the dialog open.
      expect(screen.queryByTestId("verification-purchase-dialog")).not.toBeNull();
    });

    test("success ROTATES the per-attempt idempotency key for the next attempt", async () => {
      const traffic = createNetworkTraffic();
      renderPurchaseDialog(
        traffic,
        [
          planCatalogMock([PLAN_ROW]),
          purchaseSuccessMock(),
          planCatalogMock([PLAN_ROW]),
          purchaseFailureMock("INTERNAL_SERVER_ERROR", "internal (masked transport surface)"),
        ],
        locale
      );
      let dialog = await openDialogWithPlan(t);
      fireEvent.click(within(dialog).getByRole("button", { name: t.purchaseConfirmCta }));

      await waitFor(() => {
        expect(screen.queryByTestId("verification-purchase-dialog")).toBeNull();
      });

      // Re-open the SAME dialog instance (the card keeps it mounted) and
      // fail the next attempt: its key MUST differ from the spent one.
      fireEvent.click(screen.getByTestId("verification-purchase-harness-reopen"));
      dialog = await screen.findByTestId("verification-purchase-dialog");
      await waitFor(() => {
        expect(within(dialog).getByText(expectedPlanLine(t.purchasePlanLine))).toBeDefined();
      });
      fireEvent.click(within(dialog).getByRole("button", { name: t.purchaseConfirmCta }));

      await waitFor(() => {
        expect(traffic.operationNames).toEqual(["PlanCatalog", "PurchaseVerificationPlan", "PurchaseVerificationPlan"]);
      });
      // Key rotation: the post-success attempt carries a FRESH key.
      expect(traffic.idempotencyKeys[1]).not.toBe("");
      expect(traffic.idempotencyKeys[2]).not.toBe("");
      expect(traffic.idempotencyKeys[2]).not.toBe(traffic.idempotencyKeys[1]);
      // The close affordance is the COMMON close label (a11y wiring).
      expect(tc.close.length).toBeGreaterThan(0);
    });
  });
}
