/**
 * Dashboard Navigation Items Unit Tests — DEV1-005 Task 4.5.TE
 *
 * Verifies:
 *  - REQ-054, REQ-064: Admin navigation contains "/admin/plans" entry.
 *  - Non-admin roles (Student, Teacher, Parent) do NOT contain "/admin/plans".
 */

import { describe, expect, test } from "bun:test";
import { UserRole } from "@/frontend/graphql/generated/gql/graphql";
import { getNavItemsForRole } from "@/frontend/views/dashboard/navItems";

describe("Dashboard Nav Items (REQ-054, REQ-064)", () => {
  test("Admin navigation includes /admin/plans item", () => {
    const adminNav = getNavItemsForRole(UserRole.Admin);
    const plansItem = adminNav.find(item => item.route === "/admin/plans");
    expect(plansItem).toBeDefined();
    expect(plansItem?.labelKey).toBe("plans");
  });

  test.each([UserRole.Student, UserRole.Teacher, UserRole.Parent])(
    "Non-admin role %s does NOT include /admin/plans item",
    role => {
      const nav = getNavItemsForRole(role);
      const plansItem = nav.find(item => item.route === "/admin/plans" || item.route === "/plans");
      expect(plansItem).toBeUndefined();
    }
  );
});
