"use client";

/**
 * DirectoryUserIdentityCell — the desktop table's USER column: avatar +
 * name link + ellipsized email + copy-email quick action.
 *
 * Bidi note (Latin names/emails inside an RTL page): the HTML `dir="ltr"`
 * ATTRIBUTE isolates glyph direction and participates in the bidi
 * algorithm. A CSS `direction: "ltr"` rule MUST NOT be added —
 * stylis-plugin-rtl flips it to `rtl` and it would override the attribute,
 * clipping the START of the text (leading ellipsis). With the attribute
 * alone, direction stays `ltr` and `text-align: start` shows the head with
 * a trailing ellipsis.
 *
 * The copy affordance writes the email to the clipboard and reports
 * success through `onCopyEmail` (the container owns the shared success
 * snackbar); clipboard failures are silently dropped so the snackbar never
 * lies about a copy that did not happen.
 */

import { ContentCopyOutlined as CopyIcon } from "@mui/icons-material";
import { Box, IconButton, Link as MuiLink, Stack, TableCell, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import type { DirectoryUserItem } from "@/frontend/views/admin/users/directory";
import { UserAvatar } from "@/frontend/views/admin/users/ui";
import type { DirectoryRole } from "@/frontend/views/admin/users/utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface DirectoryUserIdentityCellProps {
  readonly user: DirectoryUserItem;
  readonly role: DirectoryRole;
  readonly labels: Pick<AdminUsersLabels, "quickActions">;
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

export function DirectoryUserIdentityCell({
  user,
  role,
  labels,
  onCopyEmail,
}: DirectoryUserIdentityCellProps): ReactNode {
  const [emailCopied, setEmailCopied] = useState(false);
  const handleCopyEmail = () => {
    // Insecure contexts (plain http) expose NO Clipboard API at all — the
    // property dereference would throw synchronously, before the rejection
    // handler below could ever run. Bail silently (same posture as a
    // rejected write): the snackbar never announces a copy that did not
    // happen.
    if (!("clipboard" in navigator)) {
      return;
    }
    void navigator.clipboard
      .writeText(user.email)
      .then(() => {
        setEmailCopied(true);
        onCopyEmail?.();
        return undefined;
      })
      // A rejected copy (permission/insecure context) stays silent — the
      // shared snackbar must never announce a copy that did not happen.
      .catch(() => undefined);
  };
  return (
    <TableCell sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <UserAvatar fullName={user.fullName} role={role} size={40} />
        <Box sx={{ minWidth: 0 }}>
          <MuiLink
            component={Link}
            href={`/admin/users/${user.id}`}
            underline="hover"
            aria-label={`${labels.quickActions.viewProfile}: ${user.fullName}`}
            title={user.fullName}
            dir="ltr"
            sx={theme => ({
              display: "block",
              maxWidth: "100%",
              fontSize: 15,
              fontWeight: 600,
              color: theme.palette.text.primary,
              unicodeBidi: "isolate",
              textAlign: "start",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              // ≥44px tap target without changing the row's visual density:
              // transparent block padding grows the clickable box while the
              // matching negative margins keep the layout height unchanged.
              minHeight: 44,
              paddingBlock: "10.5px",
              marginBlock: "-10.5px",
            })}
          >
            {user.fullName}
          </MuiLink>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <Typography
              variant="body2"
              title={user.email}
              dir="ltr"
              sx={theme => ({
                fontSize: 13,
                color: theme.palette.text.secondary,
                unicodeBidi: "isolate",
                textAlign: "start",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              })}
            >
              {user.email}
            </Typography>
            <Tooltip
              title={emailCopied ? labels.quickActions.emailCopied : labels.quickActions.copyEmail}
              placement="top"
              enterTouchDelay={0}
              leaveTouchDelay={1500}
            >
              <IconButton
                size="small"
                aria-label={`${labels.quickActions.copyEmail}: ${user.email}`}
                onClick={handleCopyEmail}
                sx={theme => ({
                  // ≥44px touch target via transparent padding, matching the
                  // name-link trick; the icon stays visually 20px.
                  p: 1.5,
                  my: -1.5,
                  color: emailCopied ? theme.palette.success.main : theme.palette.text.secondary,
                })}
              >
                <CopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Stack>
    </TableCell>
  );
}
