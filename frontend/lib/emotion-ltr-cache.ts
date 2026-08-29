/**
 * Dedicated LTR-only Emotion cache for `LtrScope`.
 *
 * The main app cache (`emotion-cache.tsx`) may have the RTL stylis plugin
 * applied when the locale is Arabic. `LtrScope` wraps child content that must
 * stay LTR (e.g. code blocks, phone numbers) inside a SEPARATE cache that
 * never applies the RTL plugin — so physical margins/padding aren't flipped.
 *
 * Scope discipline (concurrency fix, PR #30 review): on the CLIENT the cache
 * is a module singleton reused across all `LtrScope` instances. On the SERVER
 * a cache's `inserted` map is per-request state — the SSR style flush clears
 * it — so every server call returns a FRESH cache. The provider holds ONE per
 * request (via `useMemo`) and shares it with every `LtrScope` below it, so
 * `useServerInsertedHTML` drains exactly the caches that request used.
 */

import createCache, { type EmotionCache } from "@emotion/cache";
import { createContext, useContext } from "react";

let ltrCache: EmotionCache | null = null;

/**
 * Server caches must defer insertions to the `useServerInsertedHTML`
 * flush in `emotion-cache.tsx` — inline `<style>` serialization during SSR
 * hydration-mismatches the client tree (same audit-CR3 root cause as the
 * main caches). Idempotent — safe to call on every cache access.
 */
function toServerCompat(cache: EmotionCache): EmotionCache {
  if (typeof window === "undefined") {
    cache.compat = true;
  }
  return cache;
}

/**
 * Request-scoped handle on the nested LtrScope cache. The provider supplies
 * the SAME per-request instance its flush drains; the fallback covers client
 * usage outside the provider tree (client caches are singletons).
 */
const LtrScopeCacheContext = createContext<EmotionCache | null>(null);

export function useLtrScopeCache(): EmotionCache {
  return useContext(LtrScopeCacheContext) ?? getLtrEmotionCache();
}

export { LtrScopeCacheContext };

/**
 * Returns the LTR Emotion cache for this render scope.
 *
 * CLIENT: module singleton (created on first call, reused everywhere).
 * SERVER: a FRESH cache per call — the provider calls this once per render
 * (`useMemo` recomputes per SSR request), so each request owns an isolated
 * cache and the shared-flush race can never drain another request's styles.
 *
 * `prepend: true` injects styles at the top of `<head>` so they win the
 * cascade over the main RTL cache's styles for the same selectors.
 */
export function getLtrEmotionCache(): EmotionCache {
  if (typeof window === "undefined") {
    return toServerCompat(createCache({ key: "ltr", prepend: true }));
  }
  ltrCache ??= toServerCompat(createCache({ key: "ltr", prepend: true }));
  return ltrCache;
}
