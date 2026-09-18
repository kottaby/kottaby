# Research 03 — Parent Portal Surfaces (Deep-Link Landing)

Outcome file for the "Parent Session Completion Notification Display" plan. All path:line citations below were verified in this session via Read/Grep/Bash (`awk`/`grep -n`). Summary of headline findings:

- The deep-link landing surface ALREADY EXISTS end-to-end: `app/(dashboard)/parent/children/[studentId]/page.tsx:73-76` forwards `?tab=` and `?session=`, the container resolves them (`ParentChildDetailContainer.tsx:33-35`), only `ReportsTab` consumes the session id, and `ReportRow` scrolls to + highlights the matching row (`ReportsTab.parts.tsx:54-79`).
- Backend: exactly five read-only query fields exist; there is NO session-scoped / by-session read today (definitive — see §3).
- The canonical doc already names this ticket's contract: `docs/parents/monitoring-portal.md:207` (R16) and `:307` ("DEV1-017 deep-link target display").
- No bottom nav exists anywhere (`frontend/providers/theme/layoutSettings.ts:10` is only a theme token; precedent plan explicitly rules "NO bottom nav" — `plan.md:497`, `specs.md:505`).

## 1. Route shells

`app/(dashboard)/parent/children/[studentId]/page.tsx` (77 lines, guard-only Server Component shell):
- Auth: `withPageAuth({ roles: [UserRole.Parent], redirectTo: "/parent/children" })` at line 64; role enum import line 3.
- Param validation: `Number(rawId)` + `Number.isSafeInteger` + `> 0` guard at lines 66-70; invalid → `redirect("/parent/children")` (line 69).
- searchParams extraction: `firstValueOf(sp, "tab")` (line 73) and `firstValueOf(sp, "session")` (line 74); firstValueOf helper at lines 40-44 (repeated param → first value).
- Renders `<ParentChildDetailContainer studentId={parsedId} tab={tab} session={session} />` at line 76.
- Zero server data fetch; the shell's own doc comment (lines 27-36) states the tab/session deep-link contract and the gate posture.

`app/(dashboard)/parent/children/page.tsx` (57 lines, portal root list):
- Auth: `withPageAuth({ roles: [UserRole.Parent], redirectTo: "/parent/children" })` at line 47.
- Reads `?student=` from searchParams (lines 49-54); an array form is dropped to `null`.
- Renders `<ParentChildrenRootContainer student={student} />` (line 56). Root container: `frontend/views/parent/monitoring/ParentChildrenRootContainer.tsx:15,23,26` — with no `?student=` it redirects/auto-selects client-side after `myLinkedChildren` resolves; prop `student: string | null` at line 117.

## 2. Portal views — child detail, tabs, session highlight

Tab mechanism (URL-is-the-state, no Zustand):
- `frontend/views/parent/monitoring/ParentChildDetailContainer.helpers.ts:1-3` — `TAB_KEYS = ["attendance", "reports", "homework", "evaluations", "progress"]`, `DEFAULT_TAB = "attendance"`; `resolveTab` (lines 9-11) falls back to default on unknown keys; `buildDetailUrl(studentId, tab, session)` (lines 13-20) emits `/parent/children/<id>?tab=<t>[&session=<s>]`.
- `ParentChildDetailContainer.tsx` (120 lines): parses `props.session` with `Number()` and drops NaN (lines 34-35); `handleTabChange` does `router.replace(buildDetailUrl(...))` (lines 52-54) preserving the session param across tab switches; `handleSwitcherChange` preserves tab+session (lines 55-57); `renderTabContent(activeTab, studentId, sessionArg, ...)` at lines 58-64; renders MUI `<Tabs value={activeTab}>` (lines 94-110).
- `ParentChildDetailContainer.tabs.tsx:35-53` — `renderTabContent(tab, studentId, session, childName, deniedAction)`: ONLY `ReportsTab` receives the `session` prop (line 44); HomeworkTab (line 46), EvaluationsTab (line 48), ProgressTab (line 50), AttendanceTab (line 52) do NOT receive it today. Tab icons at lines 21-27.

Reports tab render path:
- `ReportsTab.tsx:33` fetch-all via `useAllReportPages(props.studentId)` (from `useAllPortalPages.ts` — fetches ALL pages, not just page 1); FORBIDDEN → `PermissionDeniedFallback` (lines 50-51); passes `props.session` into `renderReportsBody` (line 63); props at lines 114-119.
- `ReportsTab.body.tsx:97` — `<ReportRow ... deepLinkSessionId={session} />`.
- `ReportsTab.parts.tsx:42-59` — `ReportRow`: `isDeepLinkTarget = deepLinkSessionId !== null && deepLinkSessionId === row.sessionId` (line 54); `useEffect` scrolls `rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" })` (lines 55-59); highlight styles `borderColor/width primary.main`, `borderInlineStartColor primary.main`, `aria-current="true"` (lines 69-84). So a SPECIFIC session IS highlighted today — but only on the reports tab.

Homework tab: `HomeworkTab.tsx:20` (component), props at line 116 — NO `session` prop; `HomeworkTab.body.tsx` rows do not reference a deep-link session. Evaluations data: `EvaluationsTab.tsx:46` reads `data?.parentChildReports?.items` — the "evaluations" tab is a re-read of the SAME report rows (rating-centric view), not a separate query. `EvaluationsSummary.tsx`, `HomeworkSummary.tsx`, `ProgressSummary.tsx` exist in `frontend/views/parent/monitoring/` for the dashboard summaries.

## 3. Backend service + gate + GraphQL fields + types

`backend/services/parents/parent-monitoring.service.ts` — namespace `ParentMonitoringService`, EXACTLY five public methods:
- `listLinkedChildren(parentActorId: number, locale: string, outerTx?: DBTransaction): Promise<ParentLinkedChildReturnType[]>` (lines 153-161) — no per-student gate; relaxed `requireActor` (line 158) + rate limit (line 159).
- `getChildProgress(parentActorId, studentId, locale, outerTx?): Promise<ParentChildProgressReturnType>` (lines 185-211) — gate at line 197, then `UserRepository.findById`, `ProgressRepository.countForStudent`, `HomeWorkRepository.findLatestByStudentId`.
- `listChildSessions(parentActorId, studentId, page: ParentPageInput | undefined, locale, outerTx?): Promise<ParentAttendancePageReturnType>` (lines 230-250).
- `listChildReports(parentActorId, studentId, page, locale, outerTx?): Promise<ParentReportPageReturnType>` (lines 268-288).
- `listChildHomework(parentActorId, studentId, page, locale, outerTx?): Promise<ParentHomeworkPageReturnType>` (lines 309-329).
- Shared scaffold `runGatedPagedRead` (lines 94-116): actor re-check → `enforcePortalRateLimit` (lines 119-132, bypassed under TEST_CI/TEST_SERVER) → `clampPageInput` → one repeatable-read `withTransaction` with `requireLinkedChild` FIRST (line 110).

`backend/services/parents/parent-monitoring.helpers.ts`:
- `requireLinkedChild(parentActorId: number, studentId: number, locale: string, tx: DBQueryExecutor | undefined): Promise<StudentSelectType>` (lines 176-209). Denial shape: constant `ForbiddenError(t.forbidden)` (line 191) via `deny()` (lines 184-192) with ONE bounded `logDomainError` bag `{ code: "FORBIDDEN", entity: "students", entityId: studentId, locale }` (lines 185-190); malformed-id pre-check lines 194-196; grant check `student?.parentId !== parentActorId` line 199; soft-delete severance lines 203-206.
- `clampPageInput(input: ParentPageInput | undefined): { page, pageSize, offset }` (lines 83-93) — MAX_PAGE_SIZE 50 (line 57), DEFAULT_PAGE_SIZE 25 (line 60), DEFAULT_PAGE 1 (line 63).
- Mappers: `mapSessionToAttendanceEntry` (line 222), `mapReportRowToEntry` (line 241, emits `sessionId`), `mapHomeWorkRowToEntry` (line 291, emits `sessionId`), `composeChildProgress` (line 343).

`backend/graphql/query/parents/parent-monitoring.query.ts` (240 lines) — five root query fields, all with `authScopes: parentOnlyAuthScopes` (`$all { authenticated: true, role: [UserRole.Parent] }`, lines 102-107):
- `myLinkedChildren` (lines 110-132, zero-arg), `parentChildProgress(studentId: Int!)` (135-153), `parentChildSessions(studentId: Int!, page: Int, pageSize: Int)` (156-184), `parentChildReports(...)` (187-212), `parentChildHomework(...)` (215-240). Page args forwarded as a closed whitelist `{ page: args.page ?? undefined, pageSize: args.pageSize ?? undefined }` (e.g. line 179). Identity always `ctx.user.id`.

`backend/types/parents/parent-monitoring.types.ts` (179 lines): `ParentPageInput { page?, pageSize? }` (lines 15-18); `ParentLinkedChildReturnType` (29-33); `ParentAttendanceEntryReturnType` (45-51); `ParentAttendancePageReturnType` (62-67); `ParentReportEntryReturnType` (81-89, carries `sessionId: number` line 83); `ParentReportPageReturnType` (96-101); `ParentHomeworkTrackReturnType` (112-117); `ParentHomeworkEntryReturnType` (127-133, `sessionId` line 129); `ParentHomeworkPageReturnType` (140-145); `ParentHomeworkPositionReturnType` (156-160); `ParentChildProgressReturnType` (174-179).

**Definitive: there is NO session-scoped or by-session read today.** No method takes a `sessionId` parameter; no session-scoped variant exists anywhere in the parents service. The deepest session-scoping that exists is CLIENT-side only (ReportsTab highlights the row whose `sessionId` matches `?session=`). Any by-session backend read would be a NEW service method + query field.

## 4. Canonical doc citations

`docs/parents/monitoring-portal.md`:
- "The five read-only query contracts" section (line 28) with the five-field args/return table (lines 44-50); `$all` conjunction rationale (lines 30-43).
- `requireLinkedChild` gate section (line 54), constant-denial oracle five-cause table (line 97), TOCTOU seal (line 112).
- Read-only posture INV-P2 (line 143); "Portal ships ZERO new GraphQL mutations" (line 145).
- "Frontend URL-is-the-state posture (no Zustand store)" (lines 161-163) — the detail route is tabbed URL segments; "a parent can deep-link a specific child's report tab directly".
- Rules: R5 zero mutations (line 196); **R16 — Deep-link contract for completion notifications** (line 207): "`/parent/children/<studentId>?tab=reports&session=<id>` is the forward display target for `session_completion` notifications emitted by `SessionReportNotificationService.notifySessionReportReady`. The emitter already writes `relatedEntityType` / `relatedEntityId`; the portal resolves the deep-link client-side."
- Forward items (line 304): "**DEV1-017 deep-link target display** → sibling ticket" (line 307).
- Why section (line 22): portal is the forward target of `session_completion` notifications; the deep-link is "the display contract that closes that notification loop".
- Related docs (lines 322-323): `docs/notifications/realtime-engine.md` (emitter), `docs/notifications/session-request-notifications.md`.

`docs/sessions/session-report-homework.md`:
- Line 54: "Recipients: the student always; the linked parent only when the parent link exists (INV-P1)".
- Lines 71, 81-82: `notifySessionReportReady` is the sole emitter; never put grades/notes in notification copy — "The body is a link invite, not a content mirror"; never publish before commit.
- Line 90: parent-portal row — "The parent's channel is the report-ready notification only."
- Lines 107-108, 115: created files list; report-ready i18n slots `eventSessionReportReadyParentBody(studentName, teacherName)` (line 115).

## 5. Parent nav + bottom-nav

`frontend/views/dashboard/nav/navItems.ts` — Parent block at lines 148-154:
- 149: `{ route: "/parent/dashboard", labelKey: "dashboard", Icon: DashboardIcon }`
- 150: `{ route: "/notifications", labelKey: "notifications", Icon: NotificationsIcon }`
- 151: `{ route: "/parent/children", labelKey: "children", Icon: ChildrenIcon }`
- 152: `{ route: "/parent/handshake", labelKey: "navLinkMyChild", Icon: LinkChildIcon }`
- 153: `{ route: "/profile", labelKey: "profile", Icon: ProfileIcon }`

Bottom nav: NO bottom-nav component exists. Grep `bottomnav` (case-insensitive) across `frontend/` matches only theme tokens: `frontend/providers/theme/layoutSettings.ts:10` (`bottomNavHeight: "64px"`) and its type `frontend/providers/theme/types.ts:81` — a DESIGN.md-derived sizing token; no component renders a bottom nav. Precedent plan stance: `ai/finished_plans/milestone_3_parent_portal_admin_governance/parent-read-only-monitoring-portal/plan.md:497` — "no per-breakpoint variant work; NO bottom nav anywhere in this product"; `specs.md:505` — "no bottom nav anywhere"; `tasks.md:265` — "single-config drives both drawers — no per-breakpoint work, NO bottom nav".

## 6. Portal test precedents

`backend/graphql/test/parent-monitoring.wire.test.ts` (2719 lines) — tiered role matrix over the wire (dev-server testClient):
- Fixture registry: `WireActor` interface (lines 436-441); `FIXTURE_MARKER = pmwire-<uuid8>` (line 443); `registerActor` over the PUBLIC `registerUser` mutation (lines 446-470); wire helpers `registeredUserIdOf` (~line 380), `accessTokenOf` (lines 388-397), `stringFieldOf` (lines 399-406); `expectIdFirstInEveryObjectSelection` id-first pin (lines 408-431).
- Matrix structure (describe blocks): anonymous tier × 5 ops (line 669; constant anonymous denial shape line 751); wrong-role tier — full 15-cell matrix (line 784-785) + BFLA byte-identity across foreign/zero/negative ids (line 865); parent without link (line 903); parent with link to a foreign child — BOLA 403 zero-data (line 946) + list without foreign child (line 981); parent with link — 200 tier (line 993, per-op tests 994-1048); BOLA probe constant-403 (line 1062, 1070, 1098); BOPLA smuggle probes — extra identity args die as GRAPHQL_VALIDATION_FAILED pre-resolver (line 1124-1125); locale negotiation en/ar (line 1186, 1187, 1203, 1219); id-first selections pin (line 1233-1234).
- A new query field slots in as: extend each tier (anonymous cell, 3 wrong-role cells, no-link cell, foreign-child cell, linked-200 cell), add to the BOPLA smuggle probe, and extend the id-first pin to the new document. The five-field SDL pin in `backend/graphql/test/schema-surface.test.ts` (per doc line 145) must be updated for any new root field.

`test/workflows/parents/parent-monitoring.journey.test.ts` (1474 lines) — "Journey — parent read-only monitoring portal (J1–J4)" (describe at line 437):
- Setup: committed fixtures in ONE committing `beforeAll` (lines 92-94, 438); `TrackedFixtures` registry with FK-safe hard-delete cleanup in `afterAll` (lines 76, 94, 1417-1425 — `tracked.cleanup()` with fail-safe); NO `runInRollback` (line 89 note) because services spawn their own transactions.
- J1 steps (lines 557-873): cast committed (557); teacher submits report+homework with EXACTLY ONE parent-wave publish (593); parent reads surfaces (686); **deep-link step — `parentChildReports(S1).items contains a row whose sessionId === σ1.id` (line 790)**; denial P2 never-linked → constant 403 (813). J2 severance journeys (873, 942). J3 constant-403 locale probes en/ar (1013, 1075, 1118). J4 multi-child fanout ar-locale (1154, 1273, 1300).
- A new field slots into the J1 read step and the J3/J4 locale/fanout journeys; the deep-link step at line 790 is the existing precedent for asserting a session-id-bearing row.

## 7. i18n — parentMonitoring namespace

- Handle: `shared/locale/namespaces/registry.ts:24` imports `ParentMonitoring` from `@/shared/locale/namespaces/parentMonitoring`; exported at line 48 of the same registry.
- Namespace definition: `shared/locale/namespaces/parentMonitoring/parentMonitoring.namespace.ts` — `defineNamespace<ParentMonitoringLabels>("parentMonitoring.parentMonitoring", translations => translations.parentMonitoringTranslations)`; barrel `shared/locale/namespaces/parentMonitoring/index.ts` re-exports.
- Type schema: `shared/locale/types/parentMonitoring/index.ts` — e.g. `readonly tabReports: string;` at line 74; the shape is wired into `Translations` at `shared/locale/types/message.ts:45` (`parentMonitoringTranslations: ParentMonitoringLabels`).
- Locale keys: `shared/locale/en/parentMonitoring/index.ts:23` — `tabReports: "Reports"`; `shared/locale/ar/parentMonitoring/index.ts:26` — `tabReports: "التقارير"`.
- Steps to add new keys: (1) add the readonly member to `ParentMonitoringLabels` in `shared/locale/types/parentMonitoring/index.ts` (functions for interpolation/pluralization per the root AGENTS.md conventions); (2) add the literal to `shared/locale/en/parentMonitoring/index.ts`; (3) add the matching literal to `shared/locale/ar/parentMonitoring/index.ts`; (4) `bun tsgo` verifies the three stay in lockstep (Labels type is the single source); consumers then read via `useAppTranslation(ParentMonitoring)` (client, e.g. `ParentChildDetailContainer.tsx:24`) or `getTranslations(locale).parentMonitoringTranslations` (server, e.g. `page.tsx:53`).

## 8. Foreign/tampered studentId — end-to-end denial

- Route shell: non-numeric/non-positive id → `redirect("/parent/children")` (`app/(dashboard)/parent/children/[studentId]/page.tsx:67-70`) — the shell never renders for malformed ids; a well-formed foreign id passes the shell.
- Resolver → service: the per-student resolvers call the service with `ctx.user.id` (never a client parent id); the gate `requireLinkedChild` (helpers lines 176-209) throws the constant `ForbiddenError` (localized `errorsTranslations.forbidden`, line 191) for foreign/missing/never-linked/severed/malformed ids — byte-indistinguishable (constant-shape oracle).
- GraphQL wire: ForbiddenError propagates uncaught to the masking boundary (query file lines 71-76 note) — extensions.code FORBIDDEN / 403, zero data.
- Client UI: `ParentChildDetailContainer.tsx:27-30` — `extractErrorCode(error)` then `mapGraphQLErrorByCode(...)?.kind === "permission-fallback"` sets `denied`; lines 42-51 render `<PermissionDeniedFallback actionLabel={t.backToChildrenAction} onAction={() => router.push("/parent/children")} />`. The same fallback pattern repeats inside each tab (e.g. `ReportsTab.tsx:50-51`), each receiving the page-level `deniedAction` (`ParentChildDetailContainer.tsx:36-41,58-64`). `PermissionDeniedFallback` renders a `Typography` + contained button surface (`frontend/components/ui/PermissionDeniedFallback.tsx:88-93`). No child fields are ever logged (gate context bag only — helpers lines 185-190).

## Verified evidence index

| Claim | Evidence |
|---|---|
| Detail page auth + param + tab/session forwarding | app/(dashboard)/parent/children/[studentId]/page.tsx:64,66-70,73-76 |
| Root page auth + ?student= | app/(dashboard)/parent/children/page.tsx:47,49-54,56 |
| Root container redirect/auto-select | frontend/views/parent/monitoring/ParentChildrenRootContainer.tsx:15,23,26,117 |
| Tab keys + URL builder | ParentChildDetailContainer.helpers.ts:1-3,9-11,13-20 |
| Container session parse + tab routing | ParentChildDetailContainer.tsx:33-35,52-57,58-64 |
| Only ReportsTab gets session prop | ParentChildDetailContainer.tabs.tsx:42-53 (line 44) |
| Reports fetch-all + fallback | ReportsTab.tsx:33,50-51,63,114-119 |
| Row highlight + scrollIntoView | ReportsTab.parts.tsx:53-59,69-84; ReportsTab.body.tsx:97 |
| Evaluations tab reuses reports query | EvaluationsTab.tsx:46 |
| Five service method signatures | parent-monitoring.service.ts:153-161,185-211,230-250,268-288,309-329 |
| Gate signature + constant denial | parent-monitoring.helpers.ts:176-209 (deny 184-192) |
| Pagination clamp | parent-monitoring.helpers.ts:56-63,83-93 |
| Five root fields + $all scopes | parent-monitoring.query.ts:102-107,110,135,156,187,215 |
| Page input + return types (sessionId present) | parent-monitoring.types.ts:15-18,81-89,127-133 |
| NO by-session read today | Verified: no sessionId param in any service method/query field (full-file reads above) |
| R16 deep-link contract + DEV1-017 | docs/parents/monitoring-portal.md:22,207,307 |
| Emitter notification rules | docs/sessions/session-report-homework.md:54,71,81-82,90,115 |
| Parent nav block | frontend/views/dashboard/nav/navItems.ts:148-154 |
| No bottom nav (token only) | frontend/providers/theme/layoutSettings.ts:10; frontend/providers/theme/types.ts:81 |
| Precedent plan: NO bottom nav | ai/finished_plans/.../plan.md:497; specs.md:505; tasks.md:265 |
| Wire test tiers + fixtures | backend/graphql/test/parent-monitoring.wire.test.ts:433-470,669,784,903,946,993,1124,1233 |
| Journey structure + deep-link step | test/workflows/parents/parent-monitoring.journey.test.ts:437,438,557,790,1417-1425 |
| i18n namespace registry handle | shared/locale/namespaces/registry.ts:24,48 |
| Example en/ar keys | shared/locale/en/parentMonitoring/index.ts:23; shared/locale/ar/parentMonitoring/index.ts:26 |
| Labels wiring | shared/locale/types/message.ts:45; shared/locale/types/parentMonitoring/index.ts:74 |
| Denial → PermissionDeniedFallback | ParentChildDetailContainer.tsx:27-30,42-51; ReportsTab.tsx:50-51 |
