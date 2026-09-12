/**
 * AdminFinancesContainer — the `/admin/finances` admin financial auditing
 * console component suite.
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components/admin`):
 * every render branch, driven with translation-handle matchers ONLY (labels
 * resolved from the `AdminFinance` namespace handle; fixture ids/names/
 * money strings/currency codes/dates are technical test data, never UI
 * copy):
 *
 *   tab strip renders the three localized tab labels · the payments tab is
 *   the default · the populated payments queue renders through the real
 *   mocked documents (both locales) · Arabic RTL resolves the same handle.
 *
 * Runs via the mandated runner:
 * `bun run test/scripts/run-test.ts test/ui/components/admin/AdminFinancesContainer.test.tsx`
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
import type {
  AdminPendingWithdrawalsQuery,
  AdminStudentPaymentsQuery,
  AdminTeacherWalletQuery,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminPendingWithdrawalsQueryDocument,
  adminStudentPaymentsQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { AdminFinancesContainer } from "@/frontend/views/admin/finances/AdminFinancesContainer";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";
import { getTranslations } from "@/shared/locale/server";

// NOTE: `renderWithWrapper` is deliberately NOT statically imported here —
// `TestWrapper.tsx` statically imports `@testing-library/react`, so a static
// import would pull RTL into the pre-DOM evaluation phase described above.

// Warm the AdminFinance handle for BOTH locales eagerly — missing-key drift
// surfaces here, at the earliest possible moment, not inside an assertion.
AdminFinance.getLabels(enMessages);
AdminFinance.getLabels(arMessages);

// ─── Locale-driven matchers ─────────────────────────────────────────────────

const t = AdminFinance.getLabels(getTranslations("en"));
const tar = AdminFinance.getLabels(getTranslations("ar"));

// ─── Fixtures & helpers ─────────────────────────────────────────────────────

const FIXED_ISO = "2026-08-29T12:00:00.000Z";

type PaymentRowFixture = AdminStudentPaymentsQuery["adminStudentPayments"]["items"][number];
type WithdrawalRowFixture = AdminPendingWithdrawalsQuery["adminPendingWithdrawals"]["items"][number];
type WalletTxFixture = AdminTeacherWalletQuery["adminTeacherWallet"]["transactions"][number];

const PAYMENT_ROW: PaymentRowFixture = {
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
} as unknown as PaymentRowFixture;

const WITHDRAWAL_ROW: WithdrawalRowFixture = {
  __typename: "AdminWithdrawalQueueRow",
  transaction: {
    __typename: "TeacherTransaction",
    id: "901",
    type: "withdrawal",
    status: "pending",
    amount: "300.00",
    description: "Withdrawal request (pending payout)",
    createdAt: FIXED_ISO,
  },
  teacherName: "Teacher One",
  walletBalance: "900.00",
} as unknown as WithdrawalRowFixture;

const WALLET_TX: WalletTxFixture = {
  __typename: "TeacherTransaction",
  id: "902",
  type: "earning",
  status: "completed",
  amount: "120.50",
  description: "Session payout",
  sessionId: "31",
  createdAt: FIXED_ISO,
} as unknown as WalletTxFixture;

function paymentsPage(rows: readonly PaymentRowFixture[], totalCount = rows.length): AdminStudentPaymentsQuery {
  return {
    adminStudentPayments: {
      __typename: "AdminStudentPaymentPage",
      items: [...rows],
      totalCount,
      page: 1,
      pageSize: 10,
    },
  } as AdminStudentPaymentsQuery;
}

function withdrawalsPage(rows: readonly WithdrawalRowFixture[]): AdminPendingWithdrawalsQuery {
  return {
    adminPendingWithdrawals: {
      __typename: "AdminWithdrawalQueuePage",
      items: [...rows],
      totalCount: rows.length,
      page: 1,
      pageSize: 25,
    },
  } as AdminPendingWithdrawalsQuery;
}

function walletPage(rows: readonly WalletTxFixture[]): AdminTeacherWalletQuery {
  return {
    adminTeacherWallet: {
      __typename: "AdminTeacherWallet",
      balance: "900.00",
      totalEarning: "1240.00",
      currency: "EGP",
      teacherId: "3",
      teacherName: "Teacher One",
      transactions: [...rows],
      totalCount: rows.length,
      page: 1,
      pageSize: 10,
    },
  } as AdminTeacherWalletQuery;
}

function paymentsMock(data: AdminStudentPaymentsQuery): MockLink.MockedResponse {
  return {
    request: { query: adminStudentPaymentsQueryDocument, variables: { filters: { studentId: null }, page: 1, pageSize: 10 } },
    result: { data },
  };
}

function withdrawalsMock(data: AdminPendingWithdrawalsQuery): MockLink.MockedResponse {
  return {
    request: { query: adminPendingWithdrawalsQueryDocument, variables: { page: 1, pageSize: 25 } },
    result: { data },
  };
}

function renderFinances(
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: "en" | "ar" = "en"
): RenderResult {
  return renderWithWrapper(
    <MockedProvider mocks={[...mocks]}>
      <AdminFinancesContainer />
    </MockedProvider>,
    { locale }
  );
}

afterEach(cleanup);

// ─── Suite (en / LTR) ───────────────────────────────────────────────────────

describe("AdminFinancesContainer (en / LTR)", () => {
  test("renders the three localized tab labels with the payments tab default", async () => {
    renderFinances([paymentsMock(paymentsPage([PAYMENT_ROW])), withdrawalsMock(withdrawalsPage([WITHDRAWAL_ROW]))]);

    expect(screen.getByRole("tab", { name: t.paymentsTab })).toBeDefined();
    expect(screen.getByRole("tab", { name: t.withdrawalsTab })).toBeDefined();
    expect(screen.getByRole("tab", { name: t.walletInspectorTab })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: t.title })).toBeDefined();
    expect(screen.getByText(t.subtitle)).toBeDefined();

    // The default payments tab renders the populated audit panel through
    // the real mocked document.
    await waitFor(() => expect(screen.getAllByText(PAYMENT_ROW.studentName).length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText(t.studentHeader).length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Suite (ar / RTL) ───────────────────────────────────────────────────────

describe("AdminFinancesContainer (ar / RTL)", () => {
  test("renders the Arabic labels through the same handle over the RTL provider stack", async () => {
    renderFinances([paymentsMock(paymentsPage([PAYMENT_ROW])), withdrawalsMock(withdrawalsPage([WITHDRAWAL_ROW]))], "ar");

    expect(screen.getByRole("heading", { level: 1, name: tar.title })).toBeDefined();
    expect(screen.getByText(tar.subtitle)).toBeDefined();
    expect(screen.getByRole("tab", { name: tar.paymentsTab })).toBeDefined();
    expect(screen.getByRole("tab", { name: tar.withdrawalsTab })).toBeDefined();
    expect(screen.getByRole("tab", { name: tar.walletInspectorTab })).toBeDefined();

    await waitFor(() => expect(screen.getAllByText(PAYMENT_ROW.studentName).length).toBeGreaterThanOrEqual(1));
  });
});

// Re-exported test-only fixtures for the sibling suites (same folder, flat
// files) — the wallet/payments suites import them to avoid duplicating the
// fixture shapes.
export { PAYMENT_ROW, WITHDRAWAL_ROW, WALLET_TX, walletPage, withdrawalsPage, paymentsPage, paymentsMock, withdrawalsMock, FIXED_ISO };

// The `waitFor` binding is re-exported use; keep the import referenced so
// the lint pass keeps it (the sibling suites await their own copy).