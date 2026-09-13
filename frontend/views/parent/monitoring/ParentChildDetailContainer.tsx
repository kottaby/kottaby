"use client";

import { useQuery } from "@apollo/client/react";
import { Box, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { myLinkedChildrenQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { AttendanceTab } from "@/frontend/views/parent/monitoring/AttendanceTab";
import { EvaluationsTab } from "@/frontend/views/parent/monitoring/EvaluationsTab";
import { HomeworkTab } from "@/frontend/views/parent/monitoring/HomeworkTab";
import { ChildSwitcher } from "@/frontend/views/parent/monitoring/ParentChildDetailContainer.parts";
import { ProgressTab } from "@/frontend/views/parent/monitoring/ProgressTab";
import { ReportsTab } from "@/frontend/views/parent/monitoring/ReportsTab";
import { ParentMonitoring, useAppTranslation } from "@/shared/locale";

/**
 * ParentChildDetailContainer — the per-child portal surface mounted at
 * `/parent/children/<studentId>` by the server-guarded route. The
 * server page validates the `studentId` path segment (integer coercion
 * failures redirect to the portal root) and extracts `?tab=` /
 * `?session=` from `searchParams`, passing them as plain props.
 *
 * URL contract (URL IS the state — no parallel local copy, no Zustand):
 *  - `?student=` is NOT used here — the studentId arrives from the
 *    server-validated path segment. The child switcher navigates to
 *    `/parent/children/<newId>` (replaces the path segment, preserving
 *    `?tab=` and `?session=`) via `router.push` so the back button
 *    still works.
 *  - MUI `Tabs` writes `?tab=<attendance|reports|homework|evaluations
 *    |progress>` via `router.replace` (no history churn per tab click).
 *  - `?session=<id>` is forwarded to the Reports tab, which scrolls
 *    the matching session row into view (the deep-link target for
 *    session-scoped notifications).
 *
 * Data: stateful `useQuery(myLinkedChildrenQueryDocument)` — zero-arg
 * (the caller's verified identity IS the read scope). Drives the
 * header (current child's name via id match) and the switcher (full
 * children list). ALL per-tab `useQuery` hooks live in the tab
 * components and re-key on `studentId` so rows never leak across
 * children (Apollo cache isolation).
 *
 * Render state matrix:
 *  - linked-children loading → header + switcher skeleton, tab content
 *    renders independently (the active tab owns its own loading state)
 *  - linked-children FORBIDDEN → `PermissionDeniedFallback` (the
 *    server's `message` is NEVER rendered)
 *  - otherwise → header (title + subtitle) + switcher + MUI Tabs +
 *    active tab component
 *
 * MUI v9 discipline: `sx`-only styling, colors through theme-palette
 * callbacks, `*Outlined` icons, `dir="auto"` on the child name (bidi
 * isolation). Every user-facing string resolves through the
 * `ParentMonitoring` namespace handle.
 */

/** Tab keys in display order — values double as the `?tab=` URL param. */
const TAB_KEYS = ["attendance", "reports", "homework", "evaluations", "progress"] as const;
type TabKey = (typeof TAB_KEYS)[number];

/** Default tab when the `?tab=` URL param is missing or unrecognized. */
const DEFAULT_TAB: TabKey = "attendance";

function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value);
}

function resolveTab(tab: string | null): TabKey {
  if (tab !== null && isTabKey(tab)) {
    return tab;
  }
  return DEFAULT_TAB;
}

function buildDetailUrl(studentId: string | number, tab: TabKey, session: string | null): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (session !== null) {
    params.set("session", session);
  }
  return `/parent/children/${studentId}?${params.toString()}`;
}

export function ParentChildDetailContainer(props: Readonly<ParentChildDetailContainerProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const router = useRouter();

  const { data, loading, error } = useQuery(myLinkedChildrenQueryDocument);

  const errorCode = error ? extractErrorCode(error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";
  if (denied) {
    return <PermissionDeniedFallback />;
  }

  const children = data?.myLinkedChildren ?? [];
  const currentChild = children.find(c => c.id === String(props.studentId));
  const activeTab = resolveTab(props.tab);
  const sessionNumber = props.session === null ? null : Number(props.session);
  const sessionArg = sessionNumber !== null && Number.isNaN(sessionNumber) ? null : sessionNumber;

  const handleTabChange = (_: unknown, value: TabKey) => {
    router.replace(buildDetailUrl(props.studentId, value, props.session));
  };

  const handleSwitcherChange = (newId: string) => {
    router.push(buildDetailUrl(newId, activeTab, props.session));
  };

  let tabContent: ReactNode;
  switch (activeTab) {
    case "reports":
      tabContent = <ReportsTab studentId={props.studentId} session={sessionArg} />;
      break;
    case "homework":
      tabContent = <HomeworkTab studentId={props.studentId} />;
      break;
    case "evaluations":
      tabContent = <EvaluationsTab studentId={props.studentId} />;
      break;
    case "progress":
      tabContent = <ProgressTab studentId={props.studentId} />;
      break;
    default:
      tabContent = <AttendanceTab studentId={props.studentId} />;
      break;
  }

  const headerTitle = currentChild === undefined ? t.portalPageTitle : t.detailPageTitle(currentChild.fullName);

  return (
    <Stack spacing={3} sx={{ width: "100%" }}>
      <Box component="header">
        <Typography variant="h5" component="h1" dir="auto" sx={{ fontWeight: 700 }}>
          {headerTitle}
        </Typography>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.detailPageSubtitle}
        </Typography>
      </Box>
      <ChildSwitcher
        linkedChildren={children}
        currentId={String(props.studentId)}
        label={t.childSwitcherLabel}
        loading={loading}
        onChange={handleSwitcherChange}
      />
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        aria-label={t.detailPageSubtitle}
      >
        <Tab value="attendance" label={t.tabAttendance} />
        <Tab value="reports" label={t.tabReports} />
        <Tab value="homework" label={t.tabHomework} />
        <Tab value="evaluations" label={t.tabEvaluations} />
        <Tab value="progress" label={t.tabProgress} />
      </Tabs>
      <Box component="section">{tabContent}</Box>
    </Stack>
  );
}

/** Props contract — studentId/tab/session arrive validated from the server page. */
export interface ParentChildDetailContainerProps {
  /** The active child id (server-validated path segment). */
  readonly studentId: number;
  /** The `?tab=` URL value (null if absent). */
  readonly tab: string | null;
  /** The `?session=` deep-link target (null if absent). */
  readonly session: string | null;
}
