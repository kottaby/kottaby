"use client";

/**
 * AdminTeachersMobileCardList — the mobile (< md) rendering of the admin
 * teacher directory: a vertical stack of per-teacher cards (16px gap). The
 * stack keeps a 96px `paddingBlockEnd` as a gap before the pagination card.
 *
 * Loading renders stable-key skeleton cards (announced through the
 * localized loading label); the empty state wraps `AdminTeachersEmptyState`
 * in a card.
 */

import { Box, Card, Stack } from "@mui/material";
import type { ReactNode } from "react";
import { AdminTeacherMobileCard } from "@/frontend/views/admin/teachers/AdminTeacherMobileCard";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { AdminTeachersEmptyState } from "@/frontend/views/admin/teachers/AdminTeachersEmptyState";
import { ADMIN_TEACHERS_SKELETON_KEYS } from "@/frontend/views/admin/teachers/adminTeachersDirectory.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminTeachersMobileCardListProps {
  readonly labels: AdminTeachersLabels;
  readonly items: readonly TeacherDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any card's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
  /** Opens the detail drawer for a card (the directory owns the drawer). */
  readonly onViewDetails?: (teacher: TeacherDirectoryItem) => void;
}

export function AdminTeachersMobileCardList(props: AdminTeachersMobileCardListProps): ReactNode {
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
            {ADMIN_TEACHERS_SKELETON_KEYS.slice(0, 4).map(rowKey => (
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
          <AdminTeachersEmptyState labels={labels} hasFilters={hasFilters} />
        </Card>
      )}
      {items.map(teacher => (
        <AdminTeacherMobileCard
          key={teacher.id}
          labels={labels}
          teacher={teacher}
          locale={locale}
          onCopyEmail={onCopyEmail}
          onViewDetails={onViewDetails}
        />
      ))}
    </Stack>
  );
}
