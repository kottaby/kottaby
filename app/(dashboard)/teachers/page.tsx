import type { Metadata } from "next";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { AdminTeachersSurface } from "@/frontend/views/admin/teachers";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/**
 * `/teachers` route — server component shell that renders the
 * `AdminTeachersSurface` (the two-tab admin teachers surface: the
 * read-only certified-teacher directory plus the applicant queue).
 *
 * Mirrors the `/disputes` page structure: `createRoleDashboardPage` cannot
 * host a custom view (it renders the shared `DashboardView` only), so this
 * page runs the SAME server guard the role dashboards use —
 * `withPageAuth({ roles: [UserRole.Admin] })` — anonymous callers redirect
 * to `/login?redirect=/teachers`; role mismatches bounce to their own role
 * dashboard (via `roleDashboardPath` — never the bare `/dashboard`
 * dispatcher, the preview-gateway loop fix). The guard is the ONLY
 * authorization boundary; the surface performs no role logic (the
 * `adminTeachers` admin identity is server-bound per BOPLA hygiene, and the
 * backend queries fail any non-admin into the canonical FORBIDDEN).
 *
 * The admin sidebar (`navItems.ts`) carries the matching `/teachers` nav
 * item; this dedicated page takes precedence over the `[feature]` catch-all
 * automatically.
 *
 * Metadata is generated dynamically from the active locale (read from the
 * `NEXT_LOCALE` cookie).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).adminTeachersTranslations;
  return {
    title: t.title,
  };
}

export default async function AdminTeachersPage() {
  await withPageAuth({ roles: [UserRole.Admin], redirectTo: "/teachers" });
  return <AdminTeachersSurface />;
}
