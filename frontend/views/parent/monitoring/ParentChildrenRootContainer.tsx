"use client";

import { useQuery } from "@apollo/client/react";
import { GroupOutlined, LinkOutlined } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
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

/**
 * ParentChildrenRootContainer — the portal root client surface mounted
 * at `/parent/children` by the server-guarded route. The portal root
 * server page is a guard-only shell: it performs NO server-side
 * auto-select or redirect, passing the raw `?student=` URL value
 * through as a plain prop. Auto-selection of the first linked child
 * happens CLIENT-SIDE in this container after
 * `useQuery(myLinkedChildrenQueryDocument)` resolves — navigating to
 * `/parent/children/<id>`. Zero children renders the localized empty
 * state with a handshake CTA.
 *
 * Data: stateful `useQuery(myLinkedChildrenQueryDocument)` — zero-arg
 * (the caller's verified identity IS the read scope; no parent id /
 * actor id / role hint is sent over the wire).
 *
 * Render state matrix:
 *  - loading → skeleton region (`component="output" aria-busy`)
 *  - FORBIDDEN → `PermissionDeniedFallback` (constant-shape denial —
 *    the server's `message` is NEVER rendered)
 *  - other errors → `ErrorRetryAlert` (retry refetches)
 *  - zero children → `IconCircleEmptyState` + handshake CTA button
 *    (deep-links to `/parent/handshake`)
 *  - ≥1 child → portal header + children count + list of `ChildCard`s
 *    (each card navigates to `/parent/children/<id>` on click)
 *
 * URL contract: the `student` prop arrives from the server page
 * (which extracts the raw `?student=` value from `searchParams`).
 * When the prop is empty AND the query has resolved with ≥1 child, a
 * `useEffect` calls `router.replace` to the first child's detail URL —
 * the URL IS the state (no parallel local copy, no Zustand).
 *
 * MUI v9 discipline: `sx`-only styling, colors through theme-palette
 * callbacks, `*Outlined` icons, `dir="auto"` on names + dates (bidi
 * isolation). Every user-facing string resolves through the
 * `ParentMonitoring` / `Errors` / `Common` namespace handles.
 */
export function ParentChildrenRootContainer(props: Readonly<ParentChildrenRootContainerProps>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const te = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();
  const router = useRouter();

  const { data, loading, error, refetch } = useQuery(myLinkedChildrenQueryDocument);

  const children = data?.myLinkedChildren;
  const hasStudentParam = props.student !== null && props.student !== "";

  // Auto-select-first: when the URL has no `?student=` AND the query
  // has resolved with ≥1 linked child, navigate to the first child's
  // detail URL. Runs once per transition into the "no selection, but
  // children loaded" state — `router.replace` keeps the history clean.
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

  return (
    <Stack spacing={3} sx={{ width: "100%" }}>
      <Box component="header">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {t.portalPageTitle}
        </Typography>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.portalPageSubtitle}
        </Typography>
      </Box>
      {children?.length ? (
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.childrenCount(children.length)}
        </Typography>
      ) : null}
      {body}
      {children?.length === 0 ? (
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

/** Props contract — `student` is the raw `?student=` URL value (null if absent). */
export interface ParentChildrenRootContainerProps {
  readonly student: string | null;
}
