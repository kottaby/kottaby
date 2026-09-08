/**
 * AdminSessionGovernanceContainer — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `AdminSessionGovernanceContainer.test.tsx` (see that file for WHY the
 * suite is split — short version: react-dom must first evaluate with the
 * Happy-DOM document already registered, or React's `isInputEventSupported`
 * flag is computed `false` and controlled `onChange` can never fire).
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components/admin-session-governance`,
 * mirroring the admin disputes suite exactly): ONE render case per branch of
 * the admin session-governance visual state matrix (DEV3-021), driven across
 * BOTH locales:
 *
 *   loading skeleton · 403/FORBIDDEN tenant-denial fallback · masked generic
 *   error · drained-directory empty state · status-filter apply →
 *   filtered-empty copy → reset restores the generic copy · populated
 *   directory (per-status status chips, needs-attention badge, verbatim fee
 *   + currency, derived duration, locale stamps, participant ids, summary
 *   strip counts, honest-count line) · pager round-trip re-keying the
 *   directory variables · the kebab eligibility matrix across the five
 *   lifecycle statuses (disabled-with-hint vs enabled) · reschedule dialog
 *   (open from kebab, prefilled timing pair, the client-mirror past-start
 *   gate blocking BEFORE the wire, and the valid pair firing
 *   `AdminSessionReschedule` with ISO-8601 instants) · cancel dialog (open,
 *   optional-reason seam counter + `maxlength` clamp, empty submit sending
 *   `reason: null`, `x-idempotency-key` captured at the LINK tier and NOT
 *   rotated across a failed retry) · reassign dialog (whole-number id →
 *   `AdminSessionReassign`) · join observation banner in the detail drawer ·
 *   absent-row drawer body (`adminSession === null` renders data-absence,
 *   never an error) · the 403 mutation arm keeping the dialog/banner open
 *   for a corrected submit.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the scaffold's `sessionSuiteLabels` plus the
 * `AdminSessionGovernance` namespace handle (warmed eagerly below) — ZERO
 * hardcoded Arabic/English copy lives here. The exception class is fixture
 * DATA (ids, enum values, an ASCII cancel/dispute reason, timestamps), with
 * stamps recomputed through the scaffold's `expectedStamp` oracle and the
 * reschedule instants recomputed through the dialog's own token converter.
 *
 * Idempotency capture: a capturing `ApolloLink` wraps the `MockLink` (the
 * broadcast compose-send precedent) and records the `x-idempotency-key`
 * context header each cancel operation carries — the same context the real
 * authLink merges into the outgoing HTTP headers.
 *
 * Preload parity: the `test:ui:components` preload chain (test-env →
 * happydom → translation-preload → next-dynamic-mock) is owned by the
 * bootstrap entry, which registers the DOM BEFORE this module — and its
 * node_modules dependencies — are evaluated.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { ApolloLink } from "@apollo/client";
import { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, fireEvent, type RenderResult, waitFor, within } from "@testing-library/react";
import {
  type AdminSessionListFilterInput,
  type AdminSessionsQuery_adminSessions_items,
  SessionIntent,
  SessionStatus,
  SessionType,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminSessionCancelMutationDocument,
  adminSessionJoinMutationDocument,
  adminSessionQueryDocument,
  adminSessionReassignMutationDocument,
  adminSessionRescheduleMutationDocument,
  adminSessionsQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import { MAX_CANCEL_REASON_LENGTH } from "@/frontend/views/admin/session-governance/CancelSessionDialog";
import { isoToDatetimeLocalToken } from "@/frontend/views/admin/session-governance/RescheduleSessionDialog";
import { AdminSessionGovernanceContainer } from "@/frontend/views/admin/session-governance/AdminSessionGovernanceContainer";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { AdminSessionGovernance as AdminSessionGovernanceNs } from "@/shared/locale/namespaces/adminSessionGovernance";
import { Common as CommonNs } from "@/shared/locale/namespaces/common";
import { Errors as ErrorsNs } from "@/shared/locale/namespaces/errors";
import { Sessions as SessionsNs } from "@/shared/locale/namespaces/sessions";
import { getTranslations } from "@/shared/locale/server";
import type { AdminSessionGovernanceLabels } from "@/shared/locale/types/adminSessionGovernance";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";
import {
  componentSuiteLocales,
  expectedStamp,
  liveScreen,
  muiLabelPattern,
  renderWithMocks,
  sessionSuiteLabels,
  snackbarSeverityClass,
} from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Eager namespace warming (missing-key drift surfaces at LOAD, not in an arm)

for (const translations of [enMessages, arMessages]) {
  AdminSessionGovernanceNs.getLabels(translations);
  SessionsNs.getLabels(translations);
  ErrorsNs.getLabels(translations);
  CommonNs.getLabels(translations);
}

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/**
 * All-fields fixture row. `__typename` mirrors what Apollo Server puts on
 * the wire; it is what makes the `Session:<id>` entity normalizable so the
 * mutation payloads converge the directory rows by id WITHOUT refetch.
 */
interface RowFixture extends AdminSessionsQuery_adminSessions_items {
  readonly __typename: "Session";
}

/** Creation moment shared by every fixture row (deterministic formatting). */
const CREATED_ISO = "2099-01-05T08:00:00.000Z";

/** Valid future timing pair (reschedule prefill — outside the past-grace window). */
const FUTURE_START_ISO = "2099-01-10T09:00:00.000Z";
const FUTURE_END_ISO = "2099-01-10T10:30:00.000Z";

/** Lapsed/past lifecycle moments (needs-attention producer + past-start gate). */
const PAST_START_ISO = "2024-11-01T09:00:00.000Z";
const PAST_END_ISO = "2024-11-01T10:00:00.000Z";
const LAPSED_DEADLINE_ISO = "2024-11-01T12:00:00.000Z";
const RESOLVED_ISO = "2024-11-02T15:00:00.000Z";

const SCHEDULED_FRESH_ID = "7301";
const SCHEDULED_LAPSED_ID = "7302";
const STARTED_ID = "7303";
const COMPLETED_ID = "7304";
const CANCELLED_ID = "7305";
const DISPUTED_ID = "7306";
const FIRST_ROW_ID = SCHEDULED_FRESH_ID;

/** Fixture DATA reasons (never locale copy). */
const CANCEL_REASON_TEXT = "Duplicate booking.";
const DISPUTE_REASON_TEXT = "Teacher never joined the session.";

/** Typographic no-value placeholder (NOT locale copy). */
const EM_DASH = "—";

/**
 * Page size the container pins into its query variables (mirrors the
 * container's module-scope `ADMIN_SESSIONS_PAGE_SIZE` — the backend's
 * 1..50 default/clamp midpoint; the constant is NOT exported, so the suite
 * re-states it).
 */
const PAGE_SIZE = 25;

/** Deterministic payload builder mirroring the closed 21-field wire shape. */
function rowFixture(overrides?: Partial<AdminSessionsQuery_adminSessions_items>): RowFixture {
  return {
    __typename: "Session",
    id: SCHEDULED_FRESH_ID,
    status: SessionStatus.Scheduled,
    intent: SessionIntent.Hifz,
    sessionType: SessionType.StudentSession,
    fee: "150.50",
    feeHeld: true,
    studentId: "401",
    teacherId: "802",
    startedAt: FUTURE_START_ISO,
    endedAt: FUTURE_END_ISO,
    confirmationDeadline: "2099-01-09T09:00:00.000Z",
    confirmedByStudentAt: null,
    confirmedByTeacherAt: null,
    createdAt: CREATED_ISO,
    updatedAt: CREATED_ISO,
    cancelReason: null,
    disputeReason: null,
    disputedAt: null,
    resolutionNote: null,
    resolvedAt: null,
    needsAttention: false,
    ...overrides,
  };
}

/** One badge-matrix page: every lifecycle status + both attention arms. */
const PAGE_ROWS: readonly RowFixture[] = [
  rowFixture({ id: SCHEDULED_FRESH_ID }),
  rowFixture({
    id: SCHEDULED_LAPSED_ID,
    startedAt: PAST_START_ISO,
    endedAt: PAST_END_ISO,
    confirmationDeadline: LAPSED_DEADLINE_ISO,
    needsAttention: true,
  }),
  rowFixture({
    id: STARTED_ID,
    status: SessionStatus.Started,
    startedAt: PAST_START_ISO,
    endedAt: null,
    confirmationDeadline: null,
  }),
  rowFixture({
    id: COMPLETED_ID,
    status: SessionStatus.Completed,
    startedAt: PAST_START_ISO,
    endedAt: PAST_END_ISO,
    confirmationDeadline: null,
    confirmedByStudentAt: PAST_END_ISO,
    confirmedByTeacherAt: PAST_END_ISO,
    resolvedAt: RESOLVED_ISO,
  }),
  rowFixture({
    id: CANCELLED_ID,
    status: SessionStatus.Cancelled,
    startedAt: null,
    endedAt: null,
    confirmationDeadline: null,
    cancelReason: CANCEL_REASON_TEXT,
    feeHeld: false,
  }),
  rowFixture({
    id: DISPUTED_ID,
    status: SessionStatus.Disputed,
    startedAt: PAST_START_ISO,
    endedAt: null,
    disputeReason: DISPUTE_REASON_TEXT,
    disputedAt: RESOLVED_ISO,
  }),
];

/** Trailing-page rows for the pager round-trip (ids only — presence check). */
const TRAILING_ROWS: readonly RowFixture[] = [
  rowFixture({ id: "7307", status: SessionStatus.Started, startedAt: PAST_START_ISO, endedAt: null }),
  rowFixture({ id: "7308", status: SessionStatus.Completed, startedAt: PAST_START_ISO, endedAt: PAST_END_ISO }),
];

/** The STARTED detail payload the drawer mock answers (detail badge always false). */
const STARTED_DETAIL: RowFixture = rowFixture({
  id: STARTED_ID,
  status: SessionStatus.Started,
  startedAt: PAST_START_ISO,
  endedAt: null,
  confirmationDeadline: null,
});

/** The cancelled wire payload the cancel-success mock returns (same id). */
function cancelledPayload(sessionId: string): RowFixture {
  return rowFixture({ id: sessionId, status: SessionStatus.Cancelled, feeHeld: false });
}

// ---------------------------------------------------------------------------
// Mock builders

/** Wire-shaped unfiltered state — every member explicitly null (required-nullable input). */
const EMPTY_FILTER: AdminSessionListFilterInput = {
  teacherUserId: null,
  studentUserId: null,
  type: null,
  status: null,
  dateFrom: null,
  dateTo: null,
};

function statusFilter(status: SessionStatus): AdminSessionListFilterInput {
  return { ...EMPTY_FILTER, status };
}

function directoryMock(
  page: number,
  items: readonly RowFixture[],
  totalCount: number,
  filter: AdminSessionListFilterInput = EMPTY_FILTER
): MockLink.MockedResponse {
  return {
    request: { query: adminSessionsQueryDocument, variables: { filter, page, pageSize: PAGE_SIZE } },
    result: { data: { adminSessions: { items: [...items], page, pageSize: PAGE_SIZE, totalCount } } },
  };
}

/**
 * Permanently in-flight query (`delay: Infinity` keeps MockLink emitting a
 * never-settling Observable). An EMPTY mock list would NOT leave the query
 * pending — MockLink raises an async unmatched-operation error instead.
 */
function pendingDirectoryMock(): MockLink.MockedResponse {
  return {
    request: { query: adminSessionsQueryDocument, variables: { filter: EMPTY_FILTER, page: 1, pageSize: PAGE_SIZE } },
    delay: Infinity,
  };
}

/**
 * Single-operation mock failing the caller at the scope layer. The failure
 * is authored as a raw `result.errors[]` entry exactly where the transport
 * boundary puts `extensions.code`; Apollo's MockedProvider wraps it into a
 * genuine `CombinedGraphQLErrors`, which `extractErrorCode` traverses — the
 * same extraction path the production error-link uses.
 */
function directoryErrorMock(code: string): MockLink.MockedResponse {
  return {
    request: { query: adminSessionsQueryDocument, variables: { filter: EMPTY_FILTER, page: 1, pageSize: PAGE_SIZE } },
    result: { errors: [{ message: `${code} (masked transport surface)`, extensions: { code } }] },
  };
}

/** The skip-gated drawer detail read — a full row, or the null absent-row. */
function detailMock(payload: RowFixture | null): MockLink.MockedResponse {
  return {
    request: { query: adminSessionQueryDocument, variables: { id: STARTED_ID } },
    result: { data: { adminSession: payload } },
  };
}

type MutationOutcome =
  | { readonly kind: "success"; readonly payload: RowFixture }
  | { readonly kind: "error"; readonly code: string };

function outcomeResult(wireField: string, outcome: MutationOutcome): MockLink.MockedResponse["result"] {
  if (outcome.kind === "success") {
    return { data: { [wireField]: outcome.payload } };
  }
  return {
    errors: [{ message: `${outcome.code} (masked transport surface)`, extensions: { code: outcome.code } }],
  };
}

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
    result: outcomeResult("adminRescheduleSession", outcome),
  };
}

function cancelMock(sessionId: string, reason: string | null, outcome: MutationOutcome): MockLink.MockedResponse {
  return {
    request: { query: adminSessionCancelMutationDocument, variables: { input: { sessionId, reason } } },
    result: outcomeResult("adminCancelSession", outcome),
  };
}

function reassignMock(
  sessionId: string,
  newTeacherUserId: number,
  outcome: MutationOutcome
): MockLink.MockedResponse {
  return {
    request: {
      query: adminSessionReassignMutationDocument,
      variables: { input: { sessionId, newTeacherUserId } },
    },
    result: outcomeResult("adminReassignTeacher", outcome),
  };
}

function joinMock(sessionId: string, outcome: MutationOutcome): MockLink.MockedResponse {
  return {
    request: { query: adminSessionJoinMutationDocument, variables: { input: { sessionId } } },
    result: outcomeResult("adminJoinSession", outcome),
  };
}

// ---------------------------------------------------------------------------
// Render + interaction helpers

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

/** Renders the container under TestWrapper (LocaleProvider → emotion → theme). */
function renderGovernance(mocks: ReadonlyArray<MockLink.MockedResponse>, locale: AppLocale): RenderResult {
  return renderWithMocks(<AdminSessionGovernanceContainer />, mocks, locale);
}

/** Assertion-free read of a mutation operation's `x-idempotency-key` header. */
function contextIdempotencyKey(operation: ApolloLink.Operation): string | null {
  const headers: unknown = operation.getContext().headers;
  if (typeof headers !== "object" || headers === null) {
    return null;
  }
  const value = Object.entries(headers).find(([key]) => key === "x-idempotency-key")?.[1];
  return typeof value === "string" ? value : null;
}

/**
 * Renders the container with the idempotency key captured at the LINK tier:
 * a capturing `ApolloLink` wraps the `MockLink` and records the header each
 * mutation operation carries (the broadcasts compose-send precedent).
 */
function renderGovernanceWithCapture(
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale,
  onOperationSent: (idempotencyKey: string | null) => void
): RenderResult {
  const capture = new ApolloLink((operation, forward) => {
    onOperationSent(contextIdempotencyKey(operation));
    return forward(operation);
  });
  const link = ApolloLink.from([capture, new MockLink([...mocks])]);
  return renderWithWrapper(
    <MockedProvider link={link}>
      <AdminSessionGovernanceContainer />
    </MockedProvider>,
    { locale }
  );
}

/** Waits for a settled row and resolves it (the populated-arm prologue). */
async function waitForRow(sessionId: string): Promise<HTMLElement> {
  await waitFor(() => {
    expect(screen.getByTestId(`admin-session-row-${sessionId}`)).toBeDefined();
  });
  return screen.getByTestId(`admin-session-row-${sessionId}`);
}

/** Opens one row's kebab menu and resolves the menu portal. */
async function openRowMenu(sessionId: string): Promise<HTMLElement> {
  await waitForRow(sessionId);
  fireEvent.click(screen.getByTestId(`admin-session-actions-${sessionId}`));
  return await waitFor(() => screen.getByRole("menu"));
}

type KebabAction = "details" | "reschedule" | "cancel" | "reassign" | "join";

/**
 * Resolves one kebab item by testid. Disabled items stay clickable through
 * `fireEvent` (MUI blocks them at the handler seam via `aria-disabled`).
 */
function kebabItem(menu: HTMLElement, sessionId: string, action: KebabAction): HTMLElement {
  return within(menu).getByTestId(`admin-session-action-${sessionId}-${action}`);
}

/** Asserts the kebab gating matrix for ONE row's open menu. */
async function expectEligibility(
  sessionId: string,
  expected: { readonly details: boolean; readonly reschedule: boolean; readonly cancel: boolean; readonly reassign: boolean; readonly join: boolean }
): Promise<void> {
  const menu = await openRowMenu(sessionId);
  for (const [action, enabled] of Object.entries(expected) as ReadonlyArray<[KebabAction, boolean]>) {
    const item = kebabItem(menu, sessionId, action);
    expect(item.getAttribute("aria-disabled")).toBe(enabled ? null : "true");
  }
}

/** Resolves the count `<p>` of one summary card (count Typography precedes the label). */
function summaryCardCount(summary: HTMLElement, label: string): string {
  const card = within(summary).getByText(label).parentElement;
  if (card === null) {
    throw new Error(`summary card for "${label}" not found`);
  }
  return card.querySelector("p")?.textContent ?? "";
}

/** The dialog's start-field prefill converted the way the dialog submits it. */
function expectedSubmitIso(fixtureIso: string): string {
  return new Date(isoToDatetimeLocalToken(fixtureIso)).toISOString();
}

async function expectDialogOpen(): Promise<HTMLElement> {
  return await waitFor(() => screen.getByRole("dialog"));
}

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the FULL branch
// matrix while every case stays independently readable. STUI_LOCALE
// split-run guard: `componentSuiteLocales` carries the shared ar/en
// filtering (unset runs BOTH locales).
for (const locale of componentSuiteLocales) {
  const { t: ts, te, tc } = sessionSuiteLabels(locale);
  const t: AdminSessionGovernanceLabels = AdminSessionGovernanceNs.getLabels(getTranslations(locale));

  describe(`AdminSessionGovernanceContainer (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("branch 1 — query in flight renders the busy skeleton under the always-on chrome", () => {
      const { container } = renderGovernance([pendingDirectoryMock()], locale);

      const skeleton = screen.getByTestId("admin-session-governance-loading");
      expect(skeleton.getAttribute("aria-busy")).toBe("true");
      // No settled surface may leak into the skeleton.
      expect(container.querySelector("[data-testid='admin-session-governance-empty']")).toBeNull();
      expect(container.querySelector("[data-testid='admin-session-governance-error']")).toBeNull();
      expect(container.querySelector("[data-testid^='admin-session-row-']")).toBeNull();
      // The chrome NEVER drops — title + honest-count bar + filter bar stay
      // mounted even on the skeleton.
      expect(container.querySelector("[data-testid='admin-session-governance-view']")).not.toBeNull();
      expect(screen.getByText(t.pageTitle)).toBeDefined();
      expect(screen.getByTestId("admin-session-governance-count").textContent).toBe(t.countLine(0));
      expect(screen.getByTestId("admin-session-governance-filters")).not.toBeNull();
    });

    test("branch 2 — 403/FORBIDDEN directory error renders the shared tenant-denial fallback", async () => {
      const { container } = renderGovernance([directoryErrorMock("FORBIDDEN")], locale);

      await waitFor(() => {
        expect(screen.getByText(te.forbiddenRole)).toBeDefined();
        expect(screen.getByText(te.forbidden)).toBeDefined();
      });
      // The deny surface REPLACES the body only — the chrome stays mounted.
      expect(container.querySelector("[data-testid='admin-session-governance-view']")).not.toBeNull();
      expect(container.querySelector("[data-testid='admin-session-governance-loading']")).toBeNull();
      expect(screen.getByText(t.pageTitle)).toBeDefined();
    });

    test("branch 3 — masked INTERNAL_SERVER_ERROR surfaces the inline retry alert", async () => {
      const { container } = renderGovernance([directoryErrorMock("INTERNAL_SERVER_ERROR")], locale);

      await waitFor(() => {
        expect(screen.getByTestId("admin-session-governance-error")).toBeDefined();
      });
      // The title renders twice (AlertTitle + body line) — never the server message.
      expect(screen.getAllByText(t.errorTitle).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole("button", { name: t.retryLabel })).toBeDefined();
      // The permission fallback must NOT appear for non-deny codes.
      expect(screen.queryByText(te.forbiddenRole)).toBeNull();
      expect(container.querySelector("[data-testid='admin-session-governance-view']")).not.toBeNull();
    });

    test("branch 4 — drained directory renders the generic empty state; no pager", async () => {
      const { container } = renderGovernance([directoryMock(1, [], 0)], locale);

      const emptyState = await waitFor(() => screen.getByTestId("admin-session-governance-empty"));
      // Scoped INSIDE the empty surface: at a zero count the chrome's
      // countLine(0) renders the SAME Arabic zero-plural copy as the empty
      // title — the assertion is scoped so the chrome never races it.
      expect(within(emptyState).getByText(t.emptyTitle)).toBeDefined();
      expect(within(emptyState).getByText(t.emptyBody)).toBeDefined();
      expect(container.querySelector("[data-testid='admin-session-governance-loading']")).toBeNull();
      expect(container.querySelector("[data-testid='admin-session-governance-view']")).not.toBeNull();
      expect(screen.getByTestId("admin-session-governance-count").textContent).toBe(t.countLine(0));
      expect(document.querySelector("[data-testid='admin-session-governance-pager']")).toBeNull();
    });

    test("branch 5 — status filter APPLY re-keys the query → filtered-empty copy; RESET restores it", async () => {
      renderGovernance(
        [
          directoryMock(1, [], 0, statusFilter(SessionStatus.Disputed)),
          directoryMock(1, [], 0),
          directoryMock(1, [], 0),
        ],
        locale
      );

      // Initial load: unfiltered and empty → the generic copy (scoped INSIDE
      // the empty surface — the chrome's countLine(0) zero-plural collides
      // with the generic title in the Arabic locale).
      const genericEmpty = await waitFor(() => screen.getByTestId("admin-session-governance-empty"));
      expect(within(genericEmpty).getByText(t.emptyTitle)).toBeDefined();

      // Pick Disputed in the status select — a plain click never opens the
      // MUI listbox under Happy DOM; mouseDown does (broadcast compose
      // precedent). The open handler lives on the INNER `role="combobox"`
      // SelectInput display div, while `data-testid` on `<Select>` lands on
      // the OUTER MuiInputBase-root wrapper (MUI v9 forwards extra props to
      // the input component) — a mouseDown there bubbles UP past the child
      // handler, so the open MUST target the combobox itself, resolved by
      // its InputLabel-driven accessible name (the type select is the only
      // other combobox on the surface).
      fireEvent.mouseDown(screen.getByRole("combobox", { name: t.filterStatusLabel }));
      // The FIRST listbox open of the run pays the cold-start module warm-up
      // (observed >1s under ar on constrained runners) — an explicit budget
      // keeps the arm deterministic without loosening its assertion.
      const option = await waitFor(() => screen.getByRole("option", { name: ts.statusDisputed }), { timeout: 4000 });
      fireEvent.click(option);
      fireEvent.click(screen.getByTestId("admin-session-governance-filters-apply"));

      // The re-keyed query answered empty → the FILTERED copy explains why.
      const filteredEmpty = await waitFor(() => screen.getByTestId("admin-session-governance-empty"));
      expect(within(filteredEmpty).getByText(t.filteredEmptyTitle)).toBeDefined();
      expect(within(filteredEmpty).getByText(t.filteredEmptyBody)).toBeDefined();
      expect(within(filteredEmpty).queryByText(t.emptyTitle)).toBeNull();

      // RESET restores the unfiltered directory AND the generic copy.
      fireEvent.click(screen.getByTestId("admin-session-governance-filters-reset"));
      const restoredEmpty = await waitFor(() => {
        const el = screen.getByTestId("admin-session-governance-empty");
        expect(within(el).getByText(t.emptyTitle)).toBeDefined();
        return el;
      });
      expect(within(restoredEmpty).queryByText(t.filteredEmptyTitle)).toBeNull();
    });

    test("branch 6 — populated directory: badge matrix, verbatim fee, derived duration, summary strip, honest count", async () => {
      renderGovernance([directoryMock(1, PAGE_ROWS, PAGE_ROWS.length)], locale);

      await waitFor(() => {
        expect(screen.getByTestId(`admin-session-row-${FIRST_ROW_ID}`)).toBeDefined();
      });
      expect(screen.getByText(t.pageTitle)).toBeDefined();
      expect(screen.getByTestId("admin-session-governance-count").textContent).toBe(t.countLine(PAGE_ROWS.length));
      expect(screen.getByTestId("admin-session-governance-filters")).not.toBeNull();

      // Badge matrix — every lifecycle status chip renders through the shared
      // status vocabulary inside its own row.
      const statusLabels: ReadonlyArray<[string, string]> = [
        [SCHEDULED_FRESH_ID, ts.statusScheduled],
        [SCHEDULED_LAPSED_ID, ts.statusScheduled],
        [STARTED_ID, ts.statusStarted],
        [COMPLETED_ID, ts.statusCompleted],
        [CANCELLED_ID, ts.statusCancelled],
        [DISPUTED_ID, ts.statusDisputed],
      ];
      for (const [sessionId, label] of statusLabels) {
        const row = screen.getByTestId(`admin-session-row-${sessionId}`);
        expect(within(row).getByText(label)).toBeDefined();
        expect(within(row).getByTestId("admin-session-status-chip")).not.toBeNull();
      }

      // needsAttention: the lapsed-deadline scheduled row carries the warning
      // badge; every other row renders none.
      expect(screen.getByTestId(`admin-session-needs-attention-${SCHEDULED_LAPSED_ID}`)).not.toBeNull();
      expect(screen.queryByTestId(`admin-session-needs-attention-${SCHEDULED_FRESH_ID}`)).toBeNull();
      expect(screen.queryByTestId(`admin-session-needs-attention-${STARTED_ID}`)).toBeNull();

      // Per-row verbatim content: fee + currency, participant ids, intent.
      for (const row of PAGE_ROWS) {
        const rowEl = screen.getByTestId(`admin-session-row-${row.id}`);
        expect(within(rowEl).getAllByText(`${row.fee} ${SESSION_FEE_CURRENCY}`).length).toBeGreaterThanOrEqual(1);
        expect(within(rowEl).getByText(`${row.studentId} · ${row.teacherId}`)).toBeDefined();
        expect(within(rowEl).getByText(row.sessionType)).toBeDefined();
      }

      // Derived duration (90 min) + locale stamps on the fresh scheduled row.
      const freshRow = screen.getByTestId(`admin-session-row-${SCHEDULED_FRESH_ID}`);
      expect(within(freshRow).getByText(t.rowDurationLabel)).toBeDefined();
      expect(within(freshRow).getByText(t.durationMinutesValue(90))).toBeDefined();
      expect(within(freshRow).getAllByText(expectedStamp(FUTURE_START_ISO, locale)).length).toBeGreaterThanOrEqual(1);
      expect(within(freshRow).getAllByText(expectedStamp(CREATED_ISO, locale)).length).toBeGreaterThanOrEqual(1);

      // Nullable lifecycle stamps collapse to the placeholder (cancelled row:
      // no start, no end, no deadline, no derived duration → four dashes).
      const cancelledRow = screen.getByTestId(`admin-session-row-${CANCELLED_ID}`);
      expect(within(cancelledRow).getByText(ts.statusCancelled)).toBeDefined();
      expect(within(cancelledRow).getAllByText(EM_DASH).length).toBeGreaterThanOrEqual(1);

      // Summary strip: per-status counts over the LOADED page + the
      // needs-attention card + the scope hint.
      const summary = screen.getByTestId("admin-session-governance-summary");
      expect(summaryCardCount(summary, ts.statusScheduled)).toBe("2");
      expect(summaryCardCount(summary, ts.statusStarted)).toBe("1");
      expect(summaryCardCount(summary, ts.statusCompleted)).toBe("1");
      expect(summaryCardCount(summary, ts.statusCancelled)).toBe("1");
      expect(summaryCardCount(summary, ts.statusDisputed)).toBe("1");
      expect(summaryCardCount(summary, t.needsAttentionLabel)).toBe("1");
      expect(within(summary).getByText(t.summaryScopeHint)).toBeDefined();

      // Six rows span one page — no pager below the list.
      expect(document.querySelector("[data-testid='admin-session-governance-pager']")).toBeNull();
    });

    test("branch 7 — pager: honest total spans two pages; next/prev re-key the directory variables", async () => {
      renderGovernance(
        [directoryMock(1, PAGE_ROWS, 30), directoryMock(2, TRAILING_ROWS, 30), directoryMock(1, PAGE_ROWS, 30)],
        locale
      );

      await waitForRow(FIRST_ROW_ID);
      const pager = screen.getByTestId("admin-session-governance-pager");
      expect(within(pager).getByText("1 / 2")).toBeDefined();
      const prev = screen.getByTestId("admin-session-governance-pager-prev");
      const next = screen.getByTestId("admin-session-governance-pager-next");
      expect(prev.getAttribute("disabled")).not.toBeNull();
      expect(next.getAttribute("disabled")).toBeNull();

      // Forward: page 2 answers the re-keyed variables with its own rows.
      fireEvent.click(next);
      await waitFor(() => {
        expect(screen.getByTestId("admin-session-row-7307")).toBeDefined();
      });
      expect(screen.getByTestId("admin-session-row-7308")).toBeDefined();
      expect(within(screen.getByTestId("admin-session-governance-pager")).getByText("2 / 2")).toBeDefined();
      expect(screen.getByTestId("admin-session-governance-pager-prev").getAttribute("disabled")).toBeNull();

      // Back: page 1 re-serves (cache or mock safety net — same observable state).
      fireEvent.click(screen.getByTestId("admin-session-governance-pager-prev"));
      await waitFor(() => {
        expect(screen.getByTestId(`admin-session-row-${FIRST_ROW_ID}`)).toBeDefined();
      });
      expect(within(screen.getByTestId("admin-session-governance-pager")).getByText("1 / 2")).toBeDefined();
    });

    test("branch 8 — kebab eligibility matrix: disabled-with-hint vs enabled across the lifecycle", async () => {
      // One render per status keeps the open menus isolated (each iteration
      // cleans up before the next render mounts a fresh directory).
      const cases: ReadonlyArray<{
        readonly row: RowFixture;
        readonly expected: { details: boolean; reschedule: boolean; cancel: boolean; reassign: boolean; join: boolean };
      }> = [
        { row: rowFixture({ id: SCHEDULED_FRESH_ID }), expected: { details: true, reschedule: true, cancel: true, reassign: true, join: false } },
        { row: rowFixture({ id: STARTED_ID, status: SessionStatus.Started, startedAt: PAST_START_ISO, endedAt: null }), expected: { details: true, reschedule: true, cancel: true, reassign: false, join: true } },
        { row: rowFixture({ id: COMPLETED_ID, status: SessionStatus.Completed, startedAt: PAST_START_ISO, endedAt: PAST_END_ISO }), expected: { details: true, reschedule: false, cancel: false, reassign: false, join: false } },
        { row: rowFixture({ id: CANCELLED_ID, status: SessionStatus.Cancelled, startedAt: null, endedAt: null }), expected: { details: true, reschedule: false, cancel: false, reassign: false, join: false } },
        { row: rowFixture({ id: DISPUTED_ID, status: SessionStatus.Disputed, startedAt: PAST_START_ISO, endedAt: null }), expected: { details: true, reschedule: false, cancel: false, reassign: false, join: false } },
      ];
      for (const scenario of cases) {
        renderGovernance([directoryMock(1, [scenario.row], 1)], locale);
        await expectEligibility(scenario.row.id, scenario.expected);
        cleanup();
      }
    });

    test("branch 9 — reschedule dialog: open from kebab, prefilled pair, past-start client gate blocks BEFORE the wire", async () => {
      // NO reschedule mock is chained: a leaked wire call from the gated
      // submit would surface as an unmatched MockLink operation and fail
      // the branch (no error snackbar may appear either).
      renderGovernance([directoryMock(1, [rowFixture({ id: SCHEDULED_LAPSED_ID, startedAt: PAST_START_ISO, endedAt: PAST_END_ISO, confirmationDeadline: LAPSED_DEADLINE_ISO, needsAttention: true })], 1)], locale);

      const menu = await openRowMenu(SCHEDULED_LAPSED_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_LAPSED_ID, "reschedule"));
      const dialog = await expectDialogOpen();

      expect(within(dialog).getByRole("heading", { name: t.rescheduleTitle })).toBeDefined();
      expect(within(dialog).getByText(t.rescheduleBody)).toBeDefined();
      // MUI TextField renders its label twice in the DOM (visible label +
      // fieldset legend notch) — the FIELD is resolved through the label
      // association (getByLabelText), never through a root-wrapper testid.
      const startInput = within(dialog).getByLabelText(muiLabelPattern(t.rescheduleStartLabel));
      expect((startInput as HTMLInputElement).value).toBe(isoToDatetimeLocalToken(PAST_START_ISO));
      const endInput = within(dialog).getByLabelText(muiLabelPattern(t.rescheduleEndLabel));
      expect((endInput as HTMLInputElement).value).toBe(isoToDatetimeLocalToken(PAST_END_ISO));
      expect(within(dialog).getByTestId("reschedule-session-submit").getAttribute("disabled")).toBeNull();

      fireEvent.click(within(dialog).getByTestId("reschedule-session-submit"));
      expect(within(dialog).getByText(te.sessionRescheduleStartInPast)).toBeDefined();
      expect(startInput.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.queryByText(t.errorTitle)).toBeNull();

      // Clean dismissal through the Common-namespace cancel — no wire call.
      fireEvent.click(within(dialog).getByRole("button", { name: tc.cancel }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(screen.getByTestId(`admin-session-row-${SCHEDULED_LAPSED_ID}`)).toBeDefined();
    });

    test("branch 10 — reschedule confirm: prefilled valid pair fires AdminSessionReschedule with ISO instants", async () => {
      renderGovernance(
        [
          directoryMock(1, [rowFixture({ id: SCHEDULED_FRESH_ID })], 1),
          rescheduleMock(
            SCHEDULED_FRESH_ID,
            expectedSubmitIso(FUTURE_START_ISO),
            expectedSubmitIso(FUTURE_END_ISO),
            { kind: "error", code: "SESSION_INVALID_TRANSITION" }
          ),
        ],
        locale
      );

      const menu = await openRowMenu(SCHEDULED_FRESH_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_FRESH_ID, "reschedule"));
      const dialog = await expectDialogOpen();
      fireEvent.click(within(dialog).getByTestId("reschedule-session-submit"));

      // The raced-transition code closes the dialog with the error snackbar
      // (the container's race arm) — a variables mismatch would surface the
      // generic masked copy instead and fail the branch.
      await waitFor(() => {
        expect(screen.getByText(te.sessionInvalidTransition)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.sessionInvalidTransition)).toContain("MuiAlert-colorError");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(screen.getByTestId(`admin-session-row-${SCHEDULED_FRESH_ID}`)).toBeDefined();
    });

    test("branch 11 — cancel dialog: optional-reason seam, empty submit sends reason:null, 403 snackbar keeps it open", async () => {
      renderGovernance(
        [
          directoryMock(1, [STARTED_DETAIL], 1),
          cancelMock(STARTED_ID, null, { kind: "error", code: "FORBIDDEN" }),
        ],
        locale
      );

      const menu = await openRowMenu(STARTED_ID);
      fireEvent.click(kebabItem(menu, STARTED_ID, "cancel"));
      const dialog = await expectDialogOpen();

      expect(within(dialog).getByRole("heading", { name: t.cancelTitle })).toBeDefined();
      expect(within(dialog).getByText(t.cancelBody)).toBeDefined();
      const reasonField = within(dialog).getByLabelText(t.cancelReasonLabel);
      expect(reasonField).toBeDefined();
      // The reason seam: hard clamp at the input + live RAW-character counter.
      const reasonInput = within(dialog).getByRole("textbox");
      expect(reasonInput.getAttribute("maxlength")).toBe(String(MAX_CANCEL_REASON_LENGTH));
      expect(within(dialog).getByText(`0/${MAX_CANCEL_REASON_LENGTH}`)).toBeDefined();

      fireEvent.click(within(dialog).getByTestId(`cancel-session-submit-${STARTED_ID}`));

      // The tenant-denial code surfaces the localized error snackbar and the
      // dialog STAYS open for a corrected submit (retryable arm).
      await waitFor(() => {
        expect(screen.getByText(te.forbidden)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.forbidden)).toContain("MuiAlert-colorError");
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByTestId(`admin-session-row-${STARTED_ID}`)).toBeDefined();
    });

    test("branch 12 — cancel idempotency: x-idempotency-key captured at the link tier, NOT rotated on a failed retry", async () => {
      const capturedKeys: Array<string | null> = [];
      const onOperationSent = (key: string | null): void => {
        capturedKeys.push(key);
      };
      renderGovernanceWithCapture(
        [
          directoryMock(1, [STARTED_DETAIL], 1),
          cancelMock(STARTED_ID, null, { kind: "error", code: "FORBIDDEN" }),
          cancelMock(STARTED_ID, null, { kind: "error", code: "FORBIDDEN" }),
        ],
        locale,
        onOperationSent
      );

      const menu = await openRowMenu(STARTED_ID);
      fireEvent.click(kebabItem(menu, STARTED_ID, "cancel"));
      const dialog = await expectDialogOpen();

      const nonNullKeys = (): string[] => capturedKeys.filter((key): key is string => key !== null);
      expect(nonNullKeys()).toHaveLength(0);

      fireEvent.click(within(dialog).getByTestId(`cancel-session-submit-${STARTED_ID}`));
      await waitFor(() => {
        expect(screen.getByText(te.forbidden)).toBeDefined();
      });
      const firstAttempt = nonNullKeys();
      expect(firstAttempt).toHaveLength(1);

      // The retried submit keeps the SAME claim (rotation happens only on
      // success — the server replay dedupe stays effective).
      fireEvent.click(within(screen.getByRole("dialog")).getByTestId(`cancel-session-submit-${STARTED_ID}`));
      await waitFor(() => {
        expect(nonNullKeys()).toHaveLength(2);
      });
      expect(nonNullKeys()[1]).toBe(firstAttempt[0]);
    });

    test("branch 13 — reassign dialog: open from kebab, whole-number id submit path, TEACHER_NOT_CERTIFIED keeps it open", async () => {
      renderGovernance(
        [
          directoryMock(1, [rowFixture({ id: SCHEDULED_FRESH_ID })], 1),
          reassignMock(SCHEDULED_FRESH_ID, 907, { kind: "error", code: "TEACHER_NOT_CERTIFIED" }),
        ],
        locale
      );

      const menu = await openRowMenu(SCHEDULED_FRESH_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_FRESH_ID, "reassign"));
      const dialog = await expectDialogOpen();

      expect(within(dialog).getByRole("heading", { name: t.reassignTitle })).toBeDefined();
      expect(within(dialog).getByText(t.reassignBody)).toBeDefined();
      expect(within(dialog).getByText(t.reassignTeacherIdLabel)).toBeDefined();
      const idInput = within(dialog).getByLabelText(muiLabelPattern(t.reassignTeacherIdLabel));
      expect(within(dialog).getByTestId(`reassign-teacher-submit-${SCHEDULED_FRESH_ID}`).getAttribute("disabled")).not.toBeNull();

      fireEvent.change(idInput, { target: { value: "907" } });
      const submit = within(dialog).getByTestId(`reassign-teacher-submit-${SCHEDULED_FRESH_ID}`);
      await waitFor(() => {
        expect(submit.getAttribute("disabled")).toBeNull();
      });
      fireEvent.click(submit);

      // The certification gate stays server-owned: the localized denial
      // surfaces as a snackbar and the dialog STAYS open for a corrected id.
      await waitFor(() => {
        expect(screen.getByText(te.teacherNotCertified)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.teacherNotCertified)).toContain("MuiAlert-colorError");
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    test("branch 14 — join observation: drawer banner fires AdminSessionJoin; 403 snackbar keeps the banner", async () => {
      renderGovernance(
        [
          directoryMock(1, [STARTED_DETAIL], 1),
          detailMock(STARTED_DETAIL),
          joinMock(STARTED_ID, { kind: "error", code: "FORBIDDEN" }),
        ],
        locale
      );

      const menu = await openRowMenu(STARTED_ID);
      fireEvent.click(kebabItem(menu, STARTED_ID, "details"));
      await waitFor(() => {
        expect(screen.getByTestId("admin-session-detail-body")).toBeDefined();
      });
      expect(screen.getByTestId(`join-observation-banner-${STARTED_ID}`)).not.toBeNull();

      fireEvent.click(screen.getByTestId(`join-observation-confirm-${STARTED_ID}`));

      // The denied join surfaces the localized snackbar; the banner and the
      // read-only detail view stay mounted for a retry.
      await waitFor(() => {
        expect(screen.getByText(te.forbidden)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.forbidden)).toContain("MuiAlert-colorError");
      expect(screen.getByTestId(`join-observation-banner-${STARTED_ID}`)).not.toBeNull();
      expect(screen.getByTestId("admin-session-detail-body")).not.toBeNull();
    });

    test("branch 15 — absent-row drawer body: adminSession null renders data-absence, never an error", async () => {
      renderGovernance([directoryMock(1, [STARTED_DETAIL], 1), detailMock(null)], locale);

      const menu = await openRowMenu(STARTED_ID);
      fireEvent.click(kebabItem(menu, STARTED_ID, "details"));
      await waitFor(() => {
        expect(screen.getByTestId("admin-session-detail-missing")).toBeDefined();
      });
      expect(screen.getByText(t.detailMissingBody)).toBeDefined();
      // No join banner and no error surface on the absence body.
      expect(screen.queryByTestId(`join-observation-banner-${STARTED_ID}`)).toBeNull();
      expect(screen.queryByTestId("admin-session-detail-error")).toBeNull();

      fireEvent.click(screen.getByTestId("admin-session-detail-close"));
      // Close-path assertions stay SYNCHRONOUS: the MUI exit transition
      // never settles under Happy DOM, so a removal `waitFor` turns into an
      // unbounded mutation-churn loop (observed RSS balloon → process kill).
      // The operator-observable outcome is pinned instead: no error surface,
      // and the directory row the operator returns to stays mounted.
      expect(screen.queryByTestId("admin-session-detail-error")).toBeNull();
      expect(screen.getByTestId(`admin-session-row-${STARTED_ID}`)).toBeDefined();
    });

    test("branch 16 — cancel submit SUCCESS: dialog closes, success snackbar, row chip flips via cache merge", async () => {
      renderGovernance(
        [directoryMock(1, [STARTED_DETAIL], 1), cancelMock(STARTED_ID, null, { kind: "success", payload: cancelledPayload(STARTED_ID) })],
        locale
      );

      const menu = await openRowMenu(STARTED_ID);
      fireEvent.click(kebabItem(menu, STARTED_ID, "cancel"));
      const dialog = await expectDialogOpen();
      fireEvent.click(within(dialog).getByTestId(`cancel-session-submit-${STARTED_ID}`));

      // Positive-signal waits + synchronous removal pin (the sibling-container
      // convention — cf. StudentSessionsContainer branch 8): the success
      // snackbar and the cache-merged row chip are the deterministic outcome
      // signals; the dialog's removal is pinned synchronously AFTER them. A
      // removal `waitFor` across the MUI exit transition churns unbounded
      // under Happy DOM (observed RSS balloon → process kill), so no observer
      // polls the exit — the fail-safe direction is preserved: a still-mounted
      // dialog fails the sync assert.
      await waitFor(() => {
        expect(screen.getByText(t.cancelSuccess)).toBeDefined();
      });
      expect(snackbarSeverityClass(t.cancelSuccess)).toContain("MuiAlert-colorSuccess");
      // The normalized payload converged the row by id — no refetch.
      await waitFor(() => {
        expect(within(screen.getByTestId(`admin-session-row-${STARTED_ID}`)).getByText(ts.statusCancelled)).toBeDefined();
      });
      expect(within(screen.getByTestId(`admin-session-row-${STARTED_ID}`)).queryByText(ts.statusStarted)).toBeNull();
      // The exit transition has resolved by the outcome signals above —
      // pin the dialog's departure synchronously.
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("branch 17 — join confirm SUCCESS: banner unmounts while the drawer stays open", async () => {
      renderGovernance(
        [directoryMock(1, [STARTED_DETAIL], 1), detailMock(STARTED_DETAIL), joinMock(STARTED_ID, { kind: "success", payload: STARTED_DETAIL })],
        locale
      );

      const menu = await openRowMenu(STARTED_ID);
      fireEvent.click(kebabItem(menu, STARTED_ID, "details"));
      await waitFor(() => {
        expect(screen.getByTestId("admin-session-detail-body")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId(`join-observation-confirm-${STARTED_ID}`));
      await waitFor(() => {
        expect(screen.queryByTestId(`join-observation-banner-${STARTED_ID}`)).toBeNull();
      });
      await waitFor(() => {
        expect(screen.getByText(t.joinSuccess)).toBeDefined();
      });
      expect(snackbarSeverityClass(t.joinSuccess)).toContain("MuiAlert-colorSuccess");
      // Observation continues — the read-only detail view is untouched.
      expect(screen.getByTestId("admin-session-detail-body")).not.toBeNull();
    });

    test("branch 18 — reassign confirm SUCCESS: dialog closes + success snackbar, row converged", async () => {
      renderGovernance(
        [
          directoryMock(1, [rowFixture({ id: SCHEDULED_FRESH_ID })], 1),
          reassignMock(SCHEDULED_FRESH_ID, 907, { kind: "success", payload: rowFixture({ id: SCHEDULED_FRESH_ID, teacherId: "907" }) }),
        ],
        locale
      );

      const menu = await openRowMenu(SCHEDULED_FRESH_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_FRESH_ID, "reassign"));
      const dialog = await expectDialogOpen();
      fireEvent.change(within(dialog).getByLabelText(muiLabelPattern(t.reassignTeacherIdLabel)), { target: { value: "907" } });
      fireEvent.click(within(dialog).getByTestId(`reassign-teacher-submit-${SCHEDULED_FRESH_ID}`));

      // Branch-16 close-path discipline (positive-signal waits + synchronous
      // removal pin): the success snackbar and the converged row are the
      // deterministic outcome signals — no observer polls the MUI exit
      // transition (unbounded churn under Happy DOM); a still-mounted dialog
      // fails the sync removal assert.
      await waitFor(() => {
        expect(screen.getByText(t.reassignSuccess)).toBeDefined();
      });
      expect(snackbarSeverityClass(t.reassignSuccess)).toContain("MuiAlert-colorSuccess");
      await waitFor(() => {
        expect(within(screen.getByTestId(`admin-session-row-${SCHEDULED_FRESH_ID}`)).getByText("401 · 907")).toBeDefined();
      });
      // The exit transition has resolved by the outcome signals above —
      // pin the dialog's departure synchronously.
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
}

