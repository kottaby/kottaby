"use client";

/**
 * AdminStudentsToolbarActions — the student directory toolbar's two
 * share/export text buttons, extracted from `AdminStudentsToolbar` (same
 * visual output; same text-button recipe as the refresh action: 44px
 * touch floor, `text.secondary` ink, `flexShrink: 0`):
 *  - `CopyLinkButton`: copies the CURRENT URL (the hook's URL-mirror
 *    effect keeps the query string in sync with the applied filters, so
 *    what the admin pastes is exactly what they see). The icon tints to
 *    the success color while the copy has resolved (mirroring the
 *    copy-email quick action); failures stay silent (insecure context /
 *    rejected write — the snackbar never lies about a copy that did not
 *    happen).
 *  - `ExportCsvButton`: while the export-all query is in flight the
 *    button shows MUI's leading spinner busy state. The tooltip switches
 *    to the honest "nothing to export" copy while disabled; a `<span>`
 *    wrapper keeps the tooltip reachable on a disabled button (disabled
 *    elements emit no pointer events).
 */

import { FileDownloadOutlined as DownloadIcon, LinkOutlined as LinkIcon } from "@mui/icons-material";
import { Box, Button, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import { useDirectoryCopyLink } from "@/frontend/views/admin/directory-copy-link";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

interface CopyLinkButtonProps {
  readonly labels: Pick<AdminStudentsLabels, "quickActions">;
  /** Invoked after the view URL copies successfully (drives the snackbar). */
  readonly onCopyLink?: () => void;
}

export function CopyLinkButton({ labels, onCopyLink }: CopyLinkButtonProps): ReactNode {
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

interface ExportCsvButtonProps {
  readonly labels: Pick<AdminStudentsLabels, "export">;
  readonly onExportCsv: () => void;
  readonly exportLoading: boolean;
  readonly exportDisabled: boolean;
}

export function ExportCsvButton({
  labels,
  onExportCsv,
  exportLoading,
  exportDisabled,
}: ExportCsvButtonProps): ReactNode {
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
