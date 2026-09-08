/**
 * AdminSessionRowStatusCell — component suite BODY.
 *
 * NOT a runner target: `bun test` collects `*.test.*` files only, and this
 * file carries the suite implementation on behalf of the sibling bootstrap
 * `AdminSessionRowStatusCell.test.tsx` (see that file for WHY the suite is
 * split — short version: react-dom must first evaluate with the Happy-DOM
 * document already registered).
 *
 * The lifecycle status-badge matrix of the admin session-governance
 * directory (DEV3-021): `AdminSessionRowStatusCell` is the shared status
 * chip driven EXCLUSIVELY by the shared presentation tables
 * (`STATUS_ICON` / `STATUS_TONE` / `STATUS_LABEL_KEY` of the student
 * sessions row family). The suite pins:
 *
 *   · every reachable lifecycle status renders the shared chip with the
 *     single-sourced sessions-namespace label (statusScheduled …
 *     statusDisputed) and an outlined icon inside the chip;
 *   · a defensive-corrupt status (a payload value outside the enum) NEVER
 *     crashes — it falls back to the disputed vocabulary on the warning
 *     tone, mirroring the presentation tables' defensive arm.
 *
 * The per-row chip rendering inside a populated directory (and the
 * `needsAttention` badge beside it) is covered end-to-end by the container
 * suite's populated-directory branch; this suite pins the CELL in isolation
 * so a presentation-table drift fails at the unit seam.
 *
 * Translation discipline: assertions reference ONLY the sessions-namespace
 * label objects (warmed eagerly below) — zero hardcoded copy.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup } from "@testing-library/react";
import { SessionStatus } from "@/frontend/graphql/generated/gql/graphql";
import { AdminSessionRowStatusCell } from "@/frontend/views/admin/session-governance/AdminSessionRowStatusCell";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import { Sessions as SessionsNs } from "@/shared/locale/namespaces/sessions";
import { getTranslations } from "@/shared/locale/server";
import type { SessionsLabels } from "@/shared/locale/types/sessions";
import { componentSuiteLocales } from "@/test/ui/components/helpers";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// Eager warming — missing-key drift surfaces at LOAD, not inside an arm.
for (const translations of [enMessages, arMessages]) {
  SessionsNs.getLabels(translations);
}

/** Every reachable lifecycle status with its single-sourced chip label. */
const STATUS_MATRIX: ReadonlyArray<{
  readonly status: SessionStatus;
  readonly labelKey: Extract<keyof SessionsLabels, `status${string}`>;
}> = [
  { status: SessionStatus.Scheduled, labelKey: "statusScheduled" },
  { status: SessionStatus.Started, labelKey: "statusStarted" },
  { status: SessionStatus.Completed, labelKey: "statusCompleted" },
  { status: SessionStatus.Cancelled, labelKey: "statusCancelled" },
  { status: SessionStatus.Disputed, labelKey: "statusDisputed" },
];

afterEach(cleanup);

for (const locale of componentSuiteLocales) {
  const ts: SessionsLabels = SessionsNs.getLabels(getTranslations(locale));

  describe(`AdminSessionRowStatusCell (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("every lifecycle status renders the shared chip with the sessions-namespace label", () => {
      for (const { status, labelKey } of STATUS_MATRIX) {
        const { container } = renderWithWrapper(<AdminSessionRowStatusCell status={status} t={ts} />, { locale });

        const chip = container.querySelector("[data-testid='admin-session-status-chip']");
        expect(chip).not.toBeNull();
        // The label resolves through the SHARED vocabulary (never duplicated
        // governance copy) and an outlined icon rides inside the chip.
        expect(chip?.textContent).toBe(ts[labelKey]);
        expect(chip?.querySelector("svg")).not.toBeNull();
      }
    });

    test("a corrupt status payload renders defensively on the disputed fallback", () => {
      // A wire payload outside the enum (corrupted cache entry, future
      // server enum member) — the presentation tables' defensive arm keeps
      // the chip renderable, never crashing.
      const corrupted = "CORRUPTED_STATUS" as unknown as SessionStatus;
      const { container } = renderWithWrapper(<AdminSessionRowStatusCell status={corrupted} t={ts} />, { locale });

      const chip = container.querySelector("[data-testid='admin-session-status-chip']");
      expect(chip).not.toBeNull();
      expect(chip?.textContent).toBe(ts.statusDisputed);
      expect(chip?.querySelector("svg")).not.toBeNull();
    });
  });
}
