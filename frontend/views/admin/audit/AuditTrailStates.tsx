"use client";

/**
 * Audit-trail state surfaces: the `aria-busy` skeleton card, the honest
 * empty state, and the settled-failure surface (the shared `RetryableNotice`
 * for the rate-limited / service-unavailable classes, else the shared
 * `ErrorRetryAlert` generic notice wired to `refetch`). The page
 * header and filter bar stay interactive around every settled failure.
 */

import { Box, Card, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { RetryableNotice, type RetryableNoticeKind } from "@/frontend/components/ui/RetryableNotice";
import { surfaceCardSx } from "@/frontend/views/admin/audit/audit-trail-skin";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";
import type { CommonLabels } from "@/shared/locale/types/common";

const SKELETON_ROW_COUNT = 6;

export function AuditTrailSkeleton(): ReactNode {
  return (
    <Card sx={surfaceCardSx}>
      <Box component="output" aria-busy sx={{ display: "block" }}>
        <Stack spacing={2} sx={{ padding: 2.5 }}>
          {Array.from({ length: SKELETON_ROW_COUNT }, (_unused, index) => `audit-trail-skeleton-row-${index + 1}`).map(
            rowKey => (
              <Skeleton key={rowKey} variant="rounded" height={44} />
            )
          )}
        </Stack>
      </Box>
    </Card>
  );
}

interface AuditTrailEmptyStateProps {
  readonly emptyState: AdminUsersLabels["auditTrail"]["emptyState"];
}

export function AuditTrailEmptyState({ emptyState }: Readonly<AuditTrailEmptyStateProps>): ReactNode {
  return (
    <Card sx={surfaceCardSx}>
      <Stack spacing={1} sx={{ alignItems: "center", padding: 6 }}>
        <Typography variant="h6" component="h2">
          {emptyState.title}
        </Typography>
        <Typography
          variant="body2"
          component="p"
          sx={theme => ({ color: theme.palette.text.secondary, maxWidth: 480, textAlign: "center" })}
        >
          {emptyState.message}
        </Typography>
      </Stack>
    </Card>
  );
}

interface AuditTrailLoadErrorProps {
  readonly labels: AdminUsersLabels["auditTrail"];
  readonly commonLabels: CommonLabels;
  readonly retryableKind: RetryableNoticeKind | null;
  readonly onRetry: () => void;
  readonly retryPending: boolean;
}

export function AuditTrailLoadError({
  labels,
  commonLabels,
  retryableKind,
  onRetry,
  retryPending,
}: Readonly<AuditTrailLoadErrorProps>): ReactNode {
  if (retryableKind !== null) {
    return <RetryableNotice kind={retryableKind} onRetry={onRetry} retryInFlight={retryPending} />;
  }
  return (
    <ErrorRetryAlert
      title={labels.errorState.title}
      retryLabel={commonLabels.retry}
      retryPending={retryPending}
      onRetry={onRetry}
    >
      <Typography variant="body2" component="p">
        {labels.errorState.message}
      </Typography>
    </ErrorRetryAlert>
  );
}
