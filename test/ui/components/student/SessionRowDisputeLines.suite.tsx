/**
 * SessionRowDisputeLines — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `SessionRowDisputeLines.test.tsx` (see that file for the two-phase
 * Happy-DOM bootstrap rationale shared with the sibling suites).
 *
 * Covers the participant-side arbitration-transparency lines rendered by
 * the shared `SessionRow` (student + teacher surfaces render the SAME row
 * parts — the dispute story was previously visible ONLY through the status
 * chip and the admin console):
 *
 *   1. DISPUTED row (reason + moment set) — the dispute line renders with
 *      the filed reason text and the localized disputed moment, on BOTH
 *      role surfaces.
 *   2. ARBITRATED row (resolution note + resolved moment set) — the
 *      arbitration-outcome line renders with the admin note and the
 *      localized resolved moment; the dispute reason line co-renders (the
 *      claimed reason stays part of the case story after the decision).
 *   3. CLEAN rows (every audit column null) — NEITHER line renders (the
 *      row stays exactly as it was before the feature: no placeholder
 *      fabrication).
 *   4. HONEST-NULL pin — a reason WITHOUT a moment (never produced by the
 *      service, but a hand-tampered cache could) renders NO line: the
 *      paired render guard (`reason && moment`) keeps the line all-or-
 *      nothing instead of a half-populated strip.
 *   5. Cancel-reason coexistence — a row carrying a cancel reason AND an
 *      arbitrated outcome renders all three audit lines (cancel + dispute
 *      + outcome) without interference.
 *   6. Locale parity on the rendered line — the overline labels come from
 *      the `sessions` namespace per active locale (EN render asserted;
 *      the ar/en key parity is the namespace suite's compile-time gate).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup } from "@testing-library/react";
import { SessionStatus } from "@/frontend/graphql/generated/gql/graphql";
import { SessionRow } from "@/frontend/views/student/sessions/SessionRow";
import type { SessionRowRole } from "@/frontend/views/student/sessions/sessionRowPresentation";
import type { AppLocale } from "@/shared/locale/AppLocale";
import {
  buildSessionWireRow,
  expectedStamp,
  liveScreen,
  renderWithMocks,
  type SessionWireRow,
} from "@/test/ui/components/helpers";

// ---------------------------------------------------------------------------
// Fixtures

/**
 * Role tokens passed through a VARIABLE (never an inline literal): a
 * string-literal `role="…"` JSX attribute is indistinguishable from an
 * ARIA role for the a11y linter — the containers pass the token the same
 * way (`role={role}`).
 */
const STUDENT_ROLE: SessionRowRole = "student";
const TEACHER_ROLE: SessionRowRole = "teacher";

const CREATED_ISO = "2099-01-05T08:00:00.000Z";
const DEADLINE_ISO = "2099-01-06T08:00:00.000Z";
const DISPUTED_ISO = "2099-01-10T13:20:00.000Z";
const RESOLVED_ISO = "2099-01-12T09:45:00.000Z";

const DISPUTE_REASON = "the recitation review was cut short by repeated connection drops";
const RESOLUTION_NOTE = "half the slot was lost to connection failures";

/** Builds a completed arbitrated row (the canonical post-dispute shape). */
function arbitratedRow(overrides?: Partial<SessionWireRow>): SessionWireRow {
  return buildSessionWireRow(
    { id: "7301", createdIso: CREATED_ISO, deadlineIso: DEADLINE_ISO },
    {
      status: SessionStatus.Completed,
      feeHeld: false,
      disputeReason: DISPUTE_REASON,
      disputedAt: DISPUTED_ISO,
      resolutionNote: RESOLUTION_NOTE,
      resolvedAt: RESOLVED_ISO,
      ...overrides,
    }
  );
}

function cleanRow(overrides?: Partial<SessionWireRow>): SessionWireRow {
  return buildSessionWireRow({ id: "7302", createdIso: CREATED_ISO, deadlineIso: DEADLINE_ISO }, overrides);
}

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Suite

describe("SessionRow dispute lines — participant arbitration transparency", () => {
  test("disputed row renders the dispute line (reason + localized moment) on the student surface", () => {
    const locale: AppLocale = "en";
    renderWithMocks(
      <SessionRow session={arbitratedRow({ id: "7311" })} onCancelIntent={() => undefined} role={STUDENT_ROLE} />,
      [],
      locale
    );
    const line = liveScreen.getByTestId("session-dispute-reason-7311");
    expect(line).toBeDefined();
    expect(line.textContent).toContain(DISPUTE_REASON);
    expect(line.textContent).toContain("Dispute reason");
    expect(line.textContent).toContain(expectedStamp(DISPUTED_ISO, locale));
  });

  test("disputed row renders the dispute line on the TEACHER surface (the non-filing participant sees the why)", () => {
    const locale: AppLocale = "en";
    renderWithMocks(
      <SessionRow
        session={arbitratedRow({ id: "7312", resolutionNote: null, resolvedAt: null })}
        onCancelIntent={() => undefined}
        role={TEACHER_ROLE}
      />,
      [],
      locale
    );
    const line = liveScreen.getByTestId("session-dispute-reason-7312");
    expect(line).toBeDefined();
    expect(line.textContent).toContain(DISPUTE_REASON);
  });

  test("arbitrated row renders the arbitration-outcome line (note + localized resolved moment)", () => {
    const locale: AppLocale = "en";
    renderWithMocks(
      <SessionRow session={arbitratedRow({ id: "7313" })} onCancelIntent={() => undefined} role={STUDENT_ROLE} />,
      [],
      locale
    );
    const line = liveScreen.getByTestId("session-resolution-note-7313");
    expect(line).toBeDefined();
    expect(line.textContent).toContain(RESOLUTION_NOTE);
    expect(line.textContent).toContain("Arbitration outcome");
    expect(line.textContent).toContain(expectedStamp(RESOLVED_ISO, locale));
  });

  test("clean row renders NEITHER line (no placeholder fabrication)", () => {
    renderWithMocks(<SessionRow session={cleanRow()} onCancelIntent={() => undefined} role={STUDENT_ROLE} />, [], "en");
    expect(liveScreen.queryByTestId("session-dispute-reason-7302")).toBeNull();
    expect(liveScreen.queryByTestId("session-resolution-note-7302")).toBeNull();
  });

  test("honest-null pin — a reason WITHOUT its moment renders NO dispute line (paired render guard)", () => {
    renderWithMocks(
      <SessionRow
        session={cleanRow({ id: "7304", disputeReason: DISPUTE_REASON, disputedAt: null })}
        onCancelIntent={() => undefined}
        role={STUDENT_ROLE}
      />,
      [],
      "en"
    );
    expect(liveScreen.queryByTestId("session-dispute-reason-7304")).toBeNull();
  });

  test("honest-null pin — a note WITHOUT its moment renders NO outcome line (paired render guard)", () => {
    renderWithMocks(
      <SessionRow
        session={cleanRow({ id: "7305", resolutionNote: RESOLUTION_NOTE, resolvedAt: null })}
        onCancelIntent={() => undefined}
        role={STUDENT_ROLE}
      />,
      [],
      "en"
    );
    expect(liveScreen.queryByTestId("session-resolution-note-7305")).toBeNull();
  });

  test("cancel reason + arbitrated outcome coexist — all three audit lines render", () => {
    renderWithMocks(
      <SessionRow
        session={arbitratedRow({ id: "7306", cancelReason: "booked the wrong slot" })}
        onCancelIntent={() => undefined}
        role={STUDENT_ROLE}
      />,
      [],
      "en"
    );
    expect(liveScreen.getByTestId("session-cancel-reason-7306")).toBeDefined();
    expect(liveScreen.getByTestId("session-dispute-reason-7306")).toBeDefined();
    expect(liveScreen.getByTestId("session-resolution-note-7306")).toBeDefined();
  });

  test("teacher surface sees the arbitrated outcome too (shared row part, zero role logic)", () => {
    const locale: AppLocale = "en";
    renderWithMocks(
      <SessionRow session={arbitratedRow({ id: "7307" })} onCancelIntent={() => undefined} role={TEACHER_ROLE} />,
      [],
      locale
    );
    const line = liveScreen.getByTestId("session-resolution-note-7307");
    expect(line.textContent).toContain(RESOLUTION_NOTE);
    expect(line.textContent).toContain(expectedStamp(RESOLVED_ISO, locale));
  });
});
