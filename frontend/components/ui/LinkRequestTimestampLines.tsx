"use client";

import { Typography } from "@mui/material";
import type { ReactNode } from "react";

/**
 * LinkRequestTimestampLines — the shared sent + expiry `body2` detail
 * lines rendered identically on BOTH parent-link surfaces: the parent
 * handshake `OutgoingLinkRequestCard` and the student
 * `/student/link-requests` `LinkRequestCard`.
 *
 * Callers compute the localized text (labels interpolation +
 * `formatApplicantDate`) and pass it in as plain strings; this fragment
 * owns only the shared Typography structure/styling so the two surfaces
 * can never drift apart.
 */

interface LinkRequestTimestampLinesProps {
  /** The localized "sent at" line, already interpolated. */
  readonly sentText: string;
  /** The localized expiry line, already interpolated. */
  readonly expiresText: string;
}

export function LinkRequestTimestampLines({
  sentText,
  expiresText,
}: Readonly<LinkRequestTimestampLinesProps>): ReactNode {
  return (
    <>
      <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
        {sentText}
      </Typography>
      <Typography variant="body2" component="p" sx={theme => ({ color: theme.palette.text.secondary })}>
        {expiresText}
      </Typography>
    </>
  );
}
