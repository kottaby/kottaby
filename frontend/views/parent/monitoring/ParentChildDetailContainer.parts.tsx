"use client";

import { Select, Skeleton, Stack, Typography } from "@mui/material";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import type { ReactNode } from "react";
import type { MyLinkedChildrenQuery_myLinkedChildren } from "@/frontend/graphql/generated/gql/graphql";

/**
 * Presentational parts of the ParentChildDetailContainer — the child
 * switcher (MUI Select) and its loading placeholder. Extracted from
 * the stateful container so the hook-bearing component stays inside
 * the file-size budget (frontend/views/* is capped at 150 lines per
 * `oxlint.config.mts`).
 */

/**
 * Child switcher — a MUI Select dropdown of the parent's linked
 * children. Renders the children's full names as options; the current
 * child (matched by id) is selected. Changing the selection calls
 * `onChange` with the new child id (string — the GraphQL ID scalar).
 *
 * While the linked-children query is in flight, a skeleton placeholder
 * renders in place of the Select so the header never flickers empty.
 */
export function ChildSwitcher({
  linkedChildren,
  currentId,
  label,
  loading,
  onChange,
}: Readonly<{
  linkedChildren: readonly MyLinkedChildrenQuery_myLinkedChildren[];
  currentId: string;
  label: string;
  loading: boolean;
  onChange: (childId: string) => void;
}>): ReactNode {
  if (loading) {
    return (
      <Stack data-testid="parent-child-switcher-loading" sx={{ gap: 0.5 }}>
        <Skeleton variant="text" sx={{ fontSize: "0.75rem", maxWidth: 80 }} />
        <Skeleton variant="rectangular" sx={{ height: 40, maxWidth: 280, borderRadius: 1 }} />
      </Stack>
    );
  }

  return (
    <FormControl variant="outlined" sx={{ maxWidth: 280 }}>
      <InputLabel id="parent-child-switcher-label">{label}</InputLabel>
      <Select
        labelId="parent-child-switcher-label"
        label={label}
        value={currentId}
        data-testid="parent-child-switcher"
        onChange={event => {
          onChange(event.target.value);
        }}
      >
        {linkedChildren.map(child => (
          <MenuItem key={child.id} value={child.id}>
            <Typography component="span" dir="auto">
              {child.fullName}
            </Typography>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
