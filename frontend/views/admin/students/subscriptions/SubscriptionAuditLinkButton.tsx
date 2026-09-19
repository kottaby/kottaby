"use client";

/**
 * SubscriptionAuditLinkButton — the row's audit-trail deep link of the
 * admin drawer's subscription rows: `/audit` seeded with the row's own
 * entity pair (the server route sanitizes the seed, so the link degrades
 * to the unfiltered listing rather than an error).
 *
 * Presentational: the id + label arrive resolved; the link keeps the
 * drawer's audit surface one click away without leaving the admin role
 * zone. MUI v9 `sx`-only styling, theme tokens only.
 */
import { ManageSearchOutlined as AuditTrailIcon } from "@mui/icons-material";
import { Button } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";

interface SubscriptionAuditLinkButtonProps {
  /** The subscription's wire id (the audit rows' entity id). */
  readonly subscriptionId: string;
  /** The link label (resolved in the owning card). */
  readonly label: string;
}

export function SubscriptionAuditLinkButton({ subscriptionId, label }: SubscriptionAuditLinkButtonProps): ReactNode {
  return (
    <Button
      component={Link}
      href={`/audit?entityType=subscription&entityId=${subscriptionId}`}
      size="small"
      variant="text"
      startIcon={<AuditTrailIcon />}
      sx={theme => ({
        ...focusVisibleRingSx,
        minHeight: 32,
        px: 1,
        alignSelf: "flex-start",
        color: theme.palette.text.secondary,
        "&:hover": { color: theme.palette.text.primary, bgcolor: theme.palette.action.hover },
      })}
    >
      {label}
    </Button>
  );
}
