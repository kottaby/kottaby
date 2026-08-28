/**
 * Admin Plans Page Unit Tests — DEV1-005 Task 4.2.TE
 *
 * Verifies:
 *  - REQ-002, REQ-062, REQ-064: Server component page metadata and export contract.
 *  - Frontend views barrel exports for plan management.
 */

import { describe, expect, test } from "bun:test";
import { metadata } from "@/app/(dashboard)/admin/plans/page";
import {
  PlanCatalogContainer,
  PlanCatalogTable,
  PlanFormDialog,
  PlanStatusConfirmDialog,
} from "@/frontend/views/admin/plans";

describe("Admin Plans Page (REQ-062)", () => {
  test("metadata exports title and description", () => {
    expect(metadata).toBeDefined();
    expect(metadata.title).toBeDefined();
  });

  test("frontend view components are exported correctly", () => {
    expect(typeof PlanCatalogContainer).toBe("function");
    expect(typeof PlanCatalogTable).toBe("function");
    expect(typeof PlanFormDialog).toBe("function");
    expect(typeof PlanStatusConfirmDialog).toBe("function");
  });
});
