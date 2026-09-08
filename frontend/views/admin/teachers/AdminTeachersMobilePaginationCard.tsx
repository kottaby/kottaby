"use client";

/**
 * AdminTeachersMobilePaginationCard — the mobile (<md) pagination bar of
 * the admin teacher directory, rendered on the shared
 * `DirectoryMobilePaginationCard` (its own card, so it doesn't float bare
 * on the page background; the desktop pagination lives inside the table
 * card via the table's `pagination` slot).
 */

import type { ReactNode } from "react";
import { DirectoryMobilePaginationCard } from "@/frontend/views/admin/directory-shared/DirectoryMobilePaginationCard";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminTeachersMobilePaginationCardProps {
  readonly labels: AdminTeachersLabels;
  /** Zero-based current page. */
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
}

export function AdminTeachersMobilePaginationCard(props: AdminTeachersMobilePaginationCardProps): ReactNode {
  return <DirectoryMobilePaginationCard {...props} />;
}
