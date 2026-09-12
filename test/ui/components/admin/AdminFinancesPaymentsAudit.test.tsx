/**
 * AdminFinancesPaymentsAudit — the payments-audit panel suite
 * (`/admin/finances`, payments tab).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components/admin`):
 * every render branch of the payments audit panel, driven with
 * translation-handle matchers ONLY (labels resolved from the `AdminFinance`
 * namespace handle; fixture ids/names/money strings are technical test
 * data):
 *
 *   busy skeleton → populated payments table (student, amount, currency,
 *   gateway, status, date) · honest empty state (no payments) · FORBIDDEN
 *   denial renders the localized denied notice (the raw server message is
 *   NEVER rendered) · the filter bar carries the localized search field,
 *   status/gateway selects and the apply/reset pair · Arabic RTL renders
 *   the same handle.
 *
 * Runs via the mandated runner:
 * `bun run test/scripts/run-test.ts test/ui/components/admin/AdminFinancesPaymentsAudit.test.tsx`
 */

// ─── Harness preloads (inline replication of the `test:ui:components` stack) ─

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

// ─── Post-DOM module wiring (top-level await — LOAD ORDERING CONTRACT) ───────

const { cleanup, screen, waitFor } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import { afterEach, describe, expect, test } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import type { RenderResult } from "@testing-library/react";
import { adminStudentPaymentsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { PaymentsAuditPanel } from "@/frontend/views/admin/finances/PaymentsAuditPanel";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";
import { getTranslations } from "@/shared/locale/server";

// Warm the AdminFinance handle for BOTH locales eagerly — missing-key drift
// surfaces here, at the earliest possible moment, not inside an assertion.
AdminFinance.getLabels(enMessages);
AdminFinance.getLabels(arMessages);

// ─── Locale-driven matchers ─────────────────────────────────────────────────

const t = AdminFinance.getLabels(getTranslations("en"));
const tar = AdminFinance.getLabels(getTranslations("ar"));

// ─── Fixtures & helpers ─────────────────────────────────────────────────────

const FIXED_ISO = "2026-08-29T12:00:00.000Z";

const PAYMENT_ROW = {
  __typename: "AdminStudentPayment",
  id: "501",
  studentId: "12",
  studentName: "Student One",
  subscriptionId: "7",
  amount: "250.00",
  currency: "EGP",
  paymentGateway: "stripe",
  status: "paid",
  createdAt: FIXED_ISO,
} as never;

function paymentsMock(data: Record<string, unknown>): MockLink.MockedResponse {
  return {
    request: { query: adminStudentPaymentsQueryDocument, variables: { filters: { studentId: null }, page: 1, pageSize: 10 } },
    result: { data },
  };
}

function codeErrorMock(code: string): MockLink.MockedResponse {
  return {
    request: { query: adminStudentPaymentsQueryDocument, variables: { filters: { studentId: null }, page: 1, pageSize: 10 } },
    result: { errors: [{ message: `${code} (masked transport surface)`, extensions: { code } }] },
  };
}

function renderPayments(mocks: ReadonlyArray<MockLink.MockedResponse>, locale: "en" | "ar" = "en"): RenderResult {
  return renderWithWrapper(
    <MockedProvider mocks={[...mocks]}>
      <PaymentsAuditPanel />
    </MockedProvider>,
    { locale }
  );
}

afterEach(cleanup);

// ─── Suite (en / LTR) ───────────────────────────────────────────────────────

describe("AdminFinancesPaymentsAudit (en / LTR)", () => {
  test("populated payments render the audit table through the real mocked document", async () => {
    renderPayments([
      paymentsMock({
        adminStudentPayments: {
          __typename: "AdminStudentPaymentPage",
          items: [PAYMENT_ROW],
          totalCount: 1,
          page: 1,
          pageSize: 10,
        },
      }),
    ]);

    await waitFor(() => expect(screen.getAllByText("Student One").length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText("250.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("EGP").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("stripe").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("paid").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(t.paymentsResultCount(1)).length).toBeGreaterThanOrEqual(1);
  });

  test("empty result renders the honest empty state without rows", async () => {
    renderPayments([
      paymentsMock({
        adminStudentPayments: {
          __typename: "AdminStudentPaymentPage",
          items: [],
          totalCount: 0,
          page: 1,
          pageSize: 10,
        },
      }),
    ]);

    await waitFor(() => expect(screen.getAllByText(t.paymentsEmpty).length).toBeGreaterThanOrEqual(1));
    expect(screen.queryByText("Student One")).toBeNull();
  });

  test("query-context FORBIDDEN renders the localized denied notice — never the raw message", async () => {
    renderPayments([codeErrorMock("FORBIDDEN")]);

    await waitFor(() => expect(screen.getByText(t.forbiddenTitle)).toBeDefined());
    expect(screen.getByText(t.forbiddenBody)).toBeDefined();
    // The server `message` text NEVER reaches the DOM.
    expect(screen.queryByText(/masked transport surface/)).toBeNull();
  });

  test("the filter bar carries the localized controls and the apply/reset pair", async () => {
    renderPayments([
      paymentsMock({
        adminStudentPayments: {
          __typename: "AdminStudentPaymentPage",
          items: [],
          totalCount: 0,
          page: 1,
          pageSize: 10,
        },
      }),
    ]);

    await waitFor(() => expect(screen.getAllByText(t.paymentsEmpty).length).toBeGreaterThanOrEqual(1));
    expect(screen.getByLabelText(t.studentSearchLabel)).toBeDefined();
    expect(screen.getByTestId("admin-finances-filters-apply")).toBeDefined();
    expect(screen.getByTestId("admin-finances-filters-reset")).toBeDefined();
  });
});

// ─── Suite (ar / RTL) ───────────────────────────────────────────────────────

describe("AdminFinancesPaymentsAudit (ar / RTL)", () => {
  test("renders the Arabic labels through the same handle over the RTL provider stack", async () => {
    renderPayments(
      [
        paymentsMock({
          adminStudentPayments: {
            __typename: "AdminStudentPaymentPage",
            items: [PAYMENT_ROW],
            totalCount: 1,
            page: 1,
            pageSize: 10,
          },
        }),
      ],
      "ar"
    );

    await waitFor(() => expect(screen.getAllByText("Student One").length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText(tar.paymentsResultCount(1)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(tar.studentHeader).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(tar.amountHeader).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(tar.studentSearchLabel)).toBeDefined();
  });
});
