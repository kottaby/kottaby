"use client";

import { Card, Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { MyLinkedChildrenQuery_myLinkedChildren } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";

/**
 * Presentational parts of the ParentChildrenRootContainer — the
 * skeleton placeholder and the per-child card. Extracted from the
 * stateful container so the hook-bearing component stays inside the
 * file-size budget (frontend/views/* is capped at 150 lines per
 * `oxlint.config.mts`).
 */

/** Stable skeleton keys (avoids `noArrayIndexKey`). */
const ROOT_SKELETON_KEYS: readonly string[] = ["children-skeleton-1", "children-skeleton-2", "children-skeleton-3"];

/** Skeleton placeholder for the initial-load state. */
export function ChildrenListSkeleton(): ReactNode {
  return (
    <Stack aria-busy="true" data-testid="parent-children-loading" sx={{ gap: 2 }}>
      {ROOT_SKELETON_KEYS.map(key => (
        <Card
          key={key}
          variant="outlined"
          sx={theme => ({
            display: "flex",
            flexDirection: "column",
            gap: 1,
            padding: 2,
            borderRadius: 2,
            borderColor: theme.palette.border.main,
          })}
        >
          <Skeleton variant="text" sx={{ fontSize: "1rem", maxWidth: 200 }} />
          <Skeleton variant="text" sx={{ fontSize: "0.875rem", maxWidth: 140 }} />
        </Card>
      ))}
    </Stack>
  );
}

/**
 * One linked-child card — full name + link-establishment date. Clicking
 * the card navigates to the child's detail URL (`/parent/children/<id>`).
 */
export function ChildCard({
  child,
  locale,
  onSelect,
}: Readonly<{
  child: MyLinkedChildrenQuery_myLinkedChildren;
  locale: string;
  onSelect: (childId: string) => void;
}>): ReactNode {
  return (
    <Card
      variant="outlined"
      component="button"
      type="button"
      data-testid="parent-child-card"
      onClick={() => onSelect(child.id)}
      sx={theme => ({
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        padding: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        borderColor: theme.palette.border.main,
        bgcolor: "transparent",
        cursor: "pointer",
        textAlign: "start",
        "&:hover": { borderColor: theme.palette.primary.main },
        "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      })}
    >
      <Typography variant="subtitle1" component="span" dir="auto" sx={{ fontWeight: 700 }}>
        {child.fullName}
      </Typography>
      <Typography variant="body2" component="span" dir="auto" sx={theme => ({ color: theme.palette.text.secondary })}>
        {formatApplicantDate(child.createdAt, locale)}
      </Typography>
    </Card>
  );
}
