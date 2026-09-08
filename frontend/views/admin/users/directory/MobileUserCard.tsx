"use client";

/**
 * MobileUserCard — one per-user card of the mobile directory list (radius
 * 12, `border.light` outline, 16px padding):
 *  - header as a 3-track grid (`auto minmax(0,1fr) auto`): 44px role-tinted
 *    avatar, the NAME profile link (`MobileUserName`, truncating with the
 *    shared bidi ellipsis recipe), and a trailing column stacking the
 *    relative time caption above the kebab actions menu (the same menu the
 *    desktop table renders) — stacking keeps the name track ≥ ~180px wide
 *    at a 390px viewport, where a horizontal time+kebab row would not;
 *  - FULL-WIDTH email row + role pill (`MobileUserIdentity`) immediately
 *    BELOW the header grid (above the divider), inset at the logical 52px
 *    so the email aligns under the name column — the QA fix that stopped
 *    addresses wrapping mid-word inside the squeezed middle track;
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Status (the per-role
 *    details headline) and Governance (bare dot + colored label — no pill on
 *    mobile).
 *
 * Soft-deleted users render dimmed via `MobileUserName`/`MobileUserIdentity`
 * and the body rows (`dimmed` drops the value cell to the disabled ink).
 */

import { Box, Card, Divider, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import {
  DirectoryActionsMenu,
  DirectoryGovernanceLabel,
  DirectoryStatusDetails,
  type DirectoryUserItem,
  MobileUserIdentity,
  MobileUserName,
  type RowCellLabels,
} from "@/frontend/views/admin/users/directory";
import { UserAvatar } from "@/frontend/views/admin/users/ui";
import {
  asDirectoryRole,
  directoryGovernanceOf,
  formatDirectoryRelativeTime,
} from "@/frontend/views/admin/users/utils";

interface MobileUserCardProps {
  readonly labels: RowCellLabels;
  readonly user: DirectoryUserItem;
  readonly locale: "ar" | "en";
  readonly onEdit: (user: DirectoryUserItem) => void;
  readonly onDelete: (user: DirectoryUserItem) => void;
  /** Invoked after the email copy resolves successfully (drives the snackbar). */
  readonly onCopyEmail?: () => void;
}

export function MobileUserCard({
  labels,
  user,
  locale,
  onEdit,
  onDelete,
  onCopyEmail,
}: MobileUserCardProps): ReactNode {
  const role = asDirectoryRole(user.role);
  const deleted = user.isDeleted;
  return (
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        p: 2,
      })}
    >
      {/*
        Header as a 3-track grid — [avatar 44px] [NAME profile link (flexible,
        minmax(0,1fr) so it can shrink and ellipsize)] [time caption stacked
        above the kebab]. The old flex row squeezed the middle block down to
        a handful of characters; `minmax(0, 1fr)` reserves every free pixel
        for the text instead. The trailing column stacks vertically (time
        over kebab ≈52px) instead of laying time and kebab side by side
        (≈96px) so the name block keeps ≥ ~180px at a 390px viewport. The
        email + copy affordance and the role pill render BELOW this grid as
        a full-card-width row (`MobileUserIdentity`) — the middle track no
        longer carries a wrapping address.
      */}
      <Box sx={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 1 }}>
        <UserAvatar fullName={user.fullName} role={role} size={44} />
        <MobileUserName user={user} labels={labels} deleted={deleted} />
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
            {formatDirectoryRelativeTime(user.lastActiveAt, locale)}
          </Typography>
          <DirectoryActionsMenu user={user} labels={labels} onEdit={onEdit} onDelete={onDelete} />
        </Box>
      </Box>
      <MobileUserIdentity user={user} role={role} labels={labels} deleted={deleted} onCopyEmail={onCopyEmail} />
      <Divider sx={{ my: 1.5 }} />
      <Stack spacing={1}>
        <MobileDetailRow label={labels.headers.status} dimmed={deleted}>
          <DirectoryStatusDetails user={user} labels={labels} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.headers.governance} dimmed={deleted}>
          <DirectoryGovernanceLabel governance={directoryGovernanceOf(user)} labels={labels} variant="dot-text" />
        </MobileDetailRow>
      </Stack>
    </Card>
  );
}

interface MobileDetailRowProps {
  readonly label: string;
  readonly dimmed: boolean;
  readonly children: ReactNode;
}

/** Strict two-column body row: label pinned to the inline-start edge, value
 *  cell flexes to fill and pins its content to the inline-end edge. */
function MobileDetailRow({ label, dimmed, children }: MobileDetailRowProps): ReactNode {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
      <Typography
        variant="body2"
        sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0, textAlign: "start" })}
      >
        {label}
      </Typography>
      <Box
        sx={theme => ({
          flex: 1,
          minWidth: 0,
          display: "flex",
          justifyContent: "flex-end",
          textAlign: "end",
          fontWeight: 500,
          ...(dimmed && { color: theme.palette.text.disabled }),
        })}
      >
        {children}
      </Box>
    </Box>
  );
}
