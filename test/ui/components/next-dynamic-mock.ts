/**
 * `next/dynamic` mock — FOURTH preload of `test:ui:components`.
 *
 * Replaces Next.js code-splitting with MICROtask-lazy resolution: a
 * dynamically-imported chunk is loaded on FIRST MOUNT of the dynamic
 * component — exactly `next/dynamic` semantics — with no Suspense fallback
 * pass and no network/turbopack involvement.
 *
 * Resolution strategy (LAZY — the loader is NEVER invoked at `dynamic()`
 * call time):
 *
 * 1. LAZY BY CONTRACT — real `next/dynamic` does not touch the loader until
 *    the component renders. An earlier revision called the loader eagerly at
 *    `dynamic()` time to sniff a synchronous re-export; that eager `import()`
 *    RESOLVED AND CACHED THE REAL MODULE in bun's registry before any
 *    test-file `mock.module` registration could run (static imports evaluate
 *    before module body statements), poisoning every later loader
 *    invocation. Eager invocation is therefore removed — `bun:test`
 *    `mock.module` stubs registered at test-file top now apply.
 *
 * 2. ASYNC RESOLUTION — the loader runs inside a microtask on mount,
 *    resolved once per loader, cached, and the memoized inner component
 *    re-renders as soon as it settles. Until then the `options.loading`
 *    placeholder (or nothing) renders — mirroring a client-side chunk
 *    hydration window.
 *
 * 3. UPDATER-WRAP RULE — the resolved component is stored with
 *    `setState(() => component)`, NEVER `setState(component)`: React
 *    interprets a function argument as a FUNCTIONAL UPDATER and would CALL
 *    the freshly-resolved component with the previous state as its props
 *    (crashing prop-destructuring charts with "Cannot destructure ... from
 *    null", or storing the returned element as the "component" —
 *    "Element type is invalid ... got: <div />").
 *
 * The mock is contract infrastructure required verbatim by the
 * `test:ui:components` script signature (four exact preloads), kept honest
 * rather than stubbed so dynamic consumers render their true content under
 * test (or their mock.module stub, when a suite registers one).
 */

import { mock } from "bun:test";
import {
  type ComponentType,
  createElement,
  Fragment,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
} from "react";

type DynamicLoader = () => unknown;

interface DynamicOptions {
  loading?: () => ReactNode | null;
  ssr?: boolean;
  loadableGenerated?: unknown;
}

/**
 * React component types are functions or React exotic objects (forwardRef/
 * memo — identifiable by the `$$typeof` element-type symbol). A module
 * namespace object is NEITHER: treating "any non-null object" as a component
 * made `extractComponent` return ES module records verbatim (the `.default`
 * branch unreachable), crashing React with "Element type is invalid" the
 * moment a dynamically-imported chunk committed.
 */
function isComponent(value: unknown): value is ComponentType<Record<string, unknown>> {
  if (typeof value === "function") return true;
  if (typeof value === "object" && value !== null && "$$typeof" in value) return true;
  return false;
}

interface WithDefault {
  readonly default?: unknown;
}

function hasDefaultExport(mod: unknown): mod is WithDefault {
  return typeof mod === "object" && mod !== null && "default" in mod;
}

/** Accepts a bare component or an ES module record, extracting `.default`. */
function extractComponent(mod: unknown): ComponentType<Record<string, unknown>> | null {
  if (isComponent(mod)) return mod;
  if (hasDefaultExport(mod) && isComponent(mod.default)) return mod.default;
  return null;
}

/** Per-loader cache: one resolution attempt regardless of re-renders. */
const resolvedModules = new Map<DynamicLoader, ComponentType<Record<string, unknown>>>();

function AsyncDynamic({
  loader,
  loading,
  ...props
}: Readonly<
  { loader: DynamicLoader; loading?: () => ReactNode | null } & Record<string, unknown>
>): ReactElement | null {
  const [Component, setComponent] = useState<ComponentType<Record<string, unknown>> | null>(
    () => resolvedModules.get(loader) ?? null
  );

  useEffect(() => {
    let alive = true;
    void Promise.resolve()
      .then(loader)
      .then(mod => {
        const extracted = alive ? extractComponent(mod) : null;
        if (alive && extracted) resolvedModules.set(loader, extracted);
        // Updater-wrap rule (header note 3): `setComponent(extracted)` would
        // make React CALL the component as a functional updater.
        if (alive) setComponent(() => extracted);
        return extracted;
      });
    return () => {
      alive = false;
    };
  }, [loader]);

  // `props` is exactly the caller's prop object here — loader/loading were
  // lifted out by the destructuring above and must NOT reach the real element.
  if (Component) return createElement(Component, props);
  if (loading) return createElement(Fragment, null, loading());
  return null;
}

void mock.module("next/dynamic", () => ({
  default: (loader: DynamicLoader, options?: DynamicOptions): ComponentType<Record<string, unknown>> => {
    const loading = options?.loading;
    const LazyDynamic = (props: Record<string, unknown>): ReactNode =>
      createElement(AsyncDynamic, { ...props, loader, loading });

    LazyDynamic.displayName = "NextDynamicLazy";
    return LazyDynamic;
  },
}));
