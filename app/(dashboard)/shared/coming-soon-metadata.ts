import type { Metadata } from "next";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/**
 * Shared `generateMetadata` body for the "coming soon" dashboard stubs —
 * the `[feature]` catch-all and the `/parent/children` role-scoped alias —
 * so every stub route emits the identical localized metadata.
 */
export async function generateComingSoonMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).dashboardTranslations;
  return {
    title: t.comingSoonMetaTitle,
    description: t.comingSoonMetaDescription,
  };
}
