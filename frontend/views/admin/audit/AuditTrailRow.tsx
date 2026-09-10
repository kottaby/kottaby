"use client";

/**
 * One trail row of the raw-MUI `Table`: locale-aware `createdAt`
 * stamp, actor, the reused `activity.action*` chip, entity columns and the
 * per-row expandable `details` block — rendered VERBATIM inside a
 * `dir="auto"` pre-formatted element (mixed-direction JSON blobs), with the
 * namespace em-dash placeholders for the null `details`/`entityId` cells.
 */

import { Box, TableCell, TableRow, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type {
  AdminAuditLogsQuery_adminAuditLogs_items,
  AuditActionType,
} from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { AuditDetailsDisclosure } from "@/frontend/views/admin/audit/AuditDetailsDisclosure";
import { bodyCellSx } from "@/frontend/views/admin/audit/audit-trail-skin";
import { DirectoryHeaderCell } from "@/frontend/views/admin/directory-shared/DirectoryHeaderCell";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface AuditTrailHeaderCellProps {
  readonly children: ReactNode;
  readonly width: string;
}

/**
 * Header cell — the shared uppercase directory header cell
 * (`DirectoryHeaderCell`), aliased under the audit-trail name for the
 * trail's header row in `AuditTrailResults`.
 */
export function AuditTrailHeaderCell(props: Readonly<AuditTrailHeaderCellProps>): ReactNode {
  return <DirectoryHeaderCell {...props} />;
}

interface AuditTrailRowProps {
  readonly entry: AdminAuditLogsQuery_adminAuditLogs_items;
  readonly tableLabels: AdminUsersLabels["auditTrail"]["table"];
  readonly locale: string;
  readonly actionLabels: Record<AuditActionType, string>;
  readonly isExpanded: boolean;
  readonly onToggleDetails: (entryId: string) => void;
}

export function AuditTrailRow({
  entry,
  tableLabels,
  locale,
  actionLabels,
  isExpanded,
  onToggleDetails,
}: Readonly<AuditTrailRowProps>): ReactNode {
  return (
    <TableRow sx={theme => ({ "&:hover": { backgroundColor: theme.palette.action.hover } })}>
      <TableCell sx={bodyCellSx}>
        <Typography variant="body2" component="p">
          {formatApplicantDate(entry.createdAt, locale)}
        </Typography>
      </TableCell>
      <TableCell sx={bodyCellSx}>
        <Typography variant="body2" component="p" sx={{ fontWeight: 600 }}>
          {entry.actorName}
        </Typography>
      </TableCell>
      <TableCell sx={bodyCellSx}>
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
      </TableCell>
      <TableCell sx={bodyCellSx}>
        <Typography variant="body2" component="p">
          {entry.entityType}
        </Typography>
      </TableCell>
      <TableCell sx={bodyCellSx}>
        {entry.entityId === null ? (
          <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {tableLabels.noEntityIdValue}
          </Typography>
        ) : (
          <Typography variant="body2" component="p">
            {entry.entityId}
          </Typography>
        )}
      </TableCell>
      <TableCell sx={bodyCellSx}>
        {entry.details !== null ? (
          <AuditDetailsDisclosure
            entryId={entry.id}
            details={entry.details}
            isExpanded={isExpanded}
            onToggleDetails={onToggleDetails}
            hideLabel={tableLabels.detailsHideLabel}
            showLabel={tableLabels.detailsShowLabel}
          />
        ) : (
          <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
            {tableLabels.noDetailsValue}
          </Typography>
        )}
      </TableCell>
    </TableRow>
  );
}
