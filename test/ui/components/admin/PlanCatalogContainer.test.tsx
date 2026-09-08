/**
 * PlanCatalogContainer — the `/admin/plans` admin catalog surface component
 * suite (Happy DOM + Apollo `MockedProvider` tier, `test/ui/components`).
 *
 * Covers the balance-credit lane select across the whole dialog flow, driven
 * with translation-handle matchers ONLY (labels resolved from the `Plans`
 * namespace handle; plan titles/values are technical test data, never UI
 * copy):
 *
 *   catalog renders (heading + seeded rows) · create dialog opens with the
 *   required lane select offering the three localized lane options ·
 *   create submit without a lane stays local (inline validation, no
 *   mutation) · create submit carries the picked lane on the wire, toasts,
 *   closes the dialog and refetches · edit dialog pre-fills the stored lane
 *   and an untouched save leaves the lane OFF the update wire (explicit
 *   undefined — stored lane untouched) · a changed lane rides the update
 *   payload · a laneless legacy row forces a pick and carries it ·
 *   Arabic/RTL render offers the Arabic lane labels and composes the same
 *   enum payload.
 *
 * Mutation payloads are observed through the `MockLink` itself: each plan
 * mutation mock's typed `result` callback records the exact variables Apollo
 * would serialize onto the wire (JSON serialization drops `undefined`, so an
 * explicit `undefined` lane and an absent field are identical there).
 *
 * Runs via the mandated runner: `bun run test:ui:components`.
 */

// ─── Harness preloads (inline replication of the `test:ui:components` stack) ─
//
// This suite carries its own copy of the exact `test:ui:components` preload
// stack, in the same order, as the FIRST statements of the module body, so it
// is self-contained under any sanctioned runner. Same LOAD ORDERING CONTRACT
// as the BroadcastComposeContainer suite: RTL must evaluate AFTER the
// Happy-DOM window exists.

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

// ─── Post-DOM module wiring (top-level await — LOAD ORDERING CONTRACT) ───────

const { cleanup, fireEvent, screen, waitFor } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import { afterEach, describe, expect, test } from "bun:test";
import { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import type { RenderResult } from "@testing-library/react";
import {
  type AdminPlansQuery,
  type AdminPlansQuery_adminPlans,
  type CreatePlanMutation,
  type CreatePlanMutationVariables,
  SubscriptionCreditLane,
  type UpdatePlanMutation,
  type UpdatePlanMutationVariables,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminPlansQueryDocument,
  createPlanMutationDocument,
  updatePlanMutationDocument,
} from "@/frontend/graphql/sharedDocuments/billing";
import { PlanCatalogContainer } from "@/frontend/views/admin/plans/catalog/PlanCatalogContainer";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import { Plans } from "@/shared/locale/namespaces/plans";
import { getTranslations } from "@/shared/locale/server";

// NOTE: `renderWithWrapper` is deliberately NOT statically imported here —
// `TestWrapper.tsx` statically imports `@testing-library/react`, so a static
// import would pull RTL into the pre-DOM evaluation phase described above.

// Warm the exercised handle for BOTH locales eagerly — missing-key drift
// surfaces here, at the earliest possible moment, not inside an assertion.
Plans.getLabels(enMessages);
Plans.getLabels(arMessages);

// ─── Locale-driven matchers ─────────────────────────────────────────────────

const t = Plans.getLabels(getTranslations("en"));
const tar = Plans.getLabels(getTranslations("ar"));

// ─── Fixtures & helpers ─────────────────────────────────────────────────────

/** Plan fixture row — the codegen row PLUS `__typename` (MockLink posture). */
type PlanFixture = AdminPlansQuery_adminPlans & { readonly __typename: "Plan" };

const FIXED_STAMP = "2026-09-01T09:00:00.000Z";

const PLAN_CONFIGURED: PlanFixture = {
  __typename: "Plan",
  id: "11",
  title: "Tajweed Weekend",
  sessionCount: 4,
  price: "80.00",
  currency: "EGP",
  intervalDays: 30,
  isActive: true,
  deactivatedAt: null,
  createdAt: FIXED_STAMP,
  updatedAt: FIXED_STAMP,
  balanceLane: SubscriptionCreditLane.Tajweed,
};

const PLAN_LANELESS: PlanFixture = {
  __typename: "Plan",
  id: "12",
  title: "Legacy Trial",
  sessionCount: 2,
  price: "0.00",
  currency: "EGP",
  intervalDays: 14,
  isActive: false,
  deactivatedAt: FIXED_STAMP,
  createdAt: FIXED_STAMP,
  updatedAt: FIXED_STAMP,
  balanceLane: null,
};

/** Technical test data — authored by the admin through form inputs. */
const CREATE_TITLE = "Quran Circle";
const EDITED_TITLE = "Tajweed Weekend Extended";

/** Result row echoed back by the mocked create mutation (MockLink posture). */
const CREATED_PLAN: PlanFixture = {
  __typename: "Plan",
  id: "301",
  title: CREATE_TITLE,
  sessionCount: 10,
  price: "250.00",
  currency: "EGP",
  intervalDays: 30,
  isActive: true,
  deactivatedAt: null,
  createdAt: FIXED_STAMP,
  updatedAt: FIXED_STAMP,
  balanceLane: SubscriptionCreditLane.Reviews,
};

function plansQueryData(plans: readonly PlanFixture[]): AdminPlansQuery {
  return { adminPlans: [...plans] };
}

function plansMock(): MockLink.MockedResponse {
  return {
    request: { query: adminPlansQueryDocument, variables: { includeInactive: true } },
    result: { data: plansQueryData([PLAN_CONFIGURED, PLAN_LANELESS]) },
    // The create flow refetches the catalog after the mutation resolves.
    maxUsageCount: Number.POSITIVE_INFINITY,
    delay: 30,
  };
}

/**
 * Create mutation mock whose variables are observed through the result
 * function — MockLink hands the exact wire variables to the typed callback.
 */
function createPlanMock(
  onVariables: (variables: CreatePlanMutationVariables) => void
): MockLink.MockedResponse<CreatePlanMutation, CreatePlanMutationVariables> {
  return {
    request: { query: createPlanMutationDocument, variables: () => true },
    result: variables => {
      onVariables(variables);
      return { data: { createPlan: CREATED_PLAN } };
    },
    delay: 30,
  };
}

function updatePlanMock(
  title: string,
  balanceLane: SubscriptionCreditLane | null,
  onVariables: (variables: UpdatePlanMutationVariables) => void
): MockLink.MockedResponse<UpdatePlanMutation, UpdatePlanMutationVariables> {
  return {
    request: { query: updatePlanMutationDocument, variables: () => true },
    result: variables => {
      onVariables(variables);
      return {
        data: {
          updatePlan: {
            __typename: "Plan",
            id: PLAN_CONFIGURED.id,
            title,
            sessionCount: PLAN_CONFIGURED.sessionCount,
            price: PLAN_CONFIGURED.price,
            currency: PLAN_CONFIGURED.currency,
            intervalDays: PLAN_CONFIGURED.intervalDays,
            isActive: true,
            deactivatedAt: null,
            createdAt: FIXED_STAMP,
            updatedAt: FIXED_STAMP,
            balanceLane,
          },
        },
      };
    },
    delay: 30,
  };
}

/** Renders the container under MockedProvider with the given mocks. */
function renderCatalog(
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  options: { readonly locale?: AppLocale } = {}
): RenderResult {
  return renderWithWrapper(
    <MockedProvider link={new MockLink([...mocks])}>
      <PlanCatalogContainer />
    </MockedProvider>,
    { locale: options.locale ?? "en" }
  );
}

/** Waits for the catalog query to resolve, then opens the plan form dialog. */
async function openFormDialog(mode: "create" | "edit-configured" | "edit-laneless"): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: `${t.editPlanButton} ${PLAN_CONFIGURED.title}` })).toBeDefined()
  );

  if (mode === "create") {
    fireEvent.click(screen.getByRole("button", { name: t.createPlanButton }));
  } else {
    const target = mode === "edit-configured" ? PLAN_CONFIGURED : PLAN_LANELESS;
    fireEvent.click(screen.getByRole("button", { name: `${t.editPlanButton} ${target.title}` }));
  }

  const expectedTitle = mode === "create" ? t.createPlanDialogTitle : t.editPlanDialogTitle;
  await waitFor(() => expect(screen.getByRole("dialog", { name: expectedTitle })).toBeDefined());
}

afterEach(cleanup);

// ─── Suite (en / LTR) ────────────────────────────────────────────────────────

describe("PlanCatalogContainer (en / LTR)", () => {
  test("create dialog renders the required lane select over the three localized lane options", async () => {
    renderCatalog([plansMock()]);

    expect(screen.getByRole("heading", { level: 1, name: t.pageTitle })).toBeDefined();
    await openFormDialog("create");

    // Both seeded catalog rows stay rendered behind the dialog.
    expect(screen.getAllByText(PLAN_CONFIGURED.title).length).toBeGreaterThan(0);
    expect(screen.getAllByText(PLAN_LANELESS.title).length).toBeGreaterThan(0);

    const combo = screen.getByRole("combobox", { name: t.balanceLaneFieldLabel });
    expect(combo).toBeDefined();
    // A plain click never opens the MUI listbox — mouseDown does.
    fireEvent.mouseDown(combo);
    expect(screen.getByRole("option", { name: t.balanceLaneHifz })).toBeDefined();
    expect(screen.getByRole("option", { name: t.balanceLaneTajweed })).toBeDefined();
    expect(screen.getByRole("option", { name: t.balanceLaneReviews })).toBeDefined();
  });

  test("create submit without a lane shows the inline validation and fires NO mutation", async () => {
    const captures: CreatePlanMutationVariables[] = [];
    renderCatalog([plansMock(), createPlanMock(variables => captures.push(variables))]);
    await openFormDialog("create");

    fireEvent.change(screen.getByRole("textbox", { name: t.titleFieldLabel }), { target: { value: CREATE_TITLE } });
    fireEvent.click(screen.getByRole("button", { name: t.saveButton }));

    expect(screen.getByText(t.validationBalanceLaneMessage)).toBeDefined();
    await waitFor(() => expect(captures).toHaveLength(0));
    // The dialog stays open for correction.
    expect(screen.getByRole("dialog", { name: t.createPlanDialogTitle })).toBeDefined();
  });

  test("create submit carries the selected lane on the wire", async () => {
    const captures: CreatePlanMutationVariables[] = [];
    renderCatalog([plansMock(), createPlanMock(variables => captures.push(variables))]);
    await openFormDialog("create");

    fireEvent.change(screen.getByRole("textbox", { name: t.titleFieldLabel }), { target: { value: CREATE_TITLE } });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: t.balanceLaneFieldLabel }));
    fireEvent.click(screen.getByRole("option", { name: t.balanceLaneReviews }));
    fireEvent.click(screen.getByRole("button", { name: t.saveButton }));

    await waitFor(() => expect(captures).toHaveLength(1));
    const input = captures[0].input;
    expect(input.balanceLane).toBe(SubscriptionCreditLane.Reviews);
    expect(input.title).toBe(CREATE_TITLE);
    expect(input.sessionCount).toBe(10);
    expect(input.price).toBe("250.00");
    expect(input.currency).toBe("EGP");
    expect(input.intervalDays).toBe(30);

    // Success surfaces the toast, then the dialog unmounts on the MUI
    // exit-transition clock — poll it (BroadcastComposeContainer idiom).
    await waitFor(() => expect(screen.getByText(t.createSuccessToast)).toBeDefined());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: t.createPlanDialogTitle })).toBeNull(), {
      timeout: 3000,
    });
  });

  test("edit dialog pre-fills the stored lane and an untouched save leaves the lane OFF the update wire", async () => {
    const captures: UpdatePlanMutationVariables[] = [];
    renderCatalog([
      plansMock(),
      updatePlanMock(EDITED_TITLE, SubscriptionCreditLane.Tajweed, variables => captures.push(variables)),
    ]);
    await openFormDialog("edit-configured");

    // The stored lane renders as the select's current value.
    const combo = screen.getByRole("combobox", { name: t.balanceLaneFieldLabel });
    expect(combo.textContent).toContain(t.balanceLaneTajweed);

    fireEvent.change(screen.getByRole("textbox", { name: t.titleFieldLabel }), { target: { value: EDITED_TITLE } });
    fireEvent.click(screen.getByRole("button", { name: t.saveButton }));

    await waitFor(() => expect(captures).toHaveLength(1));
    const input = captures[0].input;
    expect(input.title).toBe(EDITED_TITLE);
    // Untouched lane: the property exists but is explicitly undefined, which
    // JSON serialization drops — the stored lane stays untouched server-side.
    expect("balanceLane" in input).toBe(true);
    expect(input.balanceLane).toBeUndefined();
    expect(captures[0].id).toBe(PLAN_CONFIGURED.id);
  });

  test("edit dialog sends the newly picked lane when the admin changes it", async () => {
    const captures: UpdatePlanMutationVariables[] = [];
    renderCatalog([
      plansMock(),
      updatePlanMock(PLAN_CONFIGURED.title, SubscriptionCreditLane.Reviews, variables => captures.push(variables)),
    ]);
    await openFormDialog("edit-configured");

    fireEvent.mouseDown(screen.getByRole("combobox", { name: t.balanceLaneFieldLabel }));
    fireEvent.click(screen.getByRole("option", { name: t.balanceLaneReviews }));
    fireEvent.click(screen.getByRole("button", { name: t.saveButton }));

    await waitFor(() => expect(captures).toHaveLength(1));
    expect(captures[0].input.balanceLane).toBe(SubscriptionCreditLane.Reviews);
  });

  test("editing a laneless row forces a lane pick and carries it on the update", async () => {
    const captures: UpdatePlanMutationVariables[] = [];
    renderCatalog([
      plansMock(),
      updatePlanMock(PLAN_LANELESS.title, SubscriptionCreditLane.Hifz, variables => captures.push(variables)),
    ]);
    await openFormDialog("edit-laneless");

    // A laneless legacy row starts empty and blocks submit until a lane is picked.
    fireEvent.click(screen.getByRole("button", { name: t.saveButton }));
    expect(screen.getByText(t.validationBalanceLaneMessage)).toBeDefined();
    await waitFor(() => expect(captures).toHaveLength(0));

    fireEvent.mouseDown(screen.getByRole("combobox", { name: t.balanceLaneFieldLabel }));
    fireEvent.click(screen.getByRole("option", { name: t.balanceLaneHifz }));
    fireEvent.click(screen.getByRole("button", { name: t.saveButton }));

    await waitFor(() => expect(captures).toHaveLength(1));
    expect(captures[0].input.balanceLane).toBe(SubscriptionCreditLane.Hifz);
    expect(captures[0].input.title).toBe(PLAN_LANELESS.title);
  });
});

// ─── Suite (ar / RTL) ────────────────────────────────────────────────────────

describe("PlanCatalogContainer (ar / RTL)", () => {
  test("edit dialog offers the Arabic lane labels and a changed lane composes the same enum payload", async () => {
    const captures: UpdatePlanMutationVariables[] = [];
    renderCatalog(
      [
        plansMock(),
        updatePlanMock(PLAN_CONFIGURED.title, SubscriptionCreditLane.Hifz, variables => captures.push(variables)),
      ],
      { locale: "ar" }
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: `${tar.editPlanButton} ${PLAN_CONFIGURED.title}` })).toBeDefined()
    );
    fireEvent.click(screen.getByRole("button", { name: `${tar.editPlanButton} ${PLAN_CONFIGURED.title}` }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: tar.editPlanDialogTitle })).toBeDefined());

    const combo = screen.getByRole("combobox", { name: tar.balanceLaneFieldLabel });
    expect(combo.textContent).toContain(tar.balanceLaneTajweed);

    fireEvent.mouseDown(combo);
    expect(screen.getByRole("option", { name: tar.balanceLaneHifz })).toBeDefined();
    expect(screen.getByRole("option", { name: tar.balanceLaneTajweed })).toBeDefined();
    expect(screen.getByRole("option", { name: tar.balanceLaneReviews })).toBeDefined();

    fireEvent.click(screen.getByRole("option", { name: tar.balanceLaneHifz }));
    fireEvent.click(screen.getByRole("button", { name: tar.saveButton }));

    await waitFor(() => expect(captures).toHaveLength(1));
    expect(captures[0].input.balanceLane).toBe(SubscriptionCreditLane.Hifz);
  });
});
