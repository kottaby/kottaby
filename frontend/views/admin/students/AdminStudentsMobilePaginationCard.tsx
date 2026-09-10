"use client";

/**
 * AdminStudentsMobilePaginationCard — the mobile (<md) pagination bar of
 * the admin student directory, rendered on the shared
 * `DirectoryMobilePaginationCard` (its own card, so it doesn't float bare
 * on the page background; the desktop pagination lives inside the table
 * card via the table's `pagination` slot).
 */

import type { ReactNode } from "react";
import { DirectoryMobilePaginationCard } from "@/frontend/views/admin/directory-shared/DirectoryMobilePaginationCard";
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
  return <DirectoryMobilePaginationCard {...props} />;
}
