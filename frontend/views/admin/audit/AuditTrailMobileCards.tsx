"use client";

/**
 * AuditTrailMobileCards — the mobile (< md) rendering of the audit trail:
 * a vertical stack of per-entry cards replacing the desktop table's
 * horizontal-scroll track (an 860px min-width table inside a 390px
 * viewport shears mid-column with no visible affordance).
 *
 * Each card mirrors the desktop row's semantics one-to-one — `createdAt`
 * stamp, actor, the same action chip, entity type/id, and the per-entry
 * expandable verbatim `details` block in a `dir="auto"` pre — reusing the
 * shared `tableLabels` vocabulary so no new copy is introduced. Visible
 * only below the `md` breakpoint; the table owns `md` and up.
 */

import { Box, Card, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type {
  AdminAuditLogsQuery_adminAuditLogs_items,
  AuditActionType,
} from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { AuditDetailsDisclosure } from "@/frontend/views/admin/audit/AuditDetailsDisclosure";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type AuditTableLabels = AdminUsersLabels["auditTrail"]["table"];

interface AuditTrailMobileCardsProps {
  readonly entries: readonly AdminAuditLogsQuery_adminAuditLogs_items[];
  readonly tableLabels: AuditTableLabels;
  readonly locale: string;
  readonly actionLabels: Record<AuditActionType, string>;
  readonly expandedDetailsId: string | null;
  readonly onToggleDetails: (entryId: string) => void;
}

/** Row label + value line shared by the card's fact grid. */
function CardFact({
  label,
  value,
  muted = false,
}: Readonly<{ label: string; value: ReactNode; muted?: boolean }>): ReactNode {
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
      <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="p"
        sx={muted ? theme => ({ color: theme.palette.text.secondary }) : { fontWeight: 600 }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

/** One audit entry card — mirrors the desktop row's cell semantics. */
function AuditTrailCard({
  entry,
  tableLabels,
  locale,
  actionLabels,
  isExpanded,
  onToggleDetails,
}: Readonly<{
  entry: AdminAuditLogsQuery_adminAuditLogs_items;
  tableLabels: AuditTableLabels;
  locale: string;
  actionLabels: Record<AuditActionType, string>;
  isExpanded: boolean;
  onToggleDetails: (entryId: string) => void;
}>): ReactNode {
  return (
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        p: 2,
      })}
    >
      <Stack spacing={1.25}>
        <CardFact label={tableLabels.whenHeader} value={formatApplicantDate(entry.createdAt, locale)} muted />
        <CardFact label={tableLabels.actorHeader} value={entry.actorName} />
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Typography variant="caption" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {tableLabels.actionHeader}
          </Typography>
          <Box
            component="span"
            sx={theme => ({
              display: "inline-flex",
              alignItems: "center",
              padding: theme.spacing(0.25, 1.25),
              borderRadius: 999,
              backgroundColor: theme.palette.secondaryContainer,
              color: theme.palette.onSecondaryContainer,
              fontSize: 13,
              fontWeight: 600,
            })}
          >
            {actionLabels[entry.actionType]}
          </Box>
        </Stack>
        <CardFact label={tableLabels.entityTypeHeader} value={entry.entityType} muted />
        <CardFact
          label={tableLabels.entityIdHeader}
          muted={entry.entityId === null}
          value={entry.entityId ?? tableLabels.noEntityIdValue}
        />
        {entry.details !== null ? (
          <Stack spacing={1}>
            <AuditDetailsDisclosure
              entryId={entry.id}
              details={entry.details}
              isExpanded={isExpanded}
              onToggleDetails={onToggleDetails}
              hideLabel={tableLabels.detailsHideLabel}
              showLabel={tableLabels.detailsShowLabel}
              alignFlexStart
            />
          </Stack>
        ) : (
          <CardFact label={tableLabels.detailsHeader} value={tableLabels.noDetailsValue} muted />
        )}
      </Stack>
    </Card>
  );
}

/** Mobile (< md) entry-card stack — see the module docblock. */
export function AuditTrailMobileCards(props: Readonly<AuditTrailMobileCardsProps>): ReactNode {
  return (
    <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }} data-testid="audit-trail-mobile-cards">
      {props.entries.map(entry => (
        <AuditTrailCard
          key={entry.id}
          entry={entry}
          tableLabels={props.tableLabels}
          locale={props.locale}
          actionLabels={props.actionLabels}
          isExpanded={props.expandedDetailsId === entry.id}
          onToggleDetails={props.onToggleDetails}
        />
      ))}
    </Stack>
  );
}
