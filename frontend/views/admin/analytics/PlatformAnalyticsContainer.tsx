"use client";

/**
 * PlatformAnalyticsContainer — the client surface of the admin
 * whole-platform analytics dashboard (DEV3-022c).
 *
 * Data (REQ-062): `useQuery(adminPlatformAnalyticsQueryDocument, {
 * pollInterval: 120_000, notifyOnNetworkStatusChange: true })` — NO
 * `useLazyQuery`. The manual Refresh button triggers `refetch()`; while a
 * refetch is in flight the STALE snapshot stays on screen under a
 * `refreshingLabel` chip.
 *
 * States: initial per-section skeletons → populated; FORBIDDEN (the
 * governed-reader edge) renders the localized denied notice IN-container;
 * every other failure renders the load-error alert + Retry. Raw server
 * `message` text is NEVER rendered (REQ-053) — only the error CODE steers
 * the copy (extractErrorCode posture).
 *
 * Sub-component decomposition: header bar, state banners, metric grid, and
 * trend charts live in sibling files in this directory; the two recharts
 * charts are dynamically imported (ssr:false).
 */

import { NetworkStatus } from "@apollo/client/core";
import { useQuery } from "@apollo/client/react";
import { Box } from "@mui/material";
import type { ReactElement } from "react";
import { adminPlatformAnalyticsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { AnalyticsHeaderBar } from "@/frontend/views/admin/analytics/AnalyticsHeaderBar";
import { AnalyticsMetricGrid } from "@/frontend/views/admin/analytics/AnalyticsMetricGrid";
import { DeniedNotice, LoadErrorAlert } from "@/frontend/views/admin/analytics/AnalyticsStateBanners";
import { AnalyticsTrendCharts } from "@/frontend/views/admin/analytics/AnalyticsTrendCharts";

/** The FORBIDDEN wire code (the governed-reader edge renders a notice, not an error). */
const FORBIDDEN_CODE = "FORBIDDEN";

export function PlatformAnalyticsContainer(): ReactElement {
  const query = useQuery(adminPlatformAnalyticsQueryDocument, {
    pollInterval: 120_000,
    notifyOnNetworkStatusChange: true,
  });

  const errorCode = query.error ? extractErrorCode(query.error) : null;
  const denied = errorCode === FORBIDDEN_CODE;
  const initialLoading = query.loading && !query.data;
  const refreshing = query.networkStatus === NetworkStatus.refetch;
  const snapshot = query.data?.adminPlatformAnalytics ?? null;

  return (
    <Box
      component="section"
      sx={{ padding: { xs: 2, md: 3 }, maxWidth: 1280, marginInline: "auto", width: "100%" }}
      aria-busy={query.loading}
    >
      <AnalyticsHeaderBar
        refreshing={refreshing}
        initialLoading={initialLoading}
        generatedAt={snapshot?.generatedAt ?? null}
        onRefresh={() => {
          void query.refetch();
        }}
      />

      {denied ? <DeniedNotice /> : null}
      {!denied && query.error ? (
        <LoadErrorAlert
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {!denied && !query.error ? <AnalyticsMetricGrid snapshot={snapshot} initialLoading={initialLoading} /> : null}
      {snapshot ? <AnalyticsTrendCharts snapshot={snapshot} /> : null}
    </Box>
  );
}
