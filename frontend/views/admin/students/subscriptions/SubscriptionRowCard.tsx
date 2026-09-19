"use client";

/**
 * SubscriptionRowCard — one subscription row of the admin student drawer's
 * subscription-management section: the plan/status/start/end label-value
 * rows (the drawer's `DirectoryLabelValueRow` recipe, honest em-dash while
 * a period bound is pending) and the per-status lifecycle action buttons
 * (active → extend/cancel/change plan; expired → renew;
 * pending/cancelled → none).
 *
 * Presentational: the row data arrives via props; every label resolves in
 * the owning section through the `subscriptionAdmin` namespace. MUI v9
 * `sx`-only styling with the shared directory tone lanes (no hardcoded
 * colors); RTL/LTR discipline is inherited from the drawer.
 */
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { SubscriptionStatus } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  DirectoryEmptyValue,
  DirectoryLabelValueRow,
} from "@/frontend/views/admin/directory-shared/DirectoryDrawerPrimitives";
import {
  STATUS_TONE,
  type SubscriptionRow,
  type SubscriptionRowActions,
} from "@/frontend/views/admin/students/subscriptions/subscriptionAdmin.helpers";
import { toneColors } from "@/frontend/views/admin/users/utils";
import type { AppLocale } from "@/shared/locale";

/** The per-row caption + action labels the card renders (pre-resolved). */
export interface SubscriptionRowCardLabels {
  readonly fields: { readonly plan: string; readonly status: string; readonly start: string; readonly end: string };
  readonly actions: {
    readonly extend: string;
    readonly renew: string;
    readonly cancel: string;
    readonly changePlan: string;
  };
}

interface SubscriptionRowCardProps {
  readonly row: SubscriptionRow;
  /** Resolved per-status action availability (the pure matrix). */
  readonly actions: SubscriptionRowActions;
  /** Status labels keyed by the wire enum (resolved in the section). */
  readonly statusLabels: Record<SubscriptionStatus, string>;
  readonly labels: SubscriptionRowCardLabels;
  readonly locale: AppLocale;
  readonly onExtend: (row: SubscriptionRow) => void;
  readonly onRenew: (row: SubscriptionRow) => void;
  readonly onCancel: (row: SubscriptionRow) => void;
  readonly onChangePlan: (row: SubscriptionRow) => void;
}

export function SubscriptionRowCard({
  row,
  actions,
  statusLabels,
  labels,
  locale,
  onExtend,
  onRenew,
  onCancel,
  onChangePlan,
}: SubscriptionRowCardProps): ReactNode {
  return (
    <Box
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        p: 1,
      })}
    >
      <DirectoryLabelValueRow label={labels.fields.plan}>
        <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
          {row.plan.title}
        </Typography>
      </DirectoryLabelValueRow>
      <DirectoryLabelValueRow label={labels.fields.status}>
        <StatusChip status={row.status} labels={statusLabels} />
      </DirectoryLabelValueRow>
      <DirectoryLabelValueRow label={labels.fields.start}>
        {row.startDate === null ? <DirectoryEmptyValue /> : formatApplicantDate(row.startDate, locale)}
      </DirectoryLabelValueRow>
      <DirectoryLabelValueRow label={labels.fields.end}>
        {row.endDate === null ? <DirectoryEmptyValue /> : formatApplicantDate(row.endDate, locale)}
      </DirectoryLabelValueRow>
      {hasAnyAction(actions) && (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, pt: 1.5 }}>
          {actions.extend && (
            <Button size="small" variant="outlined" onClick={() => onExtend(row)}>
              {labels.actions.extend}
            </Button>
          )}
          {actions.renew && (
            <Button size="small" variant="outlined" onClick={() => onRenew(row)}>
              {labels.actions.renew}
            </Button>
          )}
          {actions.changePlan && (
            <Button size="small" variant="outlined" onClick={() => onChangePlan(row)}>
              {labels.actions.changePlan}
            </Button>
          )}
          {actions.cancel && (
            <Button size="small" variant="outlined" color="error" onClick={() => onCancel(row)}>
              {labels.actions.cancel}
            </Button>
          )}
        </Stack>
      )}
    </Box>
  );
}

/** Whether the status affords ANY lifecycle action (gates the button row). */
function hasAnyAction(actions: SubscriptionRowActions): boolean {
  return actions.extend || actions.renew || actions.cancel || actions.changePlan;
}

interface StatusChipProps {
  readonly status: SubscriptionStatus;
  readonly labels: Record<SubscriptionStatus, string>;
}

/** The lifecycle status chip on the status's tone lane. */
function StatusChip({ status, labels }: StatusChipProps): ReactNode {
  return (
    <Chip
      label={labels[status]}
      size="small"
      sx={theme => {
        const colors = toneColors(theme, STATUS_TONE[status]);
        return { bgcolor: colors.bg, color: colors.fg, fontWeight: 600 };
      }}
    />
  );
}
