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

import { CloseOutlined as CloseIcon, ContentCopyOutlined as CopyIcon } from "@mui/icons-material";
import { Box, Divider, Drawer, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  TeacherApprovalPill,
  type TeacherDirectoryItem,
  TeacherEvaluatorChip,
  TeacherGovernancePills,
  TeacherPresenceLabel,
  TeacherRatingText,
} from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import { UserAvatar } from "@/frontend/views/admin/users/ui";
import type { AppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

/** Role lane for the drawer avatar (expression-passed — matches the rows). */
const TEACHER_AVATAR_ROLE = "Teacher" as const;

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

interface DrawerSectionProps {
  readonly label: string;
  readonly children: ReactNode;
}

/** Section card — radius 12, `border.light` outline, uppercase pinned header. */
function DrawerSection({ label, children }: DrawerSectionProps): ReactNode {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        bgcolor: theme.palette.background.paper,
        p: 2,
      })}
    >
      <Typography
        variant="overline"
        component="h3"
        sx={theme => ({
          display: "block",
          color: theme.palette.text.secondary,
          fontWeight: 700,
          letterSpacing: "0.06em",
          marginBottom: 1,
        })}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}

interface LabelValueRowProps {
  readonly label: string;
  /** Latin-contact values (email/phone) are LTR data — pinned via the HTML attribute. */
  readonly ltr?: boolean;
  readonly children: ReactNode;
}

/**
 * Caption/value row (the `ProfileInfoCard` recipe): fixed 40% label column
 * in `text.secondary`, value flexing with 500 weight.
 */
function LabelValueRow({ label, ltr = false, children }: LabelValueRowProps): ReactNode {
  return (
    <Stack direction="row" spacing={2} sx={theme => ({ py: 1, borderTop: `1px solid ${theme.palette.divider}` })}>
      <Typography
        variant="body2"
        sx={theme => ({ color: theme.palette.text.secondary, flexBasis: "40%", flexShrink: 0 })}
      >
        {label}
      </Typography>
      <Box
        {...(ltr ? { dir: "ltr" } : {})}
        sx={theme => ({
          flex: 1,
          minWidth: 0,
          fontWeight: 500,
          color: theme.palette.text.primary,
          ...(ltr && { unicodeBidi: "isolate", textAlign: "start" }),
        })}
      >
        {children}
      </Box>
    </Stack>
  );
}

/** Honest null — the em-dash is a display affordance, not a value. */
function EmptyValue(): ReactNode {
  return (
    <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
      —
    </Typography>
  );
}

interface TeacherDrawerIdentitySectionProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: AdminTeachersLabels;
  readonly locale: AppLocale;
  readonly onCopyEmail?: () => void;
}

/** Identity hero — role-tinted avatar, name, copy-email affordance, contact rows. */
function TeacherDrawerIdentitySection({
  teacher,
  labels,
  locale,
  onCopyEmail,
}: TeacherDrawerIdentitySectionProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(teacher.email, onCopyEmail);
  return (
    <DrawerSection label={labels.drawer.sectionIdentity}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 1.5 }}>
        <UserAvatar fullName={teacher.name} role={TEACHER_AVATAR_ROLE} size={64} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="div"
            title={teacher.name}
            dir="ltr"
            sx={{
              fontSize: 17,
              fontWeight: 600,
              unicodeBidi: "isolate",
              textAlign: "start",
              overflowWrap: "anywhere",
            }}
          >
            {teacher.name}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <Typography
              variant="body2"
              component="div"
              title={teacher.email}
              dir="ltr"
              sx={theme => ({
                color: theme.palette.text.secondary,
                unicodeBidi: "isolate",
                textAlign: "start",
                overflowWrap: "anywhere",
                minWidth: 0,
              })}
            >
              {teacher.email}
            </Typography>
            <Tooltip
              title={emailCopied ? labels.quickActions.emailCopied : labels.quickActions.copyEmail}
              placement="top"
              enterTouchDelay={0}
              leaveTouchDelay={1500}
            >
              <IconButton
                size="small"
                aria-label={`${labels.quickActions.copyEmail}: ${teacher.email}`}
                onClick={event => {
                  // Keep the drawer from reacting to the quick action.
                  event.stopPropagation();
                  handleCopyEmail();
                }}
                sx={theme => ({
                  p: 1.5,
                  my: -1.5,
                  flexShrink: 0,
                  color: emailCopied ? theme.palette.success.main : theme.palette.text.secondary,
                })}
              >
                <CopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Stack>
      <LabelValueRow label={labels.fields.phone} ltr>
        {teacher.phone ?? <EmptyValue />}
      </LabelValueRow>
      <LabelValueRow label={labels.fields.country}>{teacher.country ?? <EmptyValue />}</LabelValueRow>
      <LabelValueRow label={labels.headers.joined}>{formatApplicantDate(teacher.createdAt, locale)}</LabelValueRow>
    </DrawerSection>
  );
}

interface TeacherDrawerStatusSectionProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: AdminTeachersLabels;
}

/** Status section — the exact pill set the directory rows render. */
function TeacherDrawerStatusSection({ teacher, labels }: TeacherDrawerStatusSectionProps): ReactNode {
  return (
    <DrawerSection label={labels.drawer.sectionStatus}>
      <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", rowGap: 1, columnGap: 1.5 }}>
        <TeacherApprovalPill teacher={teacher} labels={labels} />
        <TeacherPresenceLabel teacher={teacher} labels={labels} />
        <TeacherGovernancePills teacher={teacher} labels={labels} />
        <TeacherEvaluatorChip teacher={teacher} labels={labels} />
      </Stack>
    </DrawerSection>
  );
}

interface TeacherDrawerAcademicSectionProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: AdminTeachersLabels;
  readonly locale: AppLocale;
}

/** Academic section — rating (star + honest em-dash) and the FULL subject list. */
function TeacherDrawerAcademicSection({ teacher, labels, locale }: TeacherDrawerAcademicSectionProps): ReactNode {
  return (
    <DrawerSection label={labels.drawer.sectionAcademic}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: teacher.subjects.length > 0 ? 1 : 0 }}>
        <Typography
          variant="body2"
          sx={theme => ({ color: theme.palette.text.secondary, flexBasis: "40%", flexShrink: 0 })}
        >
          {labels.headers.rating}
        </Typography>
        <TeacherRatingText teacher={teacher} locale={locale} />
      </Stack>
      {teacher.subjects.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" component="div" sx={theme => ({ color: theme.palette.text.secondary, mb: 1 })}>
            {labels.headers.subjects}
          </Typography>
          {/* FULL chip list — the drawer lifts the row's "+N" overflow clamp. */}
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
            {teacher.subjects.map(subject => (
              <SubjectChip key={subject} label={subject} />
            ))}
          </Stack>
        </>
      )}
    </DrawerSection>
  );
}

interface SubjectChipProps {
  readonly label: string;
}

/** Neutral subject chip (the row cell's chip, unclamped). */
function SubjectChip({ label }: SubjectChipProps): ReactNode {
  return (
    <Box
      component="span"
      sx={theme => ({
        display: "inline-flex",
        alignItems: "center",
        px: 1,
        height: 26,
        borderRadius: "999px",
        bgcolor: theme.palette.surfaceContainerHighest,
        color: theme.palette.onSurfaceVariant,
        fontSize: 12,
        fontWeight: 600,
      })}
    >
      {label}
    </Box>
  );
}

interface TeacherDrawerRecordSectionProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: AdminTeachersLabels;
}

/** Record section — the record identifier (wire value, never localized). */
function TeacherDrawerRecordSection({ teacher, labels }: TeacherDrawerRecordSectionProps): ReactNode {
  return (
    <DrawerSection label={labels.drawer.sectionRecord}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Typography
          variant="body2"
          sx={theme => ({ color: theme.palette.text.secondary, flexBasis: "40%", flexShrink: 0 })}
        >
          {labels.fields.id}
        </Typography>
        <Typography
          variant="body2"
          component="span"
          dir="ltr"
          sx={theme => ({ fontWeight: 500, color: theme.palette.text.primary, unicodeBidi: "isolate" })}
        >
          {teacher.id}
        </Typography>
      </Stack>
    </DrawerSection>
  );
}
