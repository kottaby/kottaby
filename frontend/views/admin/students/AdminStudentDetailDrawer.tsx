"use client";

/**
 * AdminStudentDetailDrawer — the per-student detail side-drawer of the
 * admin student directory, opened by clicking a desktop row / mobile card
 * or through the per-row view-details quick action.
 *
 * The drawer is PRESENTATIONAL: it renders only fields the directory item
 * already carries (no extra queries, no mutations) grouped in section
 * cards — identity (role-tinted avatar + contact rows with the copy-email
 * affordance), balances (four large stat tiles painted from the SAME M3
 * container lanes the row badges use: hifz = primary, reviews = secondary,
 * tajweed = success, trial = warning), parent placement (verbatim parent
 * identity with a mailto affordance, or the localized "independent" chip),
 * languages, free trial, and record (identifier). Every caption comes from
 * the `AdminStudents` namespace; data values render verbatim.
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

import {
  CloseOutlined as CloseIcon,
  ContentCopyOutlined as CopyIcon,
  OpenInNewOutlined as OpenProfileIcon,
} from "@mui/icons-material";
import { Box, Button, Drawer, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  type StudentDirectoryItem,
  StudentLanguageChips,
  StudentTrialContent,
} from "@/frontend/views/admin/students/AdminStudentRowCells";
import { useDirectoryCopyEmail } from "@/frontend/views/admin/users/directory";
import { TonalChip, UserAvatar } from "@/frontend/views/admin/users/ui";
import { type DirectoryTone, toneColors } from "@/frontend/views/admin/users/utils";
import type { AppLocale } from "@/shared/locale";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

/** Role lane for the drawer avatar (expression-passed — matches the rows). */
const STUDENT_AVATAR_ROLE = "Student" as const;

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

interface StudentDrawerIdentitySectionProps {
  readonly student: StudentDirectoryItem;
  readonly labels: AdminStudentsLabels;
  readonly locale: AppLocale;
  readonly onCopyEmail?: () => void;
}

/** Identity hero — role-tinted avatar, name, copy-email affordance, contact rows. */
function StudentDrawerIdentitySection({
  student,
  labels,
  locale,
  onCopyEmail,
}: StudentDrawerIdentitySectionProps): ReactNode {
  const { emailCopied, handleCopyEmail } = useDirectoryCopyEmail(student.email, onCopyEmail);
  return (
    <DrawerSection label={labels.drawer.sectionIdentity}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 1.5 }}>
        <UserAvatar fullName={student.name} role={STUDENT_AVATAR_ROLE} size={64} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="div"
            title={student.name}
            dir="ltr"
            sx={{
              fontSize: 17,
              fontWeight: 600,
              unicodeBidi: "isolate",
              textAlign: "start",
              overflowWrap: "anywhere",
            }}
          >
            {student.name}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <Typography
              variant="body2"
              component="div"
              title={student.email}
              dir="ltr"
              sx={theme => ({
                color: theme.palette.text.secondary,
                unicodeBidi: "isolate",
                textAlign: "start",
                overflowWrap: "anywhere",
                minWidth: 0,
              })}
            >
              {student.email}
            </Typography>
            <Tooltip
              title={emailCopied ? labels.quickActions.emailCopied : labels.quickActions.copyEmail}
              placement="top"
              enterTouchDelay={0}
              leaveTouchDelay={1500}
            >
              <IconButton
                size="small"
                aria-label={`${labels.quickActions.copyEmail}: ${student.email}`}
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
        {student.phone ?? <EmptyValue />}
      </LabelValueRow>
      <LabelValueRow label={labels.fields.country}>{student.country ?? <EmptyValue />}</LabelValueRow>
      <LabelValueRow label={labels.headers.joined}>{formatApplicantDate(student.createdAt, locale)}</LabelValueRow>
    </DrawerSection>
  );
}

interface StudentDrawerBalancesSectionProps {
  readonly student: StudentDirectoryItem;
  readonly labels: AdminStudentsLabels;
}

/**
 * Balances section — four large stat tiles in the backend's canonical lane
 * order, painted from the same M3 container lanes the row badges use:
 * hifz = primary, reviews = secondary, tajweed = success, trial = warning.
 */
function StudentDrawerBalancesSection({ student, labels }: StudentDrawerBalancesSectionProps): ReactNode {
  return (
    <DrawerSection label={labels.drawer.sectionBalances}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
        <BalanceTile tone="primary" label={labels.balances.hifz} value={student.balanceHifz} />
        <BalanceTile tone="secondary" label={labels.balances.reviews} value={student.balanceReviews} />
        <BalanceTile tone="success" label={labels.balances.tajweed} value={student.balanceTajweed} />
        <BalanceTile tone="warning" label={labels.balances.trial} value={student.balanceTrial} />
      </Box>
    </DrawerSection>
  );
}

interface BalanceTileProps {
  readonly tone: DirectoryTone;
  readonly label: string;
  readonly value: number;
}

/** One balance stat tile — caption over a large count on the tonal lane. */
function BalanceTile({ tone, label, value }: BalanceTileProps): ReactNode {
  return (
    <Box
      sx={theme => {
        const colors = toneColors(theme, tone);
        return {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
          px: 1.5,
          py: 1.5,
          borderRadius: "12px",
          bgcolor: colors.bg,
          color: colors.fg,
        };
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h6" component="span" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
    </Box>
  );
}

interface StudentDrawerPlacementSectionProps {
  readonly student: StudentDirectoryItem;
  readonly labels: AdminStudentsLabels;
}

/**
 * Placement section — the verbatim parent identity with a mailto affordance
 * when the student is linked, the localized "independent" chip otherwise,
 * or the em-dash fallback for a linked student whose parent identity is
 * missing (defensive — mirrors the row cell).
 */
function StudentDrawerPlacementSection({ student, labels }: StudentDrawerPlacementSectionProps): ReactNode {
  return (
    <DrawerSection label={labels.drawer.sectionPlacement}>
      {!student.hasParent ? (
        <TonalChip tone="neutral" label={labels.parentLabels.noParent} />
      ) : student.parentName === null && student.parentEmail === null ? (
        <EmptyValue />
      ) : (
        <>
          {student.parentName !== null && (
            <LabelValueRow label={labels.headers.parent}>
              <Typography
                component="div"
                title={student.parentName}
                sx={theme => ({
                  fontWeight: 500,
                  color: theme.palette.text.primary,
                  overflowWrap: "anywhere",
                })}
              >
                {student.parentName}
              </Typography>
            </LabelValueRow>
          )}
          {student.parentEmail !== null && (
            <LabelValueRow label={labels.fields.parentEmail} ltr>
              <Typography
                component="a"
                href={`mailto:${student.parentEmail}`}
                title={student.parentEmail}
                sx={theme => ({
                  color: theme.palette.primary.main,
                  fontWeight: 500,
                  textDecoration: "none",
                  overflowWrap: "anywhere",
                  "&:hover": { textDecoration: "underline" },
                })}
              >
                {student.parentEmail}
              </Typography>
            </LabelValueRow>
          )}
        </>
      )}
    </DrawerSection>
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

interface StudentDrawerRecordSectionProps {
  readonly student: StudentDirectoryItem;
  readonly labels: AdminStudentsLabels;
}

/**
 * Record section — the record identifier (wire value, never localized)
 * plus the explicit full-profile link: governance actions live on the admin
 * user-detail page, so the drawer bridges the directory to that surface
 * instead of duplicating them here.
 */
function StudentDrawerRecordSection({ student, labels }: StudentDrawerRecordSectionProps): ReactNode {
  return (
    <DrawerSection label={labels.drawer.sectionRecord}>
      <Stack spacing={1.5}>
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
            {student.id}
          </Typography>
        </Stack>
        <FullProfileLink href={`/admin/users/${student.id}`} label={labels.quickActions.viewProfile} />
      </Stack>
    </DrawerSection>
  );
}

interface FullProfileLinkProps {
  readonly href: string;
  readonly label: string;
}

/**
 * The "open full profile" action — an outlined navigation button (44px
 * touch floor, same `Button component={Link}` recipe as the empty-state
 * CTA) routed to the admin user-detail page where the governance actions
 * live. Presentational everywhere else: the drawer itself stays read-only.
 */
function FullProfileLink({ href, label }: FullProfileLinkProps): ReactNode {
  return (
    <Button
      component={Link}
      href={href}
      variant="outlined"
      size="small"
      startIcon={<OpenProfileIcon />}
      sx={theme => ({
        minHeight: 44,
        borderRadius: 2,
        textTransform: "none",
        fontWeight: 600,
        alignSelf: "flex-start",
        color: theme.palette.text.primary,
        borderColor: theme.palette.border.light,
      })}
    >
      {label}
    </Button>
  );
}
