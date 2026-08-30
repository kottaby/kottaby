"use client";

/**
 * Locale-aware Emotion cache provider for the MUI theme tree.
 *
 * Two cache configurations:
 *  - `mui-ltr` — standard cache (no RTL plugin) for English / LTR layouts.
 *  - `mui-rtl` — cache with `stylis-plugin-rtl` for Arabic / RTL layouts.
 *
 * The RTL plugin flips physical CSS properties (margin-left → margin-right,
 * padding-left → padding-right, etc.) so MUI components render correctly in
 * RTL mode. Without it, `direction: "rtl"` on the theme only flips text
 * direction but NOT physical spacing — causing TextField icons, padding, and
 * adornments to appear on the wrong side.
 *
 * SSR/hydration: styles are collected into `<head>` via MUI's
 * `AppRouterCacheProvider` (`useServerInsertedHTML`) instead of Emotion's
 * default inline `<style data-emotion>` nodes at the component position. The
 * inline approach produced a hydration mismatch on every full-document load:
 * the server HTML carried the `<style>` siblings inline in `<body>` while the
 * client's first render emitted none (client-side insertion targets `<head>`),
 * so React discarded and regenerated the entire subtree — killing event
 * handlers until the recovery re-render completed.
 *
 * The cache is selected by the current locale (`LocaleContext`, seeded from
 * the `NEXT_LOCALE` cookie by the root layout). `AppRouterCacheProvider`
 * captures its options at mount, so the provider is keyed by `locale` — a
 * locale switch (which always does a full navigation via /api/set-locale)
 * remounts the provider with a fresh cache.
 *
 * NOTE on `nonce`: passed through to the Emotion cache for CSP support.
 */
import type { Options as EmotionCacheOptions } from "@emotion/cache";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { type ReactNode, useMemo } from "react";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";
import { useAppLocale } from "@/frontend/hooks/useAppLocale";

function getCacheOptions(locale: string): EmotionCacheOptions {
  if (locale === "ar") {
    return { key: "mui-rtl", prepend: true, stylisPlugins: [prefixer, rtlPlugin] };
  }
  return { key: "mui-ltr", prepend: true };
}

interface EmotionCacheProviderProps {
  readonly children: ReactNode;
  /** CSP nonce — forwarded to the Emotion cache. */
  readonly nonce?: string;
}

export default function EmotionCacheProvider({ children, nonce }: Readonly<EmotionCacheProviderProps>) {
  const locale = useAppLocale();
  const options = useMemo(() => ({ ...getCacheOptions(locale), nonce }), [locale, nonce]);
  return (
    <AppRouterCacheProvider key={locale} options={options}>
      {children}
    </AppRouterCacheProvider>
  );
}
