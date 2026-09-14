import { NotificationType as BackendNotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { NotificationType } from "@/frontend/graphql/generated/gql/graphql";

/**
 * The student link-requests decision route — ONE definition site for every
 * parent-link deep-link consumer (the drawer's row anchors, the dashboard
 * discoverability-card CTA, and the student nav entry) so the three never
 * drift.
 *
 * Leaf module: directive-free and framework-free — NO `"use client"`,
 * NO Apollo, NO logger — so nav/card/test consumers import the constant and
 * resolver WITHOUT transitively dragging the drawer-actions hook graph.
 * (The generated-gql import is runtime-inert: the generated module's only
 * import is type-only, so the codegen enum adds no dependency edge.)
 */
export const STUDENT_LINK_REQUESTS_ROUTE = "/student/link-requests";

/**
 * The student sessions route — ONE definition site for every student
 * sessions-page navigation consumer (the student nav entry and the
 * session-completion notification deep link) so the two never drift.
 *
 * Same leaf-module discipline as `STUDENT_LINK_REQUESTS_ROUTE` above:
 * directive-free and framework-free, safe for nav/card/test consumers.
 */
export const STUDENT_SESSIONS_ROUTE = "/student/sessions";

/** Fallback row target — the notifications feed page (the unchanged default). */
const NOTIFICATIONS_FEED_ROUTE = "/notifications";

/**
 * Drawer-row notification TYPE → deep-link route — the FIRST resolution
 * stage. The row's `type` field carries the GraphQL wire name of the
 * notification kind, so every key is the codegen `NotificationType` enum's
 * member — never a bare string literal.
 *
 * The session-completion row routes by TYPE alone: its emitters persist the
 * plain table pointer `relatedEntityType: "session"` as the entity
 * discriminator, which is not a notification-kind marker — keying this deep
 * link on the varchar would key on the entity table and strand the row on
 * the feed (no emitter persists `"session_completion"` there). `undefined`
 * values model the runtime miss for an unknown type (the realtime
 * payload-map precedent in `use-notification-realtime.helpers.ts`).
 */
const NOTIFICATION_ROUTE_BY_TYPE: Readonly<Record<string, string | undefined>> = {
  // The student's session-completion row deep-links to the sessions list —
  // the surface where the Rate action lives.
  [NotificationType.SessionCompletion]: STUDENT_SESSIONS_ROUTE,
};

/**
 * `relatedEntityType` → deep-link route — the FALLBACK stage, consulted
 * only when the row's notification type misses `NOTIFICATION_ROUTE_BY_TYPE`.
 * The persisted `related_entity_type` varchar carries the backend
 * `NotificationType` enum VALUE for the STUDENT-targeted parent-link row
 * (e.g. `"parent_link_request"`), so every key is the enum's member — never
 * a bare string literal. `undefined` values model the runtime miss for an
 * unknown entity type (the realtime payload-map precedent in
 * `use-notification-realtime.helpers.ts`).
 *
 * PARENT-targeted parent-link rows (issue #99) deliberately carry
 * audience-scoped refinement values (`parent_link_request_decision` /
 * `parent_link_request_expiry`, backend `parent-link-request.helpers.ts`)
 * that MISS this map — the fall-through below lands them on the notifications
 * feed instead of the student-only decision route. Adding them as keys is
 * intentionally avoided: the fall-through is the designed safe default, and
 * absence keeps this leaf module free of literals that could drift from the
 * backend constants.
 */
const NOTIFICATION_ROUTE_BY_ENTITY_TYPE: Readonly<Record<string, string | undefined>> = {
  [BackendNotificationType.ParentLinkRequest]: STUDENT_LINK_REQUESTS_ROUTE,
};

/**
 * Resolve a drawer row's navigation target from its notification type and
 * related-entity pointer. The TYPE check runs FIRST (a session-completion
 * row deep-links to the sessions list whatever its entity pointer carries —
 * emitters persist the plain `"session"` table pointer, not a
 * notification-kind discriminator); otherwise the related-entity pointer is
 * matched against the fallback map. Known pointers deep-link to their
 * surface (the student link-requests decision route); every UNKNOWN or
 * absent pointer falls through UNCHANGED to the notifications feed page
 * (the pre-deep-link hard anchor) — never throws, never mis-routes.
 */
export function resolveNotificationRoute(notificationType: NotificationType, relatedEntityType: string | null): string {
  const byType = NOTIFICATION_ROUTE_BY_TYPE[notificationType];
  if (byType !== undefined) {
    return byType;
  }
  if (relatedEntityType === null) {
    return NOTIFICATIONS_FEED_ROUTE;
  }
  return NOTIFICATION_ROUTE_BY_ENTITY_TYPE[relatedEntityType] ?? NOTIFICATIONS_FEED_ROUTE;
}
