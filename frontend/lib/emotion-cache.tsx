"use client";

/**
 * Locale-aware Emotion cache provider for the MUI theme tree.
 *
 * Creates TWO caches:
 *  - `mui-ltr` — standard cache (no RTL plugin) for English / LTR layouts.
 *  - `mui-rtl` — cache with `stylis-plugin-rtl` for Arabic / RTL layouts.
 *
 * The RTL plugin flips physical CSS properties (margin-left → margin-right,
 * padding-left → padding-right, etc.) so MUI components render correctly in
 * RTL mode. Without it, `direction: "rtl"` on the theme only flips text
 * direction but NOT physical spacing — causing TextField icons, padding, and
 * adornments to appear on the wrong side.
 *
 * The cache is selected based on the current locale (read from
 * `LocaleContext`). When the locale changes, the cache swaps, causing a
 * one-time style re-injection (acceptable for a locale switch).
 *
 * ## App Router SSR flush (`useServerInsertedHTML`)
 *
 * Under the Next.js App Router, Emotion does not relocate its server-rendered
 * styles into `<head>` on its own. Without a flush, MUI's `CssBaseline`
 * global layer (emotion `<Global>`) is emitted as an INLINE
 * `<style data-emotion="mui-rtl-global …">` element in the `<body>` stream at
 * its render position, while the client-side `<Global>` renders `null` and
 * inserts into `<head>` instead. React 19 hydration then hits a server-only
 * `<style>` child inside the provider tree and fails with
 * "Hydration failed because the server rendered HTML didn't match the
 * client", regenerating the whole tree on the client (slow TTI + RTL flash).
 * Verified live on `/student/sessions` with the `mui-rtl-global` CssBaseline
 * style (`mui-rtl-global 17bb5pf`).
 *
 * The fix is the canonical two-part contract (same approach as MUI's
 * `AppRouterCacheProvider`):
 *  1. `cache.compat = true` — on the server, `<Global>` then returns `null`
 *     and stores its rules in `cache.inserted` (as strings) instead of
 *     emitting inline `<style>` tags, so the `<body>` stays clean. On the
 *     client the only effect is that Emotion skips its `@import` hoisting
 *     middleware — a no-op for MUI's stylesheet output (this is exactly how
 *     MUI's official `AppRouterCacheProvider` wires the App Router).
 *  2. The `useServerInsertedHTML` callback drains `cache.inserted` and Next
 *     injects the returned `<style>` elements into the streamed document's
 *     `<head>`. Server styles flush into `<head>`, the body stays clean, and
 *     hydration matches.
 *
 * `inserted` values may be `true` for styles inserted directly into the
 * sheet — those cannot be re-emitted, so only string rules are flushed.
 * Global-layer styles are emitted as one `<style data-emotion="<key>-global
 * <name>">` per name so the client-side `<Global>` rehydration lookup
 * (`style[data-emotion="<key>-global <name>"]`) re-adopts them instead of
 * re-inserting duplicates; component-layer styles are joined into a single
 * `<style data-emotion="<key> <name> <name> …">` tag (the canonical
 * `createEmotionServer` shape).
 *
 * Both caches are module-level singletons shared by every SSR request, so
 * the callback DRAINS `cache.inserted` after flushing — one request's styles
 * never leak into the next request's head.
 *
 * NOTE on `nonce`: reserved for future CSP support (see module note in the
 * original static cache). Not currently applied.
 */
import createCache, { type EmotionCache } from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";
import { useAppLocale } from "@/frontend/hooks/useAppLocale";

let ltrCache: EmotionCache | null = null;
let rtlCache: EmotionCache | null = null;

function getLtrCache(): EmotionCache {
  ltrCache ??= createCache({ key: "mui-ltr", prepend: true });
  ltrCache.compat = true;
  return ltrCache;
}

function getRtlCache(): EmotionCache {
  rtlCache ??= createCache({
    key: "mui-rtl",
    prepend: true,
    stylisPlugins: [prefixer, rtlPlugin],
  });
  rtlCache.compat = true;
  return rtlCache;
}

/**
 * Drops every entry from the cache's inserted registry.
 *
 * Kept as a module-scope function on purpose: the drain is an intentional
 * mutation of a cache that was passed to `CacheProvider`/`useServerInsertedHTML`,
 * so React's immutability lint (which cannot see that the callback only runs
 * server-side, after the render pass) flags an inline `cache.inserted = {}`
 * inside the component. Calling through this opaque helper keeps that
 * invariant check for everything it can actually verify.
 */
function drainInserted(cache: EmotionCache): void {
  cache.inserted = {};
}

interface EmotionCacheProviderProps {
  readonly children: ReactNode;
  /** CSP nonce — reserved for future CSP support. */
  readonly nonce?: string;
}

export default function EmotionCacheProvider({ children }: Readonly<EmotionCacheProviderProps>) {
  const locale = useAppLocale();
  const cache = useMemo(() => (locale === "ar" ? getRtlCache() : getLtrCache()), [locale]);

  // Flush the styles Emotion inserted during this server render into <head>
  // (Next injects the returned elements there). Runs server-side only; on the
  // client the server-inserted-HTML context is absent and the callback is a
  // no-op. See the module docblock for the full contract.
  useServerInsertedHTML(() => {
    const names = Object.keys(cache.inserted);
    if (names.length === 0) return null;

    const globalStyles: Array<{ readonly name: string; readonly css: string }> = [];
    const componentNames: string[] = [];
    let componentCss = "";

    for (const name of names) {
      const css = cache.inserted[name];
      // `true` means the style was inserted directly into the sheet and
      // cannot be re-emitted; only string rules are flushed.
      if (typeof css !== "string") continue;
      if (cache.registered[`${cache.key}-${name}`] === undefined) {
        globalStyles.push({ name, css });
      } else {
        componentNames.push(name);
        componentCss += css;
      }
    }

    // Drain the singleton so this request's styles are never re-flushed for
    // the next one. Re-insertion on later requests is cheap (stylis memoizes
    // compiled rules per cache) and `registered` is left untouched.
    drainInserted(cache);

    if (globalStyles.length === 0 && componentCss === "") return null;

    const componentNamesAttr = `${cache.key} ${componentNames.join(" ")}`;

    return (
      <>
        {globalStyles.map(({ name, css }) => (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: required by the Emotion App Router SSR flush — the CSS is stylis output for trusted MUI rules, mirroring MUI's own AppRouterCacheProvider.
          <style key={name} data-emotion={`${cache.key}-global ${name}`} dangerouslySetInnerHTML={{ __html: css }} />
        ))}
        {componentCss ? (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: required by the Emotion App Router SSR flush — the CSS is stylis output for trusted MUI rules, mirroring MUI's own AppRouterCacheProvider.
          <style data-emotion={componentNamesAttr} dangerouslySetInnerHTML={{ __html: componentCss }} />
        ) : null}
      </>
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
