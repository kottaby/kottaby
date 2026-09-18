# Research 01 — Backend emission + notification data surface

Read-only research for "Parent Session Completion Notification Display". Every path:line below was verified in this session via Read/Grep/Bash. Verdict up front: the emission side is fully shipped and intentionally minimal — a `session_completion` notification reaches the linked parent with `relatedEntityType: "session"` and `relatedEntityId: <sessionId>` and NOTHING else actionable; there is **no metadata/payload/JSON column, no CTA, no deep-link field, and no student/child id anywhere on the row or the wire**. The display side (client-side resolution of session → student → portal deep link) owns that mapping; this is confirmed by `docs/parents/monitoring-portal.md:207` (R16 deep-link contract).

## 1. The emission seam: `backend/services/classes/session-report-notification.service.ts`

**File-header doc block** (lines 1–48): the module is the emit primitive for the session-report lifecycle — ONE wave-context read, up to TWO engine emissions (the student always; the linked parent only when the stored parent link exists), receipts handed back for the caller to publish after ITS commit (lines 2–6). Governance: no role checks — it emits for RECIPIENTS, never the actor (lines 8–16). Recipient derivation: the ONLY caller input is the session id; both recipients and the parent gate (`students.parent_id`) resolve server-side from the joined read inside the caller's transaction; missing session row rejects fail-closed with `SESSION_NOT_FOUND` (lines 18–25). Publish-after-commit contract (lines 27–32). Emitter-owned localization (lines 34–39). Privacy: bodies interpolate ONLY counterparty full names — never ids, grades, or note content; the body is a link invite, not a content mirror (lines 41–43).

**`reportWaveContextOf` parent-leg fail-closed logic** (lines 64–82): maps the raw joined row onto the guard-validated wave view; the parent leg is present ONLY when the LEFT JOIN produced BOTH the parent user id AND the parent full name — an incomplete leg "fails closed to 'unlinked'" (`parentUserId !== null && parentFullName !== null` at lines 78–79 → parent object, else `null` at line 80).

**`reportReadyEmitInput` fields** (lines 107–124): field-by-field emit input per recipient — `{ userId, type: NotificationType.SessionCompletion, title, body, relatedEntityType: "session", relatedEntityId: sessionId, idempotencyKey: `session:${sessionId}:report` }` (lines 114–124). The type, related session pointer, and idempotency key are IDENTICAL for both recipients; the engine binds the recipient id into its claim digest (doc block lines 107–113).

**`notifySessionReportReady` full signature** (lines 147–152):

```ts
export async function notifySessionReportReady(
  sessionId: number,
  locale: string,
  tx: DBTransaction,
  options?: NotificationEngineCallOptions
): Promise<NotificationDeliveryReceipt[]>
```

JSDoc (lines 127–146): emits report-ready notifications for one session and returns delivery receipts WITHOUT publishing; student emission always goes out (copy in student's persisted locale, body naming the teacher); parent emission only when the wave context carries the student's stored parent link (copy in parent's persisted locale, body naming student + teacher); caller publishes the returned receipts after its own commit.

**Parent branch** (lines 180–200): `const parent = wave.parent; if (parent === null) return [studentReceipt];` (lines 180–183) — unlinked students get exactly one receipt. Linked parents: locale fallback to `defaultLocale` (line 185), copy from `eventSessionReportReadyParentBody(wave.student.fullName, wave.teacher.fullName)` (line 191), emitted via `emitReportReadyNotification` with the same `reportReadyEmitInput` helper (lines 187–198); returns `[studentReceipt, parentReceipt]` (line 200).

**Callers of `notifySessionReportReady`** — exactly ONE production caller:

- `backend/services/classes/session-report.service.ts:306` — inside the session-report submission flow: `const receipts = await SessionReportNotificationService.notifySessionReportReady(sessionId, locale, tx, options);` then `return { report, receipts };`. The service doc block (lines 49–51) states publish-after-commit — the receipts are pushed through `NotificationEngine.publishReceipts` only after the transaction commits.
- The publication site: `backend/services/classes/session-report.service.ts:388-390` — `// 3. Publish-after-commit — nothing is ever pushed for a rolled-back` … `await NotificationEngine.publishReceipts(receipts, locale, options);` — strictly after the commit, confirming the emit-inside-tx/publish-after-commit seam.
- All other grep hits are tests (`backend/services/classes/session-report-notification.test.ts`, many lines) and docs/plans — no other production caller exists.

## 2. Notification engine surface

**`NotificationEmitInput`** — `backend/types/notifications/notification.types.ts:47-56`, full field list:

- `userId: number` (line 48, readonly) — recipient, resolved server-side; never a GraphQL input type (doc lines 32–46).
- `type: NotificationType` (line 49)
- `title: string` (line 50)
- `body: string | null` (line 51)
- `relatedEntityType: string | null` (line 52)
- `relatedEntityId: number | null` (line 53)
- `idempotencyKey?: string` (line 54, optional, ≤128 chars; fire-and-forget when omitted)

Batch variant `NotificationEmitBatchInput` (lines 62–69): same fields except `userIds: readonly number[]`.

**`notifications` table schema** — `backend/db/schema/notifications/notifications.ts:27-46`, ALL columns:

- `id` integer PK, generated always as identity (line 30)
- `userId` integer NOT NULL, FK → `users.id` ON DELETE CASCADE (lines 31–33)
- `type` `notificationType` pgEnum NOT NULL (line 34)
- `title` varchar(255) NOT NULL (line 35)
- `body` text, nullable (line 36)
- `isRead` boolean, default false, nullable (line 37) — soft flag, write-once rows except the is_read flip (schema doc lines 15–20)
- `relatedEntityType` varchar(100), nullable (line 38)
- `relatedEntityId` integer, nullable (line 39)
- `createdAt` timestamp NOT NULL default now (line 40)

**There is NO metadata/payload/JSON column of any kind** beyond `relatedEntityType`/`relatedEntityId` — no CTA, no deep-link URL, no student-id field. Indexes: `notifications_user_id_idx` (line 43), composite `(user_id, is_read)` for unread counts (line 44). There is no `readAt` column (only the boolean `isRead`) and no soft-delete/updatedAt (doc lines 19–20). `NotificationReturnType` (notification.types.ts:23) is identical to `$inferSelect` — the table carries no forbidden fields (doc lines 10–22).

**Idempotency mechanics** — `backend/services/notifications/emit-idempotency.ts` (257 lines): best-effort dedupe, deliberately FAIL-OPEN (deviation D5 — header lines 1–15): blocking a domain event on cache health would be worse than a duplicate inbox row, so every cache interaction degrades to "proceed with the write + ONE structured warn" (lines 8–10). The claim cache port is INJECTED per call — no module-level state, no default adapter (lines 12–15; port interface `NotificationIdempotencyClaimCache` at lines 47–51: `claim`/`store`/`get` with SET-NX-EX semantics). Claim key recipe: `notif:emit:<sha256("<sorted recipient ids joined by ,>:<type>:<key>")>` — only the SHA-256 digest is ever stored, recipient order normalized by sorting (lines 17–21; `buildEmitClaimKey` at 67–71). Claim window 24 h (`NOTIFICATION_EMIT_CLAIM_TTL_SECONDS = 86_400`, line 30). `attemptEmitClaim` (84–104): claim won → `claimed` (proceed with write); claim held + readable prior receipt → `duplicate` with revived receipt (no insert/publish); claim held but nothing replayable, or ANY cache error → `unavailable` — fail open with a warn (79–83). The completed receipt is stored on the claim key only AFTER the insert's transaction commits (`storeEmitReceiptQuietly`, 112–122) so a rolled-back emission can't ghost future replays. Because the table has no idempotency-key column, "duplicate → return the prior receipt" is satisfiable only by this value-carrying cache (lines 43–45).

## 3. Notification GraphQL read surface

**`Notification` object type** — `backend/graphql/pothos/notifications/notification.pothos.ts:41-79`. Exactly EIGHT inbox-facing fields; the recipient `userId` is structurally NOT part of the GraphQL surface (doc lines 11–13):

- `id: t.exposeID("id")` (line 45) — integer PK as GraphQL `ID!`, exposed FIRST for Apollo cache normalization
- `type` (lines 48–59) — `NotificationTypePothosEnum`, resolved through the fail-closed `isNotificationType` guard; corrupt stored enum → resolver error `NOTIFICATION_TYPE_CORRUPT` (lines 51–56)
- `title: t.exposeString("title")` (line 60)
- `body: t.exposeString("body", { nullable: true })` (line 62)
- `isRead: t.boolean({ resolve: parent => parent.isRead ?? false })` (lines 66–68) — null → false presented non-nullable
- `relatedEntityType: t.exposeString("relatedEntityType", { nullable: true })` (line 71)
- `relatedEntityId: t.exposeInt("relatedEntityId", { nullable: true })` (line 72)
- `createdAt: t.field({ type: "String", resolve: parent => parent.createdAt.toISOString() })` (lines 74–77) — ISO-8601 UTC string

**Root queries** — `backend/graphql/query/notifications/notification.query.ts`. Two fields, both `authScopes: { authenticated: true }`, identity derived exclusively from `ctx.user.id` (no identity field in the filter input — BOLA probes die as validation failures; doc lines 4–21):

- `myNotifications(filter: MyNotificationsFilterInput): NotificationListPage!` (registered lines 53–91) — delegates to `NotificationEngine.listMyNotifications(ctx.user.id, {type, isRead, limit (default 20, 1..50), offset (default 0)}, ctx.locale)` (lines 79–89).
- `myUnreadNotificationCount: Int!` (lines 94–112) — badge read via `NotificationEngine.getMyUnreadCount` (line 109), backed by the `(user_id, is_read)` composite index.

**`NotificationListPage` wrapper** — `backend/graphql/pothos/notifications/notification-list-page.pothos.ts:24-32`: `items: [Notification]` (line 28), `totalCount: Int` (line 29), `hasMore: Boolean` (line 30). No `id` field by design (embedded value object; Apollo `keyFields: false` — doc lines 14–17).

There is no dedicated "drawer" or "feed" query — the drawer/feed is the client reading `myNotifications` + `myUnreadNotificationCount`.

**`NotificationType` enum** — `backend/enum/notifications/notification-type.enum.ts:9-19`. Values: `SessionRequest = "session_request"` (10), `SessionCompletion = "session_completion"` (11), `SessionCancellation = "session_cancellation"` (12), `ParentLinkRequest = "parent_link_request"` (13), `SystemBroadcast = "system_broadcast"` (14), `PaymentConfirmation = "payment_confirmation"` (15), `EvaluationResult = "evaluation_result"` (16), `SessionDisputeOpened = "session_dispute_opened"` (17), `SessionDisputeResolved = "session_dispute_resolved"` (18).

**The wire (client-visible) enum member for session completion is `SessionCompletion` with the string value `session_completion`** (line 11; matching the pgEnum mirror noted in the file header, lines 1–8).

## 4. WS push — exact payload fields reaching the browser

The realtime envelope is `RealtimeNotificationPayload` — `backend/types/notifications/notification.types.ts:135-143`:

```ts
{
  v: 1,
  kind: "notification",
  data: Pick<NotificationReturnType,
    "id" | "type" | "title" | "body" |
    "relatedEntityType" | "relatedEntityId" | "createdAt">
}
```

The `data` projection deliberately EXCLUDES the recipient `userId` and every account identifier (doc lines 129–134) — the payload only travels on the recipient's own authenticated socket, so the recipient is implied. Fields on the wire, exactly seven: `id`, `type`, `title`, `body`, `relatedEntityType`, `relatedEntityId`, `createdAt`.

- The allowlisted projection is enforced in `backend/services/notifications/realtime/redis-pubsub-transport.ts:126-137` (`projectFanoutPayload`) — structural allowlist (lines 100–110); Redis channel `kottaby:notifications:fanout` (line 27); envelope `{ userIds, payload }` (lines 57–62).
- The sidecar: `backend/ws/notification-ws-server.ts:131-132` — subscription source fans out via `deliverNotificationFanout(registry, state, userIds, payload)`; the outbound frame is the `RealtimeNotificationPayload` JSON projection (doc line 32); protocol is push-only, client application frames ignored (doc lines 34, `notification-ws-server-handlers.ts:4`).
- Batch publish id ruling (`docs/notifications/realtime-engine.md:95`): a batch publish's envelope carries the FIRST sibling row's `id`; per-recipient ids cannot ride one envelope without N publishes.

So when a session completes, the browser receives ONLY: the session id (as `relatedEntityId`), the type `session_completion`, the pre-rendered localized title/body, `id`, `createdAt`. No student/child id, no deep link, no CTA.

## 5. Does ANY notification read path expose the student/child id for session-family rows?

**Definitively NO.** Evidence:

1. The session-completion emitter writes `relatedEntityType: "session"`, `relatedEntityId: sessionId` — never the student id — `backend/services/classes/session-report-notification.service.ts:120-121`. The row's `userId` is the parent's own id (line 188: `parent.userId`), and `userId` is not exposed on the wire (`notification.pothos.ts:11-13`, `notification.types.ts:129-134`).
2. The notifications table has NO column that could carry a student id beyond `relatedEntityId` (`backend/db/schema/notifications/notifications.ts:30-40` — verified full column list in §2; no metadata/JSON/payload column).
3. The GraphQL surface exposes only the eight fields listed in §3 (`notification.pothos.ts:41-79`) — `relatedEntityId` reaches the parent as the SESSION id only. No resolver joins sessions/students onto the notification read (`notification.query.ts:79-89` delegates directly to `NotificationEngine.listMyNotifications`; no DataLoader/session join — doc lines 23–27: "flat single-table windows").
4. The WS push projection is allowlist-frozen to the seven fields (`notification.types.ts:137-142`, `redis-pubsub-transport.ts:126-137`) — no student id by construction.

**Consequence for the plan:** resolving a `session_completion` notification to a child requires a session→student lookup on the parent side (via the parent portal's existing session-report read, which is already linked-child-scoped by `requireLinkedChild` per `docs/parents/monitoring-portal.md`), or a client-side session→student resolution surface. The notification data alone is insufficient — the mapping session id → student id must come from a portal read, not from the notification row. Canonical confirmation of the intended contract: `docs/parents/monitoring-portal.md:207` (R16): "The emitter already writes `relatedEntityType` / `relatedEntityId`; the portal resolves the deep-link client-side." — the portal's report-tab URL is `/parent/children/<studentId>?tab=reports&session=<id>` (line 207), and the notification's `relatedEntityId` payload carries the session id (`docs/parents/monitoring-portal.md:22`).

## 6. `docs/notifications/realtime-engine.md` — relevant sections

- **Header/why** (lines 1–14): the engine is the substrate enabling INV-P3 ("a parent receives real-time notification when a linked child's session completes"); session completion → parent is an explicit named use case (lines 10, 14).
- **§3.2 Publish-after-commit + caller-tx receipt composition** (lines 63–104): includes the parent-completion example — `userIds: [parentId]` (line 76), `relatedEntityType: "session"`, `relatedEntityId: session.id` (lines 79–80); the semantic-emitter table (lines 103–104) names "Parent completion notifications — Session completion → parent (INV-P3's emitters) + parent portal consumption" via `emitForUser(s)` inside the session-completion tx + `publishReceipts`.
- **Emit contract** (line 97): title ≤255, body nullable, `isNotificationType` guard, `relatedEntityType`/`relatedEntityId` strict co-presence, `idempotencyKey` non-empty ≤128.
- **§3.3 Localization-at-emitter boundary** (lines 111–113): the engine never translates; copy composition is the emitter's job.
- **§3.5 Egress projection** (lines 138–145): the REQ-021 allowlist — "no recipient ids or PII ever cross the socket"; the sidecar re-uses `projectFanoutPayload` so the single projection holds on both bus mediums; push failures fail open.
- **§3.6 Idempotency fail-open deviation** (lines 147–149): matches `emit-idempotency.ts` (§2 above).
- **Deep-link/routing guidance**: the engine doc itself gives NO deep-link/routing guidance (correctly — routing is a client concern). The routing guidance lives in `docs/notifications/session-request-notifications.md:57`: "Never widen the realtime payload for CTAs. Accept/decline actions are driven by the client reading `relatedEntityId` and calling the mutations; adding action metadata to the push envelope is an engine-projection change owned elsewhere." And in `docs/parents/monitoring-portal.md:207` (R16) as cited in §5. The historical spec `ai/finished_plans/milestone_2_matching_notifications_escrow/session-request-notification-to-teacher/specs.md:62` (REQ-016) records the ruling verbatim: the realtime envelope remains the closed projection — NO CTA/deep-link/`userId`-in-data additions; the allowlist is engine-owned and frozen. A future deep link must therefore ride on `relatedEntityType`/`relatedEntityId` interpretation, NOT on new payload fields.

## Verified evidence index

| Claim | Path:Line |
|---|---|
| File-header doc block of the emission seam | backend/services/classes/session-report-notification.service.ts:1-48 |
| `reportWaveContextOf` parent-leg fail-closed (both fields required) | backend/services/classes/session-report-notification.service.ts:64-82 (check at 78-79, `null` at 80) |
| `reportReadyEmitInput` full field list + idempotency key `session:{id}:report` | backend/services/classes/session-report-notification.service.ts:114-124 |
| `notifySessionReportReady` signature + JSDoc | backend/services/classes/session-report-notification.service.ts:127-152 |
| Parent branch (unlinked → student-only; linked → second receipt) | backend/services/classes/session-report-notification.service.ts:180-200 |
| Sole production caller | backend/services/classes/session-report.service.ts:306 |
| Publish-after-commit publication site | backend/services/classes/session-report.service.ts:388-390 (contract doc at 49-51) |
| `NotificationEmitInput` fields | backend/types/notifications/notification.types.ts:47-56 |
| Batch variant `NotificationEmitBatchInput` | backend/types/notifications/notification.types.ts:62-69 |
| `NotificationDeliveryReceipt` (rows + recipientUserIds + emitClaimKey) | backend/types/notifications/notification.types.ts:79-105 |
| `notifications` table — ALL columns (no metadata/JSON column, no readAt) | backend/db/schema/notifications/notifications.ts:27-46 (columns 30-40, indexes 43-44) |
| Idempotency mechanics (fail-open D5, digest claim key, 24h TTL, post-commit receipt store) | backend/services/notifications/emit-idempotency.ts:1-30, 47-51, 67-71, 84-104, 112-122 |
| GraphQL `Notification` object — eight wire fields, no `userId` | backend/graphql/pothos/notifications/notification.pothos.ts:41-79 (fields 45-77) |
| `myNotifications` root query | backend/graphql/query/notifications/notification.query.ts:53-91 |
| `myUnreadNotificationCount` root query | backend/graphql/query/notifications/notification.query.ts:94-112 |
| `NotificationListPage` wrapper fields | backend/graphql/pothos/notifications/notification-list-page.pothos.ts:24-32 |
| `NotificationType` enum values | backend/enum/notifications/notification-type.enum.ts:9-19 (SessionCompletion at 11) |
| `RealtimeNotificationPayload` (7-field `data`, no `userId`) | backend/types/notifications/notification.types.ts:135-143 |
| Frozen allowlist projection `projectFanoutPayload` | backend/services/notifications/realtime/redis-pubsub-transport.ts:100-110, 126-137 |
| WS sidecar fanout delivery | backend/ws/notification-ws-server.ts:131-132 (projection doc at 32) |
| No student id on any notification read path (notification carries session id only) | session-report-notification.service.ts:120-121 + notifications.ts:30-40 + notification.pothos.ts:41-79 + notification.types.ts:137-142 |
| R16 deep-link contract (portal URL pattern, client-side resolution) | docs/parents/monitoring-portal.md:207 (also 22) |
| Engine doc §3.2 parent-completion example + recipient resolution | docs/notifications/realtime-engine.md:63-104 (parent example 76-80, table 103-104) |
| No-CTA-in-payload ruling (routing reads `relatedEntityId` client-side) | docs/notifications/session-request-notifications.md:57; ai/finished_plans/milestone_2_matching_notifications_escrow/session-request-notification-to-teacher/specs.md:62 |
