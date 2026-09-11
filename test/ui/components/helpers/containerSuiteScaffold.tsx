/**
 * Shared scaffolding for the sessions-family component suites
 * (`StudentSessionsContainer`, `TeacherSessionsContainer`,
 * `AdminDisputesContainer`, `TeacherWalletContainer` suite bodies).
 *
 * Every hour of the four sessions-family suites used to repeat the same wiring: the
 * lazily-bound `screen` proxy, the MockedProvider render helper, the
 * `Intl.DateTimeFormat` stamp oracle, the STUI_LOCALE locale-run filter, the
 * locale label resolution, the session wire-row fixture builder, and the
 * whole dispute/cancel dialog interaction vocabulary. Those blocks now live
 * HERE exactly once; the suites keep only their per-container fixtures,
 * documents, and branch-specific assertions. The admin session-governance
 * suites additionally share their namespace warming, the
 * 21-field governance wire-row fixture + moments, and the cancel/reassign
 * mutation mock builders (the governance section below).
 *
 * Import contract: suites consume this module ONLY through the barrel
 * (`@/test/ui/components/helpers`). The module is evaluated lazily — the
 * suite bootstrap entries register the Happy-DOM document BEFORE the suite
 * (and therefore this module) is imported, the same ordering guarantee the
 * local helpers used to enjoy inline.
 */

import { expect } from "bun:test";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import {
  fireEvent,
  getQueriesForElement,
  type RenderResult,
  type Screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import {
  type AdminSessionsQuery_adminSessions_items,
  SessionIntent,
  SessionStatus,
  SessionType,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminSessionCancelMutationDocument,
  adminSessionReassignMutationDocument,
} from "@/frontend/graphql/sharedDocuments";
import { MAX_DISPUTE_REASON_LENGTH } from "@/frontend/views/student/sessions/SessionDisputeConfirmDialog";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import { AdminSessionGovernance as AdminSessionGovernanceNs } from "@/shared/locale/namespaces/adminSessionGovernance";
import { Common as CommonNs } from "@/shared/locale/namespaces/common";
import { Errors as ErrorsNs } from "@/shared/locale/namespaces/errors";
import { Sessions as SessionsNs } from "@/shared/locale/namespaces/sessions";
import { getTranslations } from "@/shared/locale/server";
import type { CommonLabels } from "@/shared/locale/types/common";
import type { ErrorsLabels } from "@/shared/locale/types/errors";
import type { SessionsLabels } from "@/shared/locale/types/sessions";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ---------------------------------------------------------------------------
// Live-DOM screen + render

/**
 * Lazily-bound `screen` replacement.
 *
 * WHY not `import { screen } from "@testing-library/react"`: RTL binds its
 * `screen` singleton ONCE, at the moment `@testing-library/dom/screen.js` is
 * first evaluated (`typeof document === "undefined" ? throwing-stub :
 * getQueriesForElement(document.body)`). Binding through
 * `getQueriesForElement(document.body)` on EVERY property access resolves
 * against the live DOM under BOTH runners (the per-suite bootstrap AND the
 * official `test:ui:components` CLI preloads) regardless of import order.
 */
export const liveScreen: Screen = new Proxy(Object.create(null), {
  get: (_target, property, receiver) => Reflect.get(getQueriesForElement(document.body), property, receiver),
});

/** Renders `ui` under MockedProvider(mocksCopy) + TestWrapper (LocaleProvider → emotion → theme). */
export function renderWithMocks(
  ui: ReactElement,
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale
): RenderResult {
  return renderWithWrapper(<MockedProvider mocks={[...mocks]}>{ui}</MockedProvider>, { locale });
}

// ---------------------------------------------------------------------------
// Stamp oracle + snackbar assertions

/**
 * Recomputes a timestamp stamp independently of the implementation
 * (byte-consistent clone of `formatApplicantDate`'s documented option set).
 */
export function expectedStamp(iso: string, locale: AppLocale): string {
  const formatter = new Intl.DateTimeFormat(locale === "en" ? "en" : "ar", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(new Date(iso));
}

/**
 * MUI required-field label matcher — a `required` MUI TextField appends an
 * aria-hidden asterisk to the visible InputLabel, so an exact-string
 * `getByLabelText` misses the label association. The returned pattern
 * matches the label text with an OPTIONAL trailing asterisk (any
 * whitespace separation) at the standard query-normalizer granularity.
 */
export function muiLabelPattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\s*\\*?$`);
}

/**
 * Resolves the MUI severity class of the snackbar Alert currently showing
 * `text` (`MuiAlert-colorSuccess` / `colorError` / `colorInfo` families).
 */
export function snackbarSeverityClass(text: string): string {
  return liveScreen.getByText(text).closest(".MuiAlert-root")?.className ?? "";
}

/** Waits for the snackbar carrying `text`, then pins its MUI severity class. */
async function expectSnackbar(text: string, severityClass: string): Promise<void> {
  await waitFor(() => {
    expect(liveScreen.getByText(text)).toBeDefined();
  });
  expect(snackbarSeverityClass(text)).toContain(severityClass);
}

/** Waits for the dialog to close AND the snackbar `text` (no severity pin — the arm asserts none). */
export async function expectDialogClosedAndNotice(text: string): Promise<void> {
  await waitFor(() => {
    expect(liveScreen.queryByRole("dialog")).toBeNull();
  });
  await waitFor(() => {
    expect(liveScreen.getByText(text)).toBeDefined();
  });
}

/** Waits for the dialog to close AND the snackbar `text`, then pins its severity class. */
export async function expectDialogClosedAndSnackbar(text: string, severityClass: string): Promise<void> {
  await expectDialogClosedAndNotice(text);
  expect(snackbarSeverityClass(text)).toContain(severityClass);
}

// ---------------------------------------------------------------------------
// Locale-run scaffolding

/**
 * STUI_LOCALE split-run guard: when set ("ar" | "en"), one bun invocation
 * executes ONLY that locale's block (the sanctioned OOM relief shared by the
 * sibling suites). Unset (default) runs BOTH locales.
 */
export const componentSuiteLocales: ReadonlyArray<AppLocale> = process.env.STUI_LOCALE
  ? (["ar", "en"] as AppLocale[]).filter(candidate => candidate === process.env.STUI_LOCALE)
  : (["ar", "en"] as AppLocale[]);

/** The Sessions + Errors + Common label objects the sessions-family suites assert against. */
export interface SessionSuiteLabels {
  readonly t: SessionsLabels;
  readonly te: ErrorsLabels;
  readonly tc: CommonLabels;
}

/** Resolves all three label objects for one locale from the PRELOADED translations. */
export function sessionSuiteLabels(locale: AppLocale): SessionSuiteLabels {
  return {
    t: SessionsNs.getLabels(getTranslations(locale)),
    te: ErrorsNs.getLabels(getTranslations(locale)),
    tc: CommonNs.getLabels(getTranslations(locale)),
  };
}

// ---------------------------------------------------------------------------
// Session wire fixtures

/** Typographic no-value placeholder the session/dispute rows render (NOT locale copy). */
const EM_DASH_PLACEHOLDER = "—";

/** Exact variables the list containers send for the unfiltered stateful query. */
export const ALL_SESSIONS_LIST_VARIABLES = { filter: null, page: null, pageSize: null };

/**
 * Exact variables the list containers send once a status chip is active —
 * the filtered-empty branches click a chip and the query re-keys to THESE.
 */
export function filteredSessionsListVariables(status: SessionStatus): {
  filter: { status: SessionStatus };
  page: null;
  pageSize: null;
} {
  return { filter: { status }, page: null, pageSize: null };
}

/**
 * The closed 20-field session wire shape every sessions-family row payload
 * shares (the student list, teacher list and admin-disputed item types are
 * structurally identical on the wire). `__typename` mirrors what Apollo
 * Server puts on the wire; it is what makes the `Session:<id>` entity
 * normalizable so the dialogs' cache `update`/eviction arms converge the
 * list WITHOUT refetch.
 */
export interface SessionWireRow {
  readonly __typename: "Session";
  readonly id: string;
  readonly status: SessionStatus;
  readonly intent: SessionIntent | null;
  readonly sessionType: SessionType;
  readonly fee: string | null;
  readonly feeHeld: boolean;
  readonly studentId: string;
  readonly teacherId: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly confirmationDeadline: string | null;
  readonly confirmedByStudentAt: string | null;
  readonly confirmedByTeacherAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cancelReason: string | null;
  readonly disputeReason: string | null;
  readonly disputedAt: string | null;
  readonly resolutionNote: string | null;
  readonly resolvedAt: string | null;
}

/** The per-suite defaults the closed wire shape varies by (id + the two timestamps). */
export interface SessionWireRowDefaults {
  readonly id: string;
  readonly createdIso: string;
  readonly deadlineIso: string | null;
}

/** Deterministic payload builder mirroring the closed session wire shape. */
export function buildSessionWireRow(
  defaults: SessionWireRowDefaults,
  overrides?: Partial<SessionWireRow>
): SessionWireRow {
  return {
    __typename: "Session",
    id: defaults.id,
    status: SessionStatus.Scheduled,
    intent: SessionIntent.Hifz,
    sessionType: SessionType.StudentSession,
    fee: "150.50",
    feeHeld: true,
    studentId: "401",
    teacherId: "802",
    startedAt: null,
    endedAt: null,
    confirmationDeadline: defaults.deadlineIso,
    confirmedByStudentAt: null,
    confirmedByTeacherAt: null,
    createdAt: defaults.createdIso,
    updatedAt: defaults.createdIso,
    // Dispute/cancel-audit columns — nullable, defaulted off.
    cancelReason: null,
    disputeReason: null,
    disputedAt: null,
    resolutionNote: null,
    resolvedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Session row + toolbar assertions

/** The per-row wire values the shared meta assertions read. */
export type SessionRowWireValues = Pick<SessionWireRow, "fee" | "confirmationDeadline" | "createdAt" | "intent">;

/** The Sessions-label slice the row meta assertions read. */
export type SessionRowMetaLabels = Pick<SessionsLabels, "fee" | "deadline" | "createdAt" | "intent">;

/**
 * One row's META assertions shared by the populated-page branches: verbatim
 * fee + currency (never parsed, the placeholder when null), the
 * deadline/created stamps expanded through the locale date formatter, and
 * the booking intent rendered verbatim from the payload.
 */
export function expectSessionRowMeta(
  row: HTMLElement,
  session: SessionRowWireValues,
  t: SessionRowMetaLabels,
  locale: AppLocale
): void {
  // Fee renders VERBATIM (never parsed) followed by the currency label.
  const feeText = session.fee === null ? EM_DASH_PLACEHOLDER : `${session.fee} ${SESSION_FEE_CURRENCY}`;
  expect(within(row).getAllByText(feeText).length).toBeGreaterThanOrEqual(1);
  expect(within(row).getByText(t.fee)).toBeDefined();
  // Deadline + created expand through the locale date formatter.
  const deadlineText =
    session.confirmationDeadline === null ? EM_DASH_PLACEHOLDER : expectedStamp(session.confirmationDeadline, locale);
  expect(within(row).getAllByText(deadlineText).length).toBeGreaterThanOrEqual(1);
  expect(within(row).getAllByText(expectedStamp(session.createdAt, locale)).length).toBeGreaterThanOrEqual(1);
  expect(within(row).getByText(t.deadline)).toBeDefined();
  expect(within(row).getByText(t.createdAt)).toBeDefined();
  // Booking intent renders verbatim from the payload (server-owned value).
  const intentText = session.intent ?? EM_DASH_PLACEHOLDER;
  expect(within(row).getAllByText(intentText).length).toBeGreaterThanOrEqual(1);
  expect(within(row).getByText(t.intent)).toBeDefined();
}

/** The Sessions-label slice the filter-chip toolbar assertions read. */
export type StatusFilterToolbarLabels = Pick<
  SessionsLabels,
  "statusFilterAll" | "statusScheduled" | "statusStarted" | "statusCompleted" | "statusCancelled" | "statusDisputed"
>;

/**
 * Filter-chip toolbar assertions shared by the sessions-family suites: the
 * "all" token is rendered + selected and every reachable lifecycle status
 * chip is offered — INCLUDING Disputed (the disputed state is
 * reachable on participant surfaces).
 */
export function expectStatusFilterToolbar(t: StatusFilterToolbarLabels): void {
  const allToken = liveScreen.getByRole("button", { name: t.statusFilterAll });
  expect(allToken.getAttribute("aria-pressed")).toBe("true");
  expect(liveScreen.getByRole("button", { name: t.statusScheduled })).toBeDefined();
  expect(liveScreen.getByRole("button", { name: t.statusStarted })).toBeDefined();
  expect(liveScreen.getByRole("button", { name: t.statusCompleted })).toBeDefined();
  expect(liveScreen.getByRole("button", { name: t.statusCancelled })).toBeDefined();
  expect(liveScreen.getByRole("button", { name: t.statusDisputed })).toBeDefined();
}

// ---------------------------------------------------------------------------
// Row waits + dialog drivers

/**
 * Waits for a settled session row and resolves it (the wait-then-fetch
 * prologue every populated branch shares).
 */
export async function waitForSessionRow(sessionId: string): Promise<HTMLElement> {
  await waitFor(() => {
    expect(liveScreen.getByTestId(`session-row-${sessionId}`)).toBeDefined();
  });
  return liveScreen.getByTestId(`session-row-${sessionId}`);
}

/**
 * Waits for the row, clicks its `actionLabel` CTA and resolves once the
 * dialog is open (the shared open prologue of the dialog branches).
 */
export async function clickRowActionAndAwaitDialog(sessionId: string, actionLabel: string): Promise<HTMLElement> {
  const row = await waitForSessionRow(sessionId);
  fireEvent.click(within(row).getByRole("button", { name: actionLabel }));
  return await waitFor(() => liveScreen.getByRole("dialog"));
}

/**
 * Types the (padded) reason into the dialog's textarea and submits through
 * the form (React.SubmitEvent path). When a `counterMaxLength` is given the
 * live RAW-character counter is pinned first; omitted on the error arms whose
 * suites never asserted the counter.
 */
export function submitDialogWithTypedReason(dialog: HTMLElement, rawReason: string, counterMaxLength?: number): void {
  const reasonInput = within(dialog).getByRole("textbox");
  fireEvent.change(reasonInput, { target: { value: rawReason } });
  if (counterMaxLength !== undefined) {
    expect(within(dialog).getByText(`${rawReason.length}/${counterMaxLength}`)).toBeDefined();
  }
  fireEvent.submit(dialog);
}

// ---------------------------------------------------------------------------
// Cancel + dispute dialog shells

/** The Sessions-label slice the cancel-dialog shell assertions read. */
export type CancelDialogShellLabels = Pick<
  SessionsLabels,
  "cancelConfirmTitle" | "cancelConfirmBody" | "cancelSession"
>;

/**
 * The reused cancel dialog's static shell: title + body copy, the
 * Common-namespace dismiss action, and the type="submit" CTA whose
 * activation walks the React.SubmitEvent path.
 */
export function expectCancelDialogShell(
  dialog: HTMLElement,
  t: CancelDialogShellLabels,
  tc: Pick<CommonLabels, "cancel">
): void {
  expect(within(dialog).getByText(t.cancelConfirmTitle)).toBeDefined();
  expect(within(dialog).getByText(t.cancelConfirmBody)).toBeDefined();
  expect(within(dialog).getByRole("button", { name: tc.cancel })).toBeDefined();
  const submitButton = within(dialog).getByRole("button", { name: t.cancelSession });
  expect(submitButton.getAttribute("type")).toBe("submit");
}

/** The Sessions-label slice the dispute-dialog gate assertions read. */
export type DisputeDialogGateLabels = Pick<
  SessionsLabels,
  "disputeConfirmTitle" | "disputeConfirmBody" | "openDispute" | "disputeReasonRequired"
>;

/**
 * The dispute dialog's (R-110) REQUIRED-reason gate: static shell
 * copy + submit affordance + initial RAW-character counter, then an EMPTY
 * submit that the UI-seam gate blocks — aria-invalid raises, the localized
 * error helper swaps in for the counter, and the dialog STAYS OPEN (no wire
 * call — the suites chain NO mutation mock for this branch).
 */
export function expectDisputeDialogGate(
  dialog: HTMLElement,
  t: DisputeDialogGateLabels,
  tc: Pick<CommonLabels, "cancel">
): void {
  expect(within(dialog).getByText(t.disputeConfirmTitle)).toBeDefined();
  expect(within(dialog).getByText(t.disputeConfirmBody)).toBeDefined();
  expect(within(dialog).getByRole("button", { name: tc.cancel })).toBeDefined();
  const submitButton = within(dialog).getByRole("button", { name: t.openDispute });
  expect(submitButton.getAttribute("type")).toBe("submit");
  expect(within(dialog).getByText(`0/${MAX_DISPUTE_REASON_LENGTH}`)).toBeDefined();

  fireEvent.submit(dialog);
  const reasonInput = within(dialog).getByRole("textbox");
  expect(reasonInput.getAttribute("aria-invalid")).toBe("true");
  expect(within(dialog).getByText(t.disputeReasonRequired)).toBeDefined();
  expect(liveScreen.getByRole("dialog")).toBeDefined();
}

/** Dismisses the dialog via its Common-namespace cancel and waits for it to leave the DOM. */
export async function dismissDialogViaCancel(dialog: HTMLElement, tc: Pick<CommonLabels, "cancel">): Promise<void> {
  fireEvent.click(within(dialog).getByRole("button", { name: tc.cancel }));
  await waitFor(() => {
    expect(liveScreen.queryByRole("dialog")).toBeNull();
  });
}

/**
 * The untouched-row assertion the dispute branches share: still Scheduled,
 * and the dispute affordance live again (the row's in-flight slot released
 * with the dialog).
 */
export function expectScheduledRowWithLiveDisputeCta(
  sessionId: string,
  t: Pick<SessionsLabels, "statusScheduled" | "openDispute">
): void {
  const settledRow = liveScreen.getByTestId(`session-row-${sessionId}`);
  expect(within(settledRow).getByText(t.statusScheduled)).toBeDefined();
  expect(within(settledRow).getByRole("button", { name: t.openDispute }).getAttribute("disabled")).toBeNull();
}

/**
 * The dispute-success cache convergence (normalized cache, same id, NO
 * refetch): the chip flips to DISPUTED, the dispute affordance leaves with
 * the lifecycle, and the Cancel CTA stays VISIBLE but DISABLED (the state
 * machine forbids cancelling a disputed session).
 */
export async function expectDisputedChipFlip(
  sessionId: string,
  t: Pick<SessionsLabels, "statusDisputed" | "statusScheduled" | "openDispute">
): Promise<void> {
  await waitFor(() => {
    expect(within(liveScreen.getByTestId(`session-row-${sessionId}`)).getByText(t.statusDisputed)).toBeDefined();
  });
  const settledRow = liveScreen.getByTestId(`session-row-${sessionId}`);
  expect(within(settledRow).queryByText(t.statusScheduled)).toBeNull();
  expect(within(settledRow).queryByRole("button", { name: t.openDispute })).toBeNull();
  expect(
    within(settledRow).getByTestId(`session-action-${sessionId}-cancel-disabled`).getAttribute("disabled")
  ).not.toBeNull();
}

/**
 * The dispute error arm's convergence (the dispute vocabulary is
 * snackbar-mapped, NOT the cancel flow's row-scoped inline alert): localized
 * error snackbar, dialog closes, row stays Scheduled with a live dispute CTA.
 */
export async function expectDisputeRejectionConvergence(
  sessionId: string,
  errorText: string,
  t: Pick<SessionsLabels, "statusScheduled" | "openDispute">
): Promise<void> {
  await expectSnackbar(errorText, "MuiAlert-colorError");
  expect(liveScreen.queryByRole("dialog")).toBeNull();
  expectScheduledRowWithLiveDisputeCta(sessionId, t);
}

// ---------------------------------------------------------------------------
// Admin session-governance suite fixtures

/**
 * Eager namespace warming for the governance suites — every suite calls this
 * ONCE at module scope so missing-key drift surfaces at LOAD, not inside an
 * arm (the same contract the inline warming loops used to carry).
 */
export function warmSessionSuiteNamespaces(): void {
  for (const translations of [enMessages, arMessages]) {
    AdminSessionGovernanceNs.getLabels(translations);
    SessionsNs.getLabels(translations);
    ErrorsNs.getLabels(translations);
    CommonNs.getLabels(translations);
  }
}

/**
 * The all-fields admin governance wire row (`__typename` mirrors what Apollo
 * Server puts on the wire; it is what makes the `Session:<id>` entity
 * normalizable so the mutation payloads converge the directory rows by id
 * WITHOUT refetch).
 */
export interface AdminSessionRowFixture extends AdminSessionsQuery_adminSessions_items {
  readonly __typename: "Session";
}

/**
 * Deterministic fixture moments shared by the governance suites (DATA —
 * never locale copy): the creation stamp, the future timing pair (reschedule
 * prefill — outside the past-grace window) and the lapsed/past lifecycle
 * moments (needs-attention producer + past-start gate).
 */
export const CREATED_ISO = "2099-01-05T08:00:00.000Z";
export const FUTURE_START_ISO = "2099-01-10T09:00:00.000Z";
export const FUTURE_END_ISO = "2099-01-10T10:30:00.000Z";
export const PAST_START_ISO = "2024-11-01T09:00:00.000Z";
export const PAST_END_ISO = "2024-11-01T10:00:00.000Z";

/**
 * Deterministic payload builder mirroring the closed 21-field governance
 * wire shape (every governance suite's `rowFixture` local used to restate
 * it; every call site passes an explicit `id`).
 */
export function buildAdminSessionRowFixture(
  overrides?: Partial<AdminSessionsQuery_adminSessions_items>
): AdminSessionRowFixture {
  return {
    __typename: "Session",
    id: "7401",
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

/** The success/error discriminator the governance mutation mock builders share. */
export type AdminSessionMutationOutcome =
  | { readonly kind: "success"; readonly payload: AdminSessionRowFixture }
  | { readonly kind: "error"; readonly code: string };

/**
 * Builds one governance mutation's `result` for an outcome. The failure is
 * authored as a raw `result.errors[]` entry exactly where the transport
 * boundary puts `extensions.code`; Apollo's MockedProvider wraps it into a
 * genuine `CombinedGraphQLErrors` — the same extraction path the production
 * error-link uses.
 */
export function adminMutationMockResult(
  wireField: string,
  outcome: AdminSessionMutationOutcome
): MockLink.MockedResponse["result"] {
  if (outcome.kind === "success") {
    return { data: { [wireField]: outcome.payload } };
  }
  return {
    errors: [{ message: `${outcome.code} (masked transport surface)`, extensions: { code: outcome.code } }],
  };
}

/** `AdminSessionCancel` mock with the container's variable shape (`reason: null` for the empty-submit arms). */
export function adminSessionCancelMock(
  sessionId: string,
  reason: string | null,
  outcome: AdminSessionMutationOutcome
): MockLink.MockedResponse {
  return {
    request: { query: adminSessionCancelMutationDocument, variables: { input: { sessionId, reason } } },
    result: adminMutationMockResult("adminCancelSession", outcome),
  };
}

/** `AdminSessionReassign` mock with the container's variable shape (the parsed `Int` teacher id). */
export function adminSessionReassignMock(
  sessionId: string,
  newTeacherUserId: number,
  outcome: AdminSessionMutationOutcome
): MockLink.MockedResponse {
  return {
    request: {
      query: adminSessionReassignMutationDocument,
      variables: { input: { sessionId, newTeacherUserId } },
    },
    result: adminMutationMockResult("adminReassignTeacher", outcome),
  };
}
