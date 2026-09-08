"use client";

/**
 * AdminStudentDetailDrawer — the per-student detail side-drawer of the
 * admin student directory, opened by clicking a desktop row / mobile card
 * or through the per-row view-details quick action.
 *
 * The drawer is PRESENTATIONAL: it renders only fields the directory item
 * already carries (no extra queries, no mutations) grouped in section
 * cards — identity, balances, parent placement, languages, free trial, and
 * record. Every caption comes from the `AdminStudents` namespace; data
 * values render verbatim.
 *
 * Layout: the shared section primitives and the four large sections live
 * beside this file (`AdminStudentDrawerPrimitives.tsx` /
 * `AdminStudentDrawer{Identity,Balances,Placement,Record}Section.tsx`);
 * this module keeps the drawer shell plus the two thin chip sections.
 *
 * RTL/bidi: Latin names/emails/phones are pinned with the HTML `dir="ltr"`
 * ATTRIBUTE + `unicodeBidi: isolate` — a CSS `direction` rule MUST NOT be
 * added (stylis-plugin-rtl flips it and clips the string's head), the same
 * recipe the directory rows and the users detail page use. The Drawer uses
 * the DEFAULT anchor (no `anchor` prop) exactly like `DashboardSidebar` —
 * the codebase runs the RTL emotion cache, which mirrors the paper to the
 * start edge in Arabic automatically; `theme.direction` is never set, so
 * no anchor-side branching is needed.
 *
 * Accessibility: Escape and backdrop click close the drawer (temporary
 * Drawer defaults); the close button and every quick action carry 44px
 * touch targets; one drawer instance exists per directory (owned by the
 * container), so only one detail surface can ever be open at a time.
 *
 * MUI v9 discipline: `sx`-only styling, colors via theme callbacks,
 * `*Outlined` icons.
 */

import { CloseOutlined as CloseIcon } from "@mui/icons-material";
import { Box, Drawer, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { StudentDrawerBalancesSection } from "@/frontend/views/admin/students/AdminStudentDrawerBalancesSection";
import { StudentDrawerIdentitySection } from "@/frontend/views/admin/students/AdminStudentDrawerIdentitySection";
import { StudentDrawerPlacementSection } from "@/frontend/views/admin/students/AdminStudentDrawerPlacementSection";
import { DrawerSection } from "@/frontend/views/admin/students/AdminStudentDrawerPrimitives";
import { StudentDrawerRecordSection } from "@/frontend/views/admin/students/AdminStudentDrawerRecordSection";
import {
  type StudentDirectoryItem,
  StudentLanguageChips,
  StudentTrialContent,
} from "@/frontend/views/admin/students/AdminStudentRowCells";
import type { AppLocale } from "@/shared/locale";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

/** Drawer paper width — clamps inside narrow viewports. */
const DRAWER_WIDTH = 420;

interface AdminStudentDetailDrawerProps {
  /** Whether the drawer is open (the container keeps the item mounted through the exit transition). */
  readonly open: boolean;
  /** The selected student — `null` before the first open. */
  readonly student: StudentDirectoryItem | null;
  readonly labels: AdminStudentsLabels;
  readonly locale: AppLocale;
  /** Close callback (Escape, backdrop click, close button). */
  readonly onClose: () => void;
  /** Invoked after the drawer's copy-email action resolves (drives the shared snackbar). */
  readonly onCopyEmail?: () => void;
}

export function AdminStudentDetailDrawer({
  open,
  student,
  labels,
  locale,
  onClose,
  onCopyEmail,
}: AdminStudentDetailDrawerProps): ReactNode {
  if (student === null) {
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
            <StudentDrawerIdentitySection student={student} labels={labels} locale={locale} onCopyEmail={onCopyEmail} />
            <StudentDrawerBalancesSection student={student} labels={labels} />
            <StudentDrawerPlacementSection student={student} labels={labels} />
            <StudentDrawerLanguagesSection student={student} labels={labels} />
            <StudentDrawerTrialSection student={student} labels={labels} locale={locale} />
            <StudentDrawerRecordSection student={student} labels={labels} />
          </Stack>
        </Box>
      </Stack>
    </Drawer>
  );
}

interface StudentDrawerLanguagesSectionProps {
  readonly student: StudentDirectoryItem;
  readonly labels: AdminStudentsLabels;
}

/** Languages section — the primary + another chips (em-dash when unset). */
function StudentDrawerLanguagesSection({ student, labels }: StudentDrawerLanguagesSectionProps): ReactNode {
  return (
    <DrawerSection label={labels.drawer.sectionLanguages}>
      <StudentLanguageChips student={student} />
    </DrawerSection>
  );
}

interface StudentDrawerTrialSectionProps {
  readonly student: StudentDirectoryItem;
  readonly labels: AdminStudentsLabels;
  readonly locale: AppLocale;
}

/** Trial section — the granted chip + timestamp, or the honest em-dash. */
function StudentDrawerTrialSection({ student, labels, locale }: StudentDrawerTrialSectionProps): ReactNode {
  return (
    <DrawerSection label={labels.drawer.sectionTrial}>
      <StudentTrialContent student={student} locale={locale} labels={labels} />
    </DrawerSection>
  );
}
