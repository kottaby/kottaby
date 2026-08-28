/**
 * Admin Subscription Plans Page — `/admin/plans`
 *
 * Implements REQ-002, REQ-062, REQ-064 (Task 4.2).
 * Server Component with SSR guard:
 *  - Anonymous -> redirects to `/login?redirect=/admin/plans`
 *  - Non-admin -> redirects to `/dashboard`
 *  - Admin -> renders PlanCatalogContainer
 */

import { UserRole } from "@/backend/enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { PlanCatalogContainer } from "@/frontend/views/admin/plans";
import { roleDashboardMetadata } from "@/frontend/views/dashboard/RoleDashboardPage";

export const metadata = roleDashboardMetadata();

export default async function AdminPlansPage(): Promise<React.ReactElement> {
  await withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/plans" });
  return <PlanCatalogContainer />;
}
