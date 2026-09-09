import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";

/**
 * The student link-requests decision route — ONE definition site for every
 * parent-link deep-link consumer (the drawer's row anchors, the dashboard
 * discoverability-card CTA, and the student nav entry) so the three never
 * drift.
 *
 * Leaf module: directive-free and framework-free — NO `"use client"`,
 * NO Apollo, NO logger — so nav/card/test consumers import the constant and
 * resolver WITHOUT transitively dragging the drawer-actions hook graph.
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
