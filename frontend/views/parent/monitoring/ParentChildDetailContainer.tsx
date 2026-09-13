"use client";

import { useQuery } from "@apollo/client/react";
import {
  AssignmentOutlined,
  CalendarMonthOutlined,
  DescriptionOutlined,
  RateReviewOutlined,
  RefreshOutlined,
  TrendingUpOutlined,
} from "@mui/icons-material";
import { Box, IconButton, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
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

const TAB_KEYS = ["attendance", "reports", "homework", "evaluations", "progress"] as const;
type TabKey = (typeof TAB_KEYS)[number];
const DEFAULT_TAB: TabKey = "attendance";

function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value);
}
function resolveTab(tab: string | null): TabKey {
  return tab !== null && isTabKey(tab) ? tab : DEFAULT_TAB;
}
function buildDetailUrl(studentId: string | number, tab: TabKey, session: string | null): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (session !== null) {
    params.set("session", session);
  }
  return `/parent/children/${studentId}?${params.toString()}`;
}

const TAB_LABEL_KEYS: Readonly<
  Record<TabKey, "tabAttendance" | "tabReports" | "tabHomework" | "tabEvaluations" | "tabProgress">
> = {
  attendance: "tabAttendance",
  reports: "tabReports",
  homework: "tabHomework",
  evaluations: "tabEvaluations",
  progress: "tabProgress",
};

const TAB_ICONS: Readonly<Record<TabKey, ReactElement>> = {
  attendance: <CalendarMonthOutlined fontSize="small" />,
  reports: <DescriptionOutlined fontSize="small" />,
  homework: <AssignmentOutlined fontSize="small" />,
  evaluations: <RateReviewOutlined fontSize="small" />,
  progress: <TrendingUpOutlined fontSize="small" />,
};

export function ParentChildDetailContainer(props: Readonly<ParentChildDetailContainerProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const router = useRouter();
  const { data, loading, error, refetch } = useQuery(myLinkedChildrenQueryDocument);

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
      tabContent = (
        <ReportsTab studentId={props.studentId} session={sessionArg} childName={currentChild?.fullName ?? ""} />
      );
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
      <Box
        sx={theme => ({
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          borderBottom: 2,
          borderColor: theme.palette.primary.main,
          paddingBottom: 2,
        })}
      >
        <Box component="header" sx={{ flex: 1 }}>
          <Typography variant="h5" component="h1" dir="auto" sx={{ fontWeight: 700 }}>
            {headerTitle}
          </Typography>
          <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.detailPageSubtitle}
          </Typography>
        </Box>
        <IconButton
          aria-label={t.refreshLabel}
          onClick={() => {
            void refetch();
          }}
          disabled={loading}
          size="small"
        >
          <RefreshOutlined />
        </IconButton>
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
        sx={theme => ({
          borderBottom: 1,
          borderColor: theme.palette.divider,
          "& .MuiTab-root": { minHeight: 56, textTransform: "none" },
        })}
      >
        {TAB_KEYS.map(key => (
          <Tab key={key} value={key} label={t[TAB_LABEL_KEYS[key]]} icon={TAB_ICONS[key]} iconPosition="start" />
        ))}
      </Tabs>
      <Box component="section">{tabContent}</Box>
    </Stack>
  );
}

export interface ParentChildDetailContainerProps {
  readonly studentId: number;
  readonly tab: string | null;
  readonly session: string | null;
}
