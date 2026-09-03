/**
 * Admin platform-analytics GraphQL document — the SINGLE closed read for the
 * whole-platform analytics snapshot (DEV3-022c).
 *
 * Per `frontend/graphql/sharedDocuments/AGENTS.md`:
 *  - `gql` + `TypedDocumentNode` (codegen types only — `AdminPlatformAnalyticsQuery`
 *    is generated from the named operation).
 *  - NAMED operation `AdminPlatformAnalytics` — never an anonymous document.
 *  - ZERO variables: the read scope is the whole platform for admins; the
 *    closed variable surface structurally prevents client steering
 *    (REQ-034/073 parity with the server-side closed contract).
 *  - The selection set matches the SDL contract leaf-for-leaf (plan §5.4):
 *    every section + every leaf, `generatedAt` and BOTH 30-day trends
 *    included. NO `id` selections anywhere — the entire subtree is composed
 *    of embedded value objects registered `keyFields: false` in the Apollo
 *    cache (D10; frontend/graphql/AGENTS.md embedded-type policy), so
 *    normalization keys are never needed.
 *  - Consumed via `useQuery` from `@apollo/client/react` in
 *    `PlatformAnalyticsContainer` (120s poll + manual `refetch()` — REQ-062).
 */
import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  AdminPlatformAnalyticsQuery,
  AdminPlatformAnalyticsQueryVariables,
} from "@/frontend/graphql/generated/gql/graphql";

export const adminPlatformAnalyticsQueryDocument: TypedDocumentNode<
  AdminPlatformAnalyticsQuery,
  AdminPlatformAnalyticsQueryVariables
> = gql`
  query AdminPlatformAnalytics {
    adminPlatformAnalytics {
      generatedAt
      users {
        totalCount
        activeCount
        suspendedCount
        blockedCount
        deletedCount
        adminsCount
        teachersCount
        studentsCount
        parentsCount
        newThisWeekCount
        recentlyActive24h
      }
      sessions {
        total
        today
        thisWeek
        thisMonth
        scheduled
        started
        completed
        cancelled
        disputed
        awaitingConfirmation
      }
      revenue {
        gatewayRevenueByCurrency {
          currency
          totalAmount
          last30DaysAmount
          paidPaymentsCount
        }
        offlineActivationsCount
      }
      subscriptions {
        total
        active
        pending
        expired
        cancelled
        suspended
        activeInWindowNow
      }
      teachers {
        certifiedCount
        evaluatorCount
        onlineNowCount
      }
      ratings {
        averageSessionRating
        sessionRatingsCount
        averageEvaluationScore
        evaluationScoresCount
      }
      health {
        pendingDisputes
        pendingWithdrawals
      }
      sessionTrendDaily {
        bucketStart
        sessionCount
      }
      revenueTrendDaily {
        bucketStart
        currency
        amount
      }
    }
  }
`;
