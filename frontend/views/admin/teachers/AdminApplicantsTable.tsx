"use client";

/**
 * AdminApplicantsTable — the desktop (≥`md`) applicant-queue table.
 *
 * Mirrors `AdminTeachersTable`: card container (radius 12, `border.light`
 * outline, `shadow.card`); the header row sits on `surfaceContainerHigh`
 * with uppercase 12px/600 letter-spaced `text.secondary` cells; body rows
 * are ≥72px tall, separated by `border.light` hairlines — odd rows carry a
 * faint `action.hover` zebra tint and hover upgrades the row to
 * `action.selected`.
 *
 * Columns (start → end; they mirror visually under RTL automatically):
 * NAME (avatar + name profile link + ellipsized email + copy-email quick
 * action), STATUS (lifecycle chip + governance pills), ATTEMPTS (verbatim
 * count), LAST ATTEMPT (localized timestamp or em-dash), COOLDOWN (chip
 * while active, expiry timestamp, or em-dash), JOINED (localized
 * timestamp), ACTIONS (view-profile navigation). Each body row is rendered
 * by `AdminApplicantRow`.
 *
 * Loading renders stable-key skeleton rows (the rowgroup announces the
 * localized loading label); the empty state reuses the
 * `labels.applicantsEmptyState` copy via `AdminApplicantsEmptyState`. The
 * pagination footer is injected as a `pagination` slot rendered inside the
 * same card (top hairline from `DirectoryPagination`).
 */

import { Card, Skeleton, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import type { ReactNode } from "react";
import { AdminApplicantRow } from "@/frontend/views/admin/teachers/AdminApplicantRow";
import type { ApplicantDirectoryItem } from "@/frontend/views/admin/teachers/AdminApplicantRowCells";
import { AdminApplicantsEmptyState } from "@/frontend/views/admin/teachers/AdminApplicantsEmptyState";
import { ADMIN_APPLICANTS_SKELETON_KEYS } from "@/frontend/views/admin/teachers/adminApplicants.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminApplicantsTableProps {
  readonly labels: AdminTeachersLabels;
  readonly items: readonly ApplicantDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any row's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Footer slot rendered inside the card (the shared `DirectoryPagination` bar). */
  readonly pagination?: ReactNode;
}

const COLUMN_COUNT = 7;

export function AdminApplicantsTable(props: AdminApplicantsTableProps): ReactNode {
  const { labels, items, loading, hasFilters, onCopyEmail } = props;
  const locale = useAppLocale();
  return (
    <Card
      sx={theme => ({
        display: { xs: "none", md: "block" },
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        overflow: "hidden",
      })}
    >
      <Table sx={{ tableLayout: "fixed" }}>
        <TableHead>
          <TableRow sx={theme => ({ bgcolor: theme.palette.surfaceContainerHigh })}>
            <AdminApplicantsHeaderCell width="27%">{labels.headers.name}</AdminApplicantsHeaderCell>
            <AdminApplicantsHeaderCell width="17%">{labels.headers.status}</AdminApplicantsHeaderCell>
            <AdminApplicantsHeaderCell width="8%">{labels.applicantHeaders.attempts}</AdminApplicantsHeaderCell>
            <AdminApplicantsHeaderCell width="14%">{labels.applicantHeaders.lastAttempt}</AdminApplicantsHeaderCell>
            <AdminApplicantsHeaderCell width="14%">{labels.applicantHeaders.cooldown}</AdminApplicantsHeaderCell>
            <AdminApplicantsHeaderCell width="13%">{labels.headers.joined}</AdminApplicantsHeaderCell>
            <AdminApplicantsHeaderCell width="7%">{labels.quickActions.viewProfile}</AdminApplicantsHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody aria-label={loading && items.length === 0 ? labels.applicantsLoading : undefined}>
          {loading &&
            items.length === 0 &&
            ADMIN_APPLICANTS_SKELETON_KEYS.map(rowKey => (
              <TableRow key={rowKey}>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}
                >
                  <Skeleton variant="text" />
                </TableCell>
              </TableRow>
            ))}
          {!loading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} sx={{ borderBottom: 0 }}>
                <AdminApplicantsEmptyState labels={labels} hasFilters={hasFilters} />
              </TableCell>
            </TableRow>
          )}
          {items.map((applicant, index) => (
            <AdminApplicantRow
              key={applicant.id}
              applicant={applicant}
              labels={labels}
              locale={locale}
              striped={index % 2 === 1}
              onCopyEmail={onCopyEmail}
            />
          ))}
        </TableBody>
      </Table>
      {props.pagination}
    </Card>
  );
}

interface AdminApplicantsHeaderCellProps {
  readonly children: ReactNode;
  readonly width?: string;
}

/** Header cell — uppercase 12px / 600 / letter-spaced, `text.secondary`. */
function AdminApplicantsHeaderCell({ children, width }: AdminApplicantsHeaderCellProps): ReactNode {
  return (
    <TableCell
      sx={theme => ({
        width,
        textTransform: "uppercase",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.06em",
        color: theme.palette.text.secondary,
        textAlign: "start",
        borderBottom: `1px solid ${theme.palette.border.light}`,
      })}
    >
      {children}
    </TableCell>
  );
}
