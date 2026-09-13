/**
 * AdminDisputeEscrowChip + AdminDisputeRow affordances — component suite
 * BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `AdminDisputeEscrowChip.test.tsx` (the same two-phase Happy-DOM bootstrap
 * the sessions-family entries use — see that file for WHY).
 *
 * Happy DOM tier (no wire at all — both components are pure presentation),
 * driven across BOTH locales:
 *
 *   chip classification rendering (feeHeld=true → the held label +
 *   held testid; feeHeld=false → the consumed label + consumed testid) ·
 *   the ROW integration: the chip renders beside the intent on every
 *   arbitration-queue card, and the row exposes the "Review case"
 *   affordance (caller-driven intent callback + per-row in-flight
 *   disable slot) alongside the shipped resolve affordance.
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through the scaffold's `sessionSuiteLabels` (Sessions
 * namespace) — ZERO hardcoded Arabic/English copy lives here. The
 * exception class is fixture DATA (ids, enum values, decimal strings,
 * ASCII reason text). No `console.*`, no `any`, no `.skip(`
 * /`test.only(` markers.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, within } from "@testing-library/react";
import {
  type AdminDisputedSessionsQuery_adminDisputedSessions_items_session,
  SessionIntent,
  SessionStatus,
  SessionType,
} from "@/frontend/graphql/generated/gql/graphql";
import { AdminDisputeEscrowChip } from "@/frontend/views/admin/disputes/AdminDisputeEscrowChip";
import { AdminDisputeRow } from "@/frontend/views/admin/disputes/AdminDisputeRow";
import { SESSION_FEE_CURRENCY } from "@/shared/constants";
import type { AppLocale } from "@/shared/locale/AppLocale";
import type { SessionsLabels } from "@/shared/locale/types/sessions";
import { componentSuiteLocales, liveScreen, renderWithMocks, sessionSuiteLabels } from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Fixtures (DATA — never locale copy)

/** All-fields wire row (`__typename` mirrors what Apollo Server puts on the wire). */
interface RowFixture extends AdminDisputedSessionsQuery_adminDisputedSessions_items_session {
  readonly __typename: "Session";
}

/** Row ids shared by the row-integration fixtures (DATA). */
const HELD_ROW_ID = "9501";
const CONSUMED_ROW_ID = "9502";

/** Creation/dispute moments shared by the fixtures (DATA). */
const CREATED_ISO = "2099-01-14T08:45:00.000Z";
const DISPUTED_ISO = "2099-01-14T13:20:00.000Z";

/** ASCII dispute reason the fixture participant filed (DATA, not locale copy). */
const FILED_DISPUTE_REASON = "Teacher never joined the session.";

/** Deterministic payload builder mirroring the closed 20-field wire shape. */
function rowFixture(overrides?: Partial<AdminDisputedSessionsQuery_adminDisputedSessions_items_session>): RowFixture {
  return {
    __typename: "Session",
    id: HELD_ROW_ID,
    status: SessionStatus.Disputed,
    intent: SessionIntent.Hifz,
    sessionType: SessionType.StudentSession,
    fee: "60.00",
    feeHeld: true,
    studentId: "401",
    teacherId: "802",
    startedAt: null,
    endedAt: null,
    confirmationDeadline: null,
    confirmedByStudentAt: null,
    confirmedByTeacherAt: null,
    createdAt: CREATED_ISO,
    updatedAt: DISPUTED_ISO,
    cancelReason: null,
    disputeReason: FILED_DISPUTE_REASON,
    disputedAt: DISPUTED_ISO,
    resolutionNote: null,
    resolvedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helpers

/** Alias for the scaffold's lazily-bound live-DOM screen (see its module docs). */
const screen = liveScreen;

interface RowCallbackSpies {
  readonly reviewIntentIds: string[];
  readonly resolveIntentIds: string[];
}

function makeRowSpies(): RowCallbackSpies {
  return { reviewIntentIds: [], resolveIntentIds: [] };
}

/** Renders one arbitration-queue card with recording intent callbacks. */
/** Server-resolved display names shared by every rendered fixture row (DATA). */
const ROW_STUDENT_NAME = "Chip Fixture Student";
const ROW_TEACHER_NAME = "Chip Fixture Teacher";

/** Renders one arbitration-queue card with recording intent callbacks. */
function renderRow(
  session: AdminDisputedSessionsQuery_adminDisputedSessions_items_session,
  t: SessionsLabels,
  spies: RowCallbackSpies,
  locale: AppLocale,
  reviewDisabled = false
): void {
  renderWithMocks(
    <AdminDisputeRow
      session={session}
      studentName={ROW_STUDENT_NAME}
      teacherName={ROW_TEACHER_NAME}
      t={t}
      onResolveIntent={sessionId => {
        spies.resolveIntentIds.push(sessionId);
      }}
      onReviewIntent={sessionId => {
        spies.reviewIntentIds.push(sessionId);
      }}
      reviewDisabled={reviewDisabled}
    />,
    [],
    locale
  );
}

afterEach(cleanup);

// One block per locale keeps RTL/LTR both exercised over the full branch
// matrix (STUI_LOCALE split-run guard, shared with the sibling suites).
for (const locale of componentSuiteLocales) {
  const { t } = sessionSuiteLabels(locale);

  describe(`AdminDisputeEscrowChip (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("held classification renders the held label under the held testid", () => {
      renderWithMocks(<AdminDisputeEscrowChip feeHeld t={t} />, [], locale);

      const chip = screen.getByTestId("admin-dispute-escrow-chip-held");
      expect(chip.textContent).toContain(t.escrowHeldChip);
      expect(screen.queryByTestId("admin-dispute-escrow-chip-consumed")).toBeNull();
    });

    test("consumed classification renders the consumed label under the consumed testid", () => {
      renderWithMocks(<AdminDisputeEscrowChip feeHeld={false} t={t} />, [], locale);

      const chip = screen.getByTestId("admin-dispute-escrow-chip-consumed");
      expect(chip.textContent).toContain(t.escrowConsumedChip);
      expect(screen.queryByTestId("admin-dispute-escrow-chip-held")).toBeNull();
    });

    test("held rows render the held chip + BOTH affordances — review intent fires with the row id", () => {
      const spies = makeRowSpies();
      renderRow(rowFixture({ id: HELD_ROW_ID }), t, spies, locale);

      const row = screen.getByTestId(`admin-dispute-row-${HELD_ROW_ID}`);
      expect(within(row).getByTestId("admin-dispute-escrow-chip-held")).toBeDefined();
      expect(within(row).queryByTestId("admin-dispute-escrow-chip-consumed")).toBeNull();
      // Classification-relevant facts stay on the row: verbatim fee, the
      // dispute moment, and the filed reason.
      expect(within(row).getAllByText(`60.00 ${SESSION_FEE_CURRENCY}`).length).toBeGreaterThanOrEqual(1);
      expect(within(row).getAllByText(FILED_DISPUTE_REASON).length).toBeGreaterThanOrEqual(1);

      const reviewCta = within(row).getByTestId(`admin-dispute-action-${HELD_ROW_ID}-review`);
      expect(reviewCta.textContent).toBe(t.reviewCase);
      expect(reviewCta.getAttribute("disabled")).toBeNull();
      fireEvent.click(reviewCta);
      expect(spies.reviewIntentIds).toEqual([HELD_ROW_ID]);
      expect(spies.resolveIntentIds).toEqual([]);

      // The shipped resolve affordance stays intact beside the new one.
      expect(within(row).getByTestId(`admin-dispute-action-${HELD_ROW_ID}-resolve`).textContent).toBe(t.resolveDispute);
    });

    test("consumed rows render the consumed chip; the per-row disable slot gates the review CTA", () => {
      const spies = makeRowSpies();
      renderRow(
        rowFixture({
          id: CONSUMED_ROW_ID,
          feeHeld: false,
          intent: SessionIntent.Tajweed,
          startedAt: "2099-01-14T09:00:00.000Z",
        }),
        t,
        spies,
        locale,
        true
      );

      const row = screen.getByTestId(`admin-dispute-row-${CONSUMED_ROW_ID}`);
      expect(within(row).getByTestId("admin-dispute-escrow-chip-consumed")).toBeDefined();
      expect(within(row).queryByTestId("admin-dispute-escrow-chip-held")).toBeNull();

      // The per-row in-flight slot (the case dialog for THIS row is open)
      // gates the CTA: disabled, and the click intent never fires.
      const gatedCta = within(row).getByTestId(`admin-dispute-action-${CONSUMED_ROW_ID}-review`);
      expect(gatedCta.getAttribute("disabled")).not.toBeNull();
      fireEvent.click(gatedCta);
      expect(spies.reviewIntentIds).toEqual([]);
    });
  });
}
