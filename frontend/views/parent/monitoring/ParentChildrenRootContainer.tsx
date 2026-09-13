"use client";

import { useQuery } from "@apollo/client/react";
import { GroupOutlined, LinkOutlined, RefreshOutlined } from "@mui/icons-material";
import { Avatar, Box, Button, Chip, IconButton, Stack, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { ErrorRetryAlert } from "@/frontend/components/ui/ErrorRetryAlert";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { myLinkedChildrenQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";
import { ChildCard, ChildrenListSkeleton } from "@/frontend/views/parent/monitoring/ParentChildrenRootContainer.parts";
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

  let body: ReactNode;
  if (children === undefined) {
    body =
      error === undefined ? (
        <ChildrenListSkeleton />
      ) : (
        <ErrorRetryAlert
          title={te.internalServerError}
          retryLabel={commonT.retry}
          retryPending={loading}
          onRetry={() => {
            void refetch();
          }}
        >
          <Typography variant="body2">{t.loadErrorBody}</Typography>
        </ErrorRetryAlert>
      );
  } else if (children.length === 0) {
    body = (
      <IconCircleEmptyState
        testId="parent-children-empty"
        icon={<GroupOutlined sx={{ fontSize: 36 }} />}
        title={t.childrenEmptyTitle}
        body={t.childrenEmptyBody}
      />
    );
  } else {
    body = (
      <Box
        component="output"
        aria-label={t.portalPageTitle}
        data-testid="parent-children-list"
        sx={{ display: "grid", gap: 2 }}
      >
        {children.map(child => (
          <ChildCard
            key={child.id}
            child={child}
            locale={locale}
            onSelect={childId => {
              router.push(`/parent/children/${childId}`);
            }}
          />
        ))}
      </Box>
    );
  }

  const childCount = children?.length ?? 0;

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
          <Chip label={t.statTotalChildren + ": " + childCount} color="primary" variant="filled" size="medium" />
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.childrenCount(childCount)}
          </Typography>
        </Box>
      ) : null}
      {body}
      {childCount === 0 ? (
        <Button
          variant="outlined"
          startIcon={<LinkOutlined />}
          onClick={() => {
            router.push("/parent/handshake");
          }}
          sx={theme => ({ alignSelf: "flex-start", borderColor: theme.palette.primary.main })}
        >
          {t.childrenEmptyCta}
        </Button>
      ) : null}
    </Stack>
  );
}

export interface ParentChildrenRootContainerProps {
  readonly student: string | null;
}
