"use client";

/**
 * AdminTeacherDetailDrawer record section — the record card: the record
 * identifier (wire value, never localized) plus the explicit full-profile
 * link: certification and governance actions live on the admin user-detail
 * page, so the drawer bridges the directory to that surface instead of
 * duplicating them here.
 */

import { OpenInNewOutlined as OpenProfileIcon } from "@mui/icons-material";
import { Button, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { DrawerSection } from "@/frontend/views/admin/teachers/AdminTeacherDetailDrawer/DrawerPrimitives";
import type { TeacherDirectoryItem } from "@/frontend/views/admin/teachers/AdminTeacherRowCells";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface TeacherDrawerRecordSectionProps {
  readonly teacher: TeacherDirectoryItem;
  readonly labels: AdminTeachersLabels;
}

/**
 * Record section — the record identifier (wire value, never localized)
 * plus the explicit full-profile link: certification and governance actions
 * live on the admin user-detail page, so the drawer bridges the directory
 * to that surface instead of duplicating them here.
 */
export function TeacherDrawerRecordSection({ teacher, labels }: TeacherDrawerRecordSectionProps): ReactNode {
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
            {teacher.id}
          </Typography>
        </Stack>
        <FullProfileLink href={`/admin/users/${teacher.id}`} label={labels.quickActions.viewProfile} />
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
 * CTA) routed to the admin user-detail page where the certification and
 * governance actions live. Presentational everywhere else: the drawer
 * itself stays read-only.
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
