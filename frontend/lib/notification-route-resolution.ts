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

/** The admin arbitration console — the landing surface for dispute rows. */
export const ADMIN_DISPUTES_ROUTE = "/disputes";

/** The student's session list — the landing surface for student session rows. */
export const STUDENT_SESSIONS_ROUTE = "/student/sessions";

/** The teacher's session list — the landing surface for teacher session rows. */
export const TEACHER_SESSIONS_ROUTE = "/teacher/sessions";

/** Fallback row target — the notifications feed page (the unchanged default). */
const NOTIFICATIONS_FEED_ROUTE = "/notifications";

/**
 * The session-entity pointer every session-family emitter persists (backend
 * `session-request-notification.service.ts` /
 * `session-request-notification.governance.ts` /
 * `session-report-notification.service.ts` /
 * `session-dispute-notification.service.ts` all write the same literal —
 * pinned here because no shared backend constant exists for it).
 */
const SESSION_ENTITY_TYPE = "session";

/**
 * The wire role vocabulary — EXACTLY the codegen `UserRole` values. Declared
 * as a string union so this leaf stays import-light; the conformance against
 * the generated enum is pinned in the deep-link suite (every member listed).
 */
type WireRole = "Admin" | "Parent" | "Student" | "Teacher";

/**
 * The wire notification-type vocabulary — EXACTLY the codegen
 * `NotificationType` values (PascalCase). String-union form for the same
 * leaf-import discipline; conformance pinned in the deep-link suite.
 */
type WireNotificationType =
  | "EvaluationResult"
  | "ParentLinkRequest"
  | "PaymentConfirmation"
  | "SessionCancellation"
  | "SessionCompletion"
  | "SessionDisputeOpened"
  | "SessionDisputeResolved"
  | "SessionRequest"
  | "SystemBroadcast";

/** Narrowing guard for the caller-supplied wire role (untrusted runtime shape). */
function isWireRole(value: string | null | undefined): value is WireRole {
  return value === "Admin" || value === "Parent" || value === "Student" || value === "Teacher";
}

/**
 * The session-family deep-link matrix: `notificationType` → `role` → route.
 * A missing outer key (a session row whose type carries no routing contract)
 * or a missing inner cell (an audience the wave never reaches) resolves to
 * `undefined` and the resolver falls through to the feed page — the matrix
 * NEVER fabricates a route.
 *
 * Audiences (backend emitters):
 *  - `SessionDisputeOpened` reaches ONLY the admin cohort → the arbitration
 *    console; students/teachers never receive it (no cells for them).
 *  - `SessionDisputeResolved` reaches the two participants; a defensive
 *    admin cell routes to the console too (admins reviewing history land
 *    where the queue lives), while parents get none.
 *  - `SessionCompletion` / `SessionCancellation` / `SessionRequest` reach
 *    the participants → each role's own session list.
 */
const SESSION_ROUTES_BY_TYPE_AND_ROLE: Readonly<
  Partial<Record<WireNotificationType, Readonly<Partial<Record<WireRole, string>>>>>
> = {
  SessionDisputeOpened: { Admin: ADMIN_DISPUTES_ROUTE },
  SessionDisputeResolved: {
    Admin: ADMIN_DISPUTES_ROUTE,
    Student: STUDENT_SESSIONS_ROUTE,
    Teacher: TEACHER_SESSIONS_ROUTE,
  },
  SessionCompletion: { Student: STUDENT_SESSIONS_ROUTE, Teacher: TEACHER_SESSIONS_ROUTE },
  SessionCancellation: { Student: STUDENT_SESSIONS_ROUTE, Teacher: TEACHER_SESSIONS_ROUTE },
  SessionRequest: { Student: STUDENT_SESSIONS_ROUTE, Teacher: TEACHER_SESSIONS_ROUTE },
};

/**
 * `relatedEntityType` → deep-link route. The persisted `related_entity_type`
 * varchar carries the backend `NotificationType` enum VALUE for the
 * STUDENT-targeted parent-link row (e.g. `"parent_link_request"`), so that
 * key is the enum's member — never a bare string literal. `undefined` values
 * model the runtime miss for an unknown entity type (the realtime payload-map
 * precedent in `use-notification-realtime.helpers.ts`).
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
  [NotificationType.ParentLinkRequest]: STUDENT_LINK_REQUESTS_ROUTE,
};

/**
 * Resolve a drawer/feed row's navigation target from its related-entity
 * pointer, its notification type, and the viewer's role.
 *
 * Resolution order (first hit wins):
 *  1. the parent-link entity map (`parent_link_request` → the student
 *     decision route — role-independent, only students receive those rows);
 *  2. the session matrix (session entity + known type + known role → the
 *     role's route);
 *  3. the feed-page fall-through — UNKNOWN or absent pointers, unknown
 *     types, unknown roles, and matrix misses ALL land here. Never throws,
 *     never mis-routes.
 *
 * The optional `notificationType` / `role` keep the original single-argument
 * call sites compiling: without them only rule 1 can ever hit, which is
 * exactly the pre-deep-link behavior.
 */
export function resolveNotificationRoute(
  relatedEntityType: string | null,
  notificationType?: string | null,
  role?: string | null
): string {
  if (relatedEntityType === null) {
    return NOTIFICATIONS_FEED_ROUTE;
  }
  const parentLinkRoute = NOTIFICATION_ROUTE_BY_ENTITY_TYPE[relatedEntityType];
  if (parentLinkRoute !== undefined) {
    return parentLinkRoute;
  }
  if (relatedEntityType === SESSION_ENTITY_TYPE && notificationType != null && isWireRole(role)) {
    return (
      SESSION_ROUTES_BY_TYPE_AND_ROLE[notificationType as WireNotificationType]?.[role] ?? NOTIFICATIONS_FEED_ROUTE
    );
  }
  return NOTIFICATIONS_FEED_ROUTE;
}
