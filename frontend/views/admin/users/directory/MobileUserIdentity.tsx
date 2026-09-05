"use client";

/**
 * MobileUserIdentity — the mobile user card's middle header track: name
 * link + full-width wrapping email + copy-email quick action + role pill.
 *
 * The email WRAPS (no ellipsis): at a 375px viewport the identity track is
 * ~200px wide, so nowrap + ellipsis hid a further ~27px of every seeded
 * address; wrapping shows the whole value across two lines instead of
 * silently cutting it. The name link keeps its single-line ellipsis (names
 * are short) and carries the shared 44px tap-target padding.
 *
 * The copy affordance (parity with the desktop identity cell) writes the
 * email to the clipboard and reports success through `onCopyEmail` (the
 * container owns the shared success snackbar); clipboard failures stay
 * silent so the snackbar never lies about a copy that did not happen. The
 * icon tints to the success color while the copy has resolved — and sits
 * beside the WRAPPING email as a flexShrink:0 cell, never squeezing the
 * address narrower.
 *
 * Bidi note (Latin names/emails inside an RTL page): the HTML `dir="ltr"`
 * ATTRIBUTE isolates glyph direction. A CSS `direction` rule MUST NOT be
 * added — stylis-plugin-rtl would flip it to `rtl`, clipping the string's
 * head. With the attribute alone plus `unicodeBidi: "isolate"`,
 * `text-align: start` reads correctly in both directions.
 *
 * Soft-deleted users render dimmed: the name/email drop to the disabled
 * ink, the name is struck through, and the role pill falls back to the
 * neutral lane.
 */

import { ContentCopyOutlined as CopyIcon } from "@mui/icons-material";
import { Box, IconButton, Link as MuiLink, Stack, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { DirectoryRolePill, type DirectoryUserItem } from "@/frontend/views/admin/users/directory";
import type { DirectoryRole } from "@/frontend/views/admin/users/utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface MobileUserIdentityProps {
  readonly user: DirectoryUserItem;
  readonly role: DirectoryRole;
  readonly labels: Pick<AdminUsersLabels, "quickActions" | "roleLabels">;
  readonly deleted: boolean;
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

export function MobileUserIdentity({ user, role, labels, deleted, onCopyEmail }: MobileUserIdentityProps): ReactNode {
  const [emailCopied, setEmailCopied] = useState(false);
  const handleCopyEmail = () => {
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
          unicodeBidi: "isolate",
          textAlign: "start",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
          color: deleted ? theme.palette.text.disabled : theme.palette.text.primary,
          // ≥44px tap target without shifting the email below: transparent
          // block padding grows the clickable box while the matching
          // negative margins keep the layout height unchanged.
          minHeight: 44,
          paddingBlock: "10.5px",
          marginBlock: "-10.5px",
          ...(deleted && { textDecoration: "line-through" }),
        })}
      >
        {user.fullName}
      </MuiLink>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <Typography
          variant="body2"
          dir="ltr"
          sx={theme => ({
            display: "block",
            fontSize: 13,
            unicodeBidi: "isolate",
            textAlign: "start",
            // Wrap long addresses instead of ellipsizing them — a truncated
            // email defeats the card's purpose (the full value at a glance).
            overflowWrap: "anywhere",
            flex: 1,
            minWidth: 0,
            color: deleted ? theme.palette.text.disabled : theme.palette.text.secondary,
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
              // ≥44px touch target via transparent padding; the icon stays
              // visually 20px. flexShrink: 0 keeps the wrapping email at its
              // full available width instead of squeezing under the icon.
              p: 1.5,
              my: -1.5,
              flexShrink: 0,
              color: emailCopied ? theme.palette.success.main : theme.palette.text.secondary,
            })}
          >
            <CopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box sx={{ mt: 0.5 }}>
        <DirectoryRolePill role={role} labels={labels} muted={deleted} />
      </Box>
    </Box>
  );
}
