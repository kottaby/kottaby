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
 * The Drawer uses the DEFAULT anchor (no `anchor` prop) exactly like
 * `DashboardSidebar` — the codebase runs the RTL emotion cache, which
 * mirrors the paper to the start edge in Arabic automatically;
 * `theme.direction` is never set, so no anchor-side branching is needed.
 *
 * Accessibility: Escape and backdrop click close the drawer (temporary
 * Drawer defaults); the close button and every quick action carry 44px
 * touch targets; one drawer instance exists per directory (owned by the
 * container), so only one detail surface can ever be open at a time.
 *
 * MUI v9 discipline: `sx`-only styling, colors via theme callbacks,
 * `*Outlined` icons.
 *
 * Layout: the section cards and their atoms are split across the
 * `AdminTeacherDetailDrawer/` siblings (DrawerPrimitives + one module per
 * section); this entry owns the drawer shell and the public component.
 */

import { CloseOutlined as CloseIcon } from "@mui/icons-material";
import { Box, Drawer, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { TeacherDrawerAcademicSection } from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer/DrawerAcademicSection";
import { TeacherDrawerIdentitySection } from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer/DrawerIdentitySection";
import { TeacherDrawerRecordSection } from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer/DrawerRecordSection";
import { TeacherDrawerStatusSection } from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer/DrawerStatusSection";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import type { AppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Drawer paper width — clamps inside narrow viewports. */
const DRAWER_WIDTH = 420;

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
    <Drawer
      open={open}
      onClose={onClose}
      // Default anchor (no `anchor` prop) — mirrors `DashboardSidebar`; the
      // RTL emotion cache mirrors the paper to the start edge in Arabic.
      sx={{
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          maxWidth: "calc(100vw - 24px)",
          boxSizing: "border-box",
        },
      }}
    >
      <Stack sx={{ height: "100%" }}>
        <Stack
          direction="row"
          sx={theme => ({
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 0.75,
            borderBottom: `1px solid ${theme.palette.border.light}`,
          })}
        >
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            {labels.drawer.detailsTitle}
          </Typography>
          <Tooltip title={labels.drawer.close} placement="bottom">
            <IconButton
              aria-label={labels.drawer.close}
              onClick={onClose}
              sx={theme => ({
                ...focusVisibleRingSx,
                minWidth: 44,
                minHeight: 44,
                color: theme.palette.text.secondary,
              })}
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Stack>
        <Box sx={theme => ({ overflowY: "auto", p: 2, bgcolor: theme.palette.surfaceContainerLowest, flexGrow: 1 })}>
          <Stack spacing={2} sx={{ alignItems: "stretch" }}>
            <TeacherDrawerIdentitySection teacher={teacher} labels={labels} locale={locale} onCopyEmail={onCopyEmail} />
            <TeacherDrawerStatusSection teacher={teacher} labels={labels} />
            <TeacherDrawerAcademicSection teacher={teacher} labels={labels} locale={locale} />
            <TeacherDrawerRecordSection teacher={teacher} labels={labels} />
          </Stack>
        </Box>
      </Stack>
    </Drawer>
  );
}
