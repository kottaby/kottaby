"use client";

/**
 * SubscriptionCopyIdButton — the per-row copy-id quick action of the admin
 * student drawer's subscription rows (the directory's copy-email
 * convention): writes the `#<id>` value to the clipboard, swaps the icon
 * to a check and tints the success color while the copied state is flagged
 * (a 1.5s transient — the rows are dense, so the state self-reverts
 * instead of sticking), and keeps the click from bubbling.
 *
 * Failure posture mirrors `useDirectoryCopyEmail`: insecure contexts
 * expose NO Clipboard API at all and a rejected write stays silent — the
 * button never announces a copy that did not happen.
 */

import { CheckOutlined as CopiedIcon, ContentCopyOutlined as CopyIcon } from "@mui/icons-material";
import { IconButton, Tooltip } from "@mui/material";
import { type ReactNode, useEffect, useState } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";

interface SubscriptionCopyIdButtonProps {
  /** The subscription's wire id (copied in the `#<id>` display format). */
  readonly subscriptionId: string;
  /** The copy tooltip/aria label (resolved in the owning section). */
  readonly copyLabel: string;
  /** The post-copy tooltip label. */
  readonly copiedLabel: string;
}

/** How long the check-icon copied state stays flagged before reverting. */
const COPIED_RESET_MS = 1500;

export function SubscriptionCopyIdButton({
  subscriptionId,
  copyLabel,
  copiedLabel,
}: SubscriptionCopyIdButtonProps): ReactNode {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = copied ? setTimeout(() => setCopied(false), COPIED_RESET_MS) : null;
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [copied]);

  const handleCopy = (): void => {
    if (!("clipboard" in navigator)) {
      return;
    }
    void navigator.clipboard
      .writeText(`#${subscriptionId}`)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  return (
    <Tooltip title={copied ? copiedLabel : copyLabel} placement="top">
      <IconButton
        size="small"
        aria-label={`${copyLabel}: #${subscriptionId}`}
        onClick={event => {
          // Copy only — the click must not also trigger a row-level action.
          event.stopPropagation();
          handleCopy();
        }}
        sx={theme => ({
          ...focusVisibleRingSx,
          p: 1,
          color: copied ? theme.palette.success.main : theme.palette.text.secondary,
        })}
      >
        {copied ? <CopiedIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
