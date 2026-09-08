"use client";

/**
 * AdminTeachersSurface — the /teachers two-tab client surface: the
 * certified-teacher directory (the original read-only view) plus the
 * applicant queue (new registrations awaiting certification).
 *
 * The surface owns the page header, the tab strip (MUI `Tabs`, sx-only,
 * RTL-safe — the indicator and label order mirror automatically under the
 * RTL emotion cache), and the two panels. Panels stay MOUNTED while hidden
 * (the `hidden` attribute, the MUI TabPanel recipe) so switching tabs
 * preserves each tab's filter/page state; both tab queries therefore run
 * from mount — the queue's honest `total` doubles as the inactive-tab
 * count badge with no second fetch.
 *
 * The queue state is lifted here (`useAdminTeacherApplicants`) so the tab
 * badge can read the total while the panel below receives it as a prop.
 * The same eager total feeds the directory tab's empty state: when the
 * directory is empty and the queue holds ≥1 applicant, the empty state's
 * "review join requests" CTA renders and flips `activeTab` to the queue
 * in place (the tab strip's own state flip — no URL navigation).
 * The directory panel keeps its own state exactly as before (hook, drawer,
 * snackbar, CSV export).
 *
 * The surface performs no role logic (the page-level `withPageAuth` guard
 * is the only authorization boundary; the backend queries fail any
 * non-admin into the canonical FORBIDDEN).
 *
 * All chrome copy comes from the `AdminTeachers` locale namespace, resolved
 * client-side via `useAppTranslation(AdminTeachers)` — the page mounts this
 * surface label-free so no labels cross the server→client props boundary.
 * MUI v9 `sx`-only discipline; colors via `theme.palette.*` callbacks;
 * ≥44px touch targets.
 */

import { Box, Card, Stack, Tab, Tabs, Typography } from "@mui/material";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { parseTeachersUrlTab, serializeTeachersSurfaceUrlState } from "@/frontend/views/admin/directory-url-state";
import { AdminApplicantsPanel } from "@/frontend/views/admin/teachers/AdminApplicantsPanel";
import { AdminTeachersDirectoryPanel } from "@/frontend/views/admin/teachers/AdminTeachersDirectoryPanel";
import { useAdminTeacherApplicants, useAdminTeachersDirectory } from "@/frontend/views/admin/teachers/hooks";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminTeachers } from "@/shared/locale/namespaces/adminTeachers";

/** The two tabs of the /teachers surface (values double as MUI `Tab` values). */
type TeachersTab = "teachers" | "applicants";

export function AdminTeachersSurface(): ReactNode {
  const labels = useAppTranslation(AdminTeachers);
  // ── Shareable-URL wiring (the surface owns the write side) ───────────
  // Both hooks seed their initial state from the query string (each gated
  // on its own tab — directory-url-state.ts); this effect mirrors the
  // ACTIVE tab's view back into the URL through `router.replace` (no
  // history churn, `{ scroll: false }`), so a filtered tab view copies,
  // bookmarks, and reloads faithfully. Defaults are omitted — a pristine
  // surface shares as the bare path (and `tab=applicants` alone still
  // names the queue even when its view is default).
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Lifted queue state — the badge reads the honest total; the applicants
  // panel receives the same slice as a prop (single query, no duplication).
  const applicants = useAdminTeacherApplicants();
  // The directory hook is lifted for the SAME reason (single composed URL
  // write) — the panel consumes it as a prop, mirroring the applicants
  // panel's presentational contract.
  const directory = useAdminTeachersDirectory();
  const [activeTab, setActiveTab] = useState<TeachersTab>(() => parseTeachersUrlTab(searchParams));

  const urlQuery = serializeTeachersSurfaceUrlState({
    tab: activeTab,
    directory: {
      q: directory.searchDebounced,
      approval: directory.approvalFilter,
      online: directory.onlineFilter,
      evaluator: directory.evaluatorFilter,
      page: directory.page,
      pageSize: directory.pageSize,
    },
    applicants: {
      q: applicants.searchDebounced,
      status: applicants.statusFilter,
      page: applicants.page,
      pageSize: applicants.pageSize,
    },
  });
  useEffect(() => {
    if (searchParams.toString() !== urlQuery) {
      router.replace(urlQuery === "" ? pathname : `${pathname}?${urlQuery}`, { scroll: false });
    }
    // `searchParams.toString` stays a dependency (biome's preferred shape —
    // a fresh function reference per params object): after the replace the
    // guard re-reads the NEW url, sees it already mirrors the active view,
    // and skips — one extra effect pass, zero replace churn.
  }, [urlQuery, router, pathname, searchParams.toString]);

  // The count badge is an INACTIVE-tab affordance: while the admin reads
  // the queue the pagination footer already shows the total, so the badge
  // would be redundant. It reflects the queue's CURRENT total (which is
  // the unfiltered total unless filters were set while the tab was open).
  const showApplicantsBadge = activeTab !== "applicants" && applicants.total > 0;

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
      <Box>
        <Typography variant="h4" component="h1">
          {labels.title}
        </Typography>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {labels.subtitle}
        </Typography>
      </Box>

      <Card
        sx={theme => ({
          borderRadius: "12px",
          border: `1px solid ${theme.palette.border.light}`,
          boxShadow: theme.palette.shadow.card,
        })}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value: TeachersTab) => {
            setActiveTab(value);
          }}
          aria-label={labels.title}
          sx={theme => ({ paddingInline: 2, borderBottom: `1px solid ${theme.palette.border.light}` })}
        >
          <Tab
            value="teachers"
            label={labels.tabs.teachersTab}
            id="teachers-tab-teachers"
            aria-controls="teachers-panel-teachers"
            sx={{ minHeight: 48, textTransform: "none", fontWeight: 600, fontSize: 15 }}
          />
          <Tab
            value="applicants"
            label={
              <ApplicantsTabLabel
                label={labels.tabs.applicantsTab}
                badge={showApplicantsBadge ? applicants.total : null}
              />
            }
            id="teachers-tab-applicants"
            aria-controls="teachers-panel-applicants"
            sx={{ minHeight: 48, textTransform: "none", fontWeight: 600, fontSize: 15 }}
          />
        </Tabs>
      </Card>

      {/*
        Both panels stay MOUNTED while hidden (the `hidden` attribute —
        display:none removes them from the tab order and the accessibility
        tree) so each tab keeps its filter/page state across switches.
      */}
      <Box
        role="tabpanel"
        id="teachers-panel-teachers"
        aria-labelledby="teachers-tab-teachers"
        hidden={activeTab !== "teachers"}
      >
        {/*
          The queue total is fetched eagerly (the hook runs from mount — the
          inactive-tab badge depends on it), so the directory's empty state
          can gate its join-requests CTA on the SAME source the badge uses.
        */}
        <AdminTeachersDirectoryPanel
          directory={directory}
          hasApplicants={applicants.total > 0}
          onReviewApplicants={() => {
            setActiveTab("applicants");
          }}
        />
      </Box>

      <Box
        role="tabpanel"
        id="teachers-panel-applicants"
        aria-labelledby="teachers-tab-applicants"
        hidden={activeTab !== "applicants"}
      >
        <AdminApplicantsPanel labels={labels} applicants={applicants} />
      </Box>
    </Stack>
  );
}

interface ApplicantsTabLabelProps {
  readonly label: string;
  /** The queue total when the badge is showing; `null` hides the badge. */
  readonly badge: number | null;
}

/**
 * The applicants tab label with the small count chip — a tonal pill on the
 * theme's secondary container lane (the Teacher identity lane) so it reads
 * as metadata, not as a destructive alert.
 */
function ApplicantsTabLabel({ label, badge }: ApplicantsTabLabelProps): ReactNode {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Box component="span">{label}</Box>
      {badge !== null && (
        <Box
          component="span"
          sx={theme => ({
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 20,
            height: 20,
            paddingInline: 0.75,
            borderRadius: "999px",
            bgcolor: theme.palette.secondaryContainer,
            color: theme.palette.onSecondaryContainer,
            fontSize: 12,
            fontWeight: 700,
          })}
        >
          {badge}
        </Box>
      )}
    </Stack>
  );
}
