# Research 04 — i18n ground truth, test conventions, precedent rulings

Ticket: "Parent Session Completion Notification Display" (docs/planning/TICKETS.md:2038-2075, "Parent Session Completion Notification Display" heading at line 2038). This file is i18n/test/precedent ground truth for the spec-plan. All citations verified in-session via Grep/Read/Bash.

## Summary (decision-relevant facts)

- The session-report-ready copy keys ALREADY EXIST in the notifications i18n namespace, in the type interface, `en`, and `ar` — no new notification copy keys are needed for the existing emitter; any NEW portal-display copy goes in the `parentMonitoring` namespace (registry.ts:24,47-48).
- Locale accessors are SINGLE-ARG: `getTranslations(locale)` (shared/locale/server.ts:15), `getServerTranslations(locale)` (shared/locale/server-graphql.ts:3), `useAppTranslation(handle?)` (shared/locale/client/use-app-translation.ts:8-10). There is NO `Translation` enum anywhere in `shared/` (grep `enum Translation` and `Translation.` over `shared/` → zero matches). Any plan template showing `getTranslations(locale, "ns")` or `Translation.X` is STALE.
- The deep-link resolution seam already exists: `resolveNotificationRoute(relatedEntityType, notificationType?, role?)` in `frontend/lib/notification-route-resolution.ts:188-192`, with a per-role session matrix where `SessionCompletion` currently maps ONLY Student/Teacher (line 117) — the Parent cell is the gap this ticket closes.
- The binding deep-link contract is R-I / R16: `/parent/children/<studentId>?tab=reports&session=<sessionId>` (docs/parents/monitoring-portal.md:207).
- Journey tests run via `bun run test/scripts/run-test.ts test/workflows/<domain>/<file>.test.ts` — there is NO general `test:workflows` package.json script (only `test:workflows:paymob`, package.json:32).

## 1. Notifications i18n — session-report-ready keys

Type interface `shared/locale/types/notifications/index.ts`:
- `eventSessionReportReadyTitle: string` — line 199 ("Notification title — the session's report was submitted and is ready to view").
- `eventSessionReportReadyBody: (teacherName: string) => string` — line 207 (student body; "MUST stay free of grades, note content, and identifiers … the body is a link invite, not a content mirror", lines 201-206).
- `eventSessionReportReadyParentBody: (studentName: string, teacherName: string) => string` — line 213 (parent body; "no grades, no note content, no identifiers").
- Other session-completion-adjacent keys: `typeSessionCompletion` display label (line 45), `eventSessionCompletionPromptTitle/Body` (lines 135,140), `eventSessionAutoCancelledTitle/Body` (lines 142,147). The nine notification-type values incl. `session_completion` are enumerated in the docblock at lines 17-21.

Implementations:
- `shared/locale/en/notifications/index.ts:82-85` — `"Session report ready"`, body `${LRM}${iso(teacherName)} submitted a report for your session.`, parent body `${LRM}${iso(teacherName)} submitted a session report for ${iso(studentName)}.`
- `shared/locale/ar/notifications/index.ts:83-85` — `"تقرير الجلسة جاهز"`, body `قدّم ${iso(teacherName)} تقرير جلستك.`, parent body `قدّم ${iso(teacherName)} تقرير جلسة ${iso(studentName)}.`
- Names are bidi-isolated (`iso`/LRM) by the sender per the interface docblock (types/notifications/index.ts:204-205).

Parity belt `shared/locale/notifications-namespace.parity.test.ts` enforces:
- All three keys listed in the required key set (lines 120-122) and in the function-keys set (lines 173-174 for the two body fns).
- Interpolation fixtures (lines 214-215) and a test "session-report-ready bodies embed ONLY the counterparty names in BOTH locales" (lines 372-380).
- Privacy-hygiene test: rendered title/bodies in BOTH locales must contain no `grade|graded|score|notes?|rating` and no digits (lines 382-400).
- Type-label mapping fixture `session_completion ↔ typeSessionCompletion` (lines 133,141).
- RULE FOR THE PLAN: any new display copy must land in `shared/locale/types/<ns>` + `en/` + `ar/` with exact key parity, and the parity test's key lists must be extended in lockstep.

## 2. Locale accessor GROUND TRUTH (the REAL system)

- `useAppTranslation` — `shared/locale/client/use-app-translation.ts:8-10`:
  `export function useAppTranslation(): Translations;`
  `export function useAppTranslation<TLabels>(handle: NamespaceHandle<TLabels>): TLabels;`
  Internally: `const locale = useAppLocale(); const translations = getTranslations(locale); return handle ? handle.getLabels(translations) : translations;` (lines 11-16). So client usage is `useAppTranslation(Notifications)` → the namespace labels object (root AGENTS.md examples `useAppTranslation("namespace")` are simplified prose; the real arg is a `NamespaceHandle` imported from `@/shared/locale/namespaces/<x>`).
- `getTranslations` — `shared/locale/server.ts:15`: `export function getTranslations(locale: string): Translations` — SINGLE-ARG. Server components slice the namespace off the returned object (e.g. `.notificationsTranslations`), as the parity/plan docs show. Also `getDefaultTranslations()` (line 19) and `loadAllTranslations(locale)` (line 23).
- `getServerTranslations` — `shared/locale/server-graphql.ts:3`: `export function getServerTranslations(locale: string): ReturnType<typeof getTranslations>` — SINGLE-ARG; used in resolvers/API/tests (e.g. `getServerTranslations("en").notificationsTranslations`, test/workflows/teachers/verification-plan-purchase.journey.test.ts:132).
- Namespace registry `shared/locale/namespaces/registry.ts` — full handle list (lines 7-28, composed object lines 30-53): AdminBroadcasts, AdminFinance, AdminSessionGovernance, AdminStudents, AdminTeachers, AdminUsers, Analytics, Applicant, Auth, Checkout, Common, Dashboard, Errors, HandshakeCode, Landing, Notifications, ParentLink, ParentMonitoring, Plans, Recitation, Sessions, Wallet. `Notifications` at registry.ts:22 (object key at :46); `ParentMonitoring` at registry.ts:24 (object key at :48).
- `Translation` enum: MISSING — definitively. Grep for `enum Translation` and `Translation.` across `shared/` returned zero matches. The only occurrence of the pattern anywhere is a stale mention in a finished plan (`ai/finished_plans/milestone_2_matching_notifications_escrow/real-time-notification-engine-websocket/plan.md:211` says `useAppTranslation(Translation.Notifications)`) — that predates the current accessor shape and is NOT binding on i18n style; use the real `useAppTranslation(Notifications)` handle form.
- Locale leaf-module rules (shared/locale/AGENTS.md): ICU `{var}` interpolation in leaf literals, no logic in leaves, `@/shared/locale/...` absolute imports only.

## 3. Test command ground truth (package.json)

- NO general `test:workflows` script. The ONLY workflows script is `test:workflows:paymob` (package.json:32): runs `bun run test/scripts/run-test.ts test/workflows/billing/paymob-live-tunnel.journey.test.ts`. Workflows are run per-file (or per-dir) via `bun run test/scripts/run-test.ts test/workflows/<...>` (docs/testing/workflow-journey-tests.md:102-103). No `scripts/test/` directory exists.
- `test:graphql` (package.json:36): `bun run scripts/lib/run-locked-cmd.ts test:graphql bun run test/scripts/run-server-tests.ts` (runs `backend/graphql/test/` over a dev server; `test:graphql:coverage` at line 37).
- `test:ui:e2e:paymob` (package.json:34): Paymob live checkout E2E — `bun run gen:paymob-test-env && ... bun run test/scripts/run-server-tests.ts --e2e --port 3100 test/ui/e2e/paymob-checkout.e2e.test.ts`. This is the only UI test entry point; the static/component UI test layer no longer exists.
- Other context: `test:services` (line 26, parallel runner), `test:db` (line 22), `test:integration` (line 30), `test:kill`.
- Run-test helper: `test/scripts/run-test.ts` exists; canonical invocation `bun run test/scripts/run-test.ts <path>` (mandatory log-capture wrapper for journey/db tests; `--last`, `--last --focus` flags per root AGENTS.md).
- File-scoped lint: `bun run scripts/lint-service.ts -f <file> --id <caller>` (root AGENTS.md); quality-gate stage order tsgo → oxlint → biome → lint → duplicates.

## 4. Journey conventions (binding) — docs/testing/workflow-journey-tests.md + test/workflows/AGENTS.md

docs/testing/workflow-journey-tests.md:
- Definition & layering (lines 1-53): journeys = sequential cross-actor service-layer calls, no HTTP/GraphQL; one journey file per workflow under `test/workflows/<domain>/` (lines 101-103, 118-124).
- NO `runInRollback` — ever (lines 55-58 + AGENTS.md hard rule 1): services use global `db` and own transactions; this is the documented exception valid only inside `test/workflows/`.
- Fixtures: `beforeAll` provisioning cast in ONE committing `db.transaction(...)` (line 64); `afterAll` hard-delete all tracked rows FK-safe + mandatory post-teardown existence re-probes (line 70; AGENTS.md rule 2); unique prefix `jrn_<domain>_<uuid8>` (line 74); never seed/demo rows — create via `backend/db/test/entity-setup.ts` helpers (lines 64-76, AGENTS.md rule 9).
- Honest authorization (lines 77-84): real roles, no monkey-patching permission resolution; negative steps assert translated substrings from `getServerTranslations("en").errorsTranslations` via try/catch — NEVER `expect(...).rejects.toThrow()` (AGENTS.md rule 6).
- Notification spying (lines 86-92): nothing reaches real email/SMS/push; spy the notification dispatch boundary (`spyOn` from `bun:test`, fall back to `mock.module` restored in `afterAll`); assert BOTH dispatch happened AND which userIds it targeted (AGENTS.md rule 5).
- `bun:test` imports only, `@/` aliases only (AGENTS.md rules 7-8); shared scaffolding only in `test/workflows/helpers/` with a pure `export *` barrel (lines 105-107 + AGENTS.md rule 10); cross-actor visibility + denial assertions in BOTH directions (AGENTS.md rule 12).

## 5. Precedent rulings

The requested path `ai/finished_plans/milestone_2_matching_notifications_escrow/real-time-notification-engine-websocket/outcome/*` does NOT exist (verified `ls` — MISSING). The real-time-notification-engine finished plan contains `plan.md`, `specs.md`, `tasks.md`, plus a nested `drawer/plan.md`. Rulings from those (read in-session):

Real-time engine (ai/finished_plans/milestone_2_matching_notifications_escrow/real-time-notification-engine-websocket/):
- Realtime lane is a Bun WS sidecar process (`bun run ws`), NOT an app route (plan.md:15, D1 at plan.md:83). Client on-message path = Apollo cache merge deduped by id + localized toast (plan.md:83, 515-526); no toast storm — backoff/jitter, dedupe by `id` (plan.md:398, 570).
- `session_completion` is a first-class notification-type enum value (specs.md:12; pgEnum parity at plan.md:118). Engine emits idempotency = best-effort fail-OPEN (plan.md:97, REQ-016 at specs.md:72) — relevant if the plan touches emit behavior (it should NOT; display-only).
- BOLA: parent sees child's session completion ONLY via the row emitted TO the parent, never by querying the child's inbox (REQ-030, specs.md:102). Binding for the display plan: no inbox-scoping changes.
- Realtime envelope is a CLOSED `RealtimeNotificationPayload` projection — no CTA/deep-link/userId additions (sibling ruling, session-request specs.md:71). Binding: the deep link must be resolved client-side from `relatedEntityType/relatedEntityId` + `type`, NOT by widening the payload.
- Drawer (drawer/plan.md): floating drawer shows latest notifications, row click `markNotificationRead(id, wasRead)` then navigates (drawer/plan.md:99); pinned footer "View all notifications" → `/notifications` (drawer/plan.md:35); drawer never opens a socket — the DashboardLayout shell socket co-maintains the cache (drawer/plan.md:24, 144); realtime toast host explicitly OUT of drawer scope (drawer/plan.md:154-157).

Binding prior commitments about THIS ticket (DEV1-017 / session_completion display):
- `docs/parents/monitoring-portal.md:22` — "when a child's session completes, `SessionReportNotificationService.notifySessionReportReady` emits a `session_completion` notification to the linked parent… the portal's report-tab deep-link is the display contract that closes that notification loop."
- `docs/parents/monitoring-portal.md:207` — "R16 — Deep-link contract for completion notifications. The portal's report-tab URL (`/parent/children/<studentId>?tab=reports&session=<id>`) is the forward display target for `session_completion` notifications… The emitter already writes `relatedEntityType` / `relatedEntityId`; the portal resolves the deep-link client-side."
- `docs/parents/monitoring-portal.md:307` — "DEV1-017 deep-link target display → sibling ticket (the emitter already writes relatedEntityType / relatedEntityId; the portal's report-tab deep-link … is the forward display contract)."
- `docs/planning/TICKETS.md:2052-2060` (acceptance criteria): notification type `session_completion` with a link to report/homework/evaluation; click → taken to the session report view in the monitoring portal.
- `docs/planning/MILESTONE_PLAN.md:262` — ticket row: "Parent session completion notification display | Dev 1 | 3 | Parent Read-Only Monitoring Portal, Real-Time Notification Engine (WebSocket)".
- `docs/scenarios/customer-journey-maps.md:72` — "Receives real-time notification when child's session completes; links to report/homework/evaluation… Notification Service dispatches session completion alert with link to `reports` and `home_work`."
- `docs/planning/PRODUCTION_READINESS.md:167,269` — INV-P3 verification items: parent receives session-completion notification.
- `ai/finished_plans/milestone_3_parent_portal_admin_governance/parent-read-only-monitoring-portal/specs.md:177` — REQ-013.4: detail view deep-linkable by URL — "the forward contract for DEV1-017 notification deep links, ruling R-I"; specs.md:541 "deep-link invariant, ruling R-I"; specs.md:624 "R-I — deep-link forward contract: tab/entity state is URL-expressible so DEV1-017's completion notifications can deep-link into the portal"; specs.md:631 "DEV1-017 will consume the portal's report deep-link URL as its notification target (forward item D2, not built here)".
- `.../parent-read-only-monitoring-portal/plan.md:484` — "**Deep-link contract (R-I):** `/parent/children/<studentId>?tab=reports&session=<sessionId>` — the target DEV1-017's `session_completion` notifications will emit; component layer resolves the tab and scrolls to the row." plan.md:44 "URL is the state — `?student=` / `?tab=` carry selection; no Zustand … deep links and DEV1-017 notification targets work by construction (R-G, R-I)".
- `.../parent-read-only-monitoring-portal/tasks.md:356` — journey J1 pins the `?session=` deep link resolving to the same record via portal services; J2-J4 denial/link-severing journeys.
- `.../parent-read-only-monitoring-portal/specs.md:84` — non-goal 4: "NO notification DISPLAY surface (owned by DEV1-017; the portal only ships the deep-linkable report view… ruling R-I)."
- `ai/finished_plans/milestone_3_parent_portal_admin_governance/student-confirmation-of-parent-link/tasks.md:319` — security posture precedent: "notification deep-link cannot be abused for IDOR (route is generic, authorization enforced server-side)" — binding for the parent deep link too.
- `ai/finished_plans/milestone_3_parent_portal_admin_governance/student-evaluation-submission-teacher-rating/specs.md:222` — prior deep-link map extension precedent: map `NotificationType.SessionCompletion` (student side) to `STUDENT_SESSIONS_ROUTE` single-sourced constant; the parent-side cell is the analogous extension for this ticket.

## 6. Deep-link test suite

- `frontend/lib/notification-route-resolution.test.ts` (82 lines) — pins the resolver:
  - null entity pointer → feed route (test at :23); type-stage hit routes by type alone regardless of pointer, `resolveNotificationRoute(NotificationType.SessionCompletion, …)` → `/student/sessions` (:27-30); `parent_link_request` entity pointer → `/student/link-requests` (:32-39); unmapped enum values → feed (:41); parent-targeted refinement pointers intentionally fall through to feed (:55); hostile/unknown strings safely fall through (:65).
  - `test/workflows/parents/student-confirmation-of-link.journey.test.ts:1210` — "NOTIFICATION deep-link data contract: every persisted parent-link row carries the drawer-resolvable (type, relatedEntityType, relatedEntityId) triple" (precedent for asserting the session_completion row triple at journey level).
- `resolveNotificationRoute` real signature (frontend/lib/notification-route-resolution.ts:188-192): `resolveNotificationRoute(relatedEntityType: string | null, notificationType?: string | null, role?: string | null): string`. Resolution order: parent-link entity map → session matrix (`SESSION_ROUTES_BY_TYPE_AND_ROLE`, lines 108-120; `SessionCompletion: { Student, Teacher }` at :117 — **no Parent cell, THE gap**) → role-less type map (`NOTIFICATION_ROUTE_BY_TYPE`, :137-141, only `SessionCompletion` → student sessions) → `/notifications` feed fallback. Constants: `STUDENT_LINK_REQUESTS_ROUTE` (:16), `STUDENT_SESSIONS_ROUTE` (:29), `TEACHER_SESSIONS_ROUTE` (:32), `NOTIFICATIONS_FEED_ROUTE` (:35), `SESSION_ENTITY_TYPE = "session"` (:45); wire-type/role guards :72,:88.
- `test/workflows/parents/parent-monitoring.journey.test.ts:790-807` — "J1 step 4 — Deep-link: parentChildReports(S1).items contains a row whose sessionId === σ1.id (the deep-link target)" — pins that the reports list exposes `sessionId` rows resolvable by `?session=`.

## 7. Existing notification wire tests

- `backend/graphql/test/notification-integration.matrix.test.ts` — full role × operation matrix over the four inbox ops (`myNotifications`, `myUnreadNotificationCount`, `markNotificationRead`, `markAllNotificationsRead`) vs every caller class (`setupTestServerLifecycle` + `testClient`).
- `backend/graphql/test/notification-mutation.test.ts` — wire-tier mutation suite: anonymous rejection, real HTTP → gateway → scope-auth → resolver → engine → Postgres.
- `backend/graphql/test/notification-query.test.ts` — wire-tier query suite for the two inbox queries over the real GraphQL boundary.
- Related (context, not drawer tests): `backend/services/notifications/notification-engine.{emit,inbox,projections,chaos}.test.ts`, `backend/db/test/logic/notifications/notification.repository.test.ts`, `backend/services/classes/session-report-notification.test.ts` (the parent-emitter service test), `backend/ws/notification-ws-server.test.ts`, `backend/types/notifications/notification.types.test-d.ts`, `test/workflows/classes/session-request-notifications.journey.test.ts`.

## Verified evidence index

| Claim | Evidence |
|---|---|
| Session-report-ready type keys | shared/locale/types/notifications/index.ts:199,207,213; typeSessionCompletion :45 |
| en implementations | shared/locale/en/notifications/index.ts:82-85 |
| ar implementations | shared/locale/ar/notifications/index.ts:83-85 |
| Parity belt | shared/locale/notifications-namespace.parity.test.ts:120-122,133,173-174,214-215,372-400 |
| useAppTranslation signature | shared/locale/client/use-app-translation.ts:8-16 |
| getTranslations single-arg | shared/locale/server.ts:15-17 |
| getServerTranslations single-arg | shared/locale/server-graphql.ts:3-5 |
| Registry handles incl. Notifications/ParentMonitoring | shared/locale/namespaces/registry.ts:22,24,46,48 (list 7-28,53) |
| `Translation` enum | MISSING — grep `enum Translation`/`Translation.` over shared/ → 0 matches |
| test scripts | package.json:22,26,30,32,36,37,39,40,41,42; helper test/scripts/run-test.ts (invocation docs/testing/workflow-journey-tests.md:102-103) |
| Journey conventions | docs/testing/workflow-journey-tests.md:55-92,101-107; test/workflows/AGENTS.md rules 1-12 |
| R-I/R16 deep-link contract | docs/parents/monitoring-portal.md:22,207,307; parent-read-only-monitoring-portal/plan.md:484 |
| Resolver + Parent gap | frontend/lib/notification-route-resolution.ts:117,137-141,188-212; tests at :23-39 |
| Journey deep-link pins | test/workflows/parents/parent-monitoring.journey.test.ts:790-807; student-confirmation-of-link.journey.test.ts:1210 |
| Wire tests | backend/graphql/test/notification-{integration.matrix,mutation,query}.test.ts (headers, lines 1-20) |
| Ticket AC | docs/planning/TICKETS.md:2038-2075 (AC at 2052-2060); MILESTONE_PLAN.md:262 |
| Closed realtime payload (no deep-link field) | session-request-notification-to-teacher/specs.md:71 |
| BOLA parent-row-only visibility | real-time-notification-engine-websocket/specs.md:102 (REQ-030) |
