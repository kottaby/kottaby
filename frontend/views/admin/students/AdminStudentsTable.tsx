"use client";

/**
 * AdminStudentsTable — the desktop (≥`md`) admin student directory table.
 *
 * Card container (radius 12, `border.light` outline, `shadow.card`); the
 * header row sits on `surfaceContainerHigh` with uppercase 12px/600
 * letter-spaced `text.secondary` cells; body rows are ≥72px tall, separated
 * by `border.light` hairlines — odd rows carry a faint `action.hover` zebra
 * tint and pointer hover upgrades the row to `action.selected`.
 *
 * Columns (start → end; they mirror visually under RTL automatically):
 * NAME (avatar + name + ellipsized email + copy-email quick action),
 * BALANCES (four compact lane-tinted badges), PARENT (parent identity or
 * the independent chip), LANGUAGES (primary + another chips), TRIAL
 * (granted badge + timestamp, or em-dash), JOINED (localized timestamp).
 * Each body row is rendered by `AdminStudentRow`.
 *
 * Loading renders stable-key skeleton rows (the rowgroup announces the
 * localized loading label); the empty state reuses the
 * `labels.emptyState` copy via `AdminStudentsEmptyState`. The pagination
 * footer is injected as a `pagination` slot rendered inside the same card
 * (top hairline from `DirectoryPagination`).
 */

import { Card, Skeleton, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import type { ReactNode } from "react";
import { AdminStudentRow } from "@/frontend/views/admin/students/AdminStudentRow";
import type { StudentDirectoryItem } from "@/frontend/views/admin/students/AdminStudentRowCells";
import { AdminStudentsEmptyState } from "@/frontend/views/admin/students/AdminStudentsEmptyState";
import { ADMIN_STUDENTS_SKELETON_KEYS } from "@/frontend/views/admin/students/adminStudentsDirectory.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

interface AdminStudentsTableProps {
  readonly labels: AdminStudentsLabels;
  readonly items: readonly StudentDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any row's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer for a row (the directory owns the drawer). */
  readonly onViewDetails?: (student: StudentDirectoryItem) => void;
  /** Footer slot rendered inside the card (the shared `DirectoryPagination` bar). */
  readonly pagination?: ReactNode;
}

const COLUMN_COUNT = 6;

export function AdminStudentsTable(props: AdminStudentsTableProps): ReactNode {
  const { labels, items, loading, hasFilters, onCopyEmail, onViewDetails } = props;
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
            <AdminStudentsHeaderCell width="26%">{labels.headers.name}</AdminStudentsHeaderCell>
            <AdminStudentsHeaderCell width="20%">{labels.headers.balances}</AdminStudentsHeaderCell>
            <AdminStudentsHeaderCell width="16%">{labels.headers.parent}</AdminStudentsHeaderCell>
            <AdminStudentsHeaderCell width="11%">{labels.headers.languages}</AdminStudentsHeaderCell>
            <AdminStudentsHeaderCell width="15%">{labels.headers.trial}</AdminStudentsHeaderCell>
            <AdminStudentsHeaderCell width="12%">{labels.headers.joined}</AdminStudentsHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody aria-label={loading && items.length === 0 ? labels.loading : undefined}>
          {loading &&
            items.length === 0 &&
            ADMIN_STUDENTS_SKELETON_KEYS.map(rowKey => (
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
                <AdminStudentsEmptyState labels={labels} hasFilters={hasFilters} />
              </TableCell>
            </TableRow>
          )}
          {items.map((student, index) => (
            <AdminStudentRow
              key={student.id}
              student={student}
              labels={labels}
              locale={locale}
              striped={index % 2 === 1}
              onCopyEmail={onCopyEmail}
              onViewDetails={onViewDetails}
            />
          ))}
        </TableBody>
      </Table>
      {props.pagination}
    </Card>
  );
}

interface AdminStudentsHeaderCellProps {
  readonly children: ReactNode;
  readonly width?: string;
}

/** Header cell — uppercase 12px / 600 / letter-spaced, `text.secondary`. */
function AdminStudentsHeaderCell({ children, width }: AdminStudentsHeaderCellProps): ReactNode {
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
