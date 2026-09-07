"use client";

/**
 * AdminStudentRow — one body row of the desktop `AdminStudentsTable`:
 * identity (avatar/name/email + copy-email quick action + the explicit
 * view-details quick action), session balances (four compact badges),
 * parent identity, language chips, trial state, and the localized joined
 * timestamp.
 *
 * The row opens the detail drawer on click (pointer convenience); the
 * identity cell's view-details IconButton is the keyboard/touch affordance
 * (`onViewDetails` is optional — clicking stays inert when the directory
 * renders without a drawer). The row enforces the 72px body-row height on
 * the CELLS (a row's own height is a minimum; `py: 1.5` alone measured
 * short once line-heights settled). `verticalAlign: middle` keeps
 * single-line cells centered within the 72px band. Even rows carry a faint
 * zebra tint (`action.hover`); hover upgrades the whole row to
 * `action.selected` and shows the pointer cursor so the row reads as
 * clickable.
 */

import { TableCell, TableRow } from "@mui/material";
import type { ReactNode } from "react";
import {
  StudentBalancesBadges,
  type StudentDirectoryItem,
  StudentIdentityCell,
  StudentJoinedText,
  StudentLanguageChips,
  StudentParentContent,
  StudentTrialContent,
} from "@/frontend/views/admin/students/AdminStudentRowCells";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

interface AdminStudentRowProps {
  readonly student: StudentDirectoryItem;
  readonly labels: AdminStudentsLabels;
  readonly locale: "ar" | "en";
  /** `true` paints the faint zebra tint on this row (odd body-row index). */
  readonly striped?: boolean;
  /** Invoked after the identity cell's copy-email action resolves. */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer for this row (the directory owns the drawer). */
  readonly onViewDetails?: (student: StudentDirectoryItem) => void;
}

export function AdminStudentRow({
  student,
  labels,
  locale,
  striped,
  onCopyEmail,
  onViewDetails,
}: AdminStudentRowProps): ReactNode {
  const openDetails = onViewDetails === undefined ? undefined : () => onViewDetails(student);
  return (
    <TableRow
      onClick={openDetails}
      sx={theme => ({
        height: 72,
        bgcolor: striped ? theme.palette.action.hover : "transparent",
        ...(openDetails !== undefined && { cursor: "pointer" }),
        "& td": {
          height: 72,
          py: 1.5,
          verticalAlign: "middle",
          borderBottom: `1px solid ${theme.palette.border.light}`,
        },
        "&:last-child td": { borderBottom: 0 },
        "&:hover": { bgcolor: theme.palette.action.selected },
      })}
    >
      <StudentIdentityCell student={student} labels={labels} onCopyEmail={onCopyEmail} onViewDetails={openDetails} />
      <TableCell sx={{ minWidth: 0 }}>
        <StudentBalancesBadges student={student} labels={labels} />
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <StudentParentContent student={student} labels={labels} />
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <StudentLanguageChips student={student} />
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <StudentTrialContent student={student} locale={locale} labels={labels} />
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <StudentJoinedText student={student} locale={locale} />
      </TableCell>
    </TableRow>
  );
}
