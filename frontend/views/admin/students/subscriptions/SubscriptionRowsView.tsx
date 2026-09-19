"use client";

/**
 * SubscriptionRowsView — the body of the drawer's subscription-management
 * section: the query-failure alert, the loading skeleton, the empty state,
 * or the newest-first row cards. Split from `SubscriptionAdminSection` so
 * the section composes reads + writes + dialog state while this component
 * owns the list presentation (the directory label-value recipe plus the
 * per-status action buttons).
 *
 * Presentational: rows arrive pre-sorted; the status-label table resolves
 * here once per render from the namespace's per-enum slots (keyed by the
 * wire enum — never runtime string literals). Every visible string flows
 * from the `subscriptionAdmin` namespace; MUI v9 `sx`-only styling with
 * theme tokens only.
 */
import { CardMembershipOutlined as CardMembershipIcon } from "@mui/icons-material";
import { Box, Skeleton, Stack } from "@mui/material";
import type { ReactNode } from "react";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { SubscriptionStatus } from "@/frontend/graphql/generated/gql/graphql";
import { DirectoryErrorAlert } from "@/frontend/views/admin/directory-shared/DirectoryErrorAlert";
import type { OpenSubscriptionDialogKind } from "@/frontend/views/admin/students/subscriptions/hooks";
import { SubscriptionRowCard } from "@/frontend/views/admin/students/subscriptions/SubscriptionRowCard";
import {
  actionsForStatus,
  type SubscriptionRow,
} from "@/frontend/views/admin/students/subscriptions/subscriptionAdmin.helpers";
import type { AppLocale } from "@/shared/locale";
import type { SubscriptionAdminLabels } from "@/shared/locale/types/subscriptionAdmin";

interface SubscriptionRowsViewProps {
  readonly rows: readonly SubscriptionRow[];
  readonly loading: boolean;
  readonly hasQueryError: boolean;
  readonly errorCode: string | null;
  readonly labels: SubscriptionAdminLabels;
  readonly locale: AppLocale;
  readonly onOpenDialog: (kind: OpenSubscriptionDialogKind, row: SubscriptionRow) => void;
  readonly onRetry: () => void;
}

/**
 * The section's body: the query-failure alert, the loading skeleton, the
 * empty state, or the newest-first row cards (status labels resolved once
 * per render from the namespace's per-enum slots).
 */
export function SubscriptionRowsView({
  rows,
  loading,
  hasQueryError,
  errorCode,
  labels,
  locale,
  onOpenDialog,
  onRetry,
}: SubscriptionRowsViewProps): ReactNode {
  const statusLabels: Record<SubscriptionStatus, string> = {
    [SubscriptionStatus.Active]: labels.status.active,
    [SubscriptionStatus.Expired]: labels.status.expired,
    [SubscriptionStatus.Pending]: labels.status.pending,
    [SubscriptionStatus.Cancelled]: labels.status.cancelled,
    [SubscriptionStatus.Suspended]: labels.status.suspended,
  };

  let body: ReactNode;
  if (loading && rows.length === 0) {
    body = <SubscriptionSectionSkeleton />;
  } else if (rows.length === 0) {
    body = (
      <IconCircleEmptyState
        testId="subscription-admin-empty-state"
        icon={<CardMembershipIcon sx={theme => ({ fontSize: 36, color: theme.palette.text.secondary })} />}
        title={labels.emptyState.title}
        body={labels.emptyState.message}
      />
    );
  } else {
    body = (
      <Stack sx={{ gap: 1.5 }}>
        {rows.map(row => (
          <SubscriptionRowCard
            key={row.id}
            row={row}
            actions={actionsForStatus(row.status)}
            statusLabels={statusLabels}
            labels={{ fields: labels.fields, actions: labels.actions }}
            locale={locale}
            onExtend={target => onOpenDialog("extend", target)}
            onRenew={target => onOpenDialog("renew", target)}
            onCancel={target => onOpenDialog("cancel", target)}
            onChangePlan={target => onOpenDialog("changePlan", target)}
          />
        ))}
      </Stack>
    );
  }

  return (
    <>
      {hasQueryError && (
        <Box sx={{ mb: 2 }}>
          <DirectoryErrorAlert labels={labels.errorState} onRetry={onRetry} errorCode={errorCode} />
        </Box>
      )}
      {body}
    </>
  );
}

/** The section's loading state — two row-card skeletons. */
function SubscriptionSectionSkeleton(): ReactNode {
  return (
    <Stack sx={{ gap: 1.5 }}>
      {[0, 1].map(index => (
        <Box
          key={`subscription-skeleton-${String(index)}`}
          sx={theme => ({
            borderRadius: "12px",
            border: `1px solid ${theme.palette.border.light}`,
            p: 1,
          })}
        >
          <Skeleton variant="text" height={28} sx={{ mb: 1 }} />
          <Skeleton variant="text" height={22} />
          <Skeleton variant="text" height={22} />
          <Skeleton variant="rectangular" height={32} sx={{ borderRadius: 1, mt: 1 }} />
        </Box>
      ))}
    </Stack>
  );
}
