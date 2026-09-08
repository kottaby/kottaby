/**
 * AdminSessionErrors — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `AdminSessionErrors.test.tsx` (see that file for WHY the suite is split —
 * short version: react-dom must first evaluate with the Happy-DOM document
 * already registered, or controlled `onChange` dies with
 * `isInputEventSupported === false`).
 *
 * The ERROR-DISPLAY + ELIGIBILITY-GATING tier of the admin session-
 * governance surface (DEV3-021 / tasks 5.2.4 "403 error tenant denial
 * display" + the D-03 gating matrix). Two complementary tiers:
 *
 *   ROW TIER (`AdminSessionRow` in isolation — the Record lookup tables
 *   `TIMING_MUTABLE_STATUSES` / `REASSIGN_ELIGIBLE_STATUSES` /
 *   `JOIN_ELIGIBLE_STATUSES`): the kebab menu gates the four governance
 *   actions per lifecycle status — INELIGIBLE actions render DISABLED with
 *   an explanatory TOOLTIP (`rescheduleDisabledHint` … `joinDisabledHint`,
 *   asserted HOVERED so the copy contract is pinned, not just the flag),
 *   eligible actions expose NO tooltip (`disableHoverListener` + empty
 *   title), details is always available, and the intent callbacks fire with
 *   the exact (kind, session) contract.
 *
 *   CONTAINER TIER (`AdminSessionGovernanceContainer` under
 *   `MockedProvider`): mutation failures classified through
 *   `extractErrorCode` + `normalizeGraphQLErrorCode` surface the localized
 *   403/tenant-denial copy as an ERROR Snackbar — the reschedule and
 *   reassign FORBIDDEN arms and the cancel VALIDATION arm keep the dialog
 *   OPEN for a corrected submit (the retryable family); the specific
 *   boundary-denial codes (`TEACHER_NOT_FOUND`,
 *   `SESSION_RESCHEDULE_WINDOW_INVALID`, `SESSION_RESCHEDULE_START_IN_PAST`)
 *   surface their OWN errors-namespace copy (R9 fix — never the
 *   directory-load fallback), while a masked
 *   non-mapped code falls through to the container's own error title
 *   (NEVER the server message, NEVER the denial copy).
 *
 * The directory-level 403 fallback, the masked directory error, the cancel
 * FORBIDDEN and join FORBIDDEN arms and the aria-disabled-only gating
 * matrix are pinned by the container suite's branches; this suite pins the
 * arms + affordances ONLY a row/dialog-isolated render can express.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects (`AdminSessionGovernance` / `Sessions` / `Errors` / `Common`
 * namespaces, warmed eagerly below) — zero hardcoded Arabic/English copy.
 * The exception class is fixture DATA (ids, enum values, ISO instants).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { MockLink } from "@apollo/client/testing";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import {
  type AdminSessionListFilterInput,
  type AdminSessionsQuery_adminSessions_items,
  SessionIntent,
  SessionStatus,
  SessionType,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminSessionCancelMutationDocument,
  adminSessionReassignMutationDocument,
  adminSessionRescheduleMutationDocument,
  adminSessionsQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import { AdminSessionRow, type GovernanceDialogKind } from "@/frontend/views/admin/session-governance/AdminSessionRow";
import { AdminSessionGovernanceContainer } from "@/frontend/views/admin/session-governance/AdminSessionGovernanceContainer";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import { AdminSessionGovernance as AdminSessionGovernanceNs } from "@/shared/locale/namespaces/adminSessionGovernance";
import { Common as CommonNs } from "@/shared/locale/namespaces/common";
import { Errors as ErrorsNs } from "@/shared/locale/namespaces/errors";
import { Sessions as SessionsNs } from "@/shared/locale/namespaces/sessions";
import { getTranslations } from "@/shared/locale/server";
import type { AdminSessionGovernanceLabels } from "@/shared/locale/types/adminSessionGovernance";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";
import {
  componentSuiteLocales,
  liveScreen,
  muiLabelPattern,
  renderWithMocks,
  sessionSuiteLabels,
  snackbarSeverityClass,
} from "@/test/ui/components/helpers";

// Eager namespace warming (missing-key drift surfaces at LOAD, not in an arm).
for (const translations of [enMessages, arMessages]) {
  AdminSessionGovernanceNs.getLabels(translations);
  SessionsNs.getLabels(translations);
  ErrorsNs.getLabels(translations);
  CommonNs.getLabels(translations);
}

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** All-fields fixture row (`__typename` keeps the entity normalizable). */
interface RowFixture extends AdminSessionsQuery_adminSessions_items {
  readonly __typename: "Session";
}

const CREATED_ISO = "2099-01-05T08:00:00.000Z";
const FUTURE_START_ISO = "2099-01-10T09:00:00.000Z";
const FUTURE_END_ISO = "2099-01-10T10:30:00.000Z";
const PAST_START_ISO = "2024-11-01T09:00:00.000Z";
const PAST_END_ISO = "2024-11-01T10:00:00.000Z";

const SCHEDULED_ID = "7411";
const STARTED_ID = "7412";
const COMPLETED_ID = "7413";
const CANCELLED_ID = "7414";
const DISPUTED_ID = "7415";

/** The dialog confirm arms submit the prefilled pair through this oracle. */
function expectedSubmitIso(fixtureIso: string): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const instant = new Date(fixtureIso);
  const token = `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(
    instant.getHours()
  )}:${pad(instant.getMinutes())}`;
  return new Date(token).toISOString();
}

/** Deterministic payload builder mirroring the closed 21-field wire shape. */
function rowFixture(overrides?: Partial<AdminSessionsQuery_adminSessions_items>): RowFixture {
  return {
    __typename: "Session",
    id: SCHEDULED_ID,
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

// ---------------------------------------------------------------------------
// ROW TIER — kebab gating matrix + hovered tooltip copy

interface IntentCall {
  readonly kind: GovernanceDialogKind;
  readonly sessionId: string;
}

/** Renders ONE row in isolation with recording intent callbacks. */
function renderRow(
  session: RowFixture,
  locale: AppLocale,
  t: AdminSessionGovernanceLabels,
  ts: ReturnType<typeof sessionSuiteLabels>["t"]
): { readonly intents: IntentCall[]; readonly detailCalls: string[] } {
  const intents: IntentCall[] = [];
  const detailCalls: string[] = [];
  renderWithWrapper(
    <AdminSessionRow
      session={session}
      t={t}
      tSessions={ts}
      onOpenDetails={sessionId => {
        detailCalls.push(sessionId);
      }}
      onDialogIntent={(kind, dialogSession) => {
        intents.push({ kind, sessionId: dialogSession.id });
      }}
    />,
    { locale }
  );
  return { intents, detailCalls };
}

/** Opens one row's kebab menu and resolves the menu portal. */
async function openRowMenu(sessionId: string): Promise<HTMLElement> {
  await waitFor(() => {
    expect(liveScreen.getByTestId(`admin-session-row-${sessionId}`)).toBeDefined();
  });
  fireEvent.click(liveScreen.getByTestId(`admin-session-actions-${sessionId}`));
  return await waitFor(() => liveScreen.getByRole("menu"));
}

type KebabAction = "details" | "reschedule" | "cancel" | "reassign" | "join";

function kebabItem(menu: HTMLElement, sessionId: string, action: KebabAction): HTMLElement {
  return within(menu).getByTestId(`admin-session-action-${sessionId}-${action}`);
}

/**
 * Hover-asserts the explanatory tooltip copy of an INELIGIBLE kebab action
 * (MUI Tooltip opens through the Box wrapper on `mouseover`; the title must
 * equal the exact disabled hint, never a generic label).
 */
async function expectDisabledHint(item: HTMLElement, hint: string): Promise<void> {
  fireEvent.mouseOver(item);
  await waitFor(() => {
    const tooltipTexts = liveScreen.getAllByRole("tooltip").map(el => el.textContent ?? "");
    expect(tooltipTexts.some(text => text === hint)).toBe(true);
  });
  fireEvent.mouseLeave(item);
}

/**
 * ELIGIBLE actions expose NO hover tooltip at all (`disableHoverListener`
 * + empty title) — the affordance is live, it must not advertise a hint.
 */
function expectNoTooltip(item: HTMLElement): void {
  fireEvent.mouseOver(item);
  expect(liveScreen.queryAllByRole("tooltip")).toHaveLength(0);
  fireEvent.mouseLeave(item);
}

// ---------------------------------------------------------------------------
// CONTAINER TIER — mutation error classification + snackbar display

/** Wire-shaped unfiltered state — every member explicitly null. */
const EMPTY_FILTER: AdminSessionListFilterInput = {
  teacherUserId: null,
  studentUserId: null,
  type: null,
  status: null,
  dateFrom: null,
  dateTo: null,
};

/** The container pins the backend's 1..50 default/clamp midpoint. */
const PAGE_SIZE = 25;

function directoryMock(page: number, items: readonly RowFixture[]): MockLink.MockedResponse {
  return {
    request: { query: adminSessionsQueryDocument, variables: { filter: EMPTY_FILTER, page, pageSize: PAGE_SIZE } },
    result: { data: { adminSessions: { items: [...items], page, pageSize: PAGE_SIZE, totalCount: items.length } } },
  };
}

type MutationOutcome =
  | { readonly kind: "success"; readonly payload: RowFixture }
  | { readonly kind: "error"; readonly code: string };

function outcomeResult(wireField: string, outcome: MutationOutcome): MockLink.MockedResponse["result"] {
  if (outcome.kind === "success") {
    return { data: { [wireField]: outcome.payload } };
  }
  // The failure is authored as a raw `result.errors[]` entry exactly where
  // the transport boundary puts `extensions.code`; Apollo's MockedProvider
  // wraps it into a genuine `CombinedGraphQLErrors` — the same extraction
  // path the production error-link uses.
  return {
    errors: [{ message: `${outcome.code} (masked transport surface)`, extensions: { code: outcome.code } }],
  };
}

function rescheduleMock(sessionId: string, outcome: MutationOutcome): MockLink.MockedResponse {
  return {
    request: {
      query: adminSessionRescheduleMutationDocument,
      variables: {
        input: { sessionId, startedAt: expectedSubmitIso(FUTURE_START_ISO), endedAt: expectedSubmitIso(FUTURE_END_ISO) },
      },
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

function reassignMock(sessionId: string, newTeacherUserId: number, outcome: MutationOutcome): MockLink.MockedResponse {
  return {
    request: { query: adminSessionReassignMutationDocument, variables: { input: { sessionId, newTeacherUserId } } },
    result: outcomeResult("adminReassignTeacher", outcome),
  };
}

async function openRowMenuInContainer(sessionId: string): Promise<HTMLElement> {
  await waitFor(() => {
    expect(liveScreen.getByTestId(`admin-session-row-${sessionId}`)).toBeDefined();
  });
  fireEvent.click(liveScreen.getByTestId(`admin-session-actions-${sessionId}`));
  return await waitFor(() => liveScreen.getByRole("menu"));
}

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the FULL matrix.
// STUI_LOCALE split-run guard: `componentSuiteLocales` carries the shared
// ar/en filtering (unset runs BOTH locales).
for (const locale of componentSuiteLocales) {
  const { t: ts, te } = sessionSuiteLabels(locale);
  const t: AdminSessionGovernanceLabels = AdminSessionGovernanceNs.getLabels(getTranslations(locale));

  describe(`AdminSessionErrors — kebab gating matrix + tooltips (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("scheduled row — timing actions + reassign live with NO tooltip, join disabled with its hint, reschedule intent fires", async () => {
      const { intents } = renderRow(rowFixture({ id: SCHEDULED_ID }), locale, t, ts);
      const menu = await openRowMenu(SCHEDULED_ID);

      const reschedule = kebabItem(menu, SCHEDULED_ID, "reschedule");
      const cancel = kebabItem(menu, SCHEDULED_ID, "cancel");
      const reassign = kebabItem(menu, SCHEDULED_ID, "reassign");
      const join = kebabItem(menu, SCHEDULED_ID, "join");
      expect(reschedule.getAttribute("aria-disabled")).toBeNull();
      expect(cancel.getAttribute("aria-disabled")).toBeNull();
      expect(reassign.getAttribute("aria-disabled")).toBeNull();
      expect(join.getAttribute("aria-disabled")).toBe("true");

      // Eligible actions never advertise a disabled-hint tooltip.
      expectNoTooltip(reschedule);
      expectNoTooltip(cancel);
      expectNoTooltip(reassign);
      // The ineligible join explains WHY through its exact hint copy.
      await expectDisabledHint(join, t.joinDisabledHint);

      // The reschedule intent hands the dialog state the exact session.
      fireEvent.click(reschedule);
      expect(intents).toEqual([{ kind: "reschedule", sessionId: SCHEDULED_ID }]);
    });

    test("started row — reschedule/cancel/join live, reassign disabled with its hint, cancel intent fires", async () => {
      const { intents } = renderRow(
        rowFixture({ id: STARTED_ID, status: SessionStatus.Started, startedAt: PAST_START_ISO, endedAt: null, confirmationDeadline: null }),
        locale,
        t,
        ts
      );
      const menu = await openRowMenu(STARTED_ID);

      const reschedule = kebabItem(menu, STARTED_ID, "reschedule");
      const cancel = kebabItem(menu, STARTED_ID, "cancel");
      const reassign = kebabItem(menu, STARTED_ID, "reassign");
      const join = kebabItem(menu, STARTED_ID, "join");
      expect(reschedule.getAttribute("aria-disabled")).toBeNull();
      expect(cancel.getAttribute("aria-disabled")).toBeNull();
      expect(join.getAttribute("aria-disabled")).toBeNull();
      expect(reassign.getAttribute("aria-disabled")).toBe("true");

      expectNoTooltip(reschedule);
      expectNoTooltip(cancel);
      expectNoTooltip(join);
      await expectDisabledHint(reassign, t.reassignDisabledHint);

      fireEvent.click(cancel);
      expect(intents).toEqual([{ kind: "cancel", sessionId: STARTED_ID }]);
    });

    test("completed row — reschedule/cancel/reassign/join ALL disabled with their hints, details stays live", async () => {
      const { intents, detailCalls } = renderRow(
        rowFixture({
          id: COMPLETED_ID,
          status: SessionStatus.Completed,
          startedAt: PAST_START_ISO,
          endedAt: PAST_END_ISO,
          confirmationDeadline: null,
        }),
        locale,
        t,
        ts
      );
      const menu = await openRowMenu(COMPLETED_ID);

      const reschedule = kebabItem(menu, COMPLETED_ID, "reschedule");
      const cancel = kebabItem(menu, COMPLETED_ID, "cancel");
      const reassign = kebabItem(menu, COMPLETED_ID, "reassign");
      const join = kebabItem(menu, COMPLETED_ID, "join");
      for (const item of [reschedule, cancel, reassign, join]) {
        expect(item.getAttribute("aria-disabled")).toBe("true");
      }
      expect(kebabItem(menu, COMPLETED_ID, "details").getAttribute("aria-disabled")).toBeNull();

      await expectDisabledHint(reschedule, t.rescheduleDisabledHint);
      await expectDisabledHint(cancel, t.cancelDisabledHint);
      await expectDisabledHint(reassign, t.reassignDisabledHint);
      await expectDisabledHint(join, t.joinDisabledHint);
      expect(intents).toHaveLength(0);

      // View-details is ALWAYS available — the only live action here.
      fireEvent.click(kebabItem(menu, COMPLETED_ID, "details"));
      expect(detailCalls).toEqual([COMPLETED_ID]);
    });

    test("cancelled row — all four governance actions disabled with their hints", async () => {
      const { intents } = renderRow(
        rowFixture({ id: CANCELLED_ID, status: SessionStatus.Cancelled, startedAt: null, endedAt: null, confirmationDeadline: null, feeHeld: false }),
        locale,
        t,
        ts
      );
      const menu = await openRowMenu(CANCELLED_ID);

      for (const action of ["reschedule", "cancel", "reassign", "join"] as const) {
        expect(kebabItem(menu, CANCELLED_ID, action).getAttribute("aria-disabled")).toBe("true");
      }
      await expectDisabledHint(kebabItem(menu, CANCELLED_ID, "reschedule"), t.rescheduleDisabledHint);
      await expectDisabledHint(kebabItem(menu, CANCELLED_ID, "cancel"), t.cancelDisabledHint);
      await expectDisabledHint(kebabItem(menu, CANCELLED_ID, "reassign"), t.reassignDisabledHint);
      await expectDisabledHint(kebabItem(menu, CANCELLED_ID, "join"), t.joinDisabledHint);
      expect(intents).toHaveLength(0);
    });

    test("disputed row — all four governance actions disabled with their hints", async () => {
      const { intents } = renderRow(
        rowFixture({ id: DISPUTED_ID, status: SessionStatus.Disputed, startedAt: PAST_START_ISO, endedAt: null, confirmationDeadline: null }),
        locale,
        t,
        ts
      );
      const menu = await openRowMenu(DISPUTED_ID);

      for (const action of ["reschedule", "cancel", "reassign", "join"] as const) {
        expect(kebabItem(menu, DISPUTED_ID, action).getAttribute("aria-disabled")).toBe("true");
      }
      await expectDisabledHint(kebabItem(menu, DISPUTED_ID, "reschedule"), t.rescheduleDisabledHint);
      await expectDisabledHint(kebabItem(menu, DISPUTED_ID, "cancel"), t.cancelDisabledHint);
      await expectDisabledHint(kebabItem(menu, DISPUTED_ID, "reassign"), t.reassignDisabledHint);
      await expectDisabledHint(kebabItem(menu, DISPUTED_ID, "join"), t.joinDisabledHint);
      expect(intents).toHaveLength(0);
    });
  });

  describe(`AdminSessionErrors — mutation error classification + tenant denial (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("reschedule FORBIDDEN — localized tenant-denial snackbar, dialog STAYS open for a corrected submit", async () => {
      renderWithMocks(
        <AdminSessionGovernanceContainer />,
        [directoryMock(1, [rowFixture({ id: SCHEDULED_ID })]), rescheduleMock(SCHEDULED_ID, { kind: "error", code: "FORBIDDEN" })],
        locale
      );

      const menu = await openRowMenuInContainer(SCHEDULED_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_ID, "reschedule"));
      await waitFor(() => {
        expect(liveScreen.getByRole("dialog")).toBeDefined();
      });
      fireEvent.click(within(liveScreen.getByRole("dialog")).getByTestId("reschedule-session-submit"));

      await waitFor(() => {
        expect(liveScreen.getByText(te.forbidden)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.forbidden)).toContain("MuiAlert-colorError");
      // Retryable family: the dialog premise stays valid.
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
      expect(liveScreen.getByTestId(`admin-session-row-${SCHEDULED_ID}`)).not.toBeNull();
    });

    test("reassign FORBIDDEN — localized tenant-denial snackbar, dialog STAYS open", async () => {
      renderWithMocks(
        <AdminSessionGovernanceContainer />,
        [directoryMock(1, [rowFixture({ id: SCHEDULED_ID })]), reassignMock(SCHEDULED_ID, 907, { kind: "error", code: "FORBIDDEN" })],
        locale
      );

      const menu = await openRowMenuInContainer(SCHEDULED_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_ID, "reassign"));
      const dialog = await waitFor(() => liveScreen.getByRole("dialog"));
      fireEvent.change(within(dialog).getByLabelText(muiLabelPattern(t.reassignTeacherIdLabel)), {
        target: { value: "907" },
      });
      const submit = within(dialog).getByTestId(`reassign-teacher-submit-${SCHEDULED_ID}`);
      await waitFor(() => {
        expect(submit.getAttribute("disabled")).toBeNull();
      });
      fireEvent.click(submit);

      await waitFor(() => {
        expect(liveScreen.getByText(te.forbidden)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.forbidden)).toContain("MuiAlert-colorError");
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
    });

    test("cancel VALIDATION — localized retryable snackbar, dialog STAYS open", async () => {
      renderWithMocks(
        <AdminSessionGovernanceContainer />,
        [
          directoryMock(1, [
            rowFixture({ id: STARTED_ID, status: SessionStatus.Started, startedAt: PAST_START_ISO, endedAt: null, confirmationDeadline: null }),
          ]),
          cancelMock(STARTED_ID, null, { kind: "error", code: "VALIDATION" }),
        ],
        locale
      );

      const menu = await openRowMenuInContainer(STARTED_ID);
      fireEvent.click(kebabItem(menu, STARTED_ID, "cancel"));
      const dialog = await waitFor(() => liveScreen.getByRole("dialog"));
      fireEvent.click(within(dialog).getByTestId(`cancel-session-submit-${STARTED_ID}`));

      await waitFor(() => {
        expect(liveScreen.getByText(te.validation)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.validation)).toContain("MuiAlert-colorError");
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
    });

    test("reschedule SESSION_RESCHEDULE_WINDOW_INVALID — its OWN denial copy surfaces, dialog STAYS open", async () => {
      renderWithMocks(
        <AdminSessionGovernanceContainer />,
        [
          directoryMock(1, [rowFixture({ id: SCHEDULED_ID })]),
          rescheduleMock(SCHEDULED_ID, { kind: "error", code: "SESSION_RESCHEDULE_WINDOW_INVALID" }),
        ],
        locale
      );

      const menu = await openRowMenuInContainer(SCHEDULED_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_ID, "reschedule"));
      await waitFor(() => {
        expect(liveScreen.getByRole("dialog")).toBeDefined();
      });
      fireEvent.click(within(liveScreen.getByRole("dialog")).getByTestId("reschedule-session-submit"));

      await waitFor(() => {
        expect(liveScreen.getByText(te.sessionRescheduleWindowInvalid)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.sessionRescheduleWindowInvalid)).toContain("MuiAlert-colorError");
      // Retryable family: the dialog premise stays valid.
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
    });

    test("reschedule SESSION_RESCHEDULE_START_IN_PAST — its OWN denial copy surfaces, dialog STAYS open", async () => {
      renderWithMocks(
        <AdminSessionGovernanceContainer />,
        [
          directoryMock(1, [rowFixture({ id: SCHEDULED_ID })]),
          rescheduleMock(SCHEDULED_ID, { kind: "error", code: "SESSION_RESCHEDULE_START_IN_PAST" }),
        ],
        locale
      );

      const menu = await openRowMenuInContainer(SCHEDULED_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_ID, "reschedule"));
      await waitFor(() => {
        expect(liveScreen.getByRole("dialog")).toBeDefined();
      });
      fireEvent.click(within(liveScreen.getByRole("dialog")).getByTestId("reschedule-session-submit"));

      await waitFor(() => {
        expect(liveScreen.getByText(te.sessionRescheduleStartInPast)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.sessionRescheduleStartInPast)).toContain("MuiAlert-colorError");
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
    });

    test("reassign TEACHER_NOT_FOUND — its OWN denial copy surfaces, dialog STAYS open", async () => {
      renderWithMocks(
        <AdminSessionGovernanceContainer />,
        [directoryMock(1, [rowFixture({ id: SCHEDULED_ID })]), reassignMock(SCHEDULED_ID, 907, { kind: "error", code: "TEACHER_NOT_FOUND" })],
        locale
      );

      const menu = await openRowMenuInContainer(SCHEDULED_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_ID, "reassign"));
      const dialog = await waitFor(() => liveScreen.getByRole("dialog"));
      fireEvent.change(within(dialog).getByLabelText(muiLabelPattern(t.reassignTeacherIdLabel)), {
        target: { value: "907" },
      });
      const submit = within(dialog).getByTestId(`reassign-teacher-submit-${SCHEDULED_ID}`);
      await waitFor(() => {
        expect(submit.getAttribute("disabled")).toBeNull();
      });
      fireEvent.click(submit);

      await waitFor(() => {
        expect(liveScreen.getByText(te.teacherNotFound)).toBeDefined();
      });
      expect(snackbarSeverityClass(te.teacherNotFound)).toContain("MuiAlert-colorError");
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
    });

    test("masked unmapped mutation code falls through to the container error title — never the server message, never the denial copy", async () => {
      const SERVER_LEAK = "INTERNAL_SERVER_ERROR (masked transport surface)";
      renderWithMocks(
        <AdminSessionGovernanceContainer />,
        [directoryMock(1, [rowFixture({ id: SCHEDULED_ID })]), rescheduleMock(SCHEDULED_ID, { kind: "error", code: "INTERNAL_SERVER_ERROR" })],
        locale
      );

      const menu = await openRowMenuInContainer(SCHEDULED_ID);
      fireEvent.click(kebabItem(menu, SCHEDULED_ID, "reschedule"));
      await waitFor(() => {
        expect(liveScreen.getByRole("dialog")).toBeDefined();
      });
      fireEvent.click(within(liveScreen.getByRole("dialog")).getByTestId("reschedule-session-submit"));

      await waitFor(() => {
        expect(liveScreen.getByText(t.errorTitle)).toBeDefined();
      });
      expect(snackbarSeverityClass(t.errorTitle)).toContain("MuiAlert-colorError");
      expect(liveScreen.queryByText(SERVER_LEAK)).toBeNull();
      expect(liveScreen.queryByText(te.forbidden)).toBeNull();
      expect(liveScreen.getByRole("dialog")).not.toBeNull();
    });
  });
}
