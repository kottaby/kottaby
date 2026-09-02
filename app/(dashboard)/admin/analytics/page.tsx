import type { Metadata } from "next";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { PlatformAnalyticsContainer } from "@/frontend/views/admin/analytics/PlatformAnalyticsContainer";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/**
 * `/admin/analytics` — the admin whole-platform analytics dashboard
 * (DEV3-022c).
 *
 * Server Component:
 *  1. `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/analytics" })`
 *     — verifies the caller is an admin. Anonymous → redirect to login;
 *     role mismatch → redirect to the caller's role dashboard (never bare
 *     `/dashboard`).
 *  2. Resolves the active locale + the metadata copy for the surface.
 *  3. Renders the client container — the snapshot itself is fetched by the
 *     CLIENT query (120s poll + manual refresh, REQ-062), so the server
 *     shell performs zero data fetching for this surface.
 *
 * All user-visible copy here comes from the `analytics` namespace
 * (`analyticsTranslations`) — no hardcoded strings (REQ-003/066).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).analyticsTranslations;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function AdminAnalyticsPage(): Promise<React.ReactElement> {
  await withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/analytics" });
  return <PlatformAnalyticsContainer />;
}
