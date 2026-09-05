"use client";

/**
 * DirectoryStatusDetails — the per-role status/details headline the
 * directory renders instead of a generic status chip, shared by the desktop
 * table and the mobile card list.
 */

import { Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ApplicantStatus } from "@/frontend/graphql/generated/gql/graphql";
import type { DirectoryUserItem } from "@/frontend/views/admin/users/directory";
import { TonalChip } from "@/frontend/views/admin/users/ui";
import { asDirectoryRole } from "@/frontend/views/admin/users/utils";
import { useAppLocale } from "@/shared/locale/localeContext";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

/** THE em-dash fallback for an unset cell value. Kept as a constant so the
 * details cell and the relative-time cell share one glyph source. */
const EM_DASH = "—";

/** ICU token of the plural-band `childrenCount` templates. */
const CHILDREN_COUNT_TOKEN = "{count}";

/**
 * Expands the plural-band linked-children chip: `Intl.PluralRules` of the
 * active locale resolves the band (ar carries the full
 * zero/one/two/few/many/other set; en resolves one/other) and the band's
 * `{count}` template renders the verbatim count. Replaces the former
 * function leaf that broke the locale parity suites and crossed the RSC
 * boundary as an unserializable prop.
 */
function childrenCountLabel(
  bands: AdminUsersLabels["directoryChips"]["childrenCount"],
  count: number,
  locale: string
): string {
  const category = new Intl.PluralRules(locale === "en" ? "en" : "ar").select(count);
  return bands[category].replace(CHILDREN_COUNT_TOKEN, String(count));
}

interface DirectoryStatusDetailsProps {
  readonly user: DirectoryUserItem;
  readonly labels: Pick<AdminUsersLabels, "directoryChips">;
}

/**
 * Status/details cell — the per-role headline the prototype renders instead
 * of a generic status chip:
 *  - admin/system rows: italic `text.secondary` "System User" line;
 *  - teachers: `pendingReview` (warning lane) while the application is
 *    pending / in evaluation, else `certified` (secondary lane) when the
 *    teacher is approved;
 *  - students: `parentLinked` (success lane) when the student is linked;
 *  - parents: `childrenCount(count)` (neutral lane) when linked;
 *  - anything else: the em-dash fallback.
 */
export function DirectoryStatusDetails({ user, labels }: DirectoryStatusDetailsProps): ReactNode {
  const locale = useAppLocale();
  const role = asDirectoryRole(user.role);
  if (role === "Admin") {
    return (
      <Typography variant="body2" sx={theme => ({ fontStyle: "italic", color: theme.palette.text.secondary })}>
        {labels.directoryChips.systemUser}
      </Typography>
    );
  }
  if (role === "Teacher") {
    if (user.applicantStatus === ApplicantStatus.Pending || user.applicantStatus === ApplicantStatus.InEvaluation) {
      return <TonalChip tone="warning" label={labels.directoryChips.pendingReview} />;
    }
    if (user.teacherIsApproved) {
      return <TonalChip tone="secondary" label={labels.directoryChips.certified} />;
    }
    return <EmDash />;
  }
  if (role === "Student") {
    if (user.studentHasParentLink) {
      return <TonalChip tone="success" label={labels.directoryChips.parentLinked} />;
    }
    return <EmDash />;
  }
  const linkedChildren = user.parentLinkedChildrenCount ?? 0;
  if (linkedChildren > 0) {
    return (
      <TonalChip
        tone="neutral"
        label={childrenCountLabel(labels.directoryChips.childrenCount, linkedChildren, locale)}
      />
    );
  }
  return <EmDash />;
}

/** Muted em-dash rendered in `text.secondary` for empty cell values. */
function EmDash(): ReactNode {
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
      {EM_DASH}
    </Typography>
  );
}
