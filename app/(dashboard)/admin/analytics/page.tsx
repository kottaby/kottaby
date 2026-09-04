import type { Metadata } from "next";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { PlatformAnalyticsContainer } from "@/frontend/views/admin/analytics/PlatformAnalyticsContainer";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/**
 * `/admin/analytics` — the admin platform-analytics dashboard.
 *
 * Server Component shell:
 *  1. `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/analytics" })`
 *     is the only authorization boundary. Anonymous callers bounce to
 *     `/login?redirect=/admin/analytics`; any non-admin role bounces to its
 *     own role dashboard (never the bare `/dashboard` dispatcher — see
 *     `roleDashboardRoute.ts` for the preview-gateway redirect-loop fix).
 *  2. `PlatformAnalyticsContainer` is a client component (stateful Apollo
 *     `useQuery` + polling + manual refresh, per the client-read
 *     discipline) imported directly from the view module — no barrel hop.
 *     It resolves every label itself through the `Analytics` namespace
 *     handle, so the page hands it no props. The page performs ZERO server
 *     data fetching: the snapshot comes from the client query only.
 *
 * Page metadata rides the active locale cookie through the synchronous
 * single-argument `getTranslations(locale)` property chain.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).analyticsTranslations;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
  };
}

export default async function AdminAnalyticsPage(): Promise<React.ReactElement> {
  await withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/analytics" });
  return <PlatformAnalyticsContainer />;
}
