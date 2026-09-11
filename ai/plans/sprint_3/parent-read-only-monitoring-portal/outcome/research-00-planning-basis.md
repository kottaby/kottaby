# Research 00 — Planning Basis (Ground-Truth Packet)

**Plan directory (verbatim — cite this exact string in every header/self-reference/ledger):** `ai/plans/sprint_3/parent-read-only-monitoring-portal`
**Outcome directory:** `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/`
**Ticket:** `Parent Read-Only Monitoring Portal` — `docs/planning/TICKETS.md:1988-2036` (Sprint 3, Dev 1, 8 SP, Blocked By: "Student Confirmation of Parent Link" + "Session Request Notification to Teacher" — BOTH already shipped via finished plans).
**Gathered:** 2026-09-11 by 5 read-only research agents against the live tree. Every writer MUST re-verify each `path:line` with grep/Read before promoting a claim into specs/plan/tasks (verify-then-claim is mandatory).

## 1. Ticket (verbatim essentials)

docs/planning/TICKETS.md:1998-2021 —
- Scope: parent read-only portal showing linked children's: attendance history; session reports (teacher notes, ratings); homework (Jadid & Madi, grades); teacher evaluations (scores, notes); academic progress statistics (Tajweed curriculum).
- MVP parents read-only: cannot modify data, request sessions, or make payments.
- AC: modify attempt → **403 "Read-only access" (ticket cites INV-P2)**; parent WITHOUT confirmed link accessing a student's data → **403**; multi-child parent can switch between children's views.
- Test scenarios: view attendance/reports/homework/evaluations/progress = success; modify → 403; unlinked → 403; multi-child switching.
- Decision refs: INV-P2, INV-P3, FR-7.3.

## 2. Canonical decision refs (with discrepancy ruling)

- `docs/specs/state-machine-invariants.md:226-239` — Parent-Child Link Lifecycle: INV-P1 (:236) "parent cannot monitor without student's explicit confirmation"; INV-P2 (:237) "MVP parent access strictly read-only"; INV-P3 (:238) "parent receives real-time notification when linked child's session completes"; INV-P4 RESOLVED (A.2).
- **⚠️ Citation discrepancy (RULING):** the ticket cites INV-P3 for "unlinked parent → 403", but canonical INV-P3 is the notification invariant; the unlinked-denial invariant is canonically **INV-P1** (confirmed by `docs/planning/PRODUCTION_READINESS.md:267-269`: 5.5.1 unconfirmed→no-access = INV-P1; 5.5.2 read-only = INV-P2; 5.5.3 completion-notify = INV-P3). **This plan implements INV-P1 + INV-P2 + FR-7.3 and records the ticket citation discrepancy as a documented clarification (not a scope change).**
- `docs/specs/functional-requirements.md:222-224` — FR-7.3: parents view attendance history, session reports, homework, teacher evaluations, academic progress; MVP read-only (no modify/request/pay).
- `docs/specs/open-decisions-and-gaps.md` — A.2 (:17-21): link = `students.parent_id` FK→users.id (no junction table). A.3: `students.handshake_code` unique. A.4+A.4.1-3 (:29-33,:341-356): notifications table + WS sidecar + emit-idempotency fail-open + copy localized by emitter at emit time. B.12 (:141-145): ONE parent per student. B.13 (:147-151): one parent → MANY children (separate handshake each). B.14 (:153-157): 7-day pending expiry.

## 3. Normative docs that BIND this plan

- `docs/parents/parent-link-request.md:119-123` (consumer contract, shipped DEV1-014): **"Portal reads ONLY `students.parent_id`. It must NEVER query `parent_link_requests` for authorization — the link table is history, the student row is the grant."** Other rulings: parent-side names masked forever (R9); no audit rows (R10); i18n via `parentLink` namespace (R11).
- `docs/parents/handshake-code-discovery.md` — code format `KSB-[0-9A-F]{8}`; discovery payload closed to `{ maskedName, linkable }`; `students.parentId` FK is ON DELETE SET NULL.
- `docs/workflows/04-parent-supervision-handshake.md:108-122` — MVP monitoring scope: attendance←`session` (status), reports←`reports`, homework←`home_work`, evaluations←`evaluations`, progress←`progress`. Restrictions: no session requests, no data modification, no subscribe/pay, no teacher contact. :164-166: **soft-deleted student ⇒ parent loses access immediately**; admin may set `parent_id` directly at onboarding (recorded exception to single-writer).
- `docs/sessions/session-report-homework.md:46,80,90` — existing `sessionReport`/`sessionHomework` queries are participant-only; parents get indistinguishable `null` today; **"a parent read surface is a NEW ruling with its own oracle posture"** — this plan MAKES that ruling: parent portal ships NEW parent-scoped queries; participant-only queries stay untouched.
- `docs/notifications/realtime-engine.md:14,104` — WS substrate shipped (DEV3-010); `SessionReportNotificationService.notifySessionReportReady` (`backend/services/classes/session-report-notification.service.ts:147`) ALREADY emits `session_completion` to parent when `students.parent_id` set. Parent notification DISPLAY = ticket DEV1-017 (OUT of scope here; but portal must expose deep-linkable report view route as the forward contract).
- Finished prerequisites (all in `ai/finished_plans/`): sprint_3 `dev1-013-student-handshake-code-generation`, `dev1-014-parent-child-link-request-workflow-7-day`, `dev1-015-student-confirmation-of-parent-link`; sprint_2 `dev3-010-real-time-notification-engine-websocket`, `dev3-011-session-request-notification-to-teacher`. Sibling sprint_4 `dev1-019` (E2E parent journey) consumes this portal.
- Journey precedent verifying INV-P1: `test/workflows/parents/student-confirmation-of-link.journey.test.ts`.

## 4. Backend data layer ground truth (`backend/db/schema/`)

Enums `backend/db/schema/enums.ts`: `user_role` (:9) = admin/teacher/student/parent; `session_status` (:23) = scheduled/started/completed/cancelled/disputed; `session_type` (:25) = student_session/teacher_evaluation/re_evaluation; `session_intent` (:27) = hifz/tajweed/evaluation; `link_status` (:67) = pending/confirmed/rejected/expired (TS mirror `backend/enum/shared/link-status.enum.ts:7-22`); `surah_juz_ref` (:89) = 5 surahs + juz_1..30.

| Table | File | Portal-relevant columns |
|---|---|---|
| `users` | `backend/db/schema/users/users.ts:11` | id, fullName, email, role (`:19`), governance flags (isDeleted/deletedAt, suspended, isBlocked), locale |
| `parents` | `backend/db/schema/parents/parents.ts:11` | shared-PK FK→users.id CASCADE only |
| `students` | `backend/db/schema/students/students.ts:18` | id shared-PK; balanceHifz/Reviews/Tajweed/Trial; `handshakeCode` NN (:31); **`parentId` nullable FK→users ON DELETE SET NULL (:32)**; idx `students_parent_id_idx` (:33-ish) |
| `parent_link_requests` | `backend/db/schema/parents/parent-link-requests.ts:39` | history only — NEVER for authorization |
| `session` | `backend/db/schema/classes/session.ts:50` | teacherId, studentId FKs; status; startedAt/endedAt (:66-67); fee; dual-confirmation cols; indexes on teacher/student (:82-86) |
| `reports` | `backend/db/schema/classes/reports.ts:20` | sessionId unique (:36); teacherNotes text; `studentRatingByTeacher` int CHECK 0-5 (:37) |
| `home_work` | `backend/db/schema/classes/home-work.ts:23` | sessionId unique; Jadid track: currentFromAyah/currentToAyah/currentGrade/currentSurahJuz; Madi track: revision*; grades int 0-100 CHECK (:46-47) |
| `evaluations` | `backend/db/schema/teachers/evaluations.ts:21` | evaluatedId/evaluatorId FKs, sessionId nullable, score int 0-100, notes, soft-delete — **sheikh→teacher-candidate table, NOT child-scoped** |
| `lessons` | `backend/db/schema/classes/lessons.ts:17` | id, planId nullable, title only — SKELETON |
| `progress` | `backend/db/schema/classes/progress.ts:19` | studentId, lessonId nullable, timestamps ONLY (header: NO completed_at/score) |

## 5. Backend types / repos / services ground truth

Types (`backend/types/`, barrel `@/backend/types`):
- EXISTING: `ParentSelectType` (`parents/parent.types.ts:3`); `ParentLinkRequestSelectType`, `OutgoingParentLinkRequestReturnType` (:32), `IncomingParentLinkRequestReturnType` (:55) (`parents/parent-link-request.types.ts`); `StudentSelectType` (`students/student.types.ts:4`); `SessionSelectType/SessionReturnType/SessionListFilterInput/SessionPageReturnType` (`classes/session.types.ts:5,19,49,58`); `ReportSelectType/ReportReturnType`, `HomeWorkAssignInput { jadid?, madi? }` (:37) (`classes/report.types.ts`); `HomeWorkSelectType/HomeWorkReturnType` (`classes/home-work.types.ts:3,14`); `EvaluationSelectType` only (`teachers/evaluation.types.ts:3`); `DBTransaction`, `DBQueryExecutor` (`db.types.ts:23,30`).
- MISSING: `ParentReturnType`, all `Progress*`/`Lessons*` types, attendance types — plan must ADD these to `backend/types/parents/` (+ `classes/` where canonical), never in service files.

Repos (`backend/db/repo/`, namespace objects, `tx` LAST param, writes require `tx: DBTransaction`):
- `ParentLinkRequestRepository` (`parents/parent-link-request.repository.ts:122`): full lifecycle incl. `respondToPendingForStudent` (:238), `expireSiblingPendingsForStudent` (:361).
- `StudentRepository` (`students/student.repository.ts`): `linkParentIfUnlinked(studentId, parentId, tx)` :443-451 — ONLY writer of `students.parent_id` (guarded `WHERE parent_id IS NULL`); `findById` :356. **MISSING: `listLinkedChildrenByParentId`** (plan adds it).
- `SessionRepository` (`classes/session.repository.ts`): `listForStudent` :528, `countForStudent` :558, shared predicate builder in `session.repository.helpers.ts` (template for parent-scoped reads). **MISSING: parent-scoped variants.**
- `ReportRepository.findBySessionId` :76; `HomeWorkRepository.findBySessionId` :74, `findLatestByStudentId` :122. **MISSING: progress/evaluation repo reads for portal.**

Services (`backend/services/`):
- `ParentLinkRequestService` (`parents/parent-link-request.service.ts:145`) — the ONLY parent service today. Helper `requireActor(actorId, expectedRole, locale, tx, enforceGovernance)` (`parents/parent-link-request.helpers.ts:246-298`): fresh DB re-check; `UnauthorizedError`/`ForbiddenError` from `@/shared/...` errors; governance-aware. **Pattern to reuse for new `requireLinkedChild(parentActorId, studentId, ...)` gate — MISSING.**
- `SessionReportService` (`classes/session-report.service.ts`): `getSessionReport(callerUserId, sessionId, locale, tx?)` :448, `getSessionHomework(...)` :487 via participant gate `resolveVisibleSessionForCaller` :412 (parent → null today — leave untouched).
- Locale: services take `locale: string`; `const t = getServerTranslations(locale).errorsTranslations` — SINGLE-arg accessor + property access (no `Translation.` enum, NO two-arg `getTranslations`).

GraphQL (`backend/graphql/`):
- Builder: `pothos/builder.ts` — ScopeAuthPlugin; root `queryType`/`mutationType` :155-156; scope config :111-142: `authenticated` (401 `UnauthorizedError` :127-132), `role: UserRole[]` (OR, :134), `permission` placeholder always-true (:137), `superAdmin`, `notImpersonating`; failures → `ForbiddenError` w/ localized copy (:119). **`authScopes: { $all: { authenticated: true, role: [UserRole.Parent] } }`** — `$all` conjunction is load-bearing (pattern documented `query/classes/session-lifecycle.query.ts:20-35`).
- Pothos objects: `pothos/<domain>/<entity>.pothos.ts`, `{Entity}PothosObject`, backed by `...ReturnType`, `t.exposeID("id")` first, DateTime via `t.expose(..., { type: "DateTime" })`. Ex: `pothos/parents/parent-link-request.pothos.ts:40`.
- Query fields: `query/<domain>/<entity>.query.ts`, NO named exports, side-effect registration through barrels (`query/parents/index.ts` → `query/index.ts` → `gqlSchema.ts`). Representative: `query/parents/parent-link.query.ts:55-81` (`myOutgoingParentLinkRequests`: authScopes + `ctx.t("errorsTranslations")` + service call, zero-argument BOLA pattern).
- Context (`gqlContextFactory.ts:173-244`): `ctx.user` (governance-fresh, password stripped), `ctx.role`, `ctx.isSuperAdmin`, `ctx.locale`, `ctx.t(ns)` loader.
- Roles: `UserRole` enum `backend/enum/users/user-role.enum.ts:5-10` = admin/teacher/student/parent (lowercase). Only 4 roles; "SUPER_ADMIN/SUPERVISOR/STAFF" from template tables = N/A here (map: SUPER_ADMIN→Admin).
- Parent-ALLOWED mutations exist (`requestParentChildLink`, `cancelParentLinkRequest` in `mutation/parents/parent-link.mutation.ts`) — INV-P2 enforcement is **read-surface-only scope + per-field role scopes**, NOT a global "parents may not mutate" blanket (link-request mutations are legitimately parent write actions).
- Wire-test precedent: `backend/graphql/test/parent-link.wire.test.ts` (role×op matrix, Bearer auth, `expectMutationError` + `extensions.code`, en/ar localized copy). Runner: `bun run test/scripts/run-test.ts <path>` — NEVER raw `bun test` on workflow/db tests.

## 6. Frontend ground truth

Routes (`app/`, App Router, NO `[locale]` segment, locale via NEXT_LOCALE cookie):
- Existing parent pages: `app/(dashboard)/parent/dashboard/page.tsx` (via `createRoleDashboardPage(UserRole.Parent, "/parent/dashboard")` → `frontend/views/dashboard/home/RoleDashboardPage.tsx:40-43`), `app/(dashboard)/parent/handshake/page.tsx` (uses `withPageAuth({ roles: [UserRole.Parent] })` at :36), `app/(dashboard)/parent/children/page.tsx` — **ComingSoon stub** (:14-25), the replacement target.
- `app/(dashboard)/dashboard/page.tsx:48-55` — role dispatcher → `/parent/dashboard`.
- Catch-all `app/(dashboard)/[feature]/page.tsx:26-30` renders ComingSoon for unimplemented single segments.
- Guard stack: `withPageAuth` (`frontend/lib/auth/withPageAuth.ts:67-105`) server-side + `DashboardLayout` client fallback (`frontend/views/dashboard/layout/DashboardLayout.tsx:73-107`). No middleware.ts.
- Data fetching: server page = guard only; views are client components with Apollo `useQuery` (typed documents; hooks from `@apollo/client/react`; NO `useLazyQuery`).
- **⚠️ Nav inconsistency to FIX in this plan:** `NAV_ITEMS_BY_ROLE[UserRole.Parent]` (`frontend/views/dashboard/nav/navItems.ts:133-139`) lists `/children` while the page lives at `/parent/children`. `DashboardNavItem` = `{ route, labelKey, Icon }` (:40-44); labels resolved from type-safe keys (:190-199); single config drives desktop permanent drawer + mobile temporary drawer (`DashboardSidebar.tsx`).
- Views precedent: `frontend/views/teacher/sessions/TeacherSessionsContainer.tsx` (chrome + swapping body, `useQuery` re-key by filter, "NO Zustand"); `frontend/views/admin/analytics/PlatformAnalyticsContainer.tsx` (pollInterval, `mapGraphQLErrorByCode`/`extractErrorCode` 403 handling, `PermissionDeniedFallback`). `frontend/views/parent/handshake/` = only existing parent feature view.
- **`frontend/components/ui/`** has `ErrorRetryAlert`, `PermissionDeniedFallback`, `NoticeSnackbar`, `IconCircleEmptyState` — but NO `AppDataGrid`/`MetricCard`/`PageContainer` (root AGENTS.md §File Organization is stale there; do NOT cite those as existing).
- **Zustand: NOT installed** (absent from package.json; `frontend/stores/` contains only AGENTS.md). Child switcher = URL search param + local state, NOT a store. Root AGENTS.md "Zustand" mention is aspirational — do not plan a store.
- Frontend GraphQL documents: `frontend/graphql/sharedDocuments/<domain>/` — e.g. `parents/parent-link.documents.ts:48-59` (`myOutgoingParentLinkRequestsQueryDocument`, docblock conventions: `id` first on every object, zero-arg BOLA queries, no lazy). Codegen output `frontend/graphql/generated/gql/graphql.ts`; run `bun run generate:gqlSchema` then `bun codegen` after schema/document changes. New docs → `frontend/graphql/sharedDocuments/parents/parent-monitoring.documents.ts` (planned name).
- Component tests: `test/ui/components/` (Happy DOM, mocked Apollo — no server). E2E: `test/ui/e2e/` (needs `bun run build:test` first).

i18n (`shared/locale/`):
- Namespace ceremony (5+ steps): type schema `shared/locale/types/<ns>/index.ts` → handle `shared/locale/namespaces/<ns>/<ns>.namespace.ts` via `defineNamespace<Labels>("<ns>.<ns>", t => t.<ns>Translations)` → impls `shared/locale/en/<ns>/index.ts` + `shared/locale/ar/<ns>/index.ts` → register in `shared/locale/namespaces/registry.ts:28-50` + `namespaces/index.ts` barrel + both `en/messages.ts`/`ar/messages.ts` aggregates + parity test `shared/locale/<ns>-namespace.parity.test.ts`.
- EXISTING namespaces: AdminBroadcasts, AdminSessionGovernance, AdminStudents, AdminTeachers, AdminUsers, Analytics, Applicant, Auth, Common, Dashboard, Errors, HandshakeCode, Landing, Notifications, ParentLink, Plans, Recitation, Sessions, Wallet. **Parent monitoring namespace = MISSING — plan adds e.g. `parentMonitoring`/`ParentMonitoring`.**
- Client: `useAppTranslation(NamespaceHandle)` (`shared/locale/client/use-app-translation.ts:9-17`) — property access only. Server components: `getTranslations(locale)` single-arg then `.<ns>Translations` (`shared/locale/server.ts:17-19`) + `getLocaleFromCookie()`. GraphQL resolvers: `ctx.t("errorsTranslations")`. Scripts/tests: `getServerTranslations(locale)` single-arg.

## 7. Ratified design rulings the plan MUST encode (from research verdicts)

- **R-A (authorization grant):** portal authorization reads ONLY `students.parent_id` (per `docs/parents/parent-link-request.md:119-123`). Never query `parent_link_requests` for reads.
- **R-B (attendance):** NO attendance table exists (grep-verified zero code hits). Attendance history = derived read over `session` rows scoped to child (`status` + `startedAt/endedAt`): attended = `completed`, cancelled = `cancelled`, disputed surfaced. NO new table in MVP.
- **R-C (teacher evaluations):** `evaluations` table is sheikh→teacher-candidate orientation — NOT child data. Portal "teacher evaluations (scores, notes)" = per-session teacher evaluation OF THE CHILD from `reports` (`studentRatingByTeacher` 0-5 + `teacherNotes`). The `evaluations` table stays out of the portal. Document this disambiguation; flag as product-clarification note (ticket intent satisfied via reports data).
- **R-D (progress):** `progress`+`lessons` tables are skeletons with no writers/readers today. Portal progress stats = read what exists (progress row counts by lesson where present) + latest homework surah/juz position per track as the Tajweed-curriculum position indicators (Jadid/Madi `*SurahJuz` + ayah ranges). Deep curriculum-traversal stats are DEFERRED to a future curriculum ticket (ledger entry).
- **R-E (read surfaces):** NEW parent-scoped queries; do NOT widen existing participant-only `sessionReport`/`sessionHomework` (their null-collapse posture stays for non-parents). Access check: `authScopes { $all: { authenticated: true, role: [UserRole.Parent] } }` + service-side confirmed-link gate.
- **R-F (denial codes):** unlinked/cross-child access → FORBIDDEN 403 (ticket AC); modification attempt by parent on portal-owned reads → all portal fields are queries only; mutation denial remains per-field role scopes (existing mechanism). 403 copy via `errorsTranslations` (localized, en/ar).
- **R-G (multi-child):** B.13 — one parent many children. Child switcher via `?student=<id>` URL param (no Zustand — not installed). Child list = masked-name safe (fullName of own confirmed child is fine — masking applies to pre-confirmation discovery only).
- **R-H (routes):** portal root replaces the ComingSoon at `app/(dashboard)/parent/children/page.tsx`; detail views under `app/(dashboard)/parent/children/[studentId]/`-style segments (App Router dynamic segment) with tabbed sections (attendance / reports / homework / evaluations / progress). Fix the nav `/children` → `/parent/children` inconsistency.
- **R-I (forward contract):** portal report view URL is the deep-link target for DEV1-017 completion notifications (`type='session_completion'` emitter already writes `relatedEntityType/Id`; display ticket lands later). Ledger forward item.
- **R-J (no schema change):** zero new tables/columns for MVP. Push-only Drizzle convention is N/A here (no schema edit) — tasks must still verify schema-parity holds.

## 8. Plan-house conventions (from templates + exemplars)

- Files: `specs.md`, `plan.md`, `tasks.md`, `deferred-items.md`, `outcome/` in `ai/plans/sprint_3/parent-read-only-monitoring-portal/`.
- Templates: `.agents/spec-process-guide/templates/{requirements,design,tasks,deferred-items,plan-review}-template.md` (+ checklists.md). Strip template nav chrome.
- Exemplar formats to mirror: `ai/plans/sprint_1/paymob-gateway-integration/` and `ai/finished_plans/sprint_4/audit-trail-completeness-verification/` (hybrid = template Document Information + Phase-0 ground-truth section + REQ-0NN banded ids + per-requirement `### REQ-0NN:` headings with EARS criteria, or sprint_1 banded style — pick ONE and stay consistent).
- specs.md needs: Document Information; Phase-0 Ground-Truth Verification table (substrate|state|evidence); requirements REQ-001.. with fixed REQ-001 (baseline/protocol) + REQ-002 (i18n/enum compliance); Cross-Actor Journeys (Actor Table + Ordered Steps + observer-phrased EARS) — this feature HAS journeys: teacher completes session→parent reads report; student severs link→parent loses access; admin override link→parent gains access.
- plan.md needs: decision log D1..Dn with context/options/rationale; Data Models; API Contracts + Pothos SDL + permission matrix; Services/Repo signatures + Concurrency assessment; Cross-Actor Journey Design (state machine + side-effect matrix + visibility); UX/Nav spec (routes table, sidebar integration, role matrix, per-audience); Security/Tenancy mitigations; Testing strategy; explicit N/A rulings where a template section doesn't apply (never omit silently).
- tasks.md needs: Non-Negotiable Execution Protocol; Mandatory Subtask Pipeline (X.Y.QL → X.Y.TE → X.Y.SEC → X.Y.SR → X.Y.IV per implementation task, full checkbox lines); Phase 0 baseline; Phase 1.5 Plan Review Gate (in-plan record); numbered phases; final Knowledge Propagation phase (canonical doc under `docs/parents/`); every task ends with `_Requirements: REQ-0NN, ..._` EXPANDED ids.
- deferred-items.md: template + `📅 Forward` status extension (paymob precedent); pre-seed forward items (DEV1-017 deep-link target, DEV1-019 journey coverage, curriculum-depth stats).
- Self-reference: cite `ai/plans/sprint_3/parent-read-only-monitoring-portal` verbatim at top of every artifact (Style-A bundle).
- Baseline (measured 2026-09-11, `/tmp/baseline-pp/`): **tsgo errors = 0; biome warns = 0; lint-service full-repo exit 0.** Quote these in `outcome/0-baseline-outcome.md`.

## 9. Authoring guardrails (user-mandated)

- Write files with the Write tool ONLY (chunked ~50 lines per call; create-then-append). NEVER sed/python/shell-heredoc file content.
- Re-read each file's tail after finishing to confirm the last chunk landed (truncation check).
- Every cited `path:line` and symbol re-verified with Grep/Read BEFORE writing it into an artifact. Prose-only (unverified) ⇒ label CREATE, not EXISTING/UPDATE.
- Anti-patterns forbidden in plan output: `Translation.` enum references; two-arg `getTranslations(locale, "ns")`; `@/frontend/utils/logger` citations; raw `bun test` on workflow/db tests (use `bun run test/scripts/run-test.ts`); bottom-nav UI plans; invented paths; service-layer `.types.ts` files; `useLazyQuery`.
- Hardcoded colors forbidden; MUI v9 `sx`-only styling; `*Outlined` icon names.
