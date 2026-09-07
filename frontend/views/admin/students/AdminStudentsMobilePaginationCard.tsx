"use client";

/**
 * AdminStudentsMobilePaginationCard — the mobile (<md) pagination bar of
 * the admin student directory. The mobile pagination sits in its own card
 * (same 12px radius / `border.light` outline as the student cards) so it
 * doesn't float bare on the page background; the desktop pagination lives
 * inside the table card via the table's `pagination` slot.
 *
 * The pagination control itself is the SHARED `DirectoryPagination` from
 * the users directory (structurally compatible `pagination` label block).
 */

import { Box, Card } from "@mui/material";
import type { ReactNode } from "react";
import { DirectoryPagination } from "@/frontend/views/admin/users/directory";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

interface AdminStudentsMobilePaginationCardProps {
  readonly labels: AdminStudentsLabels;
  /** Zero-based current page. */
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
}

export function AdminStudentsMobilePaginationCard(props: AdminStudentsMobilePaginationCardProps): ReactNode {
  const { labels, page, pageSize, totalCount, onPageChange, onPageSizeChange } = props;
  return (
    <Box sx={{ display: { xs: "block", md: "none" } }}>
      <Card
        sx={theme => ({
          borderRadius: "12px",
          border: `1px solid ${theme.palette.border.light}`,
          boxShadow: theme.palette.shadow.card,
        })}
      >
        <DirectoryPagination
          labels={labels}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          borderedTop={false}
        />
      </Card>
    </Box>
  );
}
