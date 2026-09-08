"use client";

/**
 * AdminTeacherDetailDrawer — the per-teacher detail side-drawer of the
 * admin teacher directory, opened by clicking a desktop row / mobile card
 * or through the per-row view-details quick action.
 *
 * The drawer is PRESENTATIONAL: it renders only fields the directory item
 * already carries (no extra queries, no mutations) grouped in section
 * cards — identity (role-tinted avatar + contact rows with the copy-email
 * affordance), account status (the exact pill set the row cells render),
 * academic (rating + the FULL subject chip list — no overflow clamp), and
 * record (identifier). Every caption comes from the `AdminTeachers`
 * namespace; data values render verbatim.
 *
 * Layout: the shell, the shared section primitives and the shared
 * identity/record sections live in `frontend/views/admin/directory-shared/`
 * (`DirectoryDetailDrawer` / `DirectoryDrawerPrimitives` /
 * `DirectoryDrawer{Identity,Record}Section`); the status/academic sections
 * live beside this file in `AdminTeacherDetailDrawer/`; this entry owns the
 * teacher composition and the public component.
 */

import type { ReactNode } from "react";
import { DirectoryDetailDrawer } from "@/frontend/views/admin/directory-shared/DirectoryDetailDrawer";
import { DirectoryDrawerIdentitySection } from "@/frontend/views/admin/directory-shared/DirectoryDrawerIdentitySection";
import { DirectoryDrawerRecordSection } from "@/frontend/views/admin/directory-shared/DirectoryDrawerRecordSection";
import { TeacherDrawerAcademicSection } from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer/DrawerAcademicSection";
import { TeacherDrawerStatusSection } from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer/DrawerStatusSection";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import type { AppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Role lane for the drawer avatar (expression-passed — matches the rows). */
const TEACHER_AVATAR_ROLE = "Teacher" as const;

interface AdminTeacherDetailDrawerProps {
  /** Whether the drawer is open (the container keeps the item mounted through the exit transition). */
  readonly open: boolean;
  /** The selected teacher — `null` before the first open. */
  readonly teacher: TeacherDirectoryItem | null;
  readonly labels: AdminTeachersLabels;
  readonly locale: AppLocale;
  /** Close callback (Escape, backdrop click, close button). */
  readonly onClose: () => void;
  /** Invoked after the drawer's copy-email action resolves (drives the shared snackbar). */
  readonly onCopyEmail?: () => void;
}

export function AdminTeacherDetailDrawer({
  open,
  teacher,
  labels,
  locale,
  onClose,
  onCopyEmail,
}: AdminTeacherDetailDrawerProps): ReactNode {
  if (teacher === null) {
    return null;
  }
  return (
    <DirectoryDetailDrawer
      open={open}
      onClose={onClose}
      title={labels.drawer.detailsTitle}
      closeLabel={labels.drawer.close}
    >
      <DirectoryDrawerIdentitySection
        sectionLabel={labels.drawer.sectionIdentity}
        name={teacher.name}
        email={teacher.email}
        avatarRole={TEACHER_AVATAR_ROLE}
        copyEmailLabel={labels.quickActions.copyEmail}
        emailCopiedLabel={labels.quickActions.emailCopied}
        phoneLabel={labels.fields.phone}
        phone={teacher.phone}
        countryLabel={labels.fields.country}
        country={teacher.country}
        joinedLabel={labels.headers.joined}
        createdAt={teacher.createdAt}
        locale={locale}
        onCopyEmail={onCopyEmail}
      />
      <TeacherDrawerStatusSection teacher={teacher} labels={labels} />
      <TeacherDrawerAcademicSection teacher={teacher} labels={labels} locale={locale} />
      <DirectoryDrawerRecordSection
        sectionLabel={labels.drawer.sectionRecord}
        idLabel={labels.fields.id}
        id={teacher.id}
        viewProfileLabel={labels.quickActions.viewProfile}
      />
    </DirectoryDetailDrawer>
  );
}
