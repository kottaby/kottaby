"use client";

/**
 * useDirectoryCopyEmail — clipboard state + handler shared by the desktop
 * (`DirectoryUserIdentityCell`) and mobile (`MobileUserIdentity`) directory
 * identity surfaces: copy the user's email, flag the transient "copied"
 * state (tooltip text / icon tint), and report success through
 * `onCopyEmail` (the container owns the shared success snackbar).
 *
 * Failure posture is silent on both lanes: insecure contexts (plain http)
 * expose NO Clipboard API at all — the property dereference would throw
 * synchronously, before the rejection handler could ever run — and a
 * rejected write (permission/insecure context) stays silent too. The
 * snackbar must never announce a copy that did not happen.
 */

import { useState } from "react";

export function useDirectoryCopyEmail(
  email: string,
  onCopyEmail?: () => void
): {
  readonly emailCopied: boolean;
  readonly handleCopyEmail: () => void;
} {
  const [emailCopied, setEmailCopied] = useState(false);
  const handleCopyEmail = () => {
    if (!("clipboard" in navigator)) {
      return;
    }
    void navigator.clipboard
      .writeText(email)
      .then(() => {
        setEmailCopied(true);
        onCopyEmail?.();
        return undefined;
      })
      .catch(() => undefined);
  };
  return { emailCopied, handleCopyEmail };
}
