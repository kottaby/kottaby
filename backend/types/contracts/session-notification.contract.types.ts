/**
 * Session Event Notifications contract (Dev 3 → Dev 1).
 *
 * Parent notifications are system OUTPUTS only — linking workflows are
 * explicitly excluded from this contract.
 *
 * `isRead` is system-managed and MUST NOT appear in input shapes.
 * `id`/`createdAt` are system-set and excluded from input.
 *
 * **BOLA:** `userId` is recipient-resolved server-side.
 * Client may NEVER push `userId` for another user.
 */
import type { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import type { NotificationSelectType } from "@/backend/types/notifications/notification.types";

/**
 * Enum-member union for session-event notification types.
 * Sibling types (ParentLinkRequest, SystemBroadcast, PaymentConfirmation,
 * EvaluationResult) are handled by sibling contracts —
 * they are NOT built here.
 */
export type SessionEventNotificationType =
  | NotificationType.SessionRequest
  | NotificationType.SessionCompletion
  | NotificationType.SessionCancellation;

/**
 * Decision #4 — both-or-neither polymorphic pointer.
 * Eliminates the invalid half-populated state (type set / id null)
 * at the type level (REQ-021).
 */
export type SessionEventNotificationEntityRef =
  | {
      readonly relatedEntityType: string;
      readonly relatedEntityId: number;
    }
  | {
      readonly relatedEntityType?: undefined;
      readonly relatedEntityId?: undefined;
    };

export interface SessionEventNotificationContract {
  /** BOLA — recipient-resolved server-side (DEV3-010). */
  readonly userId: NotificationSelectType["userId"];
  readonly type: SessionEventNotificationType;
  readonly title: NotificationSelectType["title"];
  readonly body: NotificationSelectType["body"];
  /** docs/IDEMPOTENCY.md (REQ-027) — optional for fire-and-forget notifications. */
  readonly idempotencyKey?: string;
  /** A.4 — paired via union; half-populated state is unrepresentable. `isRead` absent (system-managed). */
  readonly entityRef: SessionEventNotificationEntityRef;
}
