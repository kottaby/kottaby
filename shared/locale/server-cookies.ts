import { cookies } from "next/headers";
import { type AppLocale, defaultLocale, isAppLocale } from "@/shared/locale/AppLocale";

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export async function getLocaleFromCookie(): Promise<AppLocale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieValue && isAppLocale(cookieValue)) {
    return cookieValue;
  }
  return defaultLocale;
}
