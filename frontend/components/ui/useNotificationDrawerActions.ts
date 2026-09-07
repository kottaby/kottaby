"use client";

import { useState } from "react";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import type {
  MyNotificationsFilterInput,
  MyNotificationsQuery_myNotifications_items,
} from "@/frontend/graphql/generated/gql/graphql";
import { useNotificationMarkActions } from "@/frontend/hooks/notifications";
import { logger } from "@/frontend/lib/logger";

/**
 * The student link-requests decision route — ONE definition site for every
 * parent-link deep-link consumer (this drawer's row anchors, the dashboard
 * discoverability-card CTA, and the student nav entry) so the three never
 * drift (DEV1-015 tasks 4.1/4.2/4.4).
 */
export const STUDENT_LINK_REQUESTS_ROUTE = "/student/link-requests";

/** Fallback row target — the notifications feed page (the unchanged default). */
const NOTIFICATIONS_FEED_ROUTE = "/notifications";

/**
 * `relatedEntityType` → deep-link route. The persisted `related_entity_type`
 * varchar carries the backend `NotificationType` enum VALUE (e.g.
 * `"parent_link_request"`), so the keys are that enum's members — never bare
 * string literals. `undefined` values model the runtime miss for an unknown
 * entity type (the realtime payload-map precedent in
 * `use-notification-realtime.helpers.ts`).
 */
const NOTIFICATION_ROUTE_BY_ENTITY_TYPE: Readonly<Record<string, string | undefined>> = {
  [NotificationType.ParentLinkRequest]: STUDENT_LINK_REQUESTS_ROUTE,
};

/**
 * Resolve a drawer row's navigation target from its related-entity pointer.
 * Known entity types deep-link to their decision surface; every UNKNOWN or
 * absent pointer falls through UNCHANGED to the notifications feed page (the
 * pre-deep-link hard anchor) — never throws, never mis-routes.
 */
export function resolveNotificationRoute(relatedEntityType: string | null): string {
  if (relatedEntityType === null) {
    return NOTIFICATIONS_FEED_ROUTE;
  }
  return NOTIFICATION_ROUTE_BY_ENTITY_TYPE[relatedEntityType] ?? NOTIFICATIONS_FEED_ROUTE;
}

/** Stable identity for the "no rows pending" initial state. */
const NO_PENDING_IDS: readonly string[] = [];

/** Removes one id from the pending mark-read set (state-updater helper). */
function withoutPendingId(ids: readonly string[], id: string): readonly string[] {
  return ids.filter(pendingId => pendingId !== id);
}

interface UseNotificationDrawerActionsParams {
  /** The drawer's active window filter (spared by the stale-window sweep). */
  readonly filter: MyNotificationsFilterInput;
  /** Refetches the drawer list query (retry branch only). */
  readonly refetch: () => Promise<unknown>;
  /** Close callback (row activation closes the drawer). */
  readonly onClose: () => void;
}

interface NotificationDrawerActions {
  /** Whether the header mark-all sweep is in flight. */
  readonly markAllPending: boolean;
  /** Row ids with a mark-one mutation in flight. */
  readonly markReadPendingIds: readonly string[];
  /** Whether a retry refetch is in flight. */
  readonly retryPending: boolean;
  /** Row activation: mark read when unread, then close. */
  readonly handleOpenNotification: (item: MyNotificationsQuery_myNotifications_items) => void;
  /** Header sweep: mark every unread row read. */
  readonly handleMarkAll: () => void;
  /** Error-branch retry: refetch the drawer list query. */
  readonly handleRetry: () => void;
}

/**
 * Drawer interaction handlers + their pending state (NotificationDrawer).
 *
 * Row activation: mark read when unread (fire-and-forget — the cache
 * restyles the row) and close; the row IS a real anchor (Link) whose href
 * resolves through `resolveNotificationRoute` — parent-link-request rows
 * deep-link to the student decision route, every other entity falls through
 * to the feed page — so navigation is native, no router call. Mark-one /
 * mark-all run through the shared `useNotificationMarkActions` hook
 * (drawer-plan §3.1) so the count decrement and the stale-window sweep
 * behave IDENTICALLY to the feed page.
 */
export function useNotificationDrawerActions({
  filter,
  refetch,
  onClose,
}: Readonly<UseNotificationDrawerActionsParams>): NotificationDrawerActions {
  const { markNotificationRead, markAllNotificationsRead } = useNotificationMarkActions("NotificationDrawer");
  const [markAllPending, setMarkAllPending] = useState(false);
  const [markReadPendingIds, setMarkReadPendingIds] = useState<readonly string[]>(NO_PENDING_IDS);
  const [retryPending, setRetryPending] = useState(false);

  const handleOpenNotification = (item: MyNotificationsQuery_myNotifications_items): void => {
    if (!item.isRead) {
      setMarkReadPendingIds(prev => [...prev, item.id]);
      void markNotificationRead({ id: item.id, wasUnread: true, activeFilter: filter }).finally(() => {
        setMarkReadPendingIds(prev => withoutPendingId(prev, item.id));
      });
    }
    onClose();
  };

  /** Header sweep: shared action; the drawer surfaces no count snackbar. */
  const handleMarkAll = (): void => {
    setMarkAllPending(true);
    void (async () => {
      await markAllNotificationsRead(filter);
      setMarkAllPending(false);
    })();
  };

  const handleRetry = (): void => {
    setRetryPending(true);
    void (async () => {
      try {
        await refetch();
      } catch (error: unknown) {
        logger.debug({ caller: "NotificationDrawer" }, "[NotificationDrawer] Retry refetch rejected", {
          errorName: error instanceof Error ? error.name : typeof error,
        });
      } finally {
        setRetryPending(false);
      }
    })();
  };

  return { markAllPending, markReadPendingIds, retryPending, handleOpenNotification, handleMarkAll, handleRetry };
}
