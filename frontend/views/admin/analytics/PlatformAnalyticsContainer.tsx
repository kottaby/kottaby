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
 *    `component="output" aria-busy` region;
 *  - populated → the seven metric cards (`PlatformAnalyticsMetricGrid`)
 *    + the two trend charts (`PlatformAnalyticsTrends`, dynamic imports);
 *  - load error → inline `Alert severity="error"` + Retry CTA (stale data
 *    stays on screen when one exists);
 *  - query-context FORBIDDEN → the localized denied notice IN-container
 *    (the governed-admin edge the page guard cannot see), classified
 *    through the SINGLE `mapGraphQLErrorByCode` table over
 *    `extractErrorCode` — the raw server `message` is NEVER rendered.
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

import { useQuery } from "@apollo/client/react";
import { Box, Stack } from "@mui/material";
import type { ReactNode } from "react";
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

  const { data, loading, error, refetch } = useQuery(adminPlatformAnalyticsQueryDocument, {
    pollInterval: PLATFORM_ANALYTICS_POLL_INTERVAL_MS,
    notifyOnNetworkStatusChange: true,
  });

  const snapshot = data?.adminPlatformAnalytics;
  const initialLoad = snapshot === undefined && loading;
  const refreshing = snapshot !== undefined && loading;

  // Query-context denial classification — FORBIDDEN in query context maps to
  // the `permission-fallback` kind; every other code (incl. UNAUTHORIZED,
  // whose auth-recovery UX the errorLink owns) falls to the generic error.
  const errorCode = error ? extractErrorCode(error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";

  const handleRefresh = (): void => {
    void refetch();
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
        {error ? <PlatformAnalyticsLoadError labels={t} onRetry={handleRefresh} retryPending={loading} /> : null}
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
      />
      {body}
    </Stack>
  );
}
