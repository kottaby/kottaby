# Tasks: DEV3-007 — Recitation Record per Session (1:1)

**Plan directory (verbatim — every header, ledger path, outcome path, and self-reference in this file uses exactly this string):** `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11`
**Ticket:** DEV3-007 · Sprint 1 · Dev 3 · 2 SP · Blocked-By DEV3-004 (shipped — `docs/sessions/session-lifecycle.md`)
**Inputs:** `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/specs.md` · `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/plan.md`
**Scope note:** This ticket ships backend (types/repo/service/resolvers) + GraphQL SDL + **frontend shared documents only** (REQ-065 — no views per non-goal 3). It does **NOT** pad phases: Phase 4 contains documents + contract tests only (no view tasks, no `.BF`/`.BS` loops — there is no rendered UI surface to screenshot).

---

## Non-Negotiable Execution Protocol (applies to EVERY task)

1. **Pre-Execution outcome knowledge read.** Before starting any task, read every existing file under `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/outcome/` plus `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/deferred-items.md`. Do not re-derive a decision a prior outcome already settled; do not repeat an already-recorded deferral.
2. **Post-Edit verification.** After EVERY source file is created or modified: `bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates` — must exit 0. Never bundle multiple files and skip per-file loops.
3. **Test execution.** Test files run ONLY via `bun run test/scripts/run-test.ts <test-path>` (never raw `bun test` — it skips `--env-file=.env.test`).
4. **Semantic review checklist.** Before marking any task `[x]`, self-review: atomicity & tx propagation (`tx` handed to every repo call), env-config (no hardcoded values), zero dead code, no cross-layer imports (`shared/` never imports `@/frontend/**`, `@/backend/**`, `@/app/**`), enums as VALUE imports, no `console.*` (use `logger`), no local types in resolvers, MUI/i18n rules where applicable.
5. **Outcome documentation.** Every completed task writes `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/outcome/<task-id>-outcome.md` capturing: what shipped, deviations from plan, verification evidence (commands + exit codes), deferred discoveries.
6. **Checkbox tracking.** Update `[ ]` → `[x]` in THIS file as work completes. A task is `[x]` only when all its subtask boxes are `[x]` and its outcome file exists.
7. **Red-state rule.** Never leave the tree red between tasks; if a task cannot finish, revert its partial diff rather than commit a broken tree.

---

## Phase 0: Pre-Implementation Baseline

### - [ ] 0.1 Baseline error recording & deferred-items ledger
- **Artifacts:**
  - `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/outcome/0-baseline-outcome.md` (CREATE)
  - `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/deferred-items.md` (CREATE, initialized verbatim from `.agents/spec-process-guide/templates/deferred-items-template.md`)
- **Work:**
  - Run and RECORD (counts + first-30-lines snippets) into the baseline outcome: `bun tsgo`, `bun biome:check`, and the lint-service harness output as recorded for the DEV3-004 baseline.
  - Seed the ledger with the two known deferrals from specs: **D1** (write-once → future audited update/correction surface), **D2** (parent-portal read consumer DEV1-016) and **D3** (admin review read consumer DEV3-021) — record-now, close-later.
  - This MUST land BEFORE any source file is created or modified (REQ-001).
- **Instruction files:** `.agents/instructions/backend.instructions.md`, `AGENTS.md`.
- **Accept:** baseline counts recorded; ledger initialized with D1–D3; no source file touched yet.
- _Requirements: REQ-001_

### - [ ] 0.2 Prerequisite & anchor verification (verify-then-claim gate)
- **Work — VERIFY each anchor against bundled code and record `path:line` into `outcome/0.2-outcome.md`:**
  - `backend/db/schema/classes/recitation.ts` carries `sessionId` NOT NULL FK `session.id` (`onDelete: "cascade"`), `recitation_session_id_unique`, `name varchar(255)`, `description` text nullable (expected `backend/db/schema/classes/recitation.ts:1-19`).
  - `backend/types/classes/recitation.types.ts` contains ONLY `RecitationSelectType` + `RecitationInsertType`; barrels `backend/types/classes/index.ts`, `backend/types/index.ts` already re-export it (no barrel edit needed).
  - Helpers exist: `assertPositiveSafeSessionId`, `isPositiveSafeSessionId` (`backend/services/classes/session-lifecycle.guards.ts`), `assertActorGovernanceClean` (`backend/services/classes/session-lifecycle.governance.ts`), `isUniqueViolation` (`@/backend/services/shared`), `withTransaction` (services shared helper), `constraintNameOf` (`backend/db/test/test-utils.ts:34-49`).
  - Patterns exist for mirroring: `SessionRepository.findById` dual-executor branch (`backend/db/repo/classes/session.repository.ts:24-26`), `TeacherRepository.insertColdStartCertified` raw-23505 pattern (`backend/db/repo/teachers/teacher.repository.ts:40-57`), `SessionLifecycleService.getSessionById` null-collapse (`backend/services/classes/session-lifecycle.service.ts:178-194`), session Pothos object `t.expose*` + `DateTime` usage (`backend/graphql/pothos/classes/session.pothos.ts`), `sessionById` query scope/collapse pattern (`backend/graphql/query/classes/session-lifecycle.query.ts:43-60`).
  - Journey helpers directory `test/workflows/helpers/` EXISTS (referenced by `backend/graphql/test/session-lifecycle-mutations.test.ts:9-15`). If it does NOT exist, this task ADDS scaffolding duties to task 2.2 (helpers + `test/workflows/AGENTS.md`) per Architectural Invariant 10 — record the decision in the outcome file.
  - `ConflictError` / `ValidationError` / `NotFoundError` / `ForbiddenError` constructor shapes (codes arities) — confirm `ConflictError(code, message)` supports custom codes as the plan assumes; if not, plan switches to `DomainError(code, message)` and records the deviation NOW (before Phase 2).
  - `getServerTranslations(locale)` / `ctx.t("errors")` availability for resolver + service error copy; `errorsTranslations` flat key family in `shared/locale/`.
- **Work — gates:**
  - `bun run db push` (or schema diff) on the pre-branch state → confirm the schema is consistent now; record that ANY post-ticket diff must be empty (REQ-010 pin for Phase 5).
- **Accept:** every anchor either confirmed-with-line or re-scoped with a recorded decision; outcome file written.
- _Requirements: REQ-001, REQ-003, REQ-010, REQ-011, REQ-012, REQ-013, REQ-031, REQ-041_

---

## Phase 1: Types, Enums & Database Schema

> **Zero schema work (REQ-010):** the Drizzle schema in `backend/db/schema/` is the sole structural ground truth; this ticket makes NO edits there. Phase 1 = type extension + i18n keys only.

### - [ ] 1.1 Extend canonical types + static assertions + conformance test
- **Files:**
  - `backend/types/classes/recitation.types.ts` (UPDATE — additive: `RecitationReturnType = typeof recitation.$inferSelect`; `interface SessionRecitationSubmitInput { readonly name: string; readonly description: string | null; }`)
  - `backend/types/classes/recitation.types.test-d.ts` (CREATE — conformance: `RecitationReturnType ≡ RecitationSelectType`; `SessionRecitationSubmitInput` keys EXACTLY `{name, description}`; `@ts-expect-error` negatives: `sessionId`/`id`/`createdAt` not assignable; `description: undefined` not assignable)
  - `backend/types/classes/recitation.types.static-assertions.test.ts` (CREATE — mirror `session.types.static-assertions.test.ts` discipline: derivation never re-declared, no `any`, no `console` in the types file, no spreads)
- **NO barrel edits** (`backend/types/classes/index.ts` and `backend/types/index.ts` already re-export — VERIFY in task 0.2, assert in the static test).
- **Instruction files:** `.agents/instructions/backend.instructions.md`, `backend/AGENTS.md` (as present in bundle).
- _Requirements: REQ-003, REQ-033 (BOPLA whitelist is structural here)_
  - [ ] 1.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/classes/recitation.types.ts --lifecycle duplicates` AND same for both test files (exit code 0)
  - [ ] 1.1.TE **Test Engineering**: run `bun run test/scripts/run-test.ts backend/types/classes/` — static-assertion + conformance suites green; type errors prove the negatives compile-fail as written (Tier 1 structural coverage).
  - [ ] 1.1.SEC **Security & Tenancy Audit**: BOPLA enforcement is the deliverable — `SessionRecitationSubmitInput` excludes every server-controlled field (id, sessionId, timestamps); negative assignment tests prove exclusion.
  - [ ] 1.1.SR **Semantic Review**: no duplicate type shapes; `RecitationReturnType` is a derivation (`typeof recitation.$inferSelect`), never a hand-declared interface; zero dead exports beyond the four-member shape.
  - [ ] 1.1.IV **Instruction Verification**: re-read `.agents/instructions/backend.instructions.md` and auto-discovered AGENTS.md files for `backend/types/`; confirm compliance.
  - [ ] 1.1.OC **Outcome**: write `outcome/1.1-outcome.md`.

### - [ ] 1.2 i18n error keys (flat, both locales)
- **Files:**
  - `shared/locale/en/errors*` (UPDATE — add flat keys `recitationAlreadyExists`, `recitationSessionNotWriteable` to `ErrorsLabels`)
  - `shared/locale/ar/errors*` (UPDATE — Arabic translations of the SAME two keys)
  - `shared/locale/` types/registration per the namespace-registration checklist in `shared/AGENTS.md` (flat domain-prefixed keys — NO nested groupings)
  - i18n parity test (new or extended per existing locale-parity suite location) asserting both keys exist in BOTH locales with non-empty values
- **Instruction files:** `shared/AGENTS.md` (registration checklist), `.agents/instructions/backend.instructions.md`.
- _Requirements: REQ-002, REQ-052_
  - [ ] 1.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts` on every touched locale/type file (exit 0)
  - [ ] 1.2.TE **Test Engineering**: locale parity test green via `bun run test/scripts/run-test.ts <locale-parity-test-path>`; assert flat (non-nested) key shape.
  - [ ] 1.2.SEC **Security & Tenancy Audit**: keys carry user-safe generic copy — no server internals or dynamic interpolation holes.
  - [ ] 1.2.SR **Semantic Review**: no `Translation` enum references (none exists); keys are `ErrorsLabels`-flat with domain prefix; no duplicated keys anywhere in the locale trees.
  - [ ] 1.2.IV **Instruction Verification**: validate registration steps against `shared/AGENTS.md` checklist item-by-item.
  - [ ] 1.2.OC **Outcome**: write `outcome/1.2-outcome.md`.

---

## Phase 2: Repositories & Backend Services

### - [ ] 2.1 [Implement `RecitationRepository` — closed two-method namespace]
- **Files:**
  - `backend/db/repo/classes/recitation.repository.ts` (CREATE — namespace `RecitationRepository` with EXACTLY two exports):
    - `insertOnce(insert: RecitationInsertType, tx?: DBTransaction): Promise<RecitationSelectType>` — unique-violation propagates RAW (no translation here; mirror `TeacherRepository.insertColdStartCertified` at `backend/db/repo/teachers/teacher.repository.ts:40-57`)
    - `findBySessionId(sessionId: number, tx?: DBQueryExecutor): Promise<RecitationSelectType | null>` — dual-executor branch (Drizzle branch under tx, parameterized `queryDb` cold path; mirror `SessionRepository.findById` at `backend/db/repo/classes/session.repository.ts:24-26`)
    - **NO update / delete / list methods** (closed-namespace pin, REQ-015 / Decision 10)
  - `backend/db/repo/classes/__tests__/recitation.repository.test.ts` (CREATE — REQ-070 four-tier suite)
  - `backend/db/repo/classes/index.ts` (UPDATE — barrel re-export ONLY if the sibling barrel convention requires it; confirm against existing barrel in 0.2)
- **Instruction files:** `.agents/instructions/backend.instructions.md`, `backend/AGENTS.md`, plus `docs/drizzle/prepared-statements.md` rules (parameterized cold path; NO inline `--` comments in `sql` templates).
- _Requirements: REQ-011, REQ-015, REQ-040, REQ-070_
  - [ ] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/repo/classes/recitation.repository.ts --lifecycle duplicates` and same for the test file (exit 0)
  - [ ] 2.1.TE **Test Engineering** — 4-Tier suite (all writes inside `runInRollback`; `tx` passed to EVERY call; `expectRepoError`, NEVER `expect(...).rejects.toThrow()`):
    - Tier 1 (branch/statement): insert success + read-back; `findBySessionId` hit; `findBySessionId` miss → `null`.
    - Tier 2 (boundary): both executor branches exercised (tx branch AND cold `queryDb` branch).
    - Tier 3 (chaos): duplicate insert → raw `23505` surfaces to caller; assert `constraintNameOf(err) === "recitation_session_id_unique"`; concurrent double-insert under committed fixtures → exactly ONE winner row.
    - Tier 4 (security/isolation): sibling-session isolation — inserting for session A never leaks via a read for session B.
    - Run: `bun run test/scripts/run-test.ts backend/db/repo/classes/__tests__/recitation.repository.test.ts` — green.
  - [ ] 2.1.SEC **Security & Tenancy Audit**: parameterized equality predicate only (NO LIKE anywhere → wildcard-escaping N/A recorded); no caller-supplied column/table interpolation; identity never input-bound (insert carries exactly the mapped DTO).
  - [ ] 2.1.SR **Semantic Review**: namespace closed at two methods (source-pin asserting `Object.keys(RecitationRepository).sort()` equals `["findBySessionId","insertOnce"]` included in the repo test); tx parameter LAST on both methods; canonical types imported (no local type re-declaration).
  - [ ] 2.1.IV **Instruction Verification**: re-read `.agents/instructions/backend.instructions.md` + auto-discovered AGENTS.md; confirm `docs/drizzle/prepared-statements.md` compliance.
  - [ ] 2.1.OC **Outcome**: write `outcome/2.1-outcome.md`.

### - [ ] 2.2 [Write Recitation journey test — TEST-FIRST]
- **Files:**
  - `test/workflows/sessions/recitation-record.journey.test.ts` (CREATE — one file for the full cross-actor journey)
  - `test/workflows/helpers/` (REUSE — cast helper from the sessions domain; if `test/workflows/` is absent, this task ALSO scaffolds helpers + `test/workflows/AGENTS.md` per Architectural Invariant 10, as decided in task 0.2)
- **Steps (sequential service calls with `actorUserId`; committed fixtures; spied notification boundary):**
  1. Owning teacher → `RecitationRecordService.setSessionRecitation` on a started session → exactly ONE `recitation` row; ZERO notifications; ZERO audit rows; ZERO writes to sibling tables.
  2. Student participant → `getSessionRecitation` → observes `name`/`description` verbatim.
  3. Owner repeat write → `RECITATION_ALREADY_EXISTS`; original row byte-identical.
  4. Foreign student read → `null` (never learns the row exists).
  5. Foreign teacher write on the SAME session id → `SESSION_NOT_FOUND`, byte-identical to a nonexistent-id denial.
  6. Parent read → `null`; parent role write via the scope layer assertion documented at wire tier (service-level: predicate from DB row only).
  7. Governed (suspended) teacher write → `FORBIDDEN` at the service re-check; zero rows.
  8. Concurrent double owner-write → exactly one row, exactly one `RECITATION_ALREADY_EXISTS` loser; both participants observe the same stored record afterwards.
- **Rules:** real permission resolution (real role rows — NEVER monkey-patch); committed fixtures in `beforeAll` + tracked hard-delete in `afterAll`; `runInRollback` FORBIDDEN around service calls; notification dispatch spied (assert zero publishes on every step); admin/anon denial paths asserted at scope layer where service-level role gating doesn't apply.
- **Test-first:** this test is written BEFORE task 2.3 implements the service; it MUST fail/red at authoring time and is run again after 2.3.
- _Requirements: REQ-073 (+ journey EARS criteria from specs §2.9)_
  - [ ] 2.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts test/workflows/sessions/recitation-record.journey.test.ts --lifecycle duplicates` (exit 0)
  - [ ] 2.2.TE **Test Engineering**: after 2.3 lands, `bun run test/scripts/run-test.ts test/workflows` — green (never raw `bun test`).
  - [ ] 2.2.SEC **Security & Tenancy Audit**: denial paths (foreign/collapse/governance) are asserted, not assumed; no identity parameters beyond `sessionId` exist to smuggle.
  - [ ] 2.2.SR **Semantic Review**: fixtures cleaned (no leaked rows); actors attributed per step; sibling-table oracles explicit.
  - [ ] 2.2.IV **Instruction Verification**: `.agents/instructions/tests.instructions.md` + `test/workflows/AGENTS.md` compliance.
  - [ ] 2.2.OC **Outcome**: write `outcome/2.2-outcome.md` (record red-then-green evidence).

### - [ ] 2.3 [Implement `RecitationRecordService` — write pipeline + collapse read]
- **Files:**
  - `backend/services/classes/recitation.service.ts` (CREATE — namespace `RecitationRecordService`):
    - `setSessionRecitation(teacherUserId, sessionId, input: SessionRecitationSubmitInput, locale, outerTx?: DBTransaction): Promise<RecitationReturnType>` — EXACT pipeline (REQ-012): (1) pre-DB guards: `assertPositiveSafeSessionId` + payload guards (name trimmed non-empty ≤255; description null-or-trimmed ≤2000, empty-after-trim → null) → `ValidationError` with `fields: ApiFieldErrorType[]`; (2) `assertActorGovernanceClean` → `ForbiddenError` pre-tx; (3) ONE `withTransaction(outerTx, …)` unit: `SessionRepository.findById(sessionId, tx)` → miss OR `session.teacherId !== teacherUserId` → `NotFoundError("SESSION", …)` (byte-identical); status `scheduled|cancelled` → `ConflictError("RECITATION_SESSION_NOT_WRITEABLE", …)`; else `RecitationRepository.insertOnce(…, tx)`; catch → `isUniqueViolation` cause-chain → `ConflictError("RECITATION_ALREADY_EXISTS", localized recitationAlreadyExists)`, rethrow everything else untouched.
    - `getSessionRecitation(callerUserId, sessionId, tx?): Promise<RecitationReturnType | null>` — malformed id → `null` pre-DB; session miss/foreign → `null`; participant (DB-row predicate `teacherId===caller || studentId===caller`) → row | null.
    - Logging: exactly ONE `logger.logDomainError` per denial with bounded context `{ code, entity, entityId, locale }`; happy paths and collapse reads log NOTHING (REQ-035).
    - Source NEVER imports `NotificationEngine` / `AuditService` (REQ-018 — pinned by static test).
  - `backend/services/classes/recitation.service.test.ts` (CREATE — REQ-071 four-tier suite)
- **Instruction files:** `.agents/instructions/backend.instructions.md`, `backend/AGENTS.md`.
- _Requirements: REQ-012, REQ-013, REQ-014, REQ-015, REQ-016, REQ-017, REQ-018, REQ-031, REQ-032, REQ-034, REQ-035, REQ-040, REQ-041, REQ-042, REQ-050, REQ-051_
  - [ ] 2.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/classes/recitation.service.ts --lifecycle duplicates` and same for the test file (exit 0)
  - [ ] 2.3.TE **Test Engineering** — 4-Tier suite:
    - Tier 1: happy write + read; byte-exact `DomainError` class+code matrix: `VALIDATION`, `FORBIDDEN`, `SESSION_NOT_FOUND`, `RECITATION_SESSION_NOT_WRITEABLE`, `RECITATION_ALREADY_EXISTS`.
    - Tier 2 (boundary): name at 0/1/255/256 chars, whitespace-only, unicode/RTL; description null vs empty vs 2000/2001; `fields[]` projection names the offending field; sessionId fuzz (0, negative, fractional, NaN, >MAX_SAFE_INTEGER) → `VALIDATION` pre-DB / read collapses to `null`.
    - Tier 3 (chaos): governance fuzz (deleted/blocked/suspended/absent caller); status fuzz (scheduled/cancelled denied; started/completed/disputed admitted per B.18); concurrent same-session double-write → exactly one winner; `outerTx` composition (join-tx) AND wire-style `undefined` top-level both green; rollback purity — failed pipeline leaves ZERO residual rows.
    - Tier 4 (security): foreign teacher ≡ nonexistent (byte-identical denial); participant predicate from DB row only; write-purity oracles — zero writes to `session`, `students`, `users`, `teacher`, `wallet`, `teacher_transaction`, `notifications`, `audit_logs` (row-count oracles); `logger.logDomainError` spy counts (exactly one bounded call per denial code, zero on happy/collapse paths).
    - Run: `bun run test/scripts/run-test.ts backend/services/classes/recitation.service.test.ts` — green; re-run journey task suite (2.2) — turns green.
  - [ ] 2.3.SEC **Security & Tenancy Audit**: BOLA collapse verified on both surfaces; BOPLA — resolver-independent input never widened here; BFLA governance re-check pre-tx; content-PII never logged; LIKE N/A recorded (parameterized equality only).
  - [ ] 2.3.SR **Semantic Review**: single `withTransaction` unit with SAME `tx` everywhere; cause-chain 23505 traversal only (no message-sniffing); no blanket try/catch; canonical types imported; enum VALUES imported (status comparisons via enum members, never string literals); no service-layer `.types.ts` file created.
  - [ ] 2.3.IV **Instruction Verification**: re-read `.agents/instructions/backend.instructions.md` + auto-discovered AGENTS.md; verify governance-helper and guard-helper reuse (no twin re-implementation).
  - [ ] 2.3.OC **Outcome**: write `outcome/2.3-outcome.md`.

### - [ ] 2.M Mid-Point Review Gate
- **Gate checks (all must pass before Phase 3):**
  - `bun tsgo` and `bun biome:check` deltas vs 0.1 baseline: ZERO new errors.
  - Repo suite + service suite + journey suite green via the recorded harness.
  - Diff scan confirms: NO file under `backend/db/schema/` touched; `bun run db push` produces an EMPTY diff against the running dev DB (REQ-010); no NotificationEngine/AuditService import in `recitation.service.ts`; repository namespace closed at two methods.
  - Error-code table (REQ-052) coverage mapped 1:1 against implemented throws; deferred-items ledger revisited (nothing new uncovered → note "no additions").
- **Artifacts:** `outcome/2.M-outcome.md` with gate evidence (commands + exit codes).
- _Requirements: REQ-010, REQ-013, REQ-016, REQ-018, REQ-052_

---

## Phase 3: GraphQL Resolvers & API Handlers

### - [ ] 3.1 [Pothos object + input + mutation + query resolvers]
- **Files:**
  - `backend/graphql/pothos/classes/recitation.pothos.ts` (CREATE — `SessionRecitationInput` input `{name: String!, description: String}` and `SessionRecitationPothosObject` exposing `id` FIRST via `t.exposeID`, `sessionId` via `t.exposeID`, `name`/`description` (nullable) via `t.exposeString`, `createdAt`/`updatedAt` via `t.expose("…", { type: "DateTime" })` — NO `toISOString()` hand-serialization; NO `Int` coercion)
  - `backend/graphql/pothos/classes/index.ts` (UPDATE barrel)
  - `backend/graphql/mutation/classes/recitation.mutation.ts` (CREATE — `setSessionRecitation(sessionId: ID!, input: SessionRecitationInput!): SessionRecitation!`; `authScopes: { $all: { authenticated: true, role: [UserRole.Teacher] } }`; thin resolver: field-by-field mapping to `RecitationRecordService.setSessionRecitation(ctx.user.id, Number(args.sessionId), { name, description: description ?? null }, ctx.locale)` — NO `{...input}` spread, NO local types)
  - `backend/graphql/mutation/classes/index.ts` (UPDATE barrel)
  - `backend/graphql/query/classes/recitation.query.ts` (CREATE — `sessionRecitation(sessionId: ID!): SessionRecitation` NULLABLE; `authScopes: { authenticated: true }` ONLY; delegates to `getSessionRecitation(ctx.user.id, Number(args.sessionId))`)
  - `backend/graphql/query/classes/index.ts` (UPDATE barrel)
  - `backend/lib/gateway/public-operations.ts` (VERIFY byte-identical — NEITHER op is public; assert in wire tier)
- **Instruction files:** `.agents/instructions/backend.instructions.md`, `backend/graphql/AGENTS.md` (as present in bundle).
- _Requirements: REQ-030, REQ-032, REQ-033, REQ-060, REQ-061, REQ-062, REQ-063_
  - [ ] 3.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts` on each created/updated resolver/pothos file (exit 0)
  - [ ] 3.1.TE **Test Engineering**: scope-map smoke coverage lands in the Phase-5 wire suite; here assert the modules import and register without error and that `$all` shape is exactly as pinned (unit-level scope-map assertion in the wire test setup).
  - [ ] 3.1.SEC **Security & Tenancy Audit**: `$all` conjunction load-bearing on the mutation (`$all{authenticated, [Teacher]}` — plain map would be ANY-semantics); query scope authenticated-only with service-owned tenancy; closed input whitelist; identity NEVER input-bound (`ctx.user.id` is the sole identity source); public-operations allowlist untouched.
  - [ ] 3.1.SR **Semantic Review**: no local types in resolvers (canonical `RecitationReturnType`); `UserRole.Teacher` as VALUE import; `DateTime` scalar usage matches `session.pothos.ts` convention; no error-code literals hardcoded in resolvers (service owns codes).
  - [ ] 3.1.IV **Instruction Verification**: `.agents/instructions/backend.instructions.md` + `backend/graphql/AGENTS.md` rechecked post-edit.
  - [ ] 3.1.OC **Outcome**: write `outcome/3.1-outcome.md`.

### - [ ] 3.2 [Codegen sync + frozen-inventory extension]
- **Work:**
  - Run `bun run generate:gqlSchema && bun run codegen` in the SAME commit as 3.1; confirm committed generated SDL matches the built schema byte-for-byte.
  - `backend/graphql/test/schema-surface.test.ts` (UPDATE — ADDITIVELY extend frozen inventories: fields `setSessionRecitation` / `sessionRecitation`; types `SessionRecitation` / `SessionRecitationInput`; NEVER mutate historical pins)
  - `backend/graphql/test/sdl-static-assertions.test.ts` (UPDATE — additive SDL string assertions in `lexicographicSortSchema` print order: `setSessionRecitation(input: SessionRecitationInput!, sessionId: ID!): SessionRecitation!`; `sessionRecitation(sessionId: ID!): SessionRecitation`; full `SessionRecitation`/`SessionRecitationInput` type blocks)
  - Assert `DateTime` scalar still registered exactly once; no new scalars introduced.
- **Instruction files:** `.agents/instructions/backend.instructions.md`, `backend/graphql/AGENTS.md`.
- _Requirements: REQ-062, REQ-064, REQ-074_
  - [ ] 3.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts` on both updated test files (exit 0)
  - [ ] 3.2.TE **Test Engineering**: `bun run test/scripts/run-test.ts backend/graphql/test/schema-surface.test.ts` and `…/sdl-static-assertions.test.ts` — green; codegen determinism check (second `generate:gqlSchema` run → zero diff).
  - [ ] 3.2.SEC **Security & Tenancy Audit**: frozen inventories prove NO public-operations drift and NO update/delete/list recitation fields leaked into the SDL.
  - [ ] 3.2.SR **Semantic Review**: additions are purely additive (no historical pin rewritten); sorted-order strings verified against the actual printed SDL.
  - [ ] 3.2.IV **Instruction Verification**: backend instruction file re-read; SDL-freeze protocol honored.
  - [ ] 3.2.OC **Outcome**: write `outcome/3.2-outcome.md`.

---

## Phase 4: Frontend GraphQL Documents (NO views — non-goal 3)

> **Scope note:** REQ-065 ships typed documents ONLY. There is no page, component, nav, or rendered surface — therefore the UI `.BF`/`.BS` agent-browser loops do not apply and are explicitly not generated; the justification is recorded here and in the outcome file.

### - [ ] 4.1 [Shared documents + barrels + contract test]
- **Files:**
  - `frontend/graphql/sharedDocuments/scheduling/recitation.documents.ts` (CREATE — `sessionRecitationQueryDocument` + `setSessionRecitationMutationDocument` as `TypedDocumentNode`s; `id` selected FIRST in payload selections; NO declared unused documents)
  - `frontend/graphql/sharedDocuments/scheduling/index.ts` (UPDATE barrel)
  - `frontend/graphql/sharedDocuments/index.ts` (UPDATE top-level barrel)
  - documents-contract test (CREATE at the established sharedDocuments test location — naming/typing contract: variables surface = `{ sessionId }` on the query and `{ sessionId, input }` on the mutation, ZERO identity variables; id-first selection shape)
  - `frontend/providers/apollo/apolloCache.ts` — **MUST NOT be touched** (frozen surface; assert untouched in PR diff and pin in contract test if a policy test exists at `frontend/providers/apollo/apolloCache.test.ts:95-106`)
- **Instruction files:** `.agents/instructions/frontend.instructions.md`, `frontend/graphql/AGENTS.md`.
- _Requirements: REQ-065, REQ-033 (zero identity variables = wire-level BOPLA hygiene), REQ-043 (dispatcher untouched — no new error-map row)_
  - [ ] 4.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts` on each created/updated documents file and the contract test (exit 0)
  - [ ] 4.1.TE **Test Engineering**: `bun run test/scripts/run-test.ts frontend/graphql/sharedDocuments/` — contract suite green (naming, `TypedDocumentNode` typing against codegen output, id-first selection, exact variable surface).
  - [ ] 4.1.SEC **Security & Tenancy Audit**: documents carry NO identity variables (caller identity is never wire-visible); no selection of fields absent from `SessionRecitation`; apolloCache policy surface untouched.
  - [ ] 4.1.SR **Semantic Review**: no duplicate operation names; no unused document exports; barrels in canonical order; NO view/page/component code created anywhere.
  - [ ] 4.1.IV **Instruction Verification**: `.agents/instructions/frontend.instructions.md` + `frontend/graphql/AGENTS.md` re-read post-edit.
  - [ ] 4.1.OC **Outcome**: write `outcome/4.1-outcome.md` (record the explicit N/A ruling for `.BF`/`.BS` loops with REQ-065/non-goal-3 citation).

---

## Phase 5: Integration & Differential Testing

### - [ ] 5.1 [Wire GraphQL matrix over the live HTTP stack]
- **Files:**
  - `backend/graphql/test/recitation-record.wire.test.ts` (CREATE — live HTTP wire suite per `session-lifecycle-mutations.test.ts` / `parent-link.wire.test.ts` pattern)
- **Coverage (REQ-072):**
  - Anonymous → `UNAUTHORIZED` on BOTH ops (pre-resolver).
  - Role matrix on the mutation: student / parent / foreign teacher → `FORBIDDEN` pre-resolver.
  - BOPLA smuggle probes: `userId` / `sessionOwnerId` / `teacherId` on the input OR args → `GRAPHQL_VALIDATION_FAILED`.
  - Malformed `sessionId` wire shapes → `VALIDATION`.
  - Foreign-vs-nonexistent byte-identical collapse proof on the READ (`extensions.code` absence + payload equality — both `null`).
  - Happy-path wire result ≡ service oracle (same row fields serialized, `DateTime` payload format correct).
  - Localization proofs: error copy under `en` and `ar` locales differs appropriately and matches the new keys.
  - Boundary masking: forced non-domain internal failure → masked localized `INTERNAL_SERVER_ERROR` with correlated `requestId`; no content leak (REQ-053).
  - Public-operations allowlist: neither op executes without a session token (byte-compare `public-operations.ts` unchanged).
- **Instruction files:** `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`, `backend/graphql/AGENTS.md`.
- _Requirements: REQ-030, REQ-032, REQ-033, REQ-043, REQ-052, REQ-053, REQ-063, REQ-072_
  - [ ] 5.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/graphql/test/recitation-record.wire.test.ts --lifecycle duplicates` (exit 0)
  - [ ] 5.1.TE **Test Engineering**: `bun run test/scripts/run-test.ts backend/graphql/test/recitation-record.wire.test.ts` green; repeat-write (replay) wire assertion → `RECITATION_ALREADY_EXISTS` without any idempotency key (REQ-043).
  - [ ] 5.1.SEC **Security & Tenancy Audit**: oracle-collapse byte-equality assertions are part of the suite (not eyeballed); header/token hygiene (no PII in request logs asserted via spy where feasible).
  - [ ] 5.1.SR **Semantic Review**: assertions target `extensions.code` fixtures, not message strings; fixture cleanup complete (committed fixtures hard-deleted where the suite's own pattern requires).
  - [ ] 5.1.IV **Instruction Verification**: backend + tests instruction files re-validated.
  - [ ] 5.1.OC **Outcome**: write `outcome/5.1-outcome.md`.

### - [ ] 5.2 [Full integration gate — all suites + diff hygiene]
- **Work:**
  - Run ordered: `bun run scripts/health/sub-loop.ts` over every file created/modified in this plan (final re-sweep) → all exit 0.
  - `bun tsgo` and `bun biome:check` deltas vs 0.1 baseline: ZERO new diagnostics.
  - Full targeted test run: repo suite, service suite, journey suite, wire suite, schema-surface, SDL assertions, documents-contract, types static+conformance, i18n parity — ALL green via `run-test.ts`.
  - Schema-drift gate: `bun run db push` produces an EMPTY diff (REQ-010 final proof).
  - Differential review: git diff contains NO change to `backend/db/schema/**`, `frontend/providers/apollo/apolloCache.ts`, `backend/lib/gateway/public-operations.ts`, any dispatcher/error-map frontend file, any notification/audit module.
- **Artifacts:** `outcome/5.2-outcome.md` with command transcript + exit codes.
- _Requirements: REQ-001 (differential), REQ-010, REQ-015, REQ-016, REQ-018, REQ-063, REQ-065_

---

## Phase 6: Post-Implementation Review Waves

### - [ ] 6.1 [Parallel review waves + deferred-items check]
- **Wave 1 — review-types:** `backend/types/classes/recitation.types.ts` derivation discipline, closed input interface, `.test-d.ts` negatives all invalid-assignment-proof; no service-layer `.types.ts` materialized anywhere.
- **Wave 2 — review-backend:** repo namespace closure; service pipeline ORDER (guards→governance→tx(resolve→ownership→status→insert)); 23505 cause-chain translation only; single-`withTransaction` tx propagation; zero Notification/Audit imports; collapse-read predicate from DB row; log-hygiene bounded context; governance re-check placement pre-tx.
- **Wave 3 — review-frontend (documents-scope only):** documents are consumable typed artifacts; barrels correct; NO view/page/nav diff exists; apolloCache untouched; contract tests enforce variable surface.
- **Wave 4 — pentester:** oracle-collapse byte-equality (write denial + read null); BOPLA smuggle surface closed; BFLA scope `$all` integrity; governance-window abuse (staler-than-context token) denial at service; log-leak sweep (no content/PII anywhere in logs); race arbiter correctness (constraint, not pre-check — confirm no TOCTOU pre-check crept in).
- **Deferred-items check:** re-open `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/deferred-items.md`; for EVERY recorded item (D1, D2, D3 + any discovered mid-implementation) confirm it is either (a) still legitimately deferred with an owner ticket, or (b) resolved and closed with evidence in a corresponding outcome file. Mark any NEW finding as a ledger entry before closing this task.
- **Artifacts:** `outcome/6.1-outcome.md` summarizing each wave's verdict + any follow-on edits (each edit re-runs its file's quality loop + affected suites).
- _Requirements: REQ-001..REQ-074 sweep (review), plus ledger discipline from REQ-081_

---

## Phase 7: Knowledge Propagation & Documentation

### - [ ] 7.1 [Canonical doc — `docs/sessions/recitation-record.md`]
- **Content (REQ-080):** C.5 binding; write-once + unique-arbiter rule (23505 → `RECITATION_ALREADY_EXISTS`); collapse read (foreign ≡ nonexistent); write-acceptance window (`started | completed | disputed`, B.18 note); governance re-check posture; closed error-code table; consumer obligations for DEV3-006 / DEV2-014 / DEV1-016 / DEV3-021 (import-by-reference — never a second writer, never a direct table read); composition seam (`outerTx`); explicit NO-notifications/NO-audit ruling with owning-ticket pointers.
- **Verification:** quality loop on the doc not applicable (docs) — instead, cross-link check: every referenced doc path exists; every referenced ticket id matches the sprint backlog.
- **Artifacts:** `docs/sessions/recitation-record.md` (CREATE), `outcome/7.1-outcome.md`.
- _Requirements: REQ-080_

### - [ ] 7.2 [Layer AGENTS.md + lifecycle consumer-table amendment + ledger finalization]
- **Work:**
  - `docs/sessions/session-lifecycle.md` (UPDATE — consumer table marks DEV3-007 DELIVERED and points recitation writes/reads to `docs/sessions/recitation-record.md`).
  - `backend/services/AGENTS.md` (UPDATE — register `RecitationRecordService` pattern notes: outerTx seam, guard/governance reuse, write-once arbiter) and `backend/graphql/AGENTS.md` (UPDATE ONLY if a generalizable surface rule emerged — e.g. `$all` conjunction note; otherwise record "no change needed" in the outcome).
  - Root `AGENTS.md` Important References (UPDATE — add `docs/sessions/recitation-record.md` entry).
  - Do NOT touch `backend/db/repo/AGENTS.md` unless the bundled file exists and genuinely has a layer-rule delta (0.2 recorded whether it exists; most likely only docs pointers change).
  - Finalize `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/deferred-items.md` — status every row.
- **Artifacts:** `outcome/7.2-outcome.md`.
- _Requirements: REQ-081_

### - [ ] 7.3 [Outcome synthesis & plan closure]
- **Work:**
  - Write `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/outcome/FINAL-outcome.md`: requirements trace sweep (REQ-001..REQ-081 → implement/test/doc evidence pointers), baseline-vs-final diagnostic deltas, full command transcript index, journey/wire evidence summary, schema-drift-empty proof, and the deferred-items final state.
  - Mark every checkbox in THIS file `[x]`; confirm no red state; summarize deviations from plan (path-shape changes, error-class fallbacks from 0.2 findings, journey-scaffold additions if made).
- **Accept:** plan directory self-references are verbatim `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11` everywhere; no task left `[ ]`; ledger reconciled.
- _Requirements: REQ-001, REQ-081 (closure), full-ticket exit criterion_

---

## Traceability Index (task → requirements)

| Task | Requirements |
|---|---|
| 0.1, 0.2 | REQ-001, REQ-003, REQ-010, REQ-011–013, REQ-031, REQ-041 |
| 1.1 | REQ-003, REQ-033 |
| 1.2 | REQ-002, REQ-052 |
| 2.1 | REQ-011, REQ-015, REQ-040, REQ-070 |
| 2.2 (journey, test-first) | REQ-073 + specs §2.9 EARS |
| 2.3 | REQ-012–014, REQ-015–018, REQ-031, REQ-032, REQ-034, REQ-035, REQ-040–042, REQ-050, REQ-051, REQ-071 |
| 2.M | REQ-010, REQ-013, REQ-016, REQ-018, REQ-052 |
| 3.1 | REQ-030, REQ-032, REQ-033, REQ-060, REQ-061, REQ-062, REQ-063 |
| 3.2 | REQ-062, REQ-064, REQ-074 |
| 4.1 | REQ-065, REQ-033, REQ-043 |
| 5.1 | REQ-030, REQ-032, REQ-033, REQ-043, REQ-052, REQ-053, REQ-063, REQ-072 |
| 5.2 | REQ-001, REQ-010, REQ-015, REQ-016, REQ-018, REQ-063, REQ-065 |
| 6.1 | REQ-001–REQ-074 (review sweep) |
| 7.1 | REQ-080 |
| 7.2 | REQ-081 |
| 7.3 | REQ-001, REQ-081 |
