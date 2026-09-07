"use client";

/**
 * AdminTeachersTable — the desktop (≥`md`) admin teacher directory table.
 *
 * Card container (radius 12, `border.light` outline, `shadow.card`); the
 * header row sits on `surfaceContainerHigh` with uppercase 12px/600
 * letter-spaced `text.secondary` cells; body rows are ≥72px tall, separated
 * by `border.light` hairlines — odd rows carry a faint `action.hover` zebra
 * tint and pointer hover upgrades the row to `action.selected`.
 *
 * Columns (start → end; they mirror visually under RTL automatically):
 * NAME (avatar + name + ellipsized email + copy-email quick action),
 * STATUS (approval pill + presence + governance pills), RATING (star +
 * one-decimal localized value), SUBJECTS (chips with a "+N" overflow chip),
 * EVALUATOR (chip or em-dash), JOINED (localized timestamp). Each body row
 * is rendered by `AdminTeacherRow`.
 *
 * Loading renders stable-key skeleton rows (the rowgroup announces the
 * localized loading label); the empty state reuses the
 * `labels.emptyState` copy via `AdminTeachersEmptyState`. The pagination
 * footer is injected as a `pagination` slot rendered inside the same card
 * (top hairline from `DirectoryPagination`).
 */

import { Card, Skeleton, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import type { ReactNode } from "react";
import { AdminTeacherRow } from "@/frontend/views/admin/teachers/AdminTeacherRow";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { AdminTeachersEmptyState } from "@/frontend/views/admin/teachers/AdminTeachersEmptyState";
import { ADMIN_TEACHERS_SKELETON_KEYS } from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminTeachersTableProps {
  readonly labels: AdminTeachersLabels;
  readonly items: readonly TeacherDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any row's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Footer slot rendered inside the card (the shared `DirectoryPagination` bar). */
  readonly pagination?: ReactNode;
}

const COLUMN_COUNT = 6;

export function AdminTeachersTable(props: AdminTeachersTableProps): ReactNode {
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
            <AdminTeachersHeaderCell width="26%">{labels.headers.name}</AdminTeachersHeaderCell>
            <AdminTeachersHeaderCell width="21%">{labels.headers.status}</AdminTeachersHeaderCell>
            <AdminTeachersHeaderCell width="10%">{labels.headers.rating}</AdminTeachersHeaderCell>
            <AdminTeachersHeaderCell width="20%">{labels.headers.subjects}</AdminTeachersHeaderCell>
            <AdminTeachersHeaderCell width="11%">{labels.statusPills.evaluator}</AdminTeachersHeaderCell>
            <AdminTeachersHeaderCell width="12%">{labels.headers.joined}</AdminTeachersHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody aria-label={loading && items.length === 0 ? labels.loading : undefined}>
          {loading &&
            items.length === 0 &&
            ADMIN_TEACHERS_SKELETON_KEYS.map(rowKey => (
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
                <AdminTeachersEmptyState labels={labels} hasFilters={hasFilters} />
              </TableCell>
            </TableRow>
          )}
          {items.map((teacher, index) => (
            <AdminTeacherRow
              key={teacher.id}
              teacher={teacher}
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

interface AdminTeachersHeaderCellProps {
  readonly children: ReactNode;
  readonly width?: string;
}

/** Header cell — uppercase 12px / 600 / letter-spaced, `text.secondary`. */
function AdminTeachersHeaderCell({ children, width }: AdminTeachersHeaderCellProps): ReactNode {
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
