"use client";

/**
 * DirectoryToolbarActions — the admin user directory toolbar's right-aligned
 * action group:
 *  1. a "clear filters" text button (rendered only while at least one
 *     filter is set),
 *  2. the shareable-view **Copy link** action,
 *  3. the primary **Create User** button (44px tall, `flexShrink: 0`,
 *     never wraps its label).
 *
 * Auto margin right-aligns the group on ITS line — both on the shared
 * single line (xl+) and when the group wraps onto its own row below the
 * filters (md–lg). Extracted from `DirectoryToolbar` (file-size cap);
 * visual output identical. Label slices are passed down narrowed —
 * nothing is hardcoded.
 */

import { AddOutlined as AddIcon, LinkOutlined as LinkIcon } from "@mui/icons-material";
import { Box, Button, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import { useDirectoryCopyLink } from "@/frontend/views/admin/directory-copy-link";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type ToolbarActionsLabels = Pick<AdminUsersLabels, "filters" | "quickActions" | "createDialog">;

interface DirectoryToolbarActionsProps {
  readonly labels: ToolbarActionsLabels;
  /** True while at least one filter is set — gates the clear action. */
  readonly hasFilters: boolean;
  /** Clears every filter draft (each hook setter also restarts paging). */
  readonly onClearFilters: () => void;
  /** Reports the successful copy-link through the surface's shared snackbar. */
  readonly onCopyLink: () => void;
  readonly onCreateUser: () => void;
}

/**
 * The shareable-view action — copies the CURRENT URL (the directory hook's
 * URL-mirror effect keeps the query string in sync with the applied
 * filters, so what the admin pastes is exactly what they see). Same
 * text-button recipe as the teachers/applicants toolbars' copy-link: 44px
 * floor, `text.secondary` ink, `LinkIcon` tinting to the success color
 * while the copy has resolved; failures stay silent (the snackbar never
 * lies about a copy that did not happen).
 */
function CopyLinkButton({
  labels,
  onCopyLink,
}: {
  readonly labels: ToolbarActionsLabels;
  readonly onCopyLink: () => void;
}): ReactNode {
  const { linkCopied, handleCopyLink } = useDirectoryCopyLink(onCopyLink);
  return (
    <Tooltip title={labels.quickActions.copyLink} placement="top">
      <Button
        variant="text"
        startIcon={
          <LinkIcon
            fontSize="small"
            sx={theme => ({ color: linkCopied ? theme.palette.success.main : theme.palette.text.secondary })}
          />
        }
        onClick={handleCopyLink}
        aria-label={labels.quickActions.copyLink}
        sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
      >
        {labels.quickActions.copyLink}
      </Button>
    </Tooltip>
  );
}

export function DirectoryToolbarActions(props: DirectoryToolbarActionsProps): ReactNode {
  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        alignItems: "center",
        // Auto margin right-aligns the action group on ITS line — both
        // on the shared single line (xl+) and when the group wraps onto
        // its own row below the filters (md–lg).
        marginInlineStart: "auto",
        flexShrink: 0,
      }}
    >
      {props.hasFilters && (
        <Button
          variant="text"
          onClick={props.onClearFilters}
          sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
        >
          {props.labels.filters.clear}
        </Button>
      )}
      <CopyLinkButton labels={props.labels} onCopyLink={props.onCopyLink} />
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={props.onCreateUser}
        sx={theme => ({
          borderRadius: "8px",
          height: 44,
          flexShrink: 0,
          whiteSpace: "nowrap",
          // Pin the fill/ink pair to the theme's `primary.main`/`onPrimary`
          // tokens so the label stays on a contrast-checked pair in both
          // light and dark themes instead of relying on the default
          // `primary.contrastText` resolution.
          bgcolor: theme.palette.primary.main,
          color: theme.palette.onPrimary,
          "&:hover": { bgcolor: theme.palette.primary.dark },
        })}
      >
        {props.labels.createDialog.title}
      </Button>
    </Box>
  );
}
