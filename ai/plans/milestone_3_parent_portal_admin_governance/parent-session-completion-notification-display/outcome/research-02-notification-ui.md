# Research 02 — Frontend notification surfaces + deep-link plumbing

**Ticket:** Parent Session Completion Notification Display (docs/planning/TICKETS.md:2038-2075).
**Scope:** the frontend notification surfaces (drawer, feed, realtime toast) and the deep-link resolution module; where a Parent-viewed `SessionCompletion` row would need to route into the parent portal.

## Summary (decision-relevant facts)

- All notification deep-links flow through ONE leaf resolver: `resolveNotificationRoute(relatedEntityType, notificationType?, role?)` at `frontend/lib/notification-route-resolution.ts:188-192`.
- The session matrix `SESSION_ROUTES_BY_TYPE_AND_ROLE` (`frontend/lib/notification-route-resolution.ts:108-120`) has a `SessionCompletion` row with ONLY `Student` and `Teacher` cells (line 117) — **there is NO `Parent` cell**, so a Parent-viewed session-completion row falls through to `/notifications`.
- There are exactly TWO production call sites of the resolver (feed list, drawer body) plus the resolver's own test file; both call sites thread `userRole` from `useAuth()` (`frontend/hooks/auth/useAuth.ts:6-12` → `frontend/context/AuthContext`).
- Navigation is native `<Link href>` in both surfaces — no `router.push` anywhere in notification UI.
- No parent-specific handling exists anywhere in notification UI: `UserRole.Parent` appears in ZERO files under `frontend/views/notifications`, `frontend/hooks/notifications`, or `frontend/components/ui/Notification*` (verified by grep; only `ParentLinkRequest` *type* labels appear).
- The parent portal page exists at `app/(dashboard)/parent/children/[studentId]/page.tsx` (confirmed via directory listing); there is currently NO route constant for it in the resolver module and no notification deep-link points at it.
- A deep-link route needs the student id: the `myNotifications` row carries `relatedEntityId` (numeric session id), NOT a student id — see §6/§8 implications.

## 1. `frontend/lib/notification-route-resolution.ts` (212 lines total)

- `STUDENT_SESSIONS_ROUTE = "/student/sessions"` — exported const at `frontend/lib/notification-route-resolution.ts:29`, with JSDoc at lines 21-28 describing it as the "ONE definition site" shared by the student nav entry and the session-completion notification deep link.
- `TEACHER_SESSIONS_ROUTE = "/teacher/sessions"` — module-private const at line 32.
- `NOTIFICATIONS_FEED_ROUTE = "/notifications"` — module-private const at line 35 (the universal fall-through).
- `SESSION_ENTITY_TYPE = "session"` — line 45 (the literal every session-family backend emitter persists in `relatedEntityType`; JSDoc lines 37-44).
- `WireRole = "Admin" | "Parent" | "Student" | "Teacher"` — line 52, with guard `isWireRole` at lines 88-90. NOTE: `"Parent"` IS a valid wire role value — the matrix just has no cells using it for session types.
- `WIRE_NOTIFICATION_TYPES` — lines 59-69 (9 members incl. `SessionCompletion`), guard `isWireNotificationType` lines 72-74, union type lines 76-85.
- `SESSION_ROUTES_BY_TYPE_AND_ROLE` — lines 108-120. Exact shape:
  ```ts
  SessionDisputeOpened: { Admin: ADMIN_DISPUTES_ROUTE },                 // :111
  SessionDisputeResolved: { Admin, Student, Teacher },                    // :112-116
  SessionCompletion: { Student: STUDENT_SESSIONS_ROUTE, Teacher: TEACHER_SESSIONS_ROUTE },  // :117 — NO Parent cell
  SessionCancellation: { Student, Teacher },                              // :118
  SessionRequest: { Student, Teacher },                                   // :119
  ```
  JSDoc lines 92-107 explicitly documents the miss semantics: "A missing outer key … or a missing inner cell (an audience the wave never reaches) resolves to `undefined` and the resolver falls through to the feed page — the matrix NEVER fabricates a route."
- `NOTIFICATION_ROUTE_BY_TYPE` — lines 137-141: role-LESS stage keyed by codegen `NotificationType` enum member; the ONLY entry is `[NotificationType.SessionCompletion]: STUDENT_SESSIONS_ROUTE` (line 140). JSDoc lines 122-136 explains the session-completion row routes by TYPE alone and why keying on `"session"` is wrong. **Implication for this ticket: adding a Parent cell to the matrix (line 117) alone is not enough for the role-less stage — but the role-less stage's only entry routes to the STUDENT sessions route, so a Parent row with a resolvable role consults the matrix first (§1 resolution order).**
- `NOTIFICATION_ROUTE_BY_ENTITY_TYPE` — lines 161-163: only `[BackendNotificationType.ParentLinkRequest]: STUDENT_LINK_REQUESTS_ROUTE`. JSDoc lines 143-160 documents that PARENT-targeted refinement values (`parent_link_request_decision` / `parent_link_request_expiry`) deliberately miss.
- `resolveNotificationRoute` — signature at lines 188-192:
  ```ts
  export function resolveNotificationRoute(
    relatedEntityType: string | null,
    notificationType?: string | null,
    role?: string | null
  ): string
  ```
  Resolution order (JSDoc lines 165-187, body lines 193-211), first hit wins:
  1. `relatedEntityType === null` → feed (line 193-195);
  2. parent-link entity map hit → `STUDENT_LINK_REQUESTS_ROUTE` (lines 196-199);
  3. session matrix: `relatedEntityType === "session"` AND valid type AND valid role → `SESSION_ROUTES_BY_TYPE_AND_ROLE[type]?.[role] ?? feed` (lines 200-207);
  4. role-less type stage (only when role is NOT a valid wire role): `NOTIFICATION_ROUTE_BY_TYPE[type] ?? feed` (lines 208-210);
  5. feed fall-through (line 211).
- The JSDoc "deep-link suite" mentions: lines 50-51 ("conformance against the generated enum is pinned in the deep-link suite (every member listed)") and line 57 ("conformance pinned in the deep-link suite") — referring to the test file below.

### Test file

`frontend/lib/notification-route-resolution.test.ts` (82 lines) — the only test file matching `notification-route-resolution` (grep across `test/` and `frontend/` found no other; `test/` has NO copy). What it pins:
- `STUDENT_LINK_REQUESTS_ROUTE` constant value (lines 16-20).
- Feed fallback for null pointer (lines 23-25).
- Type-stage SessionCompletion → `/student/sessions` with null AND `"session"` entity pointer (lines 27-30) — NOTE: these calls pass the type as FIRST arg and entity as second, which does NOT match the current production signature order `(relatedEntityType, notificationType, role)`; the tests exercise the two-arg overload shape and pass because `NotificationType.SessionCompletion` as `relatedEntityType` misses the entity map and (as a non-`"session"` value) falls to... actually `NotificationType.SessionCompletion` is not wire-type-guard-relevant here; the assertions at lines 28-29 expect `/student/sessions`, matching `NOTIFICATION_ROUTE_BY_TYPE`. **CAUTION for the plan: this test file's call convention is stale relative to the resolver's documented order — a plan editing the resolver must reconcile these tests.**
- Parent-link entity pointer routing incl. cross-type (lines 32-39).
- Unmapped enum values fall to feed (lines 41-53).
- Parent-targeted refinement values fall to feed (lines 55-63).
- Hostile/unknown entity strings fall to feed (lines 65-81).
- The test does NOT pin any `Parent`-role behavior and does NOT pass a third `role` argument anywhere (no role conformance tests exist — MISSING).

## 2. ALL call sites of `resolveNotificationRoute`

Grep for `resolveNotificationRoute` across the repo returns production call sites in exactly TWO components (plus imports/tests/docs):

**Site A — feed list:** `frontend/views/notifications/feed/NotificationList.tsx:78`
```ts
deepLinkHref={resolveNotificationRoute(notification.relatedEntityType, notification.type, userRole)}
```
- Row data available: the full `MyNotificationsQuery_myNotifications_items` row (typed import at `NotificationList.tsx:6`; fields id, type, title, body, isRead, relatedEntityType, relatedEntityId, createdAt — see §6) passed as `notification` prop; only `relatedEntityType`, `type` are used for routing; `relatedEntityId` is available but NOT consumed.
- Viewer role: comes in as the `userRole: string | null` prop (`NotificationList.tsx:19`), threaded from `NotificationsFeedContainer.tsx:50` (`const { user } = useAuth()`) → `:95` (`userRole={user?.role ?? null}`) → `NotificationsFeedBody.tsx:26,66,105` → `NotificationList`.
- Navigation: NOT here — the resolved href is passed to `NotificationRow` as `deepLinkHref` (`NotificationList.tsx:78`), and `NotificationRow.tsx:92-110` renders `<Box component={Link} href={deepLinkHref} onClick={handleActivate}>` (next/link — native navigation, no router call). `deepLinkHref: string | null` prop: `null` renders the content un-linked (`NotificationRow.tsx:26,92,111-113`). Note the resolver never returns null, so the un-linked branch is currently dead in practice.

**Site B — drawer body:** `frontend/components/ui/NotificationDrawerBody.tsx:121`
```ts
href={resolveNotificationRoute(item.relatedEntityType, item.type, userRole)}
```
- Inside `NotificationDrawerList` (`:108-175`); each row is `<ListItemButton component={Link} href={...} onClick={() => onOpenNotification(item)}>` (`:118-124`).
- Row data: `MyNotificationsQuery_myNotifications_items` items (drawer window, `DRAWER_PAGE_SIZE = 5` at `NotificationDrawer.tsx:21`); `relatedEntityId` available, unused.
- Viewer role: `userRole: string | null` prop threaded from `NotificationDrawer.tsx:35,77,173` ← `NotificationUnreadBadge.tsx:65,68,140` ← `DashboardAppBar.tsx:172` (`<NotificationUnreadBadge userRole={user?.role ?? null} />`, with `const { user } = useAuth()` at `DashboardAppBar.tsx:66`, import at `:15`).
- Navigation: native `<Link>`; row activation marks read (when unread) then closes the drawer (`useNotificationDrawerActions.ts:67-75`).

**Other surfaces:** NO other call sites. The realtime hook/toast does NOT navigate at all (§5) — the toast is display-only. Grep hits outside production: `frontend/lib/notification-route-resolution.test.ts` (tests), `NotificationList.tsx:7` / `NotificationDrawerBody.tsx:10` (imports), JSDoc mentions at `NotificationsFeedContainer.tsx:35`, `NotificationRow.tsx:22`, `useNotificationDrawerActions.ts:48`, `navItems.ts`, `docs/parents/parent-link-request.md:174`.

## 3. Notifications feed page

- Route: `app/(dashboard)/notifications/page.tsx` (37 lines). Server Component: `generateMetadata` (`:26-32`), `withPageAuth({ redirectTo: "/notifications" })` with no role whitelist (`:35` — every role has an inbox), then delegates to `<NotificationsFeedContainer />` (`:36`).
- `frontend/views/notifications/feed/NotificationsFeedContainer.tsx` (122 lines): header (title `t.title` `:64`, pluralized unread count `t.unreadCount(feed.unreadCount)` `:66-70`), `MarkAllButton` (`:72-78`), `NotificationFilterChips` (read-state toggle + one chip per NotificationType, `:81-89`), `NotificationsFeedBody` (`:91-110`), and `NotificationsMarkAllSnackbar` for the mark-all affected count (`:112-119`). Role: `const { user } = useAuth()` at `:50`; `userRole={user?.role ?? null}` at `:95`.
- State: `useNotificationsFeedState` at `frontend/views/notifications/hooks/useNotificationsFeedState.ts:60-93` — `useQuery(myNotificationsQueryDocument, { variables: { filter: filters.filter } })` (`:62`, no poll on the list) + `useQuery(myUnreadNotificationCountQueryDocument, { pollInterval: 120_000 })` (`:63-65`, `NOTIFICATION_COUNT_POLL_INTERVAL_MS` at `:24`); pagination derived at `:74,77-78`; filter state in `useNotificationsFeedFilters` (local React state, no Zustand).
- Body: `frontend/views/notifications/feed/NotificationsFeedBody.tsx:62-123` — early-return branches skeleton → error (`NotificationFeedError` with `errorCode` via `extractErrorCode`) → empty (`NotificationEmptyState`) → `NotificationList` + `NotificationsFeedPager` (`:110-120`, prev/next at `:158-188`, `page + 1 / totalPages` indicator `:172-174`).
- Rows: `frontend/views/notifications/feed/NotificationList.tsx:47-85` — memo-wrapped semantic `ul` (`data-testid="notifications-list"`, `aria-busy`); maps rows to `NotificationRow` with `deepLinkHref` from the resolver (`:78`).
- `frontend/views/notifications/feed/NotificationRow.tsx:46-124` — row = type icon (`NOTIFICATION_TYPE_ICONS[notification.type] ?? NotificationsOutlined` `:57`) + content (in `NotificationRowContent`, `:74`) + mark-read action; read/unread UI: `unread = !notification.isRead` (`:58`), unread rows get `theme.palette.action.selected` background (`:85`), read rows get a divider hairline (`:88`); unread rows render `NotificationRowMarkReadAction` (`:114-121`). Row activation (`:68-72`) marks an unread row read fire-and-forget, then native Link navigation.
- i18n handles: `useAppTranslation(Notifications)` + `useAppTranslation(Common)` + `useAppLocale` (`NotificationsFeedContainer.tsx:13,43-45`); labels typed `NotificationsLabels` from `@/shared/locale/types/notifications`; mark-read aria `labels.markReadAriaLabel(notification.title)` (`NotificationRow.tsx:59`).
- Pagination: offset/limit window via `NOTIFICATIONS_PAGE_SIZE` (imported at `useNotificationsFeedState.ts:10-16`), `hasMore`/`totalCount` from the query, zero-based `page` prop.

## 4. Notification drawer

- The drawer lives under `frontend/components/ui/` (NOT `frontend/components/notifications/**` — that directory does not exist; `frontend/views/notifications/**` holds the feed but NO drawer file). Files: `NotificationUnreadBadge.tsx`, `NotificationDrawer.tsx`, `NotificationDrawerBody.tsx`, `useNotificationDrawerActions.ts`, `NotificationRealtimeToastHost.tsx`.
- Badge/entry point: `frontend/components/ui/NotificationUnreadBadge.tsx:68-143` — app-bar bell + MUI `Badge` (poll 120s, `:70-72`; overflow cap `99+` at `:24`), toggles the popover anchored to the bell (`:85-90`), renders `<NotificationDrawer ... userRole={userRole} />` at `:140`. Accessible label composes `t.badgeAriaLabel` + `t.unreadCount(n)` (`:82-83`).
- Drawer: `frontend/components/ui/NotificationDrawer.tsx:73-191` — `Popover` width `min(400px, 100vw-16px)`; list query `useQuery(myNotificationsQueryDocument, { variables: { filter }, skip: !open, fetchPolicy: "cache-and-network" })` (`:102-106`) with memoized filter `{ isRead: null, type: null, limit: 5, offset: 0 }` (`:82-85`); count query read-only `useQuery(myUnreadNotificationCountQueryDocument, { skip: !open })` (`:109`); pinned header (title + mark-all `:149-163`), scrollable body (`:165-175`), pinned footer Link to `/notifications` (`:177-188`).
- Row click flow: `ListItemButton component={Link} href={resolveNotificationRoute(item.relatedEntityType, item.type, userRole)}` (`NotificationDrawerBody.tsx:118-124`) + `onClick={() => onOpenNotification(item)}` → `handleOpenNotification` (`useNotificationDrawerActions.ts:67-75`): marks read via shared `useNotificationMarkActions` when unread (`markNotificationRead({ id, wasUnread: true, activeFilter: filter })`), then `onClose()`. Mark-all: `:78-84` via `markAllNotificationsRead(filter)`.
- Badge/unread count truth: the Apollo-cached `myUnreadNotificationCount` field (plan D11 — the realtime socket, feed mark actions, and the poll all co-maintain it; see JSDoc `NotificationUnreadBadge.tsx:35-42`).
- **Role accessor for the client at this point:** `useAuth()` from `@/frontend/hooks/auth` (`frontend/hooks/auth/useAuth.ts:6-12`, backed by `AuthContext` at `@/frontend/context/AuthContext`), read in `DashboardAppBar.tsx:66` and passed `userRole={user?.role ?? null}` at `:172`. NOT a Zustand store, NOT a session hook.

## 5. Realtime hook + helpers

`frontend/hooks/notifications/use-notification-realtime.ts` (101 lines):
- Public surface: `useNotificationRealtime(): UseNotificationRealtimeResult` → `{ toasts, dismissToast }` (`:53-56,63,100`). It owns ONE WebSocket per authenticated shell (mounted once via `NotificationRealtimeToastHost` in `DashboardLayout`), merges arrivals into the Apollo cache, and enqueues a localized toast per fresh arrival (`:8-12`).
- **On an incoming WS event there is NO auto-navigation and NO deep-link** — only: (a) Apollo cache merge, (b) unread-count bump, (c) localized toast (all inside the socket module, below). Toasts cap at `MAX_CONCURRENT_TOASTS = 3` (`:85`, constant at `use-notification-realtime.helpers.ts:31`), auto-hide 6000ms (`NotificationRealtimeToastHost.tsx:11`), dismissible (`:87-91`).
- Locale seam: `labelsRef` updated in an effect (`:73-76`), read via `readLabels()` (`:93`) so mid-connection locale changes localize later toasts.
- Session start: `startNotificationRealtimeSession({ client, readLabels, enqueueToast })` (`:95-98`).

`frontend/hooks/notifications/use-notification-realtime.socket.ts` (296 lines) — the message handler `createRealtimeMessageHandler` (`:112-178`): frame guard (`isRealtimeNotificationFrame` `:126`) → replay dedupe by id (`:130-134`, tracker `:52-72`, window `RECENT_ID_LIMIT = 200`) → `PAYLOAD_TYPE_TO_CACHE_TYPE` lookup (UNKNOWN snake_case type → dropped with warn, `:136-144`) → build `RealtimeNotificationCacheRow` (`:146-156`, `isRead: false`) → `mergeRealtimeNotificationIntoCache` (`:157`; held → complete no-op `:158-161`) → bump cached `myUnreadNotificationCount` +1 without refetch (`:165-171`) → toast via `PAYLOAD_TYPE_TO_LABEL` + `labels.realtimeToast(typeLabel, title)` (`:173-176`). Reconnect: 4401/4009 abort, others backoff-reconnect; a RE-connect fires catch-up refetch (page-1 list + count, `:74-106`).

`frontend/hooks/notifications/use-notification-realtime.cache.ts` (128 lines) — `mergeRealtimeNotificationIntoCache(cache, row, payloadType): boolean` (`:94-128`): writes/prepends the normalized `Notification:{id}` entity into every MATCHING page-1 `myNotifications` variant (offset>0 excluded `:73-75`, `isRead: true` views excluded `:76-78`, type-filter matching via `GRAPHQL_TYPE_NAME_TO_PAYLOAD_TYPE` `:79-81`), dedupe by logical id, returns whether already held. `RealtimeNotificationCacheRow` type at `:16-26` (includes `relatedEntityType` and `relatedEntityId: number | null`).

`frontend/hooks/notifications/use-notification-realtime.helpers.ts` (178 lines) — payload-map precedents:
- `PAYLOAD_TYPE_TO_CACHE_TYPE` (`:140-148`): snake_case backend value → codegen enum; includes `session_completion: NotificationType.SessionCompletion` (`:142`). `undefined` models the runtime miss.
- `PAYLOAD_TYPE_TO_LABEL` (`:155-163`): snake_case → label accessor; `session_completion: labels => labels.typeSessionCompletion` (`:157`).
- `GRAPHQL_TYPE_NAME_TO_PAYLOAD_TYPE` (`:170-178`): wire enum name → snake_case (`SessionCompletion: "session_completion"` `:173`).
- Frame shape `RealtimeNotificationFrameData` (`:90-98`): `{ id, type, title, body, relatedEntityType, relatedEntityId, createdAt }` — the WS payload carries `relatedEntityId` (numeric) but NO role and NO student id.

## 6. Notification GraphQL documents

File: `frontend/graphql/sharedDocuments/notifications/notification.documents.ts` (111 lines). Naming convention: `my…QueryDocument` / `mark…MutationDocument` exported consts (matching the AGENTS `{entityName}QueryDocument` convention). Hook used by consumers: `useQuery` / `useMutation` imported from `@apollo/client/react` (`NotificationDrawer.tsx:3`, `NotificationUnreadBadge.tsx:3`, `useNotificationsFeedState.ts:3`).

- `myNotificationsQueryDocument` (`:30-47`) — `query MyNotifications($filter: MyNotificationsFilterInput)`; `myNotifications(filter: $filter) { items { id type title body isRead relatedEntityType relatedEntityId createdAt } totalCount hasMore }`. Fields: `id` first (`:34`, Apollo normalization requirement), `type` (`:35` — GraphQL wire enum, e.g. `SessionCompletion`), `relatedEntityType` (`:39` — backend varchar, e.g. `"session"`), `relatedEntityId` (`:40` — numeric session id for session-family rows). **NO `role` field is selected, and NO per-recipient/student pointer exists on the row** — the row is self-scoped to the authenticated caller (`:15-19`).
- `myUnreadNotificationCountQueryDocument` (`:59-63`) — zero-variable `Int`.
- `markNotificationReadMutationDocument` (`:75-91`) — `mutation MarkNotificationRead($id: ID!)`, returns the flipped full row.
- `markAllNotificationsReadMutationDocument` (`:104-111`) — `mutation MarkAllNotificationsRead($type: NotificationType)`, returns bare `Int`.

**Key implication:** the notification row exposes `relatedEntityId` = the SESSION id (for session rows the backend persists the session id), not a student id. A parent deep-link to `/parent/children/[studentId]/...` therefore cannot be built from the row alone without either (a) a new field (e.g. a student/child pointer on the notification), (b) routing to a parent-level list surface that resolves the child from the session, or (c) backend emitting a parent-audience `relatedEntityType` refinement (the `parent_link_request_decision` precedent at `notification-route-resolution.ts:152-158`).

## 7. Parent-specific handling in notification UI — definitive status

Grep for `UserRole.Parent` across `frontend/views/notifications`, `frontend/hooks/notifications`, and `frontend/components/ui/Notification*`: **ZERO hits.** The only "Parent" strings in those trees are the `ParentLinkRequest` notification TYPE labels/icons:
- `frontend/views/notifications/utils/notification-type-presentation.ts:33,49,66` (label, icon `FamilyRestroomOutlined`, filter-chip order).
- `frontend/hooks/notifications/use-notification-realtime.helpers.ts:144,159,174` (payload maps).

**What does NOT exist (MISSING, all verified by grep in this session):**
- No `Parent` cell in `SESSION_ROUTES_BY_TYPE_AND_ROLE` for `SessionCompletion` (or any session type) — `notification-route-resolution.ts:111-119`.
- No route constant for `/parent/children/[studentId]` (or any parent-portal route) anywhere in the resolver module.
- No `role`-argument tests in `notification-route-resolution.test.ts`; no Parent-role routing test anywhere.
- No parent-specific row rendering, filtering, or toast behavior in the feed, drawer, or realtime hook.
- The drawer/feed role plumbing is fully generic (`userRole: string | null` prop), so adding a Parent cell to the matrix requires NO component changes — the resolved href flows automatically through both `Link` surfaces.

Net: today a Parent-viewed `SessionCompletion` row resolves through stage 3 of the resolver (valid role `Parent`, matrix cell missing → `?? NOTIFICATIONS_FEED_ROUTE`) and lands on `/notifications` — the documented safe fall-through.

## 8. Verified evidence index

| Claim | Evidence |
|---|---|
| Resolver signature + order | frontend/lib/notification-route-resolution.ts:188-211 (order doc :165-187) |
| STUDENT_SESSIONS_ROUTE const | frontend/lib/notification-route-resolution.ts:29 |
| Session matrix, no Parent cell | frontend/lib/notification-route-resolution.ts:108-120 (SessionCompletion :117) |
| NOTIFICATION_ROUTE_BY_TYPE (role-less, SessionCompletion only) | frontend/lib/notification-route-resolution.ts:137-141 |
| "deep-link suite" JSDoc | frontend/lib/notification-route-resolution.ts:50-51,57 |
| WireRole includes "Parent" | frontend/lib/notification-route-resolution.ts:52,88-90 |
| Resolver tests + what they pin | frontend/lib/notification-route-resolution.test.ts:16-81 (no role-arg tests) |
| Feed call site | frontend/views/notifications/feed/NotificationList.tsx:78 |
| Feed role source | frontend/views/notifications/feed/NotificationsFeedContainer.tsx:50,95 |
| Feed row navigation (Link) | frontend/views/notifications/feed/NotificationRow.tsx:92-110 |
| Feed read/unread UI | frontend/views/notifications/feed/NotificationRow.tsx:58,85,88,114-121 |
| Drawer call site (Link) | frontend/components/ui/NotificationDrawerBody.tsx:118-124 |
| Drawer role threading | frontend/views/dashboard/layout/DashboardAppBar.tsx:66,172 → NotificationUnreadBadge.tsx:140 → NotificationDrawer.tsx:35,173 |
| Role accessor | frontend/hooks/auth/useAuth.ts:6-12 (AuthContext) |
| Drawer mark-read flow | frontend/components/ui/useNotificationDrawerActions.ts:67-75,78-84 |
| Drawer page size / queries | frontend/components/ui/NotificationDrawer.tsx:21,82-85,102-109 |
| Feed page shell | app/(dashboard)/notifications/page.tsx:26-36 |
| Feed state/pagination | frontend/views/notifications/hooks/useNotificationsFeedState.ts:60-93 (poll :24,64) |
| Realtime: no navigation, cache+count+toast | frontend/hooks/notifications/use-notification-realtime.socket.ts:112-178 |
| Cache merge | frontend/hooks/notifications/use-notification-realtime.cache.ts:94-128 (row type :16-26) |
| Payload-map precedents | frontend/hooks/notifications/use-notification-realtime.helpers.ts:140-148,155-163,170-178 |
| Toast host (shell-mounted) | frontend/components/ui/NotificationRealtimeToastHost.tsx:30-37 |
| GraphQL docs + selected fields | frontend/graphql/sharedDocuments/notifications/notification.documents.ts:30-47,59-63,75-91,104-111 |
| No UserRole.Parent in notification UI | grep over frontend/views/notifications, frontend/hooks/notifications (hits only ParentLinkRequest type labels) |
| Parent portal page exists | app/(dashboard)/parent/children/[studentId]/page.tsx (directory listing) |
