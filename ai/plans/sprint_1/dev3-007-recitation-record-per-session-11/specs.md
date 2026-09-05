# Requirements & Specification: DEV3-007 — Recitation Record per Session (1:1)

**Plan directory (verbatim):** `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11`
**Ticket:** DEV3-007 · Sprint 1 · Dev 3 · 2 SP · Blocked by DEV3-004 (shipped — `docs/sessions/session-lifecycle.md`)
**Trace anchor:** Decision **C.5** (`docs/specs/open-decisions-and-gaps.md`) — the `recitation` table is session-linked 1:1 (`recitation.session_id` UNIQUE), and this ticket ships the write/read surface over it.

---

## 1. Executive Summary & Problem Statement

### Feature

The `recitation` table already exists and ALREADY enforces the 1:1 structural contract at rest — `recitation.sessionId` is `NOT NULL`, FK to `session.id` (`onDelete: "cascade"`), carries a UNIQUE constraint (`recitation_session_id_unique`), and holds exactly two content columns (`name: varchar(255) NOT NULL`, `description: text NULL`) plus the audit timestamps (`backend/db/schema/classes/recitation.ts:1-19`). What does NOT exist is any way to write or read a recitation record: there is no repository (only `backend/types/classes/recitation.types.ts` with `RecitationSelectType`/`RecitationInsertType` exists — no `ReturnType`/input types), no service, no GraphQL surface, no read path. This ticket ships exactly that surface — the canonical, single-writer, oracle-safe write + read seam through which every downstream consumer (the session report flow DEV3-006, the teacher submit-report flow DEV2-014, the parent portal DEV1-016, the admin review surface DEV3-021) will write and read session recitation records — never directly against the table.

### Problem from user perspective

- **Teacher (Certified Sheikh):** after (or during) a teaching session, she records what was recited — the session's recitation content/notes (e.g. *"Hafs — Al-Fatihah 1:1–7"*, free-form record text + optional notes). Until this surface exists, nothing in the platform captures the per-session recitation record, even though decision C.5 mandates exactly one per session and `docs/workflows/05-admin-governance-override.md` §8 mandates permanent retention of recitation records for dispute resolution and teacher re-evaluation evidence.
- **Student:** observes the recitation record attached to her own session — a permanent, readable record of what was covered.
- **Parent / foreign actors:** never see another student's recitation; the read surface collapses to `null` for any non-participant, preserving the session domain's "sessions are sensitive ⇒ collapse" ruling (`docs/sessions/session-lifecycle.md` §7).
- **Admin:** recitation records are *evidence for later review flows*; no admin read surface ships here (owned by DEV3-021 / parent-portal reads by DEV1-016 — import-by-reference from this ticket's service, never by direct table access).

### Business value

- Fulfils decision **C.5** at the *behavioral* level (the schema ships structure; this ticket ships the sanctioned write path), unlocking the report-submission flow (DEV3-006/2-014) and the parent-monitoring portal (DEV1-016).
- Keeps the permanent-retention evidence chain intact: every session that happened can carry exactly one recitation record, which downstream dispute-resolution and re-evaluation flows rely on.
- Prevents second-writer drift: the unique constraint + single-writer service + oracle-collapse read are the **only** channel; a second implementation of recitation writes anywhere in the codebase is structurally rejected.

### Actors involved

| Actor | Role | Capability surface |
|---|---|---|
| Session's owning teacher | `UserRole.Teacher` | Writes the recitation record for a session they own (once); reads it back |
| Session's student | `UserRole.Student` | Reads the recitation record of their own session |
| Foreign teacher / foreign student / parent / admin | any other role | Read collapses to `null`; write is denied at the scope layer or the ownership layer |
| Anonymous caller | — | `UNAUTHORIZED` pre-resolver |

### Non-goals (explicitly OUT of scope)

1. **No update / no delete surface.** Recitation records are write-once; the retention policy (`docs/workflows/05-admin-governance-override.md` §8, data-integrity rules) treats them as permanent. No correction/edit mutation ships here — a correction path is a future, separately designed, audited surface.
2. **No list / history query** ("all recitations of X"). No such surface ships; list consumers (parent portal, admin review) belong to their owning tickets and MUST import this ticket's service methods, never touch the table directly.
3. **No UI page or form.** Only the typed GraphQL shared documents ship (consumable contracts); the authoring form integrates with the report/homework flow ticket (DEV3-006 / DEV2-014), not here. No navigation/menu work.
4. **No notifications, no audit rows.** Recitation writes and reads emit ZERO `notifications` rows and ZERO `audit_logs` rows in this slice (the audit trail logs admin actions; this is a teacher write). The parent session-completion notification wave is DEV1-017's emitter, NOT this ticket.
5. **No admin override read.** Governance review of recitation records over a session is DEV3-021's surface; `sessionRecitation` here is participant-only and collapses for admins like any other non-participant.
6. **No RecitationReading (Qira'ah) re-purposing.** `recitation.name` / `description` stay FREE-TEXT record fields; the Qira'ah vocabulary (`shared/constants/recitation-reading.enum.ts`) and the user-level `preferredRecitation` preference (`docs/auth/qiraah-selection-and-c5.md`) are unrelated and MUST NOT be folded into this entity.
7. **No schema changes.** The table, the unique constraint, and the session FK all exist. `bun run db push` must produce ZERO drift for this ticket.
8. **No session-lifecycle transition changes.** The lifecycle owns states; this service reads session state only to adjudicate write acceptance.

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation (MANDATORY)

- **REQ-001 (Pre-Implementation Baseline & Ledger):** WHEN implementation begins THEN the system SHALL record baseline error counts (`bun tsgo`, `bun biome:check`, `lint-service` via the recorded harness) into `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/outcome/0-baseline-outcome.md`, and SHALL initialize the deferred-items ledger at `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md` BEFORE any source file is created or modified.
- **REQ-002 (Type-Safe i18n & Enum Value Imports Compliance):**
  - WHEN a client component renders new user-facing text THEN the view SHALL resolve it through `useAppTranslation(<NamespaceHandle>)` with a `defineNamespace` handle const (e.g. `Errors`), property access (`t.property`), never string literals, never a `Translation` enum (none exists), never `t('key')` calls.
  - WHEN a server component or service needs translations THEN it SHALL use `getTranslations(locale)` / `getServerTranslations(locale)` (ONE argument, full `Translations` tree) with property access; GraphQL resolvers SHALL use `ctx.t("namespace")` with the bound locale.
  - WHEN enum values appear in runtime expressions or casts THEN they SHALL be VALUE imports of enum members (never `import type` under runtime use, never raw string literals).
  - WHEN new error copy lands THEN it SHALL be added to BOTH `en` and `ar` AND registered per the namespace-registration checklist in `shared/AGENTS.md` (flat `ErrorsLabels` keys with domain-prefixed names — NO nested groupings).
- **REQ-003 (Canonical Types Discipline):** WHEN any layer needs the entity types THEN it SHALL import them from `backend/types/classes/recitation.types.ts` — which this ticket EXTENDS (it exists at `backend/types/classes/recitation.types.ts:1-4` with only `RecitationSelectType` + `RecitationInsertType`; this ticket ADDs `RecitationReturnType` and `SessionRecitationSubmitInput` via additive edit) — with NO local types in Pothos resolvers and NO service-layer `.types.ts` files (service-layer `.types.ts` files are prohibited outright).

### 2.2 Core Feature Logic / Happy Paths (REQ-010 … REQ-018)

- **REQ-010 (Schema Readiness Pin — zero schema work):** WHEN the implementation starts THEN the plan SHALL verify (and the test suite SHALL pin) that `backend/db/schema/classes/recitation.ts` already carries `sessionId` NOT NULL FK (`session.id`, cascade), `name` NOT NULL `varchar(255)`, `description` nullable text, and the `recitation_session_id_unique` constraint — and SHALL make ZERO schema/migration edits (a `bun run db push` diff for this ticket MUST be empty).
- **REQ-011 (Repository — single-writer primitives):** WHEN the repository module `backend/db/repo/classes/recitation.repository.ts` (CREATE) is implemented THEN it SHALL expose exactly the namespace `RecitationRepository` with: `insertOnce(insert: RecitationInsertType, tx?: DBTransaction): Promise<RecitationSelectType>` (failure of the unique constraint propagates RAW upward — translation is the service's concern, mirroring `TeacherRepository.insertColdStartCertified` surfacing `23505` at `backend/db/repo/teachers/teacher.repository.ts:40-57`), and `findBySessionId(sessionId: number, tx?: DBQueryExecutor): Promise<RecitationSelectType | null>` (dual executor branch — Drizzle branch under a transaction, parameterized `queryDb` cold path, mirroring `SessionRepository.findById` delegation at `backend/db/repo/classes/session.repository.ts:24-26`). Every repository method SHALL accept the transaction parameter LAST, and every test-facing write path SHALL run inside `runInRollback`.
- **REQ-012 (Write pipeline — deterministic ordering):** WHEN `RecitationRecordService.setSessionRecitation(teacherUserId, sessionId, input, locale, outerTx?)` (CREATE at `backend/services/classes/recitation.service.ts`) is invoked THEN the pipeline SHALL execute in EXACTLY this order: (1) pre-DB shape guards (sessionId positive-safe integer per `assertPositiveSafeSessionId` from `backend/services/classes/session-lifecycle.guards.ts:27-34`; payload field guards per REQ-050) failing with `VALIDATION` before ANY database read; (2) governance re-check of the caller via `assertActorGovernanceClean` (`backend/services/classes/session-lifecycle.governance.ts:8-22`) — suspended/blocked/deleted/absent callers fail `FORBIDDEN` pre-transaction; (3) one `withTransaction(outerTx, …)` unit (shared helper imported per the established services pattern) in which the SAME `tx` (a) resolves the session by id via `SessionRepository.findById(sessionId, tx)`, (b) rejects a miss or a non-owner (`session.teacherId !== teacherUserId`) with `NotFoundError("SESSION", …)` (foreign ≡ nonexistent, byte-identical — the session-domain collapse ruling, `docs/sessions/session-lifecycle.md` §7), (c) rejects a session whose status is `scheduled` or `cancelled` with `ConflictError("RECITATION_SESSION_NOT_WRITEABLE", …)` (a recitation records what HAPPENED — only `started`/`completed`/`disputed` sessions admit a record), (d) inserts via `RecitationRepository.insertOnce(...)` and returns the created row.
- **REQ-013 (Write-once conflict rule):** WHEN a recitation row already exists for the target session THEN the service SHALL surface `ConflictError("RECITATION_ALREADY_EXISTS", <localized recitationAlreadyExists>)` translated from the raw `23505` unique violation via cause-chain traversal (`isUniqueViolation` from `@/backend/services/shared`, exercised pattern at `backend/services/shared/user-provisioning.helpers.ts:18-33`) — NEVER the raw PG code, NEVER an `INTERNAL_SERVER_ERROR`, and the pre-existing row SHALL remain byte-identical.
- **REQ-014 (Participant-only read):** WHEN `RecitationRecordService.getSessionRecitation(callerUserId, sessionId, tx?)` is invoked THEN (1) a malformed session id SHALL return `null` pre-DB (mirror `SessionLifecycleService.getSessionById`'s null-short-circuit), (2) a nonexistent OR foreign session id SHALL return `null` (oracle collapse: absent ≡ foreign), (3) a participant (session's student or owning teacher) SHALL receive the recitation row when it exists and `null` when no recitation has been written yet, with NO error on any of these paths.
- **REQ-015 (Write-once permanence — repeat-write conflict, not upsert):** WHEN the same owning teacher calls `setSessionRecitation` twice for the same sessionId THEN the second call SHALL reject with `ConflictError("RECITATION_ALREADY_EXISTS", …)` — the unique constraint is the arbiter; the service NEVER updates or replaces the stored record, and NO update/replace method exists on the repository.
- **REQ-016 (Cross-entity write purity):** WHEN the recitation write or read executes THEN it SHALL write to the `recitation` table ONLY — ZERO writes to `session`, `students`, `users`, `teacher`, `wallet`, `teacher_transaction`, `notifications`, and `audit_logs` (row-count oracles pinned in tests; the lifecycle owns the session row exclusively, `docs/sessions/session-lifecycle.md` §10).
- **REQ-017 (Composition seam — outerTx):** WHEN a future owner flow (report submission, DEV3-006 / DEV2-014) composes the recitation write inside its own transaction THEN `setSessionRecitation` SHALL accept `outerTx?: DBTransaction` as its final parameter and propagate it into `withTransaction` (SAVEPOINT discipline), and the wire-driven mutation path SHALL pass `undefined` (own top-level transaction).
- **REQ-018 (Zero notifications, zero audit on this slice):** WHEN a recitation is written or read THEN the service SHALL call `NotificationEngine` NEVER and `AuditService` NEVER — establishes zero notifications AND zero audit rows as a locked contract of this ticket (parent-completion emitters and admin-review audit belong to their owning tickets).

### 2.3 Security, Authorization & Tenancy (REQ-030 … REQ-035)

- **REQ-030 (Role gating — BFLA):** WHEN `setSessionRecitation` is exposed THEN its field SHALL declare `authScopes: { $all: { authenticated: true, role: [UserRole.Teacher] } }` (the `$all` conjunction is load-bearing — a plain map is ANY-semantics; the `docs/teachers/applicant-lifecycle.md` §3 pattern), so anonymous callers answer `UNAUTHORIZED` pre-resolver and every non-teacher role answers `FORBIDDEN` pre-resolver. WHEN `sessionRecitation` is exposed THEN it SHALL declare `authScopes: { authenticated: true }` ONLY, with the ownership/tenancy decision made by the service.
- **REQ-031 (Governance re-check at the service layer):** WHEN a suspended, blocked, deleted, or absent teacher invokes `setSessionRecitation` (e.g. via a pre-issued still-valid token) THEN the service SHALL re-read the actor row and deny with `ForbiddenError` (`extensions.code = "FORBIDDEN"`) BEFORE opening the transaction — mirroring the write-path defense-in-depth ruling of `SessionLifecycleService.createSession` (the GraphQL context itself is NOT fail-closed; see `docs/notifications/realtime-engine.md` §3.10 and `docs/sessions/session-lifecycle.md` §2.3 governance notes).
- **REQ-032 (BOLA / IDOR — collapse the existence oracle):** WHEN any caller (any role, including foreign teacher, foreign student, parent, and admin) references a session they do not own THEN: (a) the write SHALL deny with the byte-identical `NotFoundError("SESSION", …)` (`SESSION_NOT_FOUND`) — identical to the denial for a nonexistent id, so session existence is never an oracle; (b) the read SHALL return `null` — identical to a nonexistent id. The participant predicate (`session.teacherId === callerUserId OR session.studentId === callerUserId`) SHALL be evaluated from the DB row, never from caller-supplied identity arguments (no identity parameter exists beyond `sessionId`).
- **REQ-033 (BOPLA — closed input whitelist):** WHEN the mutation receives `input: SessionRecitationInput!` THEN the Pothos input SHALL carry EXACTLY `name: String!` and `description: String`, and the resolver SHALL map fields field-by-field (NO spread, NO identity passthrough). Smuggled fields die as `GRAPHQL_VALIDATION_FAILED` before the resolver; smuggled root-level identity args die identically. Server-controlled values (recitation id, sessionId ownership resolution, timestamps) are NEVER input-bound.
- **REQ-034 (Input sanitization boundary):** WHEN any text payload is accepted THEN the service SHALL enforce: `name` — trimmed, non-empty, ≤ 255 chars (the `varchar(255)` ceiling); `description` — NULL or trimmed ≤ 2000 chars (empty-after-trim normalizes to NULL); over-limit or empty-name payloads are `VALIDATION` with the `fields[]` projection naming the offending field. LIKE/ILIKE is N/A by construction (the surface constructs NO pattern queries — the only predicate is parameterized equality on `session_id`) and SHALL be recorded as such (no `escapeLikeWildcards` import needed here; the N/A is deliberate).
- **REQ-035 (Log hygiene):** WHEN any denial fires THEN the service SHALL emit exactly ONE `logger.logDomainError` with bounded context `{ code, entity: "session" | "recitation", entityId, locale }` — NEVER the submitted `name`/`description` content, NEVER the session's counterparty, NEVER a PII value. Happy paths and collapse-to-null reads SHALL emit NOTHING.

### 2.4 Atomicity, Concurrency & Data Integrity (REQ-040 … REQ-043)

- **REQ-040 (One transaction, full tx propagation):** WHEN the write executes THEN the resolve→ownership→writeability→insert pipeline SHALL run inside ONE `withTransaction` unit with the SAME `tx` handed to EVERY repository call (mixed `tx`/`db` inside a flow is prohibited), and any mid-pipeline failure SHALL roll back to zero residual rows in `recitation`.
- **REQ-041 (23505 cause-chain translation):** IF the unique constraint `recitation_session_id_unique` fires inside the transaction THEN the thrown error's cause chain SHALL be traversed for code `23505` (NEVER message-sniffing, NEVER a Drizzle top-level read) and SHALL map EXACTLY to `ConflictError("RECITATION_ALREADY_EXISTS", …)` — the service SHALL catch only this shape and rethrow anything else untouched (no blanket try/catch masking).
- **REQ-042 (Concurrent double-write race):** WHEN two concurrent `setSessionRecitation` calls target the SAME sessionId THEN exactly ONE SHALL commit a row and the loser SHALL surface `RECITATION_ALREADY_EXISTS`; the final table state SHALL contain exactly ONE recitation row for the session (no double insert, no partial row).
- **REQ-043 (Idempotency ruling — NOT under `X-Idempotency-Key`):** BECAUSE the unique constraint is the durable arbiter of write-once, the mutation SHALL NOT require an idempotency key (recitation writes are OUTSIDE the `docs/IDEMPOTENCY.md` mandated key set), and a client retry of a completed write SHALL deterministically surface the success-adjacent conflict (`RECITATION_ALREADY_EXISTS`), which client surfaces render per the existing error-map convention without a new dispatcher row.

### 2.5 Validation & Error Contracts (REQ-050 … REQ-053)

- **REQ-050 (Input validation matrix + field projection):** WHEN the input is malformed THEN the service SHALL throw `ValidationError` LOCALIZED through the `errorsTranslations` namespace, carrying `fields[]` entries (`ApiFieldErrorType`) naming the offending field — `name: "name"` for a missing/over-length name, `field: "description"` for over-length notes — so the future teacher form renders helper text per field (projection contract mirrors `projectMutationFieldErrors` at `frontend/lib/mutationFieldErrors.ts`).
- **REQ-051 (Session id shape guard — pre-DB):** WHEN `sessionId` is zero, negative, fractional, NaN, or beyond `Number.MAX_SAFE_INTEGER` THEN the service SHALL throw `ValidationError` (`VALIDATION`) BEFORE ANY repository read (pre-DB), and the read path SHALL collapse the same shapes to `null` without touching the DB.
- **REQ-052 (Closed error-code table + i18n keys):** The surface's error taxonomy is CLOSED. New `errorsTranslations` keys SHALL be added to BOTH locales under flat domain-prefixed names: `recitationAlreadyExists`, `recitationSessionNotWriteable` (existing keys REUSED for the rest: `sessionNotFound`, `validation`, `forbidden`, `unauthorized`, `internalServerError`):

| Layer | Condition | `extensions.code` |
|---|---|---|
| pre-resolver | anonymous | `UNAUTHORIZED` |
| pre-resolver | authenticated non-teacher (write) | `FORBIDDEN` |
| service, pre-tx | governed/absent caller (write) | `FORBIDDEN` |
| service, pre-DB | malformed sessionId / malformed payload | `VALIDATION` (+ `fields[]` for payload) |
| service, in-tx | missing OR non-owned session (write) | `SESSION_NOT_FOUND` |
| service, in-tx | session status `scheduled` / `cancelled` (write) | `RECITATION_SESSION_NOT_WRITEABLE` |
| service, in-tx | recitation already exists (write, incl., race loser) | `RECITATION_ALREADY_EXISTS` |
| boundary | any non-domain internal failure | `INTERNAL_SERVER_ERROR` (masked, correlated) |
| read | any of: malformed id, nonexistent id, non-participant, session exists but no recitation yet | `null` (NEVER an error) |

- **REQ-053 (Boundary masking):** WHEN any unexpected, non-domain error escapes the service THEN the GraphQL boundary finalizer SHALL mask it to the localized `INTERNAL_SERVER_ERROR` with a correlated `requestId` — recitation content and driver internals SHALL never leak across the boundary (existing `createGraphqlErrorsFinalizerPlugin` behavior, unchanged by this ticket).

### 2.6 GraphQL & Frontend Contracts (REQ-060 … REQ-065)

- **REQ-060 (Mutation signature):** The mutation SHALL register as `setSessionRecitation(sessionId: ID!, input: SessionRecitationInput!): SessionRecitation!` (module `backend/graphql/mutation/classes/recitation.mutation.ts`, CREATE; barrel updated at `backend/graphql/mutation/classes/index.ts`) — non-nullable return (a successful call ALWAYS returns the created row), resolved through `RecitationRecordService.setSessionRecitation(ctx.user.id, Number(args.sessionId), { name: args.input.name, description: args.input.description ?? null }, ctx.locale)` under the REQ-031 governance-aware flow.
- **REQ-061 (Query signature):** The query SHALL register as `sessionRecitation(sessionId: ID!): SessionRecitation` (NULLABLE payload — the collapse channel, mirroring `sessionById`'s nullable pattern at `backend/graphql/query/classes/session-lifecycle.query.ts:43-60`) in `backend/graphql/query/classes/recitation.query.ts` (CREATE; barrel updated at `backend/graphql/query/classes/index.ts`).
- **REQ-062 (Pothos object contract):** `SessionRecitationPothosObject` (CREATE at `backend/graphql/pothos/classes/recitation.pothos.ts`; barrel updated) SHALL expose, in order: `id: ID!` FIRST (Apollo cache normalization), `sessionId: ID!`, `name: String!`, `description: String` (nullable), `createdAt: DateTime!`, `updatedAt: DateTime!`. Timestamps SHALL use the registered `DateTime` scalar (NEVER hand-serialized `.toISOString()` into `String` fields); the input type `SessionRecitationInput` SHALL carry exactly `name: String!` + `description: String`. `sessionId` uses the builder's `ID!` — NO `Int` coercion shortcuts at the boundary.
- **REQ-063 (Scope declarations + allowlist hygiene):** Both fields SHALL carry their REQ-030 scope declarations and SHALL NOT appear in the public-operations allowlist (`backend/lib/gateway/public-operations.ts` stays byte-identical — the surface is authenticated-by-design). Under the Pothos scope plugin: anonymous → `UNAUTHORIZED`; authenticated non-teacher on the mutation → `FORBIDDEN`; any common-role caller on the query passes the scope and is handed to the service's collapse rule.
- **REQ-064 (Codegen sync + frozen-inventory extension):** WHEN the surface lands THEN `bun run generate:gqlSchema && bun run codegen` SHALL run in the same commit; the committed generated SDL SHALL match the built schema byte-for-byte; and the frozen baseline inventories in `backend/graphql/test/schema-surface.test.ts` and `backend/graphql/test/sdl-static-assertions.test.ts` SHALL be EXTENDED deliberately (new entries: fields `setSessionRecitation` / `sessionRecitation`, types `SessionRecitation` / `SessionRecitationInput`) — never by mutating historical pins, only by additive registration, with a matching projection in the SDL text assertions.
- **REQ-065 (Frontend shared documents — consumable, no view):** The plan SHALL create `frontend/graphql/sharedDocuments/scheduling/recitation.documents.ts` exporting `sessionRecitationQueryDocument` and `setSessionRecitationMutationDocument` as `TypedDocumentNode`s (id selected FIRST in the payload selections), extend the barrel chain (`frontend/graphql/sharedDocuments/scheduling/index.ts` + top-level `frontend/graphql/sharedDocuments/index.ts`), add a naming/typing contract test, and SHALL NOT touch `frontend/providers/apollo/apolloCache.ts` (SessionRecitation is an id-bearing entity — normal normalization applies; no `keyFields: false` registration) and SHALL ship NO page/view/nav change (per non-goal 3).

### 2.7 Test Coverage (REQ-070 … REQ-074)

- **REQ-070 (Repository four-tier suite):** The plan SHALL create `backend/db/repo/classes/__tests__/recitation.repository.test.ts` alongside the existing `session.repository.test.ts` pattern — covering insert success + read-back (t: both tx and cold `queryDb` branches), `findBySessionId` hit/miss, 23505 propagation RAW to the caller, sibling-session isolation, and a concurrent double-insert race under committed fixtures proving exactly one winner. All tests SHALL use `runInRollback`, propagate `tx` to every call, and use `expectRepoError` (never `expect(...).rejects.toThrow()`).
- **REQ-071 (Service four-tier suite):** The plan SHALL create `backend/services/classes/recitation.service.test.ts` in the `session-lifecycle.service.test.ts` tradition: happy paths for write + read; the full denial MATRIX with byte-exact `DomainError` classes + codes (`VALIDATION`, `FORBIDDEN`, `SESSION_NOT_FOUND`, `RECITATION_SESSION_NOT_WRITEABLE`, `RECITATION_ALREADY_EXISTS`); boundary fuzz on name (0/1/255/256 chars, unicode/RTL, whitespace-only) and description (null vs empty vs 2000/2001); governance fuzz (deleted/blocked/suspended/absent caller); ownership fuzz (foreign teacher ≡ nonexistent session); status fuzz (scheduled/cancelled rejected; started/completed/disputed admitted); concurrent same-session double-write → exactly one winner; write-purity oracles (zero writes to every sibling table); zero-notification + zero-log happy-path assertions; `logger.logDomainError` spy counts per denial (one bounded call each).
- **REQ-072 (Wire GraphQL matrix):** The plan SHALL create `backend/graphql/test/recitation-record.wire.test.ts` over the LIVE HTTP stack (per the `session-lifecycle-mutations.test.ts` / `parent-link.wire.test.ts` pattern): anonymous UNAUTHORIZED on both ops; role matrix (student / parent / foreign teacher on the mutation → FORBIDDEN pre-resolver); BOPLA smuggle probes (`userId`/`sessionOwnerId`/`teacherId` on the input OR args → `GRAPHQL_VALIDATION_FAILED`); malformed `sessionId` wire shapes → `VALIDATION`; foreign-vs-nonexistent byte-identical collapse proof on the read; happy-path wire ≡ service oracle; localization proofs (en/ar denials carry their own copy).
- **REQ-073 (Cross-actor journey — test-first):** The plan SHALL write `test/workflows/sessions/recitation-record.journey.test.ts` FIRST (BEFORE the service surface is implemented), using the existing journey helpers (`test/workflows/helpers/` — referenced by `backend/graphql/test/session-lifecycle-mutations.test.ts:9-15` for cast building and fixture cleanup), with committed fixtures, HARD-DELETES in `afterAll`, NO `runInRollback` around service calls, real role resolution for every actor, and the notification boundary spied (the journey asserts ZERO publishes occur on every recitation step).
- **REQ-074 (Schema/codegen pins + type conformance):** The plan SHALL extend `backend/graphql/test/schema-surface.test.ts` (field sets + type inventories), `backend/graphql/test/sdl-static-assertions.test.ts` (the frozen SDL arrays — additively), include a documents-contract coverage test for the two shared documents (id-first, variables surface = `sessionId` on the query and `sessionId`,`input` on the mutation — ZERO identity variables), and a type-conformance `.test-d.ts` for the new canonical types (e.g. exhausting `SessionRecitationSubmitInput` keys and asserting `RecitationReturnType` parity with the schema row).

### 2.8 Documentation & Knowledge Gates (REQ-080 … REQ-081)

- **REQ-080 (Canonical doc):** The plan SHALL create `docs/sessions/recitation-record.md` as the canonical reference for the write-once recitation record: the C.5 binding, the write-once + unique-arbiter rule, the collapse read, the write-acceptance status window, governance and oracle rulings, the error-code table, and consumer obligations for DEV3-006 / DEV2-014 / DEV1-016 / DEV3-021 (import-by-reference — never a second writer, never a direct table read).
- **REQ-081 (Knowledge propagation targets):** The completion task SHALL update the layer AGENTS.md files for the touched layers (`backend/db/repo/AGENTS.md`? NO — only docs pointers change under the layer-rule policy; concrete edits: `backend/services/AGENTS.md`, `backend/graphql/AGENTS.md` if new surface rules arise, root `AGENTS.md` Important References, plus `docs/sessions/session-lifecycle.md` consumer table amended to mark DEV3-007 DELIVERED) and record every deferred item in `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/deferred-items.md` (the write-once→update surface decision and the parent-portal/admin read consumers are recorded there).

### 2.9 Cross-Actor Workflow Scenarios (Journeys) — MANDATORY

This feature spans teacher (writes) and student (reads) over the shared recitation row, plus foreign observers and administrative non-participants — the journey tier `test/workflows/sessions/recitation-record.journey.test.ts` maps 1:1 to this section.

**Actor Table:**

| Actor | Role | Can Do | Cannot Do |
|---|---|---|---|
| Owning Teacher | `teacher` (session.teacher_id = self) | Write the recitation record (once) for a session they own (started/completed/disputed); read it back | Write twice; write for a session they do not own; write for a scheduled/cancelled session; mutate any sibling entity |
| Student | `student` (session.student_id = self) | Read the recitation record of their own session | Write any recitation (`FORBIDDEN` pre-resolver); read another student's session recitation (collapses to `null`) |
| Foreign Teacher | `teacher` | — | Write on a foreign session (`SESSION_NOT_FOUND`, indistinguishable from nonexistent); read a foreign session's recitation (`null`) |
| Parent | `parent` (not a session participant) | — | Write (`FORBIDDEN` pre-resolver); read the child's session recitation via this surface (`null` — parent-portal reads ship in DEV1-016) |
| Admin | `admin` (non-participant) | — | Write (`FORBIDDEN` pre-resolver); read via this surface (`null` — admin review ships in DEV3-021) |
| Anonymous | — | — | Everything (`UNAUTHORIZED` pre-resolver) |

**Ordered Step List (actor → action → shared-state + side effects):**

1. Teacher (owner) → `RecitationRecordService.setSessionRecitation` on a started session → ONE recitation row created; ZERO notifications; ZERO audit rows; ZERO writes anywhere else.
2. Student (participant) → `getSessionRecitation` → observes the stored record verbatim (read-through).
3. Teacher (owner) → repeat write → `RECITATION_ALREADY_EXISTS`; the original row is byte-identical.
4. Foreign student → `getSessionRecitation` on the SAME session id → observes `null` — never learns the row exists.
5. Foreign teacher → write on the SAME session id → `SESSION_NOT_FOUND` (byte-identical to nonexistent).
6. Parent → read the same session id → `null`; parent → write → `FORBIDDEN` (role gate).
7. Governed teacher (suspended mid-flight) → write → `FORBIDDEN` at the service re-check, zero rows.
8. Race: two concurrent owner writes → exactly one row, exactly one `RECITATION_ALREADY_EXISTS` loser, no partial state.

**Cross-Actor EARS criteria (observer-perspective):**

- WHEN the owning teacher writes the recitation record of a started session THEN the system SHALL persist EXACTLY ONE row in `recitation` AND the student participant SHALL observe the record's `name` and `description` verbatim on the very next read.
- WHEN the owning teacher attempts a SECOND write on the same session THEN the system SHALL answer `RECITATION_ALREADY_EXISTS` AND the student SHALL still observe the ORIGINAL record unchanged.
- WHEN any non-participant (foreign student, foreign teacher, parent, admin) reads the recitation of this session THEN the system SHALL return `null` — byte-identical to the answer for a session id that never existed.
- WHEN the student calls the write mutation THEN the system SHALL deny with `FORBIDDEN` BEFORE any resolver body runs.
- WHEN the teacher writes while suspended THEN the system SHALL deny with `FORBIDDEN` AND leave zero rows anywhere.
- IF two write calls race on one session THEN the system SHALL land exactly ONE row, deny the loser with `RECITATION_ALREADY_EXISTS`, and BOTH participants (teacher owner + student) SHALL observe the same single stored record afterwards.

---

## 3. System Decisions & State Machine Invariants Alignment

### Decision References (docs/specs/open-decisions-and-gaps.md)

- **Decision C.5 (the binding one):** one recitation record per session; `recitation.session_id` UNIQUE FK. This ticket ships the ONLY write/read surface over that contract; the 1:1 constraint is DB-enforced, and the service treats the constraint as the write-once arbiter (REQ-013, REQ-041).
- **B.18 (disputed status):** disputed sessions ARE admissible for recitation recording (REQ-012(c)) — a disputed session happened; its record remains reviewable evidence.
- **A.8 / A.10 (session type / intent):** the write ownership rule keys on `session.teacherId` irrespective of `session_type` — for evaluation sessions the owner IS the evaluator; no type gate exists on the write surface.
- **A.4 (notifications):** this slice emits ZERO notifications; the parent-completion wave is owned elsewhere (non-goal 4).
- **A.5 (audit trail):** this slice emits ZERO audit rows; the audit trail logs *admin* actions, and the recitation writer is never an admin action.

### State Machine & Lifecycle Invariants (docs/specs/state-machine-invariants.md)

- **INV-S4 (both participants NOT NULL)** — the ownership and participant predicates rely on `teacherId`/`studentId` always being present; the read/write flows never mint a session and never mutate these fields (REQ-016).
- **INV-U1 / INV-U5 (governance preserves history)** — recitation records survive governance flips; governed callers are denied WRITE access at the service re-check (REQ-031) without touching existing data; historical reads ARE NOT blocked by governance state of the counterparty.
- **INV-S1 / INV-S2 (terminal session states)** — the lifecycle owns transitions; this ticket only consults status for write admissibility, never writes session state.
- **Wallet family (INV-W*)** and **balance lanes (INV-B*)** — the recitation surface performs ZERO financial writes (REQ-016) and never touches lanes, wallets, or fees.

### Cross-document workflow anchoring

- **Workflow 03 (Session Lifecycle & Escrow)** — recitation evidence hangs off `session`; the write acceptance window (`started | completed | disputed`) follows "a recitation documents what actually happened".
- **Workflow 05 §8 (Data Integrity)** — permanent retention of reports and recitations; hence write-once with NO update/delete surface in this slice.
- **`docs/sessions/session-lifecycle.md` §7 (sensitivity/oracle ruling)** — sessions collapse foreign ≡ nonexistent; this ticket inherits the same collapse for BOTH the mutation denial and the read payload, and §10's consumer guidance is honored: downstream tickets write recitation rows THROUGH this ticket's service, never from the lifecycle.
- **`docs/auth/qiraah-selection-and-c5.md` §8 forward contract** — session-recitation creation lives with session-lifecycle work; the ship ticket is THIS one. Its guards (no user-linked recitation resurrection, no Qira'ah reshaping) are adopted verbatim.
- **`docs/IDEMPOTENCY.md`** — recitation writes are outside the mandated idempotency-key set; repeat writes surface a typed conflict under the unique arbiter (REQ-043).
- **Governance window posture** — the GraphQL context boundary is NOT fail-closed (`createGraphQLContext` never re-checks governance); the write path therefore performs a service-layer governance re-check (REQ-031), matching the session-lifecycle write-side posture (`docs/sessions/session-lifecycle.md` §2.3 INV-U binding).

---

## 4. Cross-Layer Traceability Matrix

| Requirement ID | Decision Ref / Invariant | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|---|
| REQ-001 baseline/ledger | — (process) | — | — | — | `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/outcome/0-baseline-outcome.md` + `deferred-items.md` |
| REQ-002 i18n/enum discipline | A.4? N/A — platform-wide rule | error keys land in `shared/locale/{en,ar}` + types | resolver `ctx.t` usage | no view this ticket | i18n-parity suite (errors namespace) |
| REQ-003 canonical types | C.5 | — | — | — | `backend/types/classes/recitation.types.ts` extended + `*.test-d.ts` conformance |
| REQ-010 schema pin / zero drift | C.5 | — | — | — | `docs/DATABASE_MIGRATIONS.md` push-diff-empty pin in review gate |
| REQ-011 repository primitives | C.5 | `backend/db/repo/classes/recitation.repository.ts` | — | — | `backend/db/repo/classes/__tests__/recitation.repository.test.ts` |
| REQ-012 write pipeline order | C.5 + B.18 | `backend/services/classes/recitation.service.ts` (`setSessionRecitation`) | `setSessionRecitation` mutation | — | `backend/services/classes/recitation.service.test.ts` |
| REQ-013 write-once conflict | C.5 (unique arbiter) | 23505→`ConflictError` translation in `recitation.service.ts` | wire `extensions.code` assertions | dispatcher left untouched (no new row) | service + wire suites |
| REQ-014 participant-only read | session collapse ruling (lifecycle §7) | `RecitationRecordService.getSessionRecitation` | `sessionRecitation` query | — | service + wire oracle suites |
| REQ-015 permanence (no update/delete) | Workflow 05 §8 retention | repository has NO update/delete methods | NO update/delete fields registered | — | locked by scan pins in the SDL suites |
| REQ-016 write-purity | INV-U1/U5 + lifecycle §10 | service purity | — | — | row-count oracles in service test |
| REQ-017 outerTx composition seam | lifecycle §10 consumer guidance | `outerTx` final parameter | resolver passes `undefined` | — | service suite (tx join + fallback) |
| REQ-018 zero notifications/audit | A.4 / A.5 boundaries | — | — | — | `SpiedFanoutTransport` publish count = 0 + audit count oracle |
| REQ-030 role gating | scope-auth `$all` contract (`docs/auth/jwt-authentication-service.md` §2.5) | — | mutation scope map | — | wire matrix |
| REQ-031 governed-caller write denial | governance window posture (realtime §3.10 + lifecycle §2.3) | `assertActorGovernanceClean` reuse | — | — | service governance fuzz |
| REQ-032 BOLA collapse | lifecycle §7 oracle ruling | service predicates (`teacherId`/`studentId` from row) | both ops | — | wire + journey foreign/probe tiers |
| REQ-033 BOPLA closed input | platform BOPLA rule | resolver field-by-field | input type shape | — | smuggle probes (wire) |
| REQ-034 input sanitization boundary | field ceilings | service guards (name ≤255, desc ≤2000) | — | future form helperText projection | service boundary fuzz |
| REQ-035 log hygiene | platform logging rule | `logger.logDomainError` bounded context | — | — | service log-spy tiers |
| REQ-040 atomicity & tx propagation | Drizzle tx rules | `withTransaction` composition | — | — | service rollback purity probe |
| REQ-041 23505 translation | registration §6 precedent / cold-start | `isUniqueViolation` traversal | — | — | service + chaos race test |
| REQ-042 concurrent single-winner | C.5 | repository + service race | — | — | committed-fixture race (chaos) |
| REQ-043 idempotency ruling (no key) | `docs/IDEMPOTENCY.md` out-of-set | no key required; conflict on replay | — | existing error-map convention (dispatcher untouched) | wire repeat-call assertions |
| REQ-050 validation matrix + fields[] | error-handling contract §fields | `ValidationError` + `ApiFieldErrorType` entries | — | future form consumes `fields[]` | service + wire tiers |
| REQ-051 sessionId shape guard | transport guard precedent | `assertPositiveSafeSessionId` reuse | boundary `Number()` coercion | — | service + wire fuzz tiers |
| REQ-052 closed error table + i18n keys | error taxonomy doc | new keys `recitationAlreadyExists` + `recitationSessionNotWriteable` | wire codes pinned | dispatcher untouched | i18n parity + wire matrix |
| REQ-053 boundary masking | error-handling contract §2 | — | finalizer behavior (unchanged) | — | boundary masking tier |
| REQ-060 mutation signature | — | `recitation.mutation.ts` | `setSessionRecitation(sessionId: ID!, input: SessionRecitationInput!): SessionRecitation!` | `setSessionRecitationMutationDocument` | SDL + wire + contract tests |
| REQ-061 query signature | lifecycle §7 collapse | `recitation.query.ts` | `sessionRecitation(sessionId: ID!): SessionRecitation` (nullable) | `sessionRecitationQueryDocument` | SDL + wire + contract tests |
| REQ-062 Pothos object contract | codegen scalar rules | `recitation.pothos.ts` (`SessionRecitation`, `SessionRecitationInput`) | object + input fields: id first, DateTime scalar | — | Pothos/SDL pinning tiers |
| REQ-063 scope declarations + allowlist | gateway default-deny (api-gateway-and-routing.md §4) | — | authScopes assertions | `PUBLIC_OPERATIONS` unchanged | gateway allowlist + surface tests |
| REQ-064 codegen sync + inventory extension | CI drift gate (ci-pipeline.md) | — | generated SDL + gql types | codegen artifacts committed | `schema-surface.test.ts` + `sdl-static-assertions.test.ts` extended |
| REQ-065 shared documents (no view) | sharedDocuments AGENTS + apolloCache policy | — | — | `frontend/graphql/sharedDocuments/scheduling/recitation.documents.ts` + barrels | documents-contract suite; apolloCache untouched |
| REQ-070 repo suite | drizzle/transaction rules | repo file under test | — | — | repo suite GREEN |
| REQ-071 service suite | — | service file under test | — | — | service suite GREEN |
| REQ-072 wire matrix | gateway rules | — | wire endpoints | — | wire suite GREEN |
| REQ-073 journey test-first | docs/testing/workflow-journey-tests.md | — | — | — | `test/workflows/sessions/recitation-record.journey.test.ts` GREEN |
| REQ-074 SDL + codegen + types pins | codec drift gate | — | schema files | `sharedDocuments` contract tests | SDI/SDL suites GREEN |
| REQ-080 canonical doc | — | — | — | — | `docs/sessions/recitation-record.md` |
| REQ-081 knowledge propagation | propagation protocol | — | — | — | AGENTS.md + `session-lifecycle.md` consumer-table amendment + ledger entries | |
