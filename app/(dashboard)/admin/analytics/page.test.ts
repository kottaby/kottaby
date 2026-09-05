/**
 * Admin Analytics Page Unit Tests — server-shell export contract.
 *
 * Mirrors the in-bundle `app/(dashboard)/admin/plans/page.test.ts` pattern:
 * the page module is imported for its SHAPE only — `generateMetadata` is
 * never INVOKED (it reads cookies via `next/headers`, which requires a
 * request scope only available in SSR) and the guard is never executed
 * (its anonymous/wrong-role redirects are covered by the agent-browser
 * functional loop). The assertions pin the metadata-typing surface and the
 * client container wiring.
 */

import { describe, expect, test } from "bun:test";
import * as analyticsPage from "@/app/(dashboard)/admin/analytics/page";
import { PlatformAnalyticsContainer } from "@/frontend/views/admin/analytics/PlatformAnalyticsContainer";

describe("Admin Analytics Page", () => {
  test("exposes localized generateMetadata (not static metadata)", () => {
    // Metadata resolves per-request from the caller's locale cookie, so the
    // page exports `generateMetadata` instead of a static `metadata` object.
    expect(typeof analyticsPage.generateMetadata).toBe("function");
  });

  test("exposes the guarded default page export", () => {
    expect(typeof analyticsPage.default).toBe("function");
  });

  test("renders the client PlatformAnalyticsContainer", () => {
    expect(typeof PlatformAnalyticsContainer).toBe("function");
  });
});
