"use client";

/**
 * AdminApplicantsMobileCardList — the mobile (< md) rendering of the
 * applicant queue: a vertical stack of per-applicant cards (16px gap). The
 * stack keeps a 96px `paddingBlockEnd` as a gap before the pagination card.
 *
 * Loading renders stable-key skeleton cards (announced through the
 * localized loading label); the empty state wraps
 * `AdminApplicantsEmptyState` in a card.
 */

import { Box, Card, Stack } from "@mui/material";
import type { ReactNode } from "react";
import { AdminApplicantMobileCard } from "@/frontend/views/admin/teachers/AdminApplicantMobileCard";
import type { ApplicantDirectoryItem } from "@/frontend/views/admin/teachers/AdminApplicantRowCells";
import { AdminApplicantsEmptyState } from "@/frontend/views/admin/teachers/AdminApplicantsEmptyState";
import { ADMIN_APPLICANTS_SKELETON_KEYS } from "@/frontend/views/admin/teachers/adminApplicants.helpers";
import { useAppLocale } from "@/shared/locale";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface AdminApplicantsMobileCardListProps {
  readonly labels: AdminTeachersLabels;
  readonly items: readonly ApplicantDirectoryItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  /** Invoked after any card's copy-email action resolves (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

export function AdminApplicantsMobileCardList(props: AdminApplicantsMobileCardListProps): ReactNode {
  const { labels, items, loading, hasFilters, onCopyEmail } = props;
  const locale = useAppLocale();
  return (
    <Stack
      spacing={2}
      sx={{ display: { xs: "flex", md: "none" }, paddingBlockEnd: 12 /* 96px gap before the pagination card */ }}
    >
      {loading && items.length === 0 && (
        <Box component="output" aria-busy="true" aria-label={labels.applicantsLoading} sx={{ display: "contents" }}>
          <Stack spacing={2}>
            {ADMIN_APPLICANTS_SKELETON_KEYS.slice(0, 4).map(rowKey => (
              <Card
                key={rowKey}
                sx={theme => ({
                  borderRadius: "12px",
                  border: `1px solid ${theme.palette.border.light}`,
                  boxShadow: theme.palette.shadow.card,
                  p: 2,
                  height: 132,
                })}
              />
            ))}
          </Stack>
        </Box>
      )}
      {!loading && items.length === 0 && (
        <Card
          sx={theme => ({
            borderRadius: "12px",
            border: `1px solid ${theme.palette.border.light}`,
            boxShadow: theme.palette.shadow.card,
          })}
        >
          <AdminApplicantsEmptyState labels={labels} hasFilters={hasFilters} />
        </Card>
      )}
      {items.map(applicant => (
        <AdminApplicantMobileCard
          key={applicant.id}
          labels={labels}
          applicant={applicant}
          locale={locale}
          onCopyEmail={onCopyEmail}
        />
      ))}
    </Stack>
  );
}
