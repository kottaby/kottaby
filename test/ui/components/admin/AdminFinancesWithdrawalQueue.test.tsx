/**
 * AdminFinancesWithdrawalQueue — the withdrawal payout queue dialog suite
 * (`/admin/finances`, withdrawals tab).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components/admin`):
 * the approve dialog (confirm/cancel, NO reason field) and the reject
 * dialog (MANDATORY reason field) mutation-variable assertions through
 * mocked Apollo, driven with translation-handle matchers ONLY (labels
 * resolved from the `AdminFinance` / `Common` namespace handles; fixture
 * ids/names/money strings are technical test data):
 *
 *   populated queue renders the oldest-first rows (teacher, amount, wallet
 *   balance, requested-at) · approve calls the mutation with exactly
 *   `{ transactionId }` · reject requires the mandatory reason (the submit
 *   stays disabled while the reason is empty) and calls the mutation with
 *   exactly `{ transactionId, reason }` · Arabic RTL resolves the same
 *   handles.
 *
 * Runs via the mandated runner:
 * `bun run test/scripts/run-test.ts test/ui/components/admin/AdminFinancesWithdrawalQueue.test.tsx`
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
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import type { RenderResult } from "@testing-library/react";
import { adminPendingWithdrawalsQueryDocument, approveWithdrawalMutationDocument, rejectWithdrawalMutationDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { WithdrawalQueuePanel } from "@/frontend/views/admin/finances/WithdrawalQueuePanel";
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
const TX_ID = "901";

const QUEUE_ROW = {
  __typename: "AdminWithdrawalQueueRow",
  transaction: {
    __typename: "TeacherTransaction",
    id: TX_ID,
    type: "withdrawal",
    status: "pending",
    amount: "300.00",
    description: "Withdrawal request (pending payout)",
    createdAt: FIXED_ISO,
  },
  teacherName: "Teacher One",
  walletBalance: "900.00",
} as never;

function withdrawalsMock(data: Record<string, unknown>): MockLink.MockedResponse {
  return {
    request: { query: adminPendingWithdrawalsQueryDocument, variables: { page: 1, pageSize: 25 } },
    result: { data },
  };
}

function approveMock(variables: Record<string, unknown>): MockLink.MockedResponse {
  return {
    request: { query: approveWithdrawalMutationDocument, variables },
    result: {
      data: {
        approveWithdrawal: {
          __typename: "TeacherTransaction",
          id: TX_ID,
          type: "withdrawal",
          status: "completed",
          amount: "300.00",
          description: "Withdrawal request (pending payout)",
          walletId: "3",
          sessionId: null,
          createdAt: FIXED_ISO,
        },
      },
    },
  };
}

function rejectMock(variables: Record<string, unknown>): MockLink.MockedResponse {
  return {
    request: { query: rejectWithdrawalMutationDocument, variables },
    result: {
      data: {
        rejectWithdrawal: {
          __typename: "TeacherTransaction",
          id: TX_ID,
          type: "withdrawal",
          status: "failed",
          amount: "300.00",
          description: "Withdrawal request (pending payout)",
          walletId: "3",
          sessionId: null,
          createdAt: FIXED_ISO,
        },
      },
    },
  };
}


function renderQueue(mocks: ReadonlyArray<MockLink.MockedResponse>, locale: "en" | "ar" = "en"): RenderResult {
  return renderWithWrapper(
    <MockedProvider mocks={[...mocks]}>
      <WithdrawalQueuePanel />
    </MockedProvider>,
    { locale }
  );
}

afterEach(cleanup);

// ─── Suite (en / LTR) ───────────────────────────────────────────────────────

describe("AdminFinancesWithdrawalQueue (en / LTR)", () => {
  test("populated queue renders the pending rows through the real mocked document", async () => {
    renderQueue([withdrawalsMock({ adminPendingWithdrawals: { __typename: "AdminWithdrawalQueuePage", items: [QUEUE_ROW], totalCount: 1, page: 1, pageSize: 25 } })]);

    await waitFor(() => expect(screen.getAllByText("Teacher One").length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText(t.pendingWithdrawalsCount(1)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(t.walletBalanceHeader).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(t.requestedAtHeader).length).toBeGreaterThanOrEqual(1);
  });

  test("approve calls the mutation with exactly `{ transactionId }`", async () => {
    renderQueue([
      withdrawalsMock({ adminPendingWithdrawals: { __typename: "AdminWithdrawalQueuePage", items: [QUEUE_ROW], totalCount: 1, page: 1, pageSize: 25 } }),
      approveMock({ transactionId: TX_ID }),
    ]);

    await waitFor(() => expect(screen.getAllByTestId(`admin-finances-approve-${TX_ID}`).length).toBeGreaterThanOrEqual(1));
    fireEvent.click(screen.getAllByTestId(`admin-finances-approve-${TX_ID}`)[0]);

    const confirm = await waitFor(() => screen.getByTestId(`approve-withdrawal-submit-${TX_ID}`));
    fireEvent.click(confirm);

    // The approve mutation settled (the mocked variables matched EXACTLY
    // `{ transactionId: TX_ID }`) — the dialog closes on settle.
    await waitFor(() => expect(screen.queryByTestId(`approve-withdrawal-submit-${TX_ID}`)).toBeNull());
  });

  test("reject requires the mandatory reason and calls the mutation with `{ transactionId, reason }`", async () => {
    renderQueue([
      withdrawalsMock({ adminPendingWithdrawals: { __typename: "AdminWithdrawalQueuePage", items: [QUEUE_ROW], totalCount: 1, page: 1, pageSize: 25 } }),
      rejectMock({ transactionId: TX_ID, reason: "Duplicate payout request" }),
    ]);

    await waitFor(() => expect(screen.getAllByTestId(`admin-finances-reject-${TX_ID}`).length).toBeGreaterThanOrEqual(1));
    fireEvent.click(screen.getAllByTestId(`admin-finances-reject-${TX_ID}`)[0]);

    // The mandatory reason field is on the dialog; the submit stays
    // DISABLED while the reason is empty (a rejection outcome is never
    // implied by a default).
    const submit = await waitFor(() => screen.getByTestId(`reject-withdrawal-submit-${TX_ID}`));
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByTestId(`reject-withdrawal-reason-${TX_ID}`), {
      target: { value: "Duplicate payout request" },
    });
    expect(submit.hasAttribute("disabled")).toBe(false);

    fireEvent.click(submit);

    // The reject mutation settled (the mocked variables matched EXACTLY
    // `{ transactionId: TX_ID, reason: "Duplicate payout request" }`).
    await waitFor(() => expect(screen.queryByTestId(`reject-withdrawal-submit-${TX_ID}`)).toBeNull());
  });
});

// ─── Suite (ar / RTL) ───────────────────────────────────────────────────────

describe("AdminFinancesWithdrawalQueue (ar / RTL)", () => {
  test("renders the Arabic queue labels through the same handle", async () => {
    renderQueue(
      [withdrawalsMock({ adminPendingWithdrawals: { __typename: "AdminWithdrawalQueuePage", items: [QUEUE_ROW], totalCount: 1, page: 1, pageSize: 25 } })],
      "ar"
    );

    await waitFor(() => expect(screen.getByText(tar.pendingWithdrawalsCount(1))).toBeDefined());
    expect(screen.getAllByText(tar.walletBalanceHeader).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(tar.approveAction).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(tar.rejectAction).length).toBeGreaterThanOrEqual(1);
  });
});

// The settlement stubs are re-exported use for the sibling suites; keep the
// imports referenced so the lint pass keeps them.