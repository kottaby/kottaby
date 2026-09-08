"use client";

/**
 * AdminTeachersToolbarControls — the text-button + search-field controls
 * shared by the two /teachers toolbars (the certified-teacher directory's
 * `AdminTeachersToolbar` and the applicant queue's `AdminApplicantsToolbar`):
 * the copy-link action, the export-CSV action, the refresh action, and the
 * search input. All follow the same recipe — text buttons, 44px touch
 * floor, `text.secondary` ink, `flexShrink: 0` so the wrapping control row
 * never squeezes them — with colors resolved through theme-callback sx.
 */

import {
  FileDownloadOutlined as DownloadIcon,
  LinkOutlined as LinkIcon,
  RefreshOutlined as RefreshIcon,
  SearchOutlined as SearchIcon,
} from "@mui/icons-material";
import { Box, Button, TextField, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import { useDirectoryCopyLink } from "@/frontend/views/admin/directory-copy-link";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

interface ToolbarSearchFieldProps {
  readonly id: string;
  readonly labels: Pick<AdminTeachersLabels, "filters">;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** The toolbar's search input: magnifier leading adornment, fixed 44px height. */
export function ToolbarSearchField({ id, labels, value, onChange }: ToolbarSearchFieldProps): ReactNode {
  return (
    <TextField
      id={id}
      hiddenLabel
      placeholder={labels.filters.searchPlaceholder}
      value={value}
      onChange={event => onChange(event.target.value)}
      slotProps={{
        htmlInput: { "aria-label": labels.filters.search },
        input: {
          startAdornment: (
            <SearchIcon fontSize="small" sx={theme => ({ marginInlineEnd: 1, color: theme.palette.text.secondary })} />
          ),
        },
      }}
      sx={{
        flex: { xs: "1 1 100%", sm: "1 1 300px" },
        maxWidth: 400,
        "& .MuiInputBase-root": { height: 44 },
      }}
    />
  );
}

interface ToolbarRefreshButtonProps {
  readonly labels: Pick<AdminTeachersLabels, "filters">;
  /** `true` while the query is in flight (the button shows a disabled state). */
  readonly loading: boolean;
  /** Re-fetches the current page (the promise is handed to Apollo). */
  readonly onClick: () => void;
}

/** The refresh action — re-fetches the current page (same recipe as its siblings). */
export function ToolbarRefreshButton({ labels, loading, onClick }: ToolbarRefreshButtonProps): ReactNode {
  return (
    <Button
      variant="text"
      startIcon={<RefreshIcon />}
      onClick={onClick}
      disabled={loading}
      aria-label={labels.filters.refresh}
      sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
    >
      {labels.filters.refresh}
    </Button>
  );
}

interface ToolbarCopyLinkButtonProps {
  readonly labels: Pick<AdminTeachersLabels, "quickActions">;
  /** Invoked after the view URL copies successfully (drives the snackbar). */
  readonly onCopyLink?: () => void;
}

/**
 * The shareable-view action — copies the CURRENT URL (the surface's
 * URL-mirror effect keeps the query string in sync with the active tab's
 * applied filters, so what the admin pastes is exactly what they see).
 * Same text-button recipe as the export/refresh actions next to it; the
 * icon tints to the success color while the copy has resolved, and
 * failures stay silent (the snackbar never lies about a copy that did not
 * happen).
 */
export function ToolbarCopyLinkButton({ labels, onCopyLink }: ToolbarCopyLinkButtonProps): ReactNode {
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

interface ToolbarExportCsvButtonProps {
  readonly labels: Pick<AdminTeachersLabels, "export">;
  readonly onExportCsv: () => void;
  /** `true` while the export query is in flight (the button shows a busy state). */
  readonly exportLoading: boolean;
  /** `true` while loading or the filtered total is zero — nothing to export. */
  readonly exportDisabled: boolean;
}

/**
 * The export action — same text-button recipe as the refresh action next to
 * it (variant/size/44px floor/`text.secondary` ink). While the export-all
 * query is in flight the button shows MUI's leading spinner busy state.
 * The tooltip switches to the honest "nothing to export" copy while
 * disabled; a `<span>` wrapper keeps the tooltip reachable on a disabled
 * button (disabled elements emit no pointer events).
 */
export function ToolbarExportCsvButton({
  labels,
  onExportCsv,
  exportLoading,
  exportDisabled,
}: ToolbarExportCsvButtonProps): ReactNode {
  return (
    <Tooltip title={exportDisabled ? labels.export.exportCsvEmpty : labels.export.exportCsv} placement="top">
      <Box component="span" sx={{ display: "inline-flex", flexShrink: 0 }}>
        <Button
          variant="text"
          startIcon={<DownloadIcon />}
          onClick={onExportCsv}
          loading={exportLoading}
          disabled={exportDisabled}
          aria-label={labels.export.exportCsv}
          sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
        >
          {labels.export.exportCsv}
        </Button>
      </Box>
    </Tooltip>
  );
}
