"use client";

/**
 * PlatformAnalyticsContainer — the admin platform-analytics client surface
 * mounted at `/admin/analytics` by the server-guarded route (the only
 * consumer; imported directly from the route, no views barrel hop).
 *
 * Data: stateful `useQuery` over `adminPlatformAnalyticsQueryDocument`
 * (hooks from `@apollo/client/react`; no `useLazyQuery`) with the 120s
 * poll cadence (`notifyOnNetworkStatusChange` keeps the in-flight poll
 * observable). The manual Refresh button triggers `refetch()`; while a
 * refresh/poll is in flight the STALE snapshot stays fully rendered under
 * the `refreshingLabel` chip + spinner (never a blank flicker).
 *
 * Render state matrix:
 *  - initial load → per-section card-shaped Skeleton grid wrapped in a
 *    `component="output" aria-busy` region — keyed to the one-and-only
 *    first fetch (`networkStatus === loading`), never re-entered on a
 *    later poll pulse: a failed initial load keeps its Alert stable
 *    through every re-attempt instead of flipping Alert→Skeleton while
 *    the endpoint is down (Apollo drops the settled `error` the moment
 *    a re-attempt starts, so the posture derives from `networkStatus`);
 *  - populated → the seven metric cards (`PlatformAnalyticsMetricGrid`)
 *    + the two trend charts (`PlatformAnalyticsTrends`, dynamic imports);
 *  - load error → inline `Alert severity="error"` + Retry CTA (stale data
 *    stays on screen when one exists);
 *  - query-context FORBIDDEN → the localized denied notice IN-container
 *    (the governed-admin edge the page guard cannot see), classified
 *    through the SINGLE `mapGraphQLErrorByCode` table over
 *    `extractErrorCode` — the raw server `message` is NEVER rendered;
 *    the denial is LATCHED while no snapshot exists, so every snapshotless
 *    re-attempt keeps the notice on screen (never the generic Retry CTA,
 *    which the mapping table marks non-retryable for permission denials).
 *
 * Decomposition (same folder): `PlatformAnalyticsChrome` (heading +
 * toolbar), `MetricCard` (card shell + rows), `PlatformAnalyticsSections`
 * (the seven sections incl. revenue via `RevenueSectionCard`),
 * `PlatformAnalyticsStates` (skeleton/error/denied), `PlatformAnalyticsTrends`
 * + `TrendChartCard` + `SessionTrendChart` / `RevenueTrendChart` (dynamic
 * plot bodies), `platform-analytics-display` (pure display plumbing).
 *
 * MUI v9 discipline: `sx`-only styling, colors exclusively through
 * `theme.palette.*` (no hex/rgb), `*Outlined` icons only, ≥44px touch
 * targets, RTL-safe logical composition, `useAppTranslation(Analytics)`
 * property access for every label (no literal copy anywhere). A pure read
 * surface: emits nothing to the logger.
 */

import { NetworkStatus } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { Box, Stack } from "@mui/material";
import { type ReactNode, useState } from "react";
import { adminPlatformAnalyticsQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import {
  PlatformAnalyticsHeader,
  PlatformAnalyticsToolbar,
} from "@/frontend/views/admin/analytics/PlatformAnalyticsChrome";
import { PlatformAnalyticsMetricGrid } from "@/frontend/views/admin/analytics/PlatformAnalyticsSections";
import {
  PlatformAnalyticsDeniedNotice,
  PlatformAnalyticsLoadError,
  PlatformAnalyticsSkeleton,
} from "@/frontend/views/admin/analytics/PlatformAnalyticsStates";
import { PlatformAnalyticsTrends } from "@/frontend/views/admin/analytics/PlatformAnalyticsTrends";
import {
  buildPlatformAnalyticsCsv,
  platformAnalyticsCsvFilename,
} from "@/frontend/views/admin/analytics/platform-analytics-csv";
import { useAppLocale, useAppTranslation } from "@/shared/locale";
import { Analytics } from "@/shared/locale/namespaces/analytics";

/** Snapshot poll cadence — the 120s platform poll posture (`frontend/AGENTS.md`). */
const PLATFORM_ANALYTICS_POLL_INTERVAL_MS = 120_000;

/**
 * PlatformAnalyticsContainer — see the module docblock for the full
 * composition and state contract.
 */
export function PlatformAnalyticsContainer(): ReactNode {
  const t = useAppTranslation(Analytics);
  const locale = useAppLocale();

  const { data, loading, error, refetch, networkStatus } = useQuery(adminPlatformAnalyticsQueryDocument, {
    pollInterval: PLATFORM_ANALYTICS_POLL_INTERVAL_MS,
    notifyOnNetworkStatusChange: true,
  });

  const snapshot = data?.adminPlatformAnalytics;
  // Skeleton ONLY for the one-and-only first fetch: Apollo v4 drops the
  // settled `error` the moment a poll/refetch re-attempt starts (there is no
  // snapshot to attach it to), so `loading` alone cannot distinguish the
  // initial load from a re-attempt — `networkStatus` can (refetch/poll vs
  // loading). Every snapshotless re-attempt therefore keeps the error Alert
  // + Retry on screen instead of flipping Alert→Skeleton→Alert while down.
  const initialLoad = snapshot === undefined && networkStatus === NetworkStatus.loading;
  const retryingSnapshotless = snapshot === undefined && loading && !initialLoad;
  const refreshing = snapshot !== undefined && loading;

  // Query-context denial classification — FORBIDDEN in query context maps to
  // the `permission-fallback` kind; every other code (incl. UNAUTHORIZED,
  // whose auth-recovery UX the errorLink owns) falls to the generic error.
  const errorCode = error ? extractErrorCode(error) : null;
  const deniedNow =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";

  // Sticky denial memory — the snapshotless re-attempt posture above applies
  // to denials too: Apollo drops the settled FORBIDDEN the moment a poll
  // re-attempt starts, so `deniedNow` flips false mid-window and the generic
  // branch would flash the LoadError Retry CTA (non-retryable for permission
  // denials). The settled permission classification is LATCHED (React's
  // guarded render-phase state adjustment): once set, `denied` stays true
  // while `snapshot === undefined`; it resets when a snapshot arrives or the
  // query is re-created (a fresh mount starts with fresh hook state).
  // Non-permission errors keep the generic Alert-stable posture untouched.
  const [denialLatched, setDenialLatched] = useState(false);
  const denied = deniedNow || (denialLatched && snapshot === undefined);
  if (denied !== denialLatched) {
    setDenialLatched(denied);
  }

  const handleRefresh = (): void => {
    void refetch();
  };

  /**
   * CSV export — serializes the SNAPSHOT ALREADY ON SCREEN (no second
   * fetch): the coherence stamp travels with the data, so the file is a
   * faithful image of the dashboard at its `generatedAt`. Guarded no-op
   * without a snapshot — the download affordance never fabricates data.
   * The object URL is revoked on the next tick (the synchronous click has
   * already consumed it by then).
   */
  const handleExportCsv = (): void => {
    if (snapshot === undefined) {
      return;
    }
    const csv = buildPlatformAnalyticsCsv(snapshot, t);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = platformAnalyticsCsvFilename(snapshot.generatedAt);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };

  // Skeleton, denial, or settled content — statements, not a nested ternary.
  let body: ReactNode;
  if (denied) {
    body = <PlatformAnalyticsDeniedNotice labels={t} />;
  } else if (initialLoad) {
    body = <PlatformAnalyticsSkeleton />;
  } else {
    body = (
      <Stack spacing={3}>
        {error !== undefined || retryingSnapshotless ? (
          <PlatformAnalyticsLoadError labels={t} onRetry={handleRefresh} retryPending={loading} />
        ) : null}
        {snapshot !== undefined ? (
          <Box component="output" aria-busy={refreshing || undefined} sx={{ display: "block" }}>
            <Stack spacing={3}>
              <PlatformAnalyticsMetricGrid snapshot={snapshot} labels={t} locale={locale} />
              <PlatformAnalyticsTrends snapshot={snapshot} labels={t} locale={locale} />
            </Stack>
          </Box>
        ) : null}
      </Stack>
    );
  }

  return (
    <Stack spacing={3} sx={{ width: "100%" }}>
      <PlatformAnalyticsHeader labels={t} />
      <PlatformAnalyticsToolbar
        labels={t}
        locale={locale}
        generatedAt={snapshot?.generatedAt ?? null}
        refreshing={refreshing}
        refreshDisabled={initialLoad || denied}
        onRefresh={handleRefresh}
        onExportCsv={handleExportCsv}
        exportDisabled={snapshot === undefined || denied}
      />
      {body}
    </Stack>
  );
}
