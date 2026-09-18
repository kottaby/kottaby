| Monitoring GraphQL surface | EXISTS — EXTEND | `backend/graphql/query/parents/parent-monitoring.query.ts:110-240` — five fields: `myLinkedChildren:110`, `parentChildProgress:135`, `parentChildSessions:156`, `parentChildReports:187`, `parentChildHomework:215`; SDL pinned in `backend/graphql/test/schema-surface.test.ts:531-535` |
| Apollo cache policy | EXISTS — EXTEND | `frontend/providers/apollo/apolloCache.ts:114-118` — no-id value types (`ParentReportPage`, `ParentChildProgress`) carry `keyFields: false` |
| i18n — notifications namespace | EXISTS — FROZEN | handle `Notifications` `shared/locale/namespaces/registry.ts:22`; copy `eventSessionReportReadyTitle/Body/ParentBody` `shared/locale/types/notifications/index.ts:199,207,213` + `en/notifications/index.ts:82-85` + `ar/notifications/index.ts:83-85`; parity belt `shared/locale/notifications-namespace.parity.test.ts:120-122,372-400` (privacy-hygiene pin — no grades/scores/notes/digits in copy) |
| i18n — parentMonitoring namespace | EXISTS — EXTEND | handle `ParentMonitoring` `registry.ts:24`; types `shared/locale/types/parentMonitoring/index.ts:74`; en `shared/locale/en/parentMonitoring/index.ts:23`; ar `shared/locale/ar/parentMonitoring/index.ts:26`; accessors: `useAppTranslation(ParentMonitoring)` (handle constants from `@/shared/locale`, as `ParentChildrenRootContainer.tsx:22` does), `getTranslations(locale)` `shared/locale/server.ts:15` (SINGLE ARG), `getServerTranslations(locale)` `shared/locale/server-graphql.ts:3` |
| Locale system facts | VERIFIED | NO `Translation` enum exists anywhere in `shared/` (grep-verified); property access only (`t.keyName`); frontend logger lives at `frontend/lib/logger.ts` — root AGENTS.md's `@/frontend/utils/logger` is STALE, never cite it |
| Nav | EXISTS — UNCHANGED | parent block `frontend/views/dashboard/nav/navItems.ts:148-154`; NO bottom nav exists anywhere in the app (precedent portal plan rules "NO bottom nav" — `ai/finished_plans/milestone_3_parent_portal_admin_governance/parent-read-only-monitoring-portal/plan.md:497`) |
| Binding deep-link contract | EXISTS | R16: `/parent/children/<studentId>?tab=reports&session=<id>` — `docs/parents/monitoring-portal.md:207`; DEV1-017 forward item `:307`; "link invite, not content mirror" `docs/sessions/session-report-homework.md:81` |
| Test infrastructure | EXISTS | journey conventions `docs/testing/workflow-journey-tests.md:55-58` (NO runInRollback), `:64-70` (committed beforeAll fixtures + FK-safe afterAll teardown), `:77-84` (honest auth via localized error substrings), `:86-92` (spy the notification dispatch boundary), `:102-103` (runner `bun run test/scripts/run-test.ts <path>`); NO general `test:workflows` script exists (`package.json:32` is paymob-only) — run journeys per-file; wire tests: `bun run test:graphql` (`package.json:36`); wire matrix precedent `backend/graphql/test/parent-monitoring.wire.test.ts:669-1234`; journey deep-link precedent `test/workflows/parents/parent-monitoring.journey.test.ts:790-807` (reports rows carry deep-linkable `sessionId`); documents test `frontend/graphql/sharedDocuments/parents/parent-monitoring.documents.test.ts` |
| `redirect()` precedent | EXISTS | `next/navigation` redirect used at `app/(dashboard)/parent/children/[studentId]/page.tsx:69-71` and `app/(dashboard)/dashboard/page.tsx:56-60` |

## 2. Baseline Facts (Task 0 must record)

1. **Resolver test suite — RED at planning-wave verification 2026-09-17**:
   2 failing cases in `frontend/lib/notification-route-resolution.test.ts`
   (stale type-first argument order — the file pinned the pre-matrix
   two-stage contract); 5 pass / 2 fail via
   `KOTTABY_TEST_RUNNER_OK=1 bun test frontend/lib/notification-route-resolution.test.ts`.
   **RESOLVED out-of-band later on 2026-09-17** (pre-implementation,
   standalone fix outside this plan — the user's request, not plan
   execution): the suite was rewritten to the resolver's CURRENT 3-param
   contract `resolveNotificationRoute(relatedEntityType, notificationType?, role?)`
   (`frontend/lib/notification-route-resolution.ts:188`; resolver module
   byte-unchanged). Now GREEN: 8 tests / 25 expect() calls / 0 fail via
   `bun run test/scripts/run-test.ts frontend/lib/notification-route-resolution.test.ts`;
   per-file gate `bun run scripts/health/sub-loop.ts frontend/lib/notification-route-resolution.test.ts --lifecycle duplicates`
   → exit 0. The rewrite added session-matrix + role-less-type-stage
   coverage with codegen `UserRole` enum role assertions. Task 0 records
   this CURRENT (green) baseline plus the RED→green history so Task 6's
   additions are provably regression-free. Deferred item D1
   (reconciliation) is RESOLVED. (amended 2026-09-17, post-R1: baseline
   fact re-framed from RED to reconciled-green; history retained.)
2. Direct `bun test <file>` is guarded by the project's runner warning —
   approved runners: `bun run test/scripts/run-test.ts <path>` (log capture,
   locking, env) and `bun run test:<suite>`. Raw `bun test` on workflow
   journeys is FORBIDDEN in tasks.
3. Both blocker tickets ship: the notification + portal substrate above.

## 3. Binding Rulings (R-A .. R-K — the plan fleshes these out, never re-opens them)

**R-A — Display-only scope; emission substrate is byte-frozen.** No change to
`session-report-notification.service.ts`, the engine, WS envelope, drawer/feed/
badge/toast components, or the `notifications` i18n namespace. The parent
already receives, sees, and is pushed the row in real time; this plan adds the
LINK and its landing.

**R-B — The deep link lands on the pinned R16 URL.**
`/parent/children/<studentId>?tab=reports&session=<id>`
(`docs/parents/monitoring-portal.md:207`). No new routes, no new tabs, no nav
changes, no bottom nav.

**R-C — Session→child resolution is a new, link-gated GraphQL read.** Field
`parentSessionTarget(sessionId: Int!): ParentSessionTarget!` added to
`backend/graphql/query/parents/parent-monitoring.query.ts`. Reuses
`SessionRepository.findById` + `requireLinkedChild` + `enforcePortalRateLimit`;
NO new repo method, NO new table. Nonexistent / foreign / unlinked session ids
all yield the SAME constant localized `ForbiddenError` (existence
non-disclosure; R4 log discipline — no session fields in denial log context).
Rejected alternative: client-side scan of each linked child's paginated
reports/sessions (O(children) queries, pagination-fragile, race-prone).
**R-D — Two-hop navigation.** The resolver returns a SYNCHRONOUS pure entry URL
`/parent/children?session=<id>`; the portal root container resolves it via the
new query and `router.replace`s to the canonical R16 URL. Rationale: drawer/feed
rows are `<Link href>` computed synchronously; the resolver is a leaf module
(no Apollo); root-container `router.replace` navigation is established
(`ParentChildrenRootContainer.tsx:25-35`). On resolution failure (FORBIDDEN):
show a transient localized notice, then fall through to the existing
first-child auto-select. The auto-select effect and the session-resolution
effect must never race: while `?session=` is present and unresolved, the
session flow owns navigation.

**R-E — The resolver grows an optional 4th parameter `relatedEntityId`.**
Signature becomes
`resolveNotificationRoute(relatedEntityType, notificationType?, role?, relatedEntityId?): string`.
The Parent/SessionCompletion matrix cell becomes a BUILDER function
(`(relatedEntityId: string) => string`) applied ONLY when the id is a non-empty
string — absent/empty id falls to the feed (the matrix never fabricates).
Existing Student/Teacher cells stay static strings; the role-less type stage is
byte-unchanged (parents always carry a resolvable wire role from `useAuth`).
New exported constant: `PARENT_PORTAL_ROOT_ROUTE = "/parent/children"`.

**R-F — Resolver-test Parent-cell coverage is in scope; stale-arg
   reconciliation RESOLVED out-of-band.** The suite
   (`frontend/lib/notification-route-resolution.test.ts`) was RED at
   planning (2026-09-17, 2 failures — stale type-first arg order; 5 pass /
   2 fail) and was reconciled OUT-OF-BAND the same day (pre-implementation,
   standalone fix outside the plan, the user's request): rewritten to the
   current `(entity, type, role)` signature — 8 tests / 25 expects / 0
   fail via `bun run test/scripts/run-test.ts <path>`;
   `sub-loop.ts --lifecycle duplicates` exit 0; resolver module
   byte-unchanged. This ruling now binds Task 6 to adding the Parent-cell
   coverage (plus the 4th `relatedEntityId?` param cases and the two call
   sites) on the ALREADY-GREEN suite. Baseline + RED→green history
   recorded in Task 0 so the additions are provably not a new regression.

**R-G — Session highlight threads to the homework + evaluations tabs.**
`renderTabContent` (`ParentChildDetailContainer.tabs.tsx:34-50`) passes
`session` to `HomeworkTab` and `EvaluationsTab`; both apply the same
highlight + scrollIntoView mechanism as `ReportsTab.parts.tsx:54-79`. This
delivers the ticket's "report, homework, and evaluation" content promise from
ONE link (report row carries `teacherNotes` + `studentRatingByTeacher`; the
homework row carries the assignment). If `ParentHomeworkEntryReturnType`
lacks `sessionId`, add it to the closed projection + mapper + documents +
codegen (verify at implementation).

**R-H — i18n:** NO new namespace; exactly ONE new key family in
`parentMonitoring`: `sessionTargetUnavailableNotice` (en/ar/types triple).
The `notifications` namespace copy stays byte-frozen. RTL correctness for the
Arabic notice string is mandatory (parity test extension).

**R-I — Apollo cache:** `ParentSessionTarget: { keyFields: false }` appended in
`apolloCache.ts` beside the existing portal entries (`:114-118`). The new type
carries NO `id` (closed two-field projection, R6/R14-conforming).

**R-J — SDL + codegen discipline:** `bun run generate:gqlSchema` then
`bun codegen` after the schema change; `schema-surface.test.ts` field list
gains `parentSessionTarget` (`:531-535` area).

**R-K — Zero DB schema changes, zero mutations, zero emitter changes.** The
feature is a pure read surface + routing. `git diff backend/db/schema/` stays
empty. No new tables, columns, enums, seeds, env keys.

## 4. Frozen Signatures & Contracts

**Type** (`backend/types/parents/parent-monitoring.types.ts` — append):
```typescript
export interface ParentSessionTargetReturnType {
  readonly sessionId: number;
  readonly studentId: number;
}
```

**Service** (`backend/services/parents/parent-monitoring.service.ts` — new
namespace member):
```typescript
export async function getSessionTarget(
  parentActorId: number,
  sessionId: number,
  locale: string,
  tx?: DBTransaction
): Promise<ParentSessionTargetReturnType>
```
Flow: `isPositiveSafeInt(sessionId)` → `ValidationError` →
`requireActor(parentActorId, UserRole.Parent, locale, tx, false)` →
`enforcePortalRateLimit(parentActorId, locale)` → ONE repeatable-read
transaction: `SessionRepository.findById(sessionId, tx)` → null ⇒ constant
`ForbiddenError` (portal denial copy; log context `{ code, entity: "sessions",
entityId: sessionId, locale }` ONLY — no session row fields) →
`requireLinkedChild(parentActorId, row.studentId, locale, tx)` → return
`{ sessionId: row.id, studentId: row.studentId }`.
**GraphQL field** (`backend/graphql/query/parents/parent-monitoring.query.ts`):
```graphql
parentSessionTarget(sessionId: Int!): ParentSessionTarget!
```
`authScopes: parentOnlyAuthScopes` (the shared parent-only const at
`backend/graphql/query/parents/parent-monitoring.query.ts:102-107`, portal R13);
resolves via
`ParentMonitoringService.getSessionTarget(ctx.user.id, args.sessionId, ctx.locale)`;
the Pothos objectRef is declared as
`.objectRef<ParentSessionTargetReturnType>("ParentSessionTarget")` — the wire
name drops the `ReturnType` suffix per the ten-ref precedent
(`backend/graphql/pothos/parents/parent-monitoring.pothos.ts:179,:312`); the
Apollo cache policy key `ParentSessionTarget` (R-I) equals the wire type name.
It registers beside the existing parent-monitoring object refs (locate the
portal objectRef registration file via the query file's existing imports — do
not invent a location).

**Frontend document**
(`frontend/graphql/sharedDocuments/parents/parent-monitoring.documents.ts`):
`parentSessionTargetQueryDocument` selecting `sessionId` + `studentId`
(naming convention `{Field}QueryDocument`).

**Resolver** (`frontend/lib/notification-route-resolution.ts`): 4th optional
param `relatedEntityId?: string | number | null` (wire rows carry
`number | null`, `graphql.ts:960`); matrix value type widens to
`string | ((relatedEntityId: string) => string)`; the Parent/SessionCompletion
cell is the builder `parentSessionCompletionEntry` producing
`/parent/children?session=<id>`; call sites pass the row's `relatedEntityId`.

## 5. Frozen REQ Map (traceability contract — cite these EXACT ids)

| REQ | Title (gist) |
|---|---|
| REQ-000 | Pre-implementation baseline & execution protocol (incl. the resolver-suite baseline history — RED at planning, reconciled out-of-band 2026-09-17) |
| REQ-001 | Locale + enum-import compliance (REAL accessor system: handle constants, single-arg getTranslations, property access) |
| REQ-010 | Parent row deep-link: SessionCompletion + Parent + session pointer + relatedEntityId → entry URL `/parent/children?session=<id>` (drawer AND feed) |
| REQ-011 | Portal-root session resolution → `router.replace` to canonical R16 URL `/parent/children/<studentId>?tab=reports&session=<id>` |
| REQ-012 | Resolution-failure handling: constant denial → transient localized notice + existing first-child auto-select fallback; no race between the two navigation effects |
| REQ-013 | Session highlight on homework + evaluations tabs (same mechanism as reports) |
| REQ-014 | Content promise: one link surfaces report + homework + evaluation (report row = notes + rating; homework row = assignment); notifications copy byte-frozen |
| REQ-015 | Realtime + inbox regression pin: parent receives WS push, toast, unread badge via the generic surfaces (NO new realtime code; journey + engine tests pin it) |
| REQ-016 | Unlinked-parent negative: emission fails closed (no parent row) AND stale/dangling rows resolve to the constant denial |
| REQ-020 | `parentSessionTarget` authz: link gate + constant ForbiddenError oracle + R4 log discipline + portal rate limit |
| REQ-021 | BOLA/BOPLA/BFLA defenses: no input spread, low-priv roles rejected, foreign session ids indistinguishable |
| REQ-030 | SDL contract: `parentSessionTarget(sessionId: Int!): ParentSessionTarget!`, `$all` authScopes, parent-only |
| REQ-031 | Codegen + Apollo cache (`keyFields:false`) + schema-surface SDL pin + documents test |
| REQ-040 | UX/Nav: zero new routes, zero nav changes, role access matrix, explicit NO bottom-nav ruling |
| REQ-041 | i18n: one new `parentMonitoring` key (`sessionTargetUnavailableNotice`) in types + en + ar; parity test extension |
| REQ-050 | Test engineering: tiers, layer rules, approved runners (`bun run test/scripts/run-test.ts <path>`; NEVER raw `bun test` on journeys) |
| REQ-051 | Journey J1 (test/workflows/parents/parent-session-completion-deep-link.journey.test.ts) — cross-actor, test-first |
| REQ-060 | Per-file quality gates (`sub-loop.ts --lifecycle duplicates`), resolver-test Parent-cell coverage (R-F; stale-arg reconciliation landed out-of-band 2026-09-17), baseline comparison |
| REQ-061 | Knowledge propagation: extend `docs/parents/monitoring-portal.md` DEV1-017 display-contract section + outcome protocol |

## 6. Frozen Task Map

| Task | Title | Files (create/modify) | REQs |
|---|---|---|---|
| 0 | Baseline + deferred ledger | (ledger `deferred-items.md`; no code) | REQ-000 |
| 1 | Journey test J1 — TEST-FIRST | CREATE `test/workflows/parents/parent-session-completion-deep-link.journey.test.ts` | REQ-051, REQ-016 |
| 2 | i18n key triple | MODIFY `shared/locale/types/parentMonitoring/index.ts`, `shared/locale/en/parentMonitoring/index.ts`, `shared/locale/ar/parentMonitoring/index.ts` (+ parity test file) | REQ-041 |
| 3 | Backend read surface | MODIFY `backend/types/parents/parent-monitoring.types.ts`, `backend/services/parents/parent-monitoring.service.ts` (+`.test.ts`), `backend/graphql/query/parents/parent-monitoring.query.ts` | REQ-020, REQ-030 |
| 4 | SDL regen + wire tests | `bun run generate:gqlSchema` + `bun codegen`; MODIFY `backend/graphql/test/schema-surface.test.ts`, `backend/graphql/test/parent-monitoring.wire.test.ts` | REQ-021, REQ-031 |
| 4.5 | Mid-point review gate (backend-scoped) | review wave (review-backend / review-types / review-config) over Tasks 3-4 files | REQ-060 |
| 5 | Frontend documents + cache | MODIFY `frontend/graphql/sharedDocuments/parents/parent-monitoring.documents.ts` (+`.test.ts`), `frontend/providers/apollo/apolloCache.ts` | REQ-031 |
| 6 | Resolver Parent cell + call sites + Parent-cell test coverage | MODIFY `frontend/lib/notification-route-resolution.ts` + `.test.ts`, `frontend/views/notifications/feed/NotificationList.tsx`, `frontend/components/ui/NotificationDrawerBody.tsx` | REQ-010, REQ-015, REQ-060 |
| 7 | Portal-root resolution flow | MODIFY `app/(dashboard)/parent/children/page.tsx`, `frontend/views/parent/monitoring/ParentChildrenRootContainer.tsx` (+parts/body as needed) + container tests | REQ-011, REQ-012 |
| 8 | Tab session threading | MODIFY `frontend/views/parent/monitoring/ParentChildDetailContainer.tabs.tsx`, `HomeworkTab*.tsx`, `EvaluationsTab*.tsx` (+ types/mapper if sessionId missing) | REQ-013, REQ-014 |
| 9 | Post-implementation review wave + quality gates | review-types/review-backend/review-frontend/security-probing wave; baseline comparison; deferred enforcement | REQ-060, REQ-020, REQ-021 |
| 10 | Knowledge propagation | EXTEND `docs/parents/monitoring-portal.md`; outcome file | REQ-061 |
## 7. Journey J1 (cross-actor — the test-first contract)

**Actors:** teacher (report submitter — emission trigger), student (session
participant — own row recipient), parent (notified observer — link consumer),
system (emission + resolution substrate).

| Actor | Role | Can Do | Cannot Do |
|---|---|---|---|
| Teacher | `teacher` | submit the session report (emission trigger) | resolve other parents' sessions, see parent rows |
| Student | `student` | receive own completion row | resolve session targets (parent-only field) |
| Parent | `parent` | receive the SessionCompletion row; resolve `parentSessionTarget`; land on the R16 deep link | resolve a foreign session; receive rows for unlinked children |
| System | engine | emit + publish post-commit; constant-denial oracle | widen the frozen payload |

**Ordered steps (assertion set):**
1. Teacher → submits report for a completed session → emission receipts
   prepared for student + linked parent; published post-commit (spy the
   dispatch boundary — NEVER real channels).
2. System → parent inbox contains the row with
   `relatedEntityType="session"`, `relatedEntityId=<sessionId>`, wire type
   `SessionCompletion`.
3. Parent → `ParentMonitoringService.getSessionTarget(parentId, sessionId)`
   → returns `{ sessionId, studentId }` where studentId is the LINKED child.
4. Parent → reports read for that child contains the session's report row
   (`sessionId`, `teacherNotes`, `studentRatingByTeacher`) — the R16 URL is
   constructible and lands on the highlighted row.
5. Negative: unlinked child's session → NO parent emission (fail-closed
   wave `:78-80`).
6. Negative: foreign parent → `getSessionTarget` throws the constant
   localized `ForbiddenError` (indistinguishable from nonexistent session).

## 8. Test Obligations & Approved Runners

- **Journey** (test-first, Task 1): `test/workflows/parents/parent-session-completion-deep-link.journey.test.ts`
  — committed beforeAll fixtures + FK-safe afterAll teardown, NO `runInRollback`,
  honest role auth, dispatch spy; run:
  `bun run test/scripts/run-test.ts test/workflows/parents/parent-session-completion-deep-link.journey.test.ts`
  (NEVER raw `bun test` on journeys; NO general `test:workflows` script exists).
- **Wire** (Task 4): extend `backend/graphql/test/parent-monitoring.wire.test.ts`
  matrix — anonymous → 401; wrong role (student/teacher/admin) → 403; parent +
  nonexistent session → constant FORBIDDEN; parent + foreign session →
  constant FORBIDDEN; parent + linked child's session → `{ studentId }`;
  en/ar denial copy parity; run via `bun run test:graphql`.
- **Service** (Task 3): `parent-monitoring.service.test.ts` extension — happy
  path; missing session → constant denial; foreign → constant denial;
  non-positive session id → ValidationError; rate-limit passthrough; follow the
  file's existing mocking conventions.
- **Resolver** (Task 6): add Parent-cell cases (entry URL built,
  absent/empty id → feed, other types + Parent → feed, Student/Teacher
  cells unchanged) to the suite already reconciled to the current
  signature out-of-band 2026-09-17.
- **Frontend** (Tasks 5-8): documents test, root-container resolution tests
  (success replace / failure notice / no auto-select race), tab-highlight
  tests mirroring the ReportsTab pattern; run via
  `bun run test/scripts/run-test.ts <path>`.
- **Per-file gates**: `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` (exit 0) after every file.

## 9. Anti-Patterns (plan text MUST NOT contain these)

- ❌ `Translation.` enum references — NO such enum exists; use handle
  constants (`ParentMonitoring`, `Notifications`, `Common`, `Errors`) imported
  from `@/shared/locale`.
- ❌ Two-arg `getTranslations(locale, "namespace")` — single-arg
  `getTranslations(locale)` + property chain
  (`.parentMonitoringTranslations`), server components only.
- ❌ `@/frontend/utils/logger` — STALE path; the frontend logger lives at
  `frontend/lib/logger.ts` (`@/frontend/lib/logger`); backend uses
  `@/backend/lib/logger`.
- ❌ Raw `bun test` on workflow journeys (use
  `bun run test/scripts/run-test.ts <path>`); `KOTTABY_TEST_RUNNER_OK=1` is a
  debugging bypass only, never cited as a task runner.
- ❌ Bottom-nav items/menus — NO bottom nav exists anywhere; UX/Nav sections
  answer "Mobile Bottom Nav: N/A — none exists (R-B)".
- ❌ Invented paths/symbols — every `path:line` must come from the substrate
  table (§1) or be re-verified with Grep/Read before citing.
- ❌ next-intl / `getBackendTranslations` / `shared/messages/` (all removed).
- ❌ Widening the frozen notification payload, emitter, WS envelope, or the
  `notifications` i18n copy (R-A).
- ❌ New Drizzle schema, mutations, seeds, env keys (R-K).

## 10. Decision Log (for plan.md §Key Design Decisions — cite as D1..D6)

- **D1** Display-only scope (R-A) — substrate verified shipped; plan touches
  only resolver + portal + one read field.
- **D2** Two-hop navigation (R-D) — sync pure resolver + root-container
  resolution + `router.replace`; rejected per-row async fetch and
  client-side child-scans (pagination-fragile, O(children) queries).
- **D3** Server-side link-gated resolution (R-C) — new `parentSessionTarget`
  read; rejected payload widening (frozen engine allowlist) and
  notification-row enrichment.
- **D4** Constant ForbiddenError oracle for resolution misses (R-C) —
  existence non-disclosure for session-id probing; matches portal oracle.
- **D5** Session highlight threading (R-G) — one link, three content tabs;
  reports tab stays the R16 landing.
- **D6** Resolver-test reconciliation (R-F) — the baseline suite was RED at
  planning (2026-09-17); the stale-arg reconciliation landed OUT-OF-BAND
  the same day (pre-implementation, standalone fix outside the plan), so
  D6's remaining substance is Task 6 adding Parent-cell coverage on the
  already-green suite (not preserved-as-red).
