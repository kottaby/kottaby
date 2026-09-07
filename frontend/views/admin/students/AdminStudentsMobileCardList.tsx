"use client";

/**
 * AdminStudentsMobileCardList — the mobile (< md) rendering of the admin
 * student directory: a vertical stack of per-student cards (16px gap). The
 * stack keeps a 96px `paddingBlockEnd` as a gap before the pagination card.
 *
 * Loading renders stable-key skeleton cards (announced through the
 * localized loading label); the empty state wraps `AdminStudentsEmptyState`
 * in a card.
 */

import { Box, Card, Stack } from "@mui/material";
import type { ReactNode } from "react";
import { AdminStudentMobileCard } from "@/frontend/views/admin/students/AdminStudentMobileCard";
import type { StudentDirectoryItem } from "@/frontend/views/admin/students/AdminStudentRowCells";
import { AdminStudentsEmptyState } from "@/frontend/views/admin/students/AdminStudentsEmptyState";
import { ADMIN_STUDENTS_SKELETON_KEYS } from "@/frontend/views/admin/students/adminStudentsDirectory.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

interface AdminStudentsMobileCardListProps {
  readonly labels: AdminStudentsLabels;
  readonly items: readonly StudentDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any card's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer for a card (the directory owns the drawer). */
  readonly onViewDetails?: (student: StudentDirectoryItem) => void;
}

export function AdminStudentsMobileCardList(props: AdminStudentsMobileCardListProps): ReactNode {
  const { labels, items, loading, hasFilters, onCopyEmail, onViewDetails } = props;
  const locale = useAppLocale();
  return (
    <Stack
      spacing={2}
      sx={{ display: { xs: "flex", md: "none" }, paddingBlockEnd: 12 /* 96px gap before the pagination card */ }}
    >
      {loading && items.length === 0 && (
        <Box component="output" aria-busy="true" aria-label={labels.loading} sx={{ display: "contents" }}>
          <Stack spacing={2}>
            {ADMIN_STUDENTS_SKELETON_KEYS.slice(0, 4).map(rowKey => (
              <Card
                key={rowKey}
                sx={theme => ({
                  borderRadius: "12px",
                  border: `1px solid ${theme.palette.border.light}`,
                  boxShadow: theme.palette.shadow.card,
                  p: 2,
                  height: 132,
                })}
              />
            ))}
          </Stack>
        </Box>
      )}
      {!loading && items.length === 0 && (
        <Card
          sx={theme => ({
            borderRadius: "12px",
            border: `1px solid ${theme.palette.border.light}`,
            boxShadow: theme.palette.shadow.card,
          })}
        >
          <AdminStudentsEmptyState labels={labels} hasFilters={hasFilters} />
        </Card>
      )}
      {items.map(student => (
        <AdminStudentMobileCard
          key={student.id}
          labels={labels}
          student={student}
          locale={locale}
          onCopyEmail={onCopyEmail}
          onViewDetails={onViewDetails}
        />
      ))}
    </Stack>
  );
}
