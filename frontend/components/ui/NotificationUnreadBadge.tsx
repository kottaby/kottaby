"use client";

import { useQuery } from "@apollo/client/react";
import { NotificationsOutlined } from "@mui/icons-material";
import { Badge, IconButton, Tooltip } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { myUnreadNotificationCountQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { Notifications, useAppTranslation } from "@/shared/locale";

/**
 * Unread-count polling cadence — the conventional notification-count posture
 * (`NOTIFICATION_COUNT_POLL_INTERVAL_MS`, `frontend/AGENTS.md`: 120s). The
 * shell socket merges realtime arrivals into the cached count without
 * refetches; this poll is the silent-degradation floor (REQ-064).
 */
const NOTIFICATION_COUNT_POLL_INTERVAL_MS = 120_000;

/**
 * Visible badge overflow cap — anything above renders as `99+` while the
 * accessible label keeps announcing the true pluralized count.
 */
const BADGE_OVERFLOW_MAX = 99;

/**
 * NotificationUnreadBadge — the app-bar bell + unread badge (REQ-063c).
 *
 * Mounted by `DashboardAppBar` inside the authenticated shell branch, so it
 * renders on EVERY dashboard route for EVERY role (REQ-065): the bell is the
 * always-reachable entry to `/notifications` (the sidebar entry is the
 * second affordance).
 *
 * Count source (plan D11 — Apollo cache is the single frontend truth):
 * `useQuery(myUnreadNotificationCountQueryDocument)` observes the SAME
 * `ROOT_QUERY.myUnreadNotificationCount` field the shell-mounted realtime
 * socket (arrival +1 / reconnect catch-up), the feed's mark-one (−1) and
 * mark-all (refetch) co-maintain — cache writes from any of those re-render
 * this badge WITHOUT a refetch. The 120s poll is only the degradation floor;
 * simultaneous observers (badge + feed) coalesce in-flight queries through
 * Apollo's query deduplication.
 *
 * This component NEVER opens a WebSocket (REQ-067): the tab's single socket
 * belongs to `NotificationRealtimeToastHost` in `DashboardLayout`. Loading
 * and error states degrade silently — no badge content, no alarming UI
 * (REQ-064); the errorLink surface owns GraphQL error UX.
 *
 * Accessibility: the button's accessible name (and tooltip) composes the
 * bell action label with the pluralized unread-count announcement —
 * `badgeAriaLabel — unreadCount(n)` (the ApiStatusIndicator tooltip
 * composition precedent) — so screen readers announce both the action and
 * the state. RTL mirrors the badge anchor to the bell's top-END corner via
 * the `[dir=rtl]` sx override below (MUI v9's badge anchor is physical).
 *
 * MUI v9 discipline: `sx`-only styling, `theme.palette.*` via theme
 * callbacks, `*Outlined` icon, MUI severity color slot for the badge.
 */
export function NotificationUnreadBadge(): ReactNode {
  const t = useAppTranslation(Notifications);
  const countQuery = useQuery(myUnreadNotificationCountQueryDocument, {
    pollInterval: NOTIFICATION_COUNT_POLL_INTERVAL_MS,
  });

  const unread = countQuery.data?.myUnreadNotificationCount;
  // Action + pluralized state compose the accessible name (em-dash join —
  // the ApiStatusIndicator tooltip-title precedent). While the count is
  // unresolved (loading/error) the action label alone remains accurate.
  const accessibleLabel =
    typeof unread === "number" ? `${t.badgeAriaLabel} — ${t.unreadCount(unread)}` : t.badgeAriaLabel;

  return (
    <Tooltip title={accessibleLabel}>
      <IconButton
        component={Link}
        href="/notifications"
        aria-label={accessibleLabel}
        sx={theme => ({
          ...focusVisibleRingSx,
          color: theme.palette.text.primary,
        })}
      >
        <Badge
          badgeContent={unread}
          color="error"
          max={BADGE_OVERFLOW_MAX}
          sx={{
            // MUI v9's badge anchor is PHYSICAL (`inset` + translate CSS
            // vars set inline on the badge slot) — it does NOT mirror under
            // RTL. Anchor the badge at the bell's top-END corner: under
            // `[dir=rtl]` (the app sets document dir per locale and never
            // sets `theme.direction`) flip the vars to the top-left corner.
            // `!important` is required to override the inline slot style.
            "[dir=rtl] & .MuiBadge-badge": {
              "--Badge-inset": "0 auto 0 0 !important",
              "--Badge-origin": "0% 0% !important",
              "--Badge-translate": "-50%, -50% !important",
            },
          }}
        >
          <NotificationsOutlined />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
