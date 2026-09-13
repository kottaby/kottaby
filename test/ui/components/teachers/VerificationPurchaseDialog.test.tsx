/**
 * VerificationPurchaseDialog — component suite.
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components`): the
 * dialog is rendered through the same composition the status card hosts
 * (mounted profile watcher + dialog + container notice snackbar) and driven
 * across the purchase interaction matrix:
 *
 *   plan-line render from the catalog (en LTR + ar RTL) · confirm disabled
 *   while the catalog is in flight · missing active plan row → disabled
 *   confirm + generic error copy · failed catalog fetch → the same generic
 *   error copy instead of the probe · confirm success → success snackbar +
 *   close + profile refetch · cooldown denial → server-localized copy
 *   (the ONE sanctioned raw server message) + profile refetch · duplicate
 *   replay → info notice · generic denial → generic error copy, no
 *   refetch · per-attempt idempotency key STABLE across failed attempts
 *   and ROTATED only on success.
 *
 * The refetch target is observed honestly: the host mounts the profile read
 * (a one-line `useQuery` probe mirroring the real host card, which owns both
 * the dialog and the `myApplicantProfileQueryDocument` watcher) so Apollo's
 * `refetchQueries` sees an ACTIVE query to re-issue. Every operation is
 * observed at the LINK tier through a capturing `ApolloLink` that records
 * each dispatch (operation name + `x-idempotency-key` context header — the
 * same context the real authLink merges into the outgoing HTTP headers) and
 * each RESPONSE COMPLETION, tagged with its dispatch ordinal. Refetch
 * assertions wait for a profile completion dispatched AFTER the purchase
 * attempt — dispatch-delta alone would leave the response in flight across
 * the suite's teardown, and completion-order is immune to mount-read
 * cancellation semantics.
 *
 * Translation discipline: assertions reference ONLY label objects resolved
 * through `Applicant.getLabels(getTranslations(locale))` (plus `Common`
 * for the close affordance) — zero hardcoded UI copy. The one exception
 * class is fixture DATA (plan row values, ids) and the authored SERVER
 * cooldown message, which is server data passing through verbatim by
 * design, never a client-rendered translation.
 *
 * Runs via the mandated runner:
 * `bun run test/scripts/run-test.ts test/ui/components/teachers/VerificationPurchaseDialog.test.tsx`
 */

// ─── Harness preloads (inline replication of the `test:ui:components` stack) ─

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

// ─── Post-DOM module wiring (top-level await — LOAD ORDERING CONTRACT) ───────

const { cleanup, fireEvent, screen, waitFor } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import { afterEach, describe, expect, test } from "bun:test";
import { ApolloLink, Observable } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import type { RenderResult } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { NoticeSnackbar } from "@/frontend/components/ui/NoticeSnackbar";
import {
  PaymentGateway,
  PaymentStatus,
  type PlanCatalogQuery_planCatalog,
  type PurchaseVerificationPlanMutation,
  type PurchaseVerificationPlanMutation_purchaseVerificationPlan_checkout,
  type PurchaseVerificationPlanMutation_purchaseVerificationPlan_payment,
  type PurchaseVerificationPlanMutation_purchaseVerificationPlan_subscription,
  SubscriptionStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  myApplicantProfileQueryDocument,
  planCatalogQueryDocument,
  purchaseVerificationPlanMutationDocument,
} from "@/frontend/graphql/sharedDocuments";
import {
  type PurchaseNotice,
  VerificationPurchaseDialog,
} from "@/frontend/views/teachers/dashboard/VerificationPurchaseDialog";
import { VERIFICATION_PLAN_TITLE } from "@/shared/constants/verification-plan.constants";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Applicant as ApplicantNs } from "@/shared/locale/namespaces/applicant";
import { getTranslations } from "@/shared/locale/server";

// NOTE: `renderWithWrapper` is deliberately NOT statically imported here —
// `TestWrapper.tsx` statically imports `@testing-library/react`, so a static
// import would pull RTL into the pre-DOM evaluation phase described above.

// ─── Locale-driven matchers ─────────────────────────────────────────────────

const t = ApplicantNs.getLabels(getTranslations("en"));
const tar = ApplicantNs.getLabels(getTranslations("ar"));

// ─── Fixtures & helpers ─────────────────────────────────────────────────────

const FIXED_STAMP = "2026-09-01T09:00:00.000Z";

/** Plan fixture row — the codegen row PLUS `__typename` (MockLink posture). */
type PlanRow = PlanCatalogQuery_planCatalog & { readonly __typename: "Plan" };

/**
 * Purchase payload fixture — the codegen mutation result PLUS the `__typename`
 * markers MockedProvider's cache normalization needs on every nested entity.
 */
type PurchasePayloadFixture = PurchaseVerificationPlanMutation & {
  readonly purchaseVerificationPlan: {
    readonly subscription: PurchaseVerificationPlanMutation_purchaseVerificationPlan_subscription & {
      readonly __typename: "StudentSubscription";
    };
    readonly payment: PurchaseVerificationPlanMutation_purchaseVerificationPlan_payment & {
      readonly __typename: "StudentPayment";
    };
    readonly checkout: PurchaseVerificationPlanMutation_purchaseVerificationPlan_checkout & {
      readonly __typename: "PaymentCheckout";
    };
  };
};

const VERIFICATION_PLAN_ROW: PlanRow = {
  __typename: "Plan",
  id: "31",
  title: VERIFICATION_PLAN_TITLE,
  sessionCount: 5,
  price: "150.00",
  currency: "EGP",
  intervalDays: 14,
  isActive: true,
  deactivatedAt: null,
  createdAt: FIXED_STAMP,
  updatedAt: FIXED_STAMP,
};

const OTHER_PLAN_ROW: PlanRow = { ...VERIFICATION_PLAN_ROW, id: "32", title: "Hifz Intensive" };

/** Authored SERVER cooldown copy — server data passing through verbatim. */
const SERVER_COOLDOWN_MESSAGE = "Server-localized cooldown copy: re-application unlocks after 2099-01-15T10:30Z";

function expectedPlanLine(plan: PlanRow, labels: ReturnType<typeof ApplicantNs.getLabels>): string {
  return labels.purchasePlanLine(plan.title, plan.price, plan.currency, plan.sessionCount, plan.intervalDays);
}

function purchasePayload(): PurchasePayloadFixture {
  return {
    purchaseVerificationPlan: {
      subscription: {
        __typename: "StudentSubscription",
        id: "901",
        status: SubscriptionStatus.Pending,
        planId: 31,
        paymentMethod: PaymentGateway.Mock,
        paymentReference: "mock_ref_1",
        paymentVerifiedAt: null,
        startDate: null,
        endDate: null,
        createdAt: FIXED_STAMP,
        updatedAt: FIXED_STAMP,
      },
      payment: {
        __typename: "StudentPayment",
        id: "902",
        amount: "150.00",
        currency: "EGP",
        status: PaymentStatus.Pending,
        paymentGateway: PaymentGateway.Mock,
        subscriptionId: 901,
        createdAt: FIXED_STAMP,
        updatedAt: FIXED_STAMP,
      },
      checkout: {
        __typename: "PaymentCheckout",
        provider: PaymentGateway.Mock,
        providerReference: "mock_ref_1",
        checkoutUrl: null,
      },
    },
  };
}

function planCatalogMock(rows: readonly PlanRow[], delay?: number): MockLink.MockedResponse {
  return {
    request: { query: planCatalogQueryDocument },
    result: { data: { planCatalog: [...rows] } },
    delay,
  };
}

/** Catalog transport failure — drives the PlanSlot error arm (no probe, no line). */
function planCatalogErrorMock(): MockLink.MockedResponse {
  return {
    request: { query: planCatalogQueryDocument },
    error: new Error("catalog transport failure"),
  };
}

/**
 * Profile watcher mock. Defaults to `maxUsageCount: 2` (mount-time read plus
 * the post-mutation refetch — MockLink consumes each entry once by default);
 * suites that drive several refetching attempts pass a higher count.
 */
function profileMock(maxUsageCount = 2): MockLink.MockedResponse {
  return {
    maxUsageCount,
    request: { query: myApplicantProfileQueryDocument },
    result: {
      data: {
        myApplicantProfile: {
          __typename: "Applicant",
          id: 42424,
          status: "in_evaluation",
          verificationAttempts: 0,
          lastAttemptAt: null,
          cooldownUntil: null,
          cooldownActive: false,
          canPurchaseVerification: false,
        },
      },
    },
  };
}

function purchaseSuccessMock(): MockLink.MockedResponse {
  return {
    request: { query: purchaseVerificationPlanMutationDocument },
    result: { data: purchasePayload() },
  };
}

/** Server denial authored exactly where the transport puts `extensions.code`. */
function purchaseDenialMock(code: string, message: string): MockLink.MockedResponse {
  return {
    request: { query: purchaseVerificationPlanMutationDocument },
    result: {
      errors: [{ message, extensions: { code } }],
    },
  };
}

// ─── Link-tier observation (dispatches + response completions) ──────────────

interface CapturedDispatch {
  readonly operationName: string;
  readonly idempotencyKey: string | null;
}

interface CapturedCompletion {
  readonly operationName: string;
  /** Position of the dispatch in the dispatch sequence. */
  readonly dispatchOrdinal: number;
}

/** Link-tier record: what left the client and what came back settled. */
interface OperationRecorder {
  readonly dispatched: readonly CapturedDispatch[];
  readonly completed: readonly CapturedCompletion[];
}

function contextIdempotencyKey(operation: ApolloLink.Operation): string | null {
  const headers: unknown = operation.getContext().headers;
  if (typeof headers !== "object" || headers === null) {
    return null;
  }
  const value = Object.entries(headers).find(([key]) => key === "x-idempotency-key")?.[1];
  return typeof value === "string" ? value : null;
}

// ─── Host harness (mirrors the status card's composition) ───────────────────

/** The host card's mounted profile read — the refetch target the hook drives. */
function ProfileProbe(): ReactNode {
  useQuery(myApplicantProfileQueryDocument);
  return null;
}

function DialogHost(): ReactNode {
  const [notice, setNotice] = useState<PurchaseNotice | null>(null);
  const [closeCount, setCloseCount] = useState(0);
  return (
    <>
      <ProfileProbe />
      <VerificationPurchaseDialog open onClose={() => setCloseCount(count => count + 1)} onNotice={setNotice} />
      <NoticeSnackbar notice={notice} autoHideDuration={4000} onClose={() => setNotice(null)} />
      <span data-testid="dialog-close-count">{closeCount}</span>
    </>
  );
}

/** Renders the dialog host under MockedProvider behind the capturing link. */
function renderDialog(mocks: ReadonlyArray<MockLink.MockedResponse>, locale: AppLocale): OperationRecorder {
  const dispatched: CapturedDispatch[] = [];
  const completed: CapturedCompletion[] = [];
  const capture = new ApolloLink((operation, forward) => {
    const dispatchOrdinal = dispatched.length;
    dispatched.push({ operationName: operation.operationName ?? "", idempotencyKey: contextIdempotencyKey(operation) });
    return new Observable<ApolloLink.Result>(observer => {
      const subscription = forward(operation).subscribe({
        next: result => observer.next(result),
        error: error => observer.error(error),
        complete: () => {
          completed.push({ operationName: operation.operationName ?? "", dispatchOrdinal });
          observer.complete();
        },
      });
      return () => subscription.unsubscribe();
    });
  });
  const link = ApolloLink.from([capture, new MockLink([...mocks])]);
  const rendered: RenderResult = renderWithWrapper(
    <MockedProvider link={link}>
      <DialogHost />
    </MockedProvider>,
    { locale }
  );
  void rendered;
  return { dispatched, completed };
}

/** Waits for the confirm affordance to become clickable (catalog settled). */
async function confirmButton(labels: ReturnType<typeof ApplicantNs.getLabels>): Promise<HTMLElement> {
  const button = await waitFor(() => {
    const candidate = screen.getByRole("button", { name: labels.purchaseConfirmCta });
    expect(candidate.getAttribute("disabled")).toBeNull();
    return candidate;
  });
  return button;
}

/** Profile-read dispatch count observed at the link tier so far. */
function profileDispatchCount(recorder: OperationRecorder): number {
  return recorder.dispatched.filter(operation => operation.operationName === "MyApplicantProfile").length;
}

/** Waits for the mount-time profile read to dispatch (refetch baseline). */
async function settledProfileBaseline(recorder: OperationRecorder): Promise<number> {
  await waitFor(() => {
    expect(profileDispatchCount(recorder)).toBe(1);
  });
  return profileDispatchCount(recorder);
}

/**
 * Waits until a profile-read RESPONSE completes whose dispatch happened
 * after the latest purchase attempt — the honest refetch-settled signal
 * (the host's unmount must never race an in-flight refetch response).
 */
async function profileRefetchSettled(recorder: OperationRecorder): Promise<void> {
  const lastPurchaseOrdinal = recorder.dispatched.reduce(
    (last, operation, index) => (operation.operationName === "PurchaseVerificationPlan" ? index : last),
    -1
  );
  await waitFor(
    () => {
      expect(
        recorder.completed.some(
          completion =>
            completion.operationName === "MyApplicantProfile" && completion.dispatchOrdinal > lastPurchaseOrdinal
        )
      ).toBe(true);
    },
    // The post-success refetch races the notice render under load; the
    // default 1s window flaked on a cold process, so this settle gate is
    // given a wider window (assertion strength unchanged).
    { timeout: 3000 }
  );
}

afterEach(cleanup);

// ─── Suite (en / LTR) ────────────────────────────────────────────────────────

describe("VerificationPurchaseDialog (en / LTR)", () => {
  test("renders the resolved plan line + description + actions from the plan catalog", async () => {
    renderDialog([planCatalogMock([OTHER_PLAN_ROW, VERIFICATION_PLAN_ROW]), profileMock()], "en");

    expect(screen.getByText(t.purchaseDialogTitle)).toBeDefined();
    expect(screen.getByText(t.purchaseDialogDescription)).toBeDefined();
    // The title-matched row wins — the other catalog row never leaks in.
    await waitFor(() => {
      expect(screen.getByText(expectedPlanLine(VERIFICATION_PLAN_ROW, t))).toBeDefined();
    });
    expect(screen.queryByText(expectedPlanLine(OTHER_PLAN_ROW, t))).toBeNull();
    expect(screen.getByRole("button", { name: t.purchaseCancelCta })).toBeDefined();
    await confirmButton(t);
  });

  test("confirm stays disabled while the plan catalog is in flight", () => {
    renderDialog([planCatalogMock([], Infinity), profileMock()], "en");

    const button = screen.getByRole("button", { name: t.purchaseConfirmCta });
    expect(button.getAttribute("disabled")).not.toBeNull();
  });

  test("missing active plan row disables confirm and renders the generic error copy", async () => {
    renderDialog([planCatalogMock([OTHER_PLAN_ROW]), profileMock()], "en");

    await waitFor(() => {
      expect(screen.getByText(t.purchaseGenericError)).toBeDefined();
    });
    const button = screen.getByRole("button", { name: t.purchaseConfirmCta });
    expect(button.getAttribute("disabled")).not.toBeNull();
  });

  test("failed catalog fetch renders the generic error copy instead of the probe and keeps confirm disabled", async () => {
    renderDialog([planCatalogErrorMock(), profileMock()], "en");

    await waitFor(() => {
      expect(screen.getByText(t.purchaseGenericError)).toBeDefined();
    });
    // The error arm replaces the in-flight probe entirely.
    expect(screen.queryByRole("progressbar")).toBeNull();
    const button = screen.getByRole("button", { name: t.purchaseConfirmCta });
    expect(button.getAttribute("disabled")).not.toBeNull();
  });

  test("confirm success → success snackbar + close + profile refetch", async () => {
    const recorder = renderDialog(
      [planCatalogMock([VERIFICATION_PLAN_ROW]), profileMock(), purchaseSuccessMock()],
      "en"
    );

    const baseline = await settledProfileBaseline(recorder);
    fireEvent.click(await confirmButton(t));

    await waitFor(() => {
      expect(screen.getByText(t.purchaseSuccess)).toBeDefined();
    });
    await waitFor(() => {
      expect(profileDispatchCount(recorder)).toBe(baseline + 1);
    });
    await profileRefetchSettled(recorder);
    expect(screen.getByTestId("dialog-close-count").textContent).toBe("1");
    const alert = screen.getByText(t.purchaseSuccess).closest('[role="alert"]');
    expect(alert?.className.includes("MuiAlert-colorSuccess")).toBe(true);
  });

  test("cooldown denial surfaces the server copy (verbatim) and refetches the profile, dialog stays open", async () => {
    const recorder = renderDialog(
      [
        planCatalogMock([VERIFICATION_PLAN_ROW]),
        profileMock(),
        purchaseDenialMock("APPLICANT_COOLDOWN_ACTIVE", SERVER_COOLDOWN_MESSAGE),
      ],
      "en"
    );

    const baseline = await settledProfileBaseline(recorder);
    fireEvent.click(await confirmButton(t));

    await waitFor(() => {
      expect(screen.getByText(SERVER_COOLDOWN_MESSAGE)).toBeDefined();
    });
    await waitFor(() => {
      expect(profileDispatchCount(recorder)).toBe(baseline + 1);
    });
    await profileRefetchSettled(recorder);
    expect(screen.getByTestId("dialog-close-count").textContent).toBe("0");
    const alert = screen.getByText(SERVER_COOLDOWN_MESSAGE).closest('[role="alert"]');
    expect(alert?.className.includes("MuiAlert-colorError")).toBe(true);
  });

  test("duplicate replay surfaces the info notice and performs no refetch", async () => {
    const recorder = renderDialog(
      [
        planCatalogMock([VERIFICATION_PLAN_ROW]),
        profileMock(),
        purchaseDenialMock("DUPLICATE_REQUEST", "duplicate replay"),
      ],
      "en"
    );

    const baseline = await settledProfileBaseline(recorder);
    fireEvent.click(await confirmButton(t));

    await waitFor(() => {
      expect(screen.getByText(t.purchaseDuplicateInfo)).toBeDefined();
    });
    const alert = screen.getByText(t.purchaseDuplicateInfo).closest('[role="alert"]');
    expect(alert?.className.includes("MuiAlert-colorInfo")).toBe(true);
    expect(profileDispatchCount(recorder)).toBe(baseline);
    expect(screen.getByTestId("dialog-close-count").textContent).toBe("0");
  });

  test("generic denial surfaces the localized generic error copy and performs no refetch", async () => {
    const recorder = renderDialog(
      [
        planCatalogMock([VERIFICATION_PLAN_ROW]),
        profileMock(),
        purchaseDenialMock("PLAN_NOT_FOUND", "plan missing (masked)"),
      ],
      "en"
    );

    const baseline = await settledProfileBaseline(recorder);
    fireEvent.click(await confirmButton(t));

    await waitFor(() => {
      expect(screen.getByText(t.purchaseGenericError)).toBeDefined();
    });
    // Raw server messages never leak outside the sanctioned cooldown copy.
    expect(screen.queryByText("plan missing (masked)")).toBeNull();
    expect(profileDispatchCount(recorder)).toBe(baseline);
  });

  test("the per-attempt key stays STABLE across failed attempts and ROTATES only on success", async () => {
    const recorder = renderDialog(
      [
        planCatalogMock([VERIFICATION_PLAN_ROW]),
        // Mount read + cooldown refetch + TWO success-path profile refetches.
        profileMock(4),
        purchaseDenialMock("DUPLICATE_REQUEST", "duplicate replay"),
        purchaseDenialMock("APPLICANT_COOLDOWN_ACTIVE", SERVER_COOLDOWN_MESSAGE),
        purchaseSuccessMock(),
        // Post-success attempt — the rotated key's first carrier.
        purchaseSuccessMock(),
      ],
      "en"
    );

    const purchaseKeys = (): string[] =>
      recorder.dispatched
        .filter(operation => operation.operationName === "PurchaseVerificationPlan")
        .map(operation => operation.idempotencyKey)
        .filter((key): key is string => key !== null);

    fireEvent.click(await confirmButton(t));
    await waitFor(() => expect(purchaseKeys()).toHaveLength(1));
    // Attempt completion gates the next click: the capture fires at dispatch,
    // so wait for each attempt's notice before re-clicking (the confirm button
    // re-enables only once `purchasing` settles back to false).
    await waitFor(() => expect(screen.getByText(t.purchaseDuplicateInfo)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: t.purchaseConfirmCta }));
    await waitFor(() => expect(purchaseKeys()).toHaveLength(2));
    await waitFor(() => expect(screen.getByText(SERVER_COOLDOWN_MESSAGE)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: t.purchaseConfirmCta }));
    await waitFor(() => expect(purchaseKeys()).toHaveLength(3));
    await waitFor(() => expect(screen.getByText(t.purchaseSuccess)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: t.purchaseConfirmCta }));
    await waitFor(() => expect(purchaseKeys()).toHaveLength(4));

    const keys = purchaseKeys();
    expect(keys[0]).not.toBeNull();
    // Domain rejections keep the SAME key (server-side replay dedupe stays
    // effective), and the successful attempt itself also rides the kept key —
    // rotation lands AFTER success, mirroring the broadcast-send precedent.
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[0]);
    // The final success-path profile refetch settles before teardown.
    await profileRefetchSettled(recorder);
  });

  test("cancel closes the dialog without firing the mutation", async () => {
    const recorder = renderDialog([planCatalogMock([VERIFICATION_PLAN_ROW]), profileMock()], "en");

    await confirmButton(t);
    fireEvent.click(screen.getByRole("button", { name: t.purchaseCancelCta }));

    expect(screen.getByTestId("dialog-close-count").textContent).toBe("1");
    expect(
      recorder.dispatched.filter(operation => operation.operationName === "PurchaseVerificationPlan")
    ).toHaveLength(0);
  });
});

// ─── Suite (ar / RTL) ────────────────────────────────────────────────────────

describe("VerificationPurchaseDialog (ar / RTL)", () => {
  test("renders the Arabic plan line from the catalog", async () => {
    renderDialog([planCatalogMock([VERIFICATION_PLAN_ROW]), profileMock()], "ar");

    await waitFor(() => {
      expect(screen.getByText(expectedPlanLine(VERIFICATION_PLAN_ROW, tar))).toBeDefined();
    });
    expect(screen.getByText(tar.purchaseDialogTitle)).toBeDefined();
    expect(screen.getByText(tar.purchaseDialogDescription)).toBeDefined();
    expect(screen.getByRole("button", { name: tar.purchaseConfirmCta })).toBeDefined();
    expect(screen.getByRole("button", { name: tar.purchaseCancelCta })).toBeDefined();
  });

  test("confirm success renders the Arabic success snackbar", async () => {
    const recorder = renderDialog(
      [planCatalogMock([VERIFICATION_PLAN_ROW]), profileMock(), purchaseSuccessMock()],
      "ar"
    );

    fireEvent.click(await confirmButton(tar));

    await waitFor(() => {
      expect(screen.getByText(tar.purchaseSuccess)).toBeDefined();
    });
    await profileRefetchSettled(recorder);
  });
});
