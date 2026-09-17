"use client";

import { useQuery } from "@apollo/client/react";
import { GroupOutlined, RefreshOutlined } from "@mui/icons-material";
import { Avatar, Box, IconButton, Stack, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { myLinkedChildrenQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { renderChildrenBody } from "@/frontend/views/parent/monitoring/ParentChildrenRootContainer.body";
import { Common, Errors, ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

export function ParentChildrenRootContainer(props: Readonly<ParentChildrenRootContainerProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();
  const router = useRouter();
  const { data, loading, error, refetch } = useQuery(myLinkedChildrenQueryDocument);
  const children = data?.myLinkedChildren;
  const hasStudentParam = props.student !== null && props.student !== "";

  useEffect(() => {
    // Cold-entry ONLY: with no `?student=` param the root redirects to the
    // first child. A present param means the user is explicitly list-
    // browsing (or the detail page owns a stale-id denial) — the root must
    // never yank the URL (pinned by the container suite; auto-redirecting
    // on a foreign/stale id also re-opens the child-id enumeration oracle).
    if (!hasStudentParam && children !== undefined && children.length > 0) {
      router.replace(`/parent/children/${children[0].id}`);
    }
  }, [hasStudentParam, children, router]);

  const errorCode = error ? extractErrorCode(error) : null;
  const denied =
    errorCode !== null &&
    mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback";
  if (denied) {
    return <PermissionDeniedFallback />;
  }

  const childCount = children?.length ?? 0;
  const body = renderChildrenBody(
    children,
    error,
    loading,
    te,
    commonT,
    t,
    locale,
    childId => {
      router.push(`/parent/children/${childId}`);
    },
    () => {
      router.push("/parent/handshake");
    },
    refetch
  );

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
        <Avatar
          sx={theme => ({
            bgcolor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            width: 48,
            height: 48,
          })}
        >
          <GroupOutlined />
        </Avatar>
        <Box component="header" sx={{ flex: 1 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {t.portalPageTitle}
          </Typography>
          <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.portalPageSubtitle}
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
      {childCount > 0 ? (
        <Box sx={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.childrenCount(childCount)}
          </Typography>
        </Box>
      ) : null}
      {body}
    </Stack>
  );
}

export interface ParentChildrenRootContainerProps {
  readonly student: string | null;
}
