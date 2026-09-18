# Research — Core data model & the broadcast send path

Purpose: establish how a broadcast send is recorded today (notifications rows + audit row), so a first-class `broadcasts` header table can be planned against the real write path.

Date: 2026-09-18

## Verified findings

### Current storage shape (no first-class entity)

- Today a broadcast is NOT a first-class entity. One send produces:
  - (a) N rows in `notifications` with type `system_broadcast` and `relatedEntityType`/`relatedEntityId` = null (`backend/db/schema/notifications/notifications.ts:27-46`);
  - (b) exactly ONE row in `audit_logs` with `entityType: "notification_broadcast"` (const `AUDIT_ENTITY_TYPE` at `backend/services/notifications/admin-broadcast.service.ts:79`), `entityId` null, and `details` JSON that is metadata-only by design — `{scope, role?/country?/planId?, recipientCount}` — deliberately containing no copy of the message text.
- The metadata-only audit-details rule is prior plan REQ-021, recorded verbatim at `ai/finished_plans/milestone_3_parent_portal_admin_governance/broadcast-notifications-system-wide-targ/specs.md:63` (that plan also sanctioned widening `AuditLogWriteContract.entityId` to `number | null` for broadcasts).
- Delivery is instant; there is no scheduling, no status field, and no stop semantics today.
- The central plan decision is a first-class `broadcasts` header table recording one row per send.

### `notifications` table

- `backend/db/schema/notifications/notifications.ts:27` — `pgTable("notifications", …)`:
  - `id` integer identity PK; `userId` FK → users `onDelete: cascade`; `type` pgEnum(`notification_type`); `title` varchar(255); `body` text; `isRead` boolean; `relatedEntityType` varchar(100); `relatedEntityId` integer; `createdAt` timestamp defaultNow.
- Indexes: `notifications_user_id_idx` on `(user_id)` and `notifications_user_id_is_read_idx` on `(user_id, is_read)`.
- File header documents that the table is append-only except the in-place `is_read` flip.

### `audit_logs` table

- `backend/db/schema/audit/audit-logs.ts:30` — `pgTable("audit_logs", …)`:
  - `id` integer identity PK; `actorId` FK → users `onDelete: restrict`; `actionType` pgEnum(`audit_action_type`); `entityType` varchar(100); `entityId` integer (nullable — `audit-logs.ts:39`); `details` varchar(2000) storing JSON; `createdAt` timestamp defaultNow.
- Indexes: `audit_logs_actor_id_idx` on `(actor_id)` and `audit_logs_entity_type_entity_id_idx` on `(entity_type, entity_id)`.

### Backfill join key

- Postgres `now()` returns transaction-start time, so the audit row and all notification rows created in one send transaction share the exact same `createdAt`.
- This is the deterministic join key for a historical backfill: `audit_logs.entityType = "notification_broadcast"` matched to `notifications.type = "system_broadcast"` rows with identical `createdAt`.

### Enums

- `AuditActionType` (`backend/enum/audit/audit-action-type.enum.ts:12-13`) already contains `Suspend` and `Reactivate` members — a stop action can reuse `Suspend` without enum changes.
- `BroadcastAudienceType` (`backend/enum/notifications/broadcast-audience-type.enum.ts:13-18`) = All/Role/Country/Plan — TypeScript-only today; NO matching pgEnum exists yet (the file doc explicitly states it has no `pgEnum` counterpart because individual notification rows record the resolved recipient, not the cohort).
- pgEnum registry `backend/db/schema/enums.ts`:
  - `user_role` at :9 = ["admin","teacher","student","parent"];
  - `link_status` at :25;
  - `notification_type` at :89 — 9 members incl. `system_broadcast`;
  - `audit_action_type` at :101 — create/update/delete/override… incl. suspend/reactivate.

### Send service & send path

- Send service: `AdminBroadcastService.broadcast(input, actorId, locale, idempotencyKey?, options?, outerTx?)` at `backend/services/notifications/admin-broadcast.service.ts:330`.
- Admin gate: `assertActorAdmin` at `backend/services/admin/admin-gate.helpers.ts:114` — pre-transaction, zero writes on denial.
- Cap: `BROADCAST_MAX_RECIPIENTS = 5000` at `backend/services/notifications/admin-broadcast.service.ts:70` — fail-closed, checked before any write.
- Validation error codes (all in `admin-broadcast.service.ts`): `BROADCAST_TITLE_INVALID` (:351), `BROADCAST_AUDIENCE_INVALID` (:185), `PLAN_NOT_FOUND` (:264), `BROADCAST_AUDIENCE_EMPTY` (:292), `BROADCAST_AUDIENCE_TOO_LARGE` (:300).
- Send path is ONE transaction:
  - `NotificationEngine.emitForUsers({userIds, type, title, body, relatedEntityType: null, relatedEntityId: null, idempotencyKey}, locale, tx, options)` at `backend/services/notifications/notification-engine.service.ts:79` (NOTE — engine lives in `notification-engine.service.ts`, not `notification-engine.ts`);
  - `AuditService.createAuditLog` (actionType `Create`, entityType `"notification_broadcast"`, entityId null) at `admin-broadcast.service.ts:394`;
  - after commit, `publishReceipts` at `backend/services/notifications/notification-engine.service.ts:116`, delegating to `publishReceiptsFromIndex` in `backend/services/notifications/notification-engine.publish.ts:43`.
- Replay is detected via the stored idempotency receipt: `receipt.emitClaimKey === undefined` marks a replayed emit (`backend/services/notifications/notification-engine.publish.ts:54`).
- `NotificationEngine` is the single writer of `notifications` — canonical doc §9 prohibition (`docs/notifications/broadcast-notifications.md:76`). Any retraction must go through the engine, never write notifications rows directly.

### Reusable error/search helpers

- `translateDbError` at `backend/lib/errors.ts:201` maps PG unique-violation 23505 → `ConflictError` (traverses Drizzle `DrizzleQueryError` cause chains; SQLite UNIQUE → ConflictError best-effort).
- `escapeLikeWildcards` helper at `backend/lib/db/escape-like-wildcards.ts:37` (escapes `\`, `%`, `_` for ILIKE literals).
- ILIKE search precedent at `backend/db/repo/admin/admin-user-query-helpers.ts:96-98` — `ilike` on `users.fullName`/`users.email` with the escaped pattern.

## Carry-over notes for plan phases

- The `broadcasts` header table must be written inside the same send transaction as the notifications batch and the audit row, so header + notification rows + audit share one commit (and one `now()`).
- Historical backfill joins existing sends on `audit_logs.entityType = "notification_broadcast"` + exact `createdAt` match against `notifications.type = "system_broadcast"` rows created in the same transaction.
- Stop/retract lifecycle should reuse `AuditActionType.Suspend` for the stop audit action — no `audit_action_type` pgEnum change needed.
- A `broadcast_status` pgEnum (or equivalent) will be net-new; `broadcast_audience_type` is TS-only today and may stay TS-only per canonical doc §9 (no fifth-audience-kind-by-schema rule).
- Any retract/unpublish semantics that touch `notifications` rows must route through `NotificationEngine`, not direct repo writes.
- Unique-violation handling for backfill guards should reuse `translateDbError` (23505 → ConflictError).
