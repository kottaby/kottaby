/**
 * AdminFinancesWalletInspector — the wallet inspector panel suite
 * (`/admin/finances`, wallet tab).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components/admin`):
 * the teacher picker (the existing admin teachers query), the summary
 * cards, and the manual wallet-adjustment dialog's mutation-variable
 * assertions, driven with translation-handle matchers ONLY (labels
 * resolved from the `AdminFinance` namespace handle; fixture ids/names/
 * money strings are technical test data):
 *
 *   the picker renders with the existing teachers query (no new read
 *   surface) · the populated wallet renders the summary cards + ledger ·
 *   the honest no-wallet state renders the empty copy (never fake zeros) ·
 *   adjust calls the mutation with the input object
 *   `{ teacherId, amount, direction, reason }` · Arabic RTL resolves the
 *   same handle.
 *
 * Runs via the mandated runner:
 * `bun run test/scripts/run-test.ts test/ui/components/admin/AdminFinancesWalletInspector.test.tsx`
 */

// ─── Harness preloads (inline replication of the `test:ui:components` stack) ─

await import("@/test/ui/test-env");
await import("@/test/ui/components/happydom-preload");
await import("@/test/ui/components/translation-preload");
await import("@/test/ui/components/next-dynamic-mock");

// ─── Post-DOM module wiring (top-level await — LOAD ORDERING CONTRACT) ───────

const { cleanup, fireEvent, screen, waitFor, within } = await import("@testing-library/react");
const { renderWithWrapper } = await import("@/test/ui/components/TestWrapper");

import { afterEach, describe, expect, test } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import type { RenderResult } from "@testing-library/react";
import {
  adjustTeacherWalletMutationDocument,
  adminPendingWithdrawalsQueryDocument,
  adminTeachersQueryDocument,
  adminTeacherWalletQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { WalletInspectorPanel } from "@/frontend/views/admin/finances/WalletInspectorPanel";
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

/**
 * Deadline poll (plain sleeps + a direct probe — no `waitFor` act-wrapper
 * overhead). Exits the moment the probe holds or the (pure failure bound)
 * deadline elapses.
 */
async function pollUntil(probe: () => boolean, deadlineAt: number, intervalMs: number): Promise<boolean> {
  if (probe()) {
    return true;
  }
  if (Date.now() >= deadlineAt) {
    return false;
  }
  await new Promise(resolve => setTimeout(resolve, intervalMs));
  return pollUntil(probe, deadlineAt, intervalMs);
}

// ─── Fixtures & helpers ─────────────────────────────────────────────────────

const FIXED_ISO = "2026-08-29T12:00:00.000Z";
const TEACHER_ID = 3;

/** Deadline-poll cadence for the adjust settle (pure failure bound). */
const SETTLE_POLL_INTERVAL_MS = 40;
const SETTLE_POLL_DEADLINE_MS = 3200;

const TEACHER_ITEM = {
  __typename: "AdminTeacherItem",
  id: TEACHER_ID,
  name: "Teacher One",
  email: "teacher@draftacademy.local",
  phone: null,
  country: null,
  isApproved: true,
  isEvaluator: false,
  averageRating: null,
  isOnline: false,
  subjects: [],
  isDeleted: false,
  suspended: false,
  isBlocked: false,
  createdAt: FIXED_ISO,
} as never;

function teachersMock(): MockLink.MockedResponse {
  return {
    request: { query: adminTeachersQueryDocument, variables: { filters: null, page: 1, pageSize: 50 } },
    result: {
      data: {
        adminTeachers: {
          __typename: "AdminTeacherPage",
          total: 1,
          page: 1,
          pageSize: 50,
          pageCount: 1,
          items: [TEACHER_ITEM],
        },
      },
    },
  };
}

const WALLET_TX = {
  __typename: "TeacherTransaction",
  id: "902",
  type: "earning",
  status: "completed",
  amount: "120.50",
  description: "Session payout",
  sessionId: "31",
  createdAt: FIXED_ISO,
} as never;

function walletMock(data: Record<string, unknown>): MockLink.MockedResponse {
  return {
    request: {
      query: adminTeacherWalletQueryDocument,
      variables: {
        teacherId: String(TEACHER_ID),
        filters: { type: undefined, status: undefined, from: undefined, to: undefined },
        page: 1,
        pageSize: 10,
      },
    },
    result: { data },
    // The adjust settle refetches `AdminTeacherWallet` (cache-and-network
    // consumes two mocks per query) — the refetch lane must never starve.
    maxUsageCount: Number.POSITIVE_INFINITY,
  };
}

function adjustMock(variables: Record<string, unknown>): MockLink.MockedResponse {
  return {
    request: { query: adjustTeacherWalletMutationDocument, variables },
    result: {
      data: {
        adjustTeacherWallet: {
          __typename: "TeacherTransaction",
          id: "910",
          type: "bonus",
          status: "completed",
          amount: "50.00",
          description: "Manual adjustment",
          walletId: "3",
          sessionId: null,
          createdAt: FIXED_ISO,
        },
      },
    },
  };
}

/**
 * The panel reads the `?teacherId=` seed through the container — the panel
 * test mounts with the sanitized seed handed down as a prop.
 */
function renderInspector(mocks: ReadonlyArray<MockLink.MockedResponse>, locale: "en" | "ar" = "en"): RenderResult {
  return renderWithWrapper(
    <MockedProvider mocks={[...mocks]}>
      <WalletInspectorPanel initialTeacherId={TEACHER_ID} onTeacherChange={() => undefined} />
    </MockedProvider>,
    { locale }
  );
}

afterEach(cleanup);

const POPULATED_WALLET = {
  adminTeacherWallet: {
    __typename: "AdminTeacherWallet",
    balance: "900.00",
    totalEarning: "1240.00",
    currency: "EGP",
    teacherId: String(TEACHER_ID),
    teacherName: "Teacher One",
    transactions: [WALLET_TX],
    totalCount: 1,
    page: 1,
    pageSize: 10,
  },
};

const NO_WALLET = {
  adminTeacherWallet: {
    __typename: "AdminTeacherWallet",
    balance: null,
    totalEarning: null,
    currency: "EGP",
    teacherId: String(TEACHER_ID),
    teacherName: "Teacher One",
    transactions: [],
    totalCount: 0,
    page: 1,
    pageSize: 10,
  },
};

// The `walletMock` spare mocks and the infinite-usage withdrawals mock keep
// the settle refetch lane fed (cache-and-network consumes two mocks per
// query) — a starved refetch would surface as a mock-mismatch error wave.
// ─── Suite (en / LTR) ───────────────────────────────────────────────────────

describe("AdminFinancesWalletInspector (en / LTR)", () => {
  test("populated wallet renders the summary cards + ledger through the real mocked documents", async () => {
    renderInspector([teachersMock(), teachersMock(), walletMock(POPULATED_WALLET), walletMock(POPULATED_WALLET)]);

    await waitFor(() => expect(screen.getByTestId("admin-finances-balance-card")).toBeDefined());
    await waitFor(() => expect(screen.getByText("900.00")).toBeDefined());
    expect(screen.getByText(t.balanceLabel)).toBeDefined();
    expect(screen.getByText(t.totalEarningsLabel)).toBeDefined();
    expect(screen.getByText("1,240.00")).toBeDefined();
    expect(screen.getAllByText("Session payout").length).toBeGreaterThanOrEqual(1);
    // The ledger chips render the LOCALIZED labels (never the raw wire
    // enums) — the fixtures carry lowercase `type: "earning"` /
    // `status: "completed"` (unknown wire values → honest verbatim
    // fallback), the canonical enums resolve through the localized labels.
    expect(screen.getAllByText(t.typeEarning).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(t.statusCompleted).length).toBeGreaterThanOrEqual(1);
    // The shared pagination bar renders in the ledger card footer; on a
    // single page both controls sit disabled at the bounds.
    expect(screen.getByTestId("admin-finances-pagination")).toBeDefined();
    expect(screen.getByTestId("admin-finances-pagination-next").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("admin-finances-pagination-prev").hasAttribute("disabled")).toBe(true);
  });

  test("the honest no-wallet state renders the empty copy — never fake zeros", async () => {
    renderInspector([teachersMock(), teachersMock(), walletMock(NO_WALLET), walletMock(NO_WALLET)]);

    await waitFor(() => expect(screen.getByTestId("admin-finances-balance-card")).toBeDefined());
    // The null-pair renders the namespace's empty copy on BOTH cards.
    expect(screen.getAllByText(t.inspectorEmpty).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0.00")).toBeNull();
  });

  test("adjust calls the mutation with the input object `{ teacherId, amount, direction, reason }`", async () => {
    renderInspector([
      teachersMock(),
      teachersMock(),
      walletMock(POPULATED_WALLET),
      walletMock(POPULATED_WALLET),
      adjustMock({
        input: {
          teacherId: String(TEACHER_ID),
          amount: "50.00",
          direction: "Credit",
          reason: "Goodwill bonus",
        },
      }),
      // The settle hooks refetch `AdminTeacherWallet` AND
      // `AdminPendingWithdrawals` after the mutation — cache-and-network
      // consumes two mocks per query, so keep spares for both reads.
      walletMock(POPULATED_WALLET),
      walletMock(POPULATED_WALLET),
      {
        request: { query: adminPendingWithdrawalsQueryDocument, variables: { page: 1, pageSize: 25 } },
        result: {
          data: {
            adminPendingWithdrawals: {
              __typename: "AdminWithdrawalQueuePage",
              items: [],
              totalCount: 0,
              page: 1,
              pageSize: 25,
            },
          },
        },
        maxUsageCount: Number.POSITIVE_INFINITY,
      },
    ]);

    await waitFor(() => expect(screen.getByTestId("admin-finances-balance-card")).toBeDefined());

    fireEvent.click(screen.getByTestId("admin-finances-adjust-open"));

    // The dialog resolves open (NO options object — the hidden variant hangs
    // happy-dom), then the fields are driven via the dialog-scoped label
    // association (label text carries the required asterisk).
    const dialog = await waitFor(() => screen.getByRole("dialog"));
    const amountInput = within(dialog).getByLabelText(/Amount/);
    fireEvent.change(amountInput, { target: { value: "50.00" } });
    const reasonInput = within(dialog).getByLabelText(/Reason/);
    fireEvent.change(reasonInput, { target: { value: "Goodwill bonus" } });

    fireEvent.click(within(dialog).getByTestId("admin-finances-adjust-submit"));

    // The adjust mutation settled (the mocked input matched EXACTLY the
    // wire object) — the dialog closes on settle. The settle lands through
    // the MockLink refetch lane whose timers run OUTSIDE waitFor's act
    // window under happy-dom — the deadline poll (plain sleeps + a direct
    // query) observes it without the act-wrapper stall; the deadline is a
    // pure failure bound, not a sleep seed.
    const settled = await pollUntil(
      () => screen.queryByTestId("admin-finances-adjust-submit") === null,
      Date.now() + SETTLE_POLL_DEADLINE_MS,
      SETTLE_POLL_INTERVAL_MS
    );
    expect(settled).toBe(true);
    expect(screen.queryByTestId("admin-finances-adjust-submit")).toBeNull();
  });
});

// ─── Suite (ar / RTL) ───────────────────────────────────────────────────────

describe("AdminFinancesWalletInspector (ar / RTL)", () => {
  test("renders the Arabic labels through the same handle over the RTL provider stack", async () => {
    renderInspector([teachersMock(), teachersMock(), walletMock(POPULATED_WALLET), walletMock(POPULATED_WALLET)], "ar");

    await waitFor(() => expect(screen.getByTestId("admin-finances-balance-card")).toBeDefined());
    expect(screen.getByText(tar.balanceLabel)).toBeDefined();
    expect(screen.getByText(tar.totalEarningsLabel)).toBeDefined();
    expect(screen.getByLabelText(tar.teacherPickerLabel)).toBeDefined();
  });
});
