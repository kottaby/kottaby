/**
 * Admin platform-analytics GraphQL documents — the read-only aggregate
 * snapshot surface (`adminPlatformAnalytics`).
 *
 * Per `frontend/graphql/sharedDocuments/AGENTS.md`:
 *  - Document uses `gql` + `TypedDocumentNode` (codegen types only).
 *  - Zero-argument query: the operation declares NO variables and the
 *    second `TypedDocumentNode` type parameter is omitted — the whole-
 *    platform snapshot is derived server-side from the authenticated admin
 *    caller, so the closed input surface leaves the client nothing to steer.
 *  - NO `id` is selected anywhere: every `PlatformAnalytics*` type in the
 *    subtree is an aggregate/embedded value object carrying no `id` at all
 *    (aggregate anonymity) — selecting one would fail validation. The value
 *    objects opt out of cache normalization via `keyFields: false` in
 *    `frontend/providers/apollo/apolloCache.ts`.
 *  - Consumed in views via `useQuery` from `@apollo/client/react` —
 *    NO `useLazyQuery`.
 */
import { gql, type TypedDocumentNode } from "@apollo/client";
import type { AdminPlatformAnalyticsQuery } from "@/frontend/graphql/generated/gql/graphql";

/**
 * Whole-platform analytics snapshot for admins — one coherent read
 * selecting the full closed contract: the `generatedAt` coherence stamp,
 * all seven section aggregates (users, sessions, revenue, subscriptions,
 * teachers, ratings, health) and both 30-day zero-filled trend series.
 * Money amounts arrive as exact decimal strings (`totalAmount`,
 * `last30DaysAmount`, `amount`) — never numeric.
 */
export const adminPlatformAnalyticsQueryDocument: TypedDocumentNode<AdminPlatformAnalyticsQuery> = gql`
  query AdminPlatformAnalytics {
    adminPlatformAnalytics {
      generatedAt
      users { totalCount activeCount suspendedCount blockedCount deletedCount adminsCount teachersCount studentsCount parentsCount newThisWeekCount recentlyActive24h }
      sessions { total today thisWeek thisMonth scheduled started completed cancelled disputed awaitingConfirmation }
      revenue { offlineActivationsCount gatewayRevenueByCurrency { currency totalAmount last30DaysAmount paidPaymentsCount } }
      subscriptions { total active pending expired cancelled suspended activeInWindowNow }
      teachers { certifiedCount evaluatorCount onlineNowCount }
      ratings { averageSessionRating sessionRatingsCount averageEvaluationScore evaluationScoresCount }
      health { pendingDisputes pendingWithdrawals }
      sessionTrendDaily { bucketStart sessionCount }
      revenueTrendDaily { bucketStart currency amount }
    }
  }
`;
