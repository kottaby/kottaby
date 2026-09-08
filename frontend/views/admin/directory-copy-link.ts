"use client";

/**
 * useDirectoryCopyLink — the shareable-view affordance behind the admin
 * directory toolbars' "Copy link" action: copies the CURRENT URL (which the
 * surface's URL-mirror effect keeps in sync with the applied filters —
 * directory-url-state.ts) to the clipboard and reports success through
 * `onCopied` (the owning surface shows the shared success snackbar).
 *
 * Failure posture mirrors `useDirectoryCopyEmail` exactly — silent on both
 * lanes: insecure contexts expose NO Clipboard API at all (the property
 * dereference would throw synchronously) and a rejected write stays silent
 * too. The snackbar must never announce a copy that did not happen.
 *
 * `linkCopied` tints the toolbar icon to the success color while resolved,
 * the same transient affordance the copy-email quick action uses.
 */

import { useState } from "react";

export function useDirectoryCopyLink(onCopied?: () => void): {
  readonly linkCopied: boolean;
  readonly handleCopyLink: () => void;
} {
  const [linkCopied, setLinkCopied] = useState(false);
  const handleCopyLink = () => {
    if (!("clipboard" in navigator)) {
      return;
    }
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setLinkCopied(true);
        onCopied?.();
        return undefined;
      })
      .catch(() => undefined);
  };
  return { linkCopied, handleCopyLink };
}
