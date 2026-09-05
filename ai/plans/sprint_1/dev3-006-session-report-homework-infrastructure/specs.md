# Requirements & Specification: DEV3-006 — Session Report & Homework Infrastructure

**Feature slug / plan directory (verbatim):** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure`
**Self-reference discipline:** every header, task 0.1, and the deferred-items ledger path in the downstream plan/tasks docs MUST use this exact string.
**Plan ledger path:** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/deferred-items.md`
**Outcome directory:** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/`

---

## 1. Executive Summary & Problem Statement

### Feature
DEV3-006 ships the **session report & homework infrastructure** for the Kottab LMS P2P teaching model: the guarded write path and participant read path over the pre-existing `reports` and `home_work` tables (both landed in DEV1-001's foundational schema: `backend/db/schema/classes/reports.ts`, `backend/db/schema/classes/home-work.ts`). A report record carries `teacher_notes` + `student_rating_by_teacher` (0–5); a homework record carries Jadid (new memorization) and Madi (review) assignment fields — ayah ranges, grades (0–100), and `surah_juz_ref` enum references (decision B.11). Reports reach the teacher **via the session row only** (`reports.session_id → session.teacher_id`; the redundant `reports.teacher_id` was eliminated by decision C.4). This ticket is the **infrastructure layer**: repositories, canonical types, the guarded service, the GraphQL surface, and the notification seam. The full teacher submission UX flow is owned downstream by DEV2-014 (recorded consumer contract).

### Problem from user perspective
- **Teacher (Certified Sheikh):** after marking a session complete, the teacher must record what happened — performance notes, a rating of the student, the grade for the previous assignment, and the next assignment (Jadid + Madi). Today there is no callable surface: the tables exist but nothing writes or reads them, so Workflow 03's "Submit Session Report" step is unwired.
- **Student:** needs to see the report and know their next homework assignment; cross-teacher continuity (Workflow 03 §4.2) demands the assignment live on a durable row readable regardless of which teacher sees the student next.
- **Parent:** expects a notification when a linked child's session completes *and* its report exists (Workflow 04 §6 trigger).
- **Admin:** reviews reports during dispute resolution (Workflow 03 §7) — the rows must be trustworthy, permanently retained, and never authored by anyone but the owning teacher.
- **Downstream developers (DEV2-014, DEV1-016/017, DEV3-012/013):** need one canonical guarded primitive they can compose, so that INV-S7 (report only on `completed` sessions), INV-S8 (homework only with a report), and INV-HW1..HW4 are **structurally** enforced rather than re-litigated per consumer.

### Business value
Reports and homework are the pedagogical spine of the platform (Workflow 03 §4–§5): they carry grading, homework chaining across non-dedicated teachers (the P2P anti-disintermediation model), and the evidence base for admin dispute arbitration (B.18) and teacher re-evaluation (Workflow 01). Without this infrastructure, dual confirmation (DEV3-012) has nothing to confirm *against*, and the escrow release has no pedagogical evidence trail.

### Actors involved
| Actor | Role here |
|---|---|
| Certified Teacher (owning the session) | Submits report + homework; reads them |
| Student (session participant) | Reads report + homework; observes notifications |
| Parent (linked via `students.parent_id`) | Receives the completion-report notification (INV-P3 surface); **no** report read surface here (DEV1-016 owns the portal) |
| Admin / foreign teachers / unlinked parents | Denied — oracle-collapsed reads, role/state denials on writes |
| Downstream consumers | DEV2-014 (submission UX), DEV2-015 (Surah/Juz tracking UI), DEV1-016/017 (parent portal + display), DEV2-017 (rating aggregation), DEV2-019 (admin academic tracking) |

### Non-goals (explicitly OUT of scope)
- **Teacher-facing submit/edit UI pages and report browsing UI** — owned by DEV2-014 (workflow: report submission flow). This ticket ships the wire contract consumable; no views/pages are built.
- **Parent monitoring portal reads** (`sessionReport` visibility for parents via `students.parent_id` authorization) — DEV1-016's surface. Parents here receive notifications only.
- **Homework grading UX, first-vs-subsequent-session grading choreography UI** — DEV2-014/DEV2-015.
- **Aggregating `teacher.average_rating` from `reports.student_rating_by_teacher`** — DEV2-017 owns the aggregation; this ticket stores the per-session rating verbatim (INV-E4's substrate).
- **Session status transitions** (complete/start/cancel/dispute) — DEV3-004 shipped them; this ticket consumes `session.status` read-only as its gate input.
- **Escrow / wallet / balance writes** — INV-S3: zero `teacher_transaction`/`wallet` writes here; the report submission does not release the hold (DEV3-012/013 own release).
- **Recitation row creation** (1:1 session → recitation) — DEV3-007 (C.5).
- **`progress` (Tajweed curriculum) updates** — DEV1-011 (FR-6.3).
- **Schema greenfielding** — `reports` and `home_work` exist; this ticket *verifies and minimally amends* (push-only), never re-creates.

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation (MANDATORY)

- **REQ-001 (Pre-Implementation Baseline & Ledger):** WHEN implementation begins THEN system SHALL record baseline error counts (`tsgo`, `biome:check`, `lint-service`, `oxlint`) into `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/0-baseline-outcome.md` AND initialize `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md`.
- **REQ-002 (Type-Safe i18n & Enum Value Imports Compliance):**
  - Client components MUST use `useAppTranslation(<NamespaceHandle>)` with `defineNamespace` handle consts and property access (`t.property`), never string literals, never a `Translation` enum (it does not exist), never function calls `t('key')`.
  - Server components MUST use `getTranslations(locale)` (single argument, full `Translations` tree) and property access.
  - Services MUST use `getServerTranslations(locale)` (one argument) from `@/shared/locale/server-graphql`.
  - GraphQL resolvers MUST use `ctx.t("namespace")`.
  - All enum usages in runtime expressions/casts (`SessionStatus`, `SurahJuzRef`, `NotificationType`, `UserRole`) MUST use value imports (not `import type`) and enum **members**, never raw string literals.
  - New i18n keys land in the existing flat `errors` namespace convention (domain-prefixed flat keys, e.g. `reportAlreadyExists`) and the domain notification copy slots in the existing `notifications` namespace; en/ar parity is mechanically pinned by the namespace parity suites.
- **REQ-003 (Canonical Types Discipline):** All entity types MUST come from `backend/types/classes/report.types.ts` and `backend/types/classes/home-work.types.ts` — extending the existing `ReportSelectType`/`ReportInsertType` and `HomeWorkSelectType`/`HomeWorkInsertType` (both modules exist with only the Select/Insert pair today — VERIFY and extend in place) with `ReportReturnType`, `ReportSubmitInput`, `HomeWorkReturnType`, `HomeWorkAssignInput`/`HomeWorkGradeInput` as needed. No local type definitions in Pothos resolvers; no service-layer `.types.ts` files.

### 2.2 Core Feature Logic / Happy Paths

- **REQ-010 (Report repository):** WHEN the plan author builds the data layer THEN system SHALL expose `backend/db/repo/classes/report.repository.ts` with: `insertReport(insert: ReportInsertType, tx)` (single INSERT … RETURNING), `findBySessionId(sessionId, tx?)` (single parameterized read), and a guarded one-report-per-session insertion strategy (see REQ-040). Every method accepts `tx` last and propagates it.
- **REQ-011 (Homework repository):** WHEN the plan author builds the data layer THEN system SHALL expose `backend/db/repo/classes/home-work.repository.ts` with: `insertHomeWork(insert: HomeWorkInsertType, tx)` , `findBySessionId(sessionId, tx?)`, `findLatestUngradedByStudentId(studentId, tx?)` (reads the newest homework row belonging to the student's earliest prior completed session, via `home_work → session.student_id`, newest-first), and `gradeHomeWorkOnce(id, grades, tx)` — a guarded `UPDATE … SET current_grade = ?, revision_grade = ?, updated_at = now() WHERE id = ? AND current_grade IS NULL AND revision_grade IS NULL RETURNING *` so a grade is written **exactly once** (INV-HW4's "grade the previous assignment once" window).
- **REQ-012 (Report submission gate — INV-S7 + ownership):** WHEN a caller submits a session report THEN the service SHALL: (1) assert the caller is an authenticated `UserRole.Teacher`; (2) re-verify the caller's governance state service-side (deleted/blocked/suspended ⇒ `FORBIDDEN`, mirroring the session-lifecycle governance re-check pattern in `backend/services/classes/session-lifecycle.governance.ts`); (3) read the session row inside the transaction and assert `session.teacherId === ctx.user.id` (non-owning teacher ⇒ constant oracle shape, REQ-030); (4) assert `session.status === SessionStatus.Completed` (scheduled/started/cancelled/disputed ⇒ typed denial). All four assertions precede any write.
- **REQ-013 (Atomic report + homework co-creation — INV-S8):** WHEN a report submission is valid THEN system SHALL write the `reports` row AND, when the input carries a homework assignment, the `home_work` row **inside ONE `withTransaction` unit** with `tx` propagated to every repository call. IF any write fails THEN the transaction SHALL roll back leaving zero `reports`/`home_work` rows. A homework row SHALL never exist without a report row for the same session (INV-S8) — the write path makes the orphan state structurally unreachable.
- **REQ-014 (Homework assignment payload — Jadid & Madi):** WHEN homework is assigned THEN the input SHALL carry the Jadid block (`currentFromAyah`, `currentToAyah`, `currentSurahJuz`) and the Madi block (`revisionFromAyah`, `revisionToAyah`, `revisionSurahJuz`) as optional cohesive blocks; system SHALL validate: `from ≤ to` when both ayah endpoints are present, ayah numbers are positive safe integers, and Surah/Juz values are members of the SHIPPED `SurahJuzRef` enum (`backend/enum/shared/surah-juz-ref.enum.ts` — 5 surah examples + 30 juz; values outside the enum are rejected `VALIDATION` pre-DB). **The enum is enum-complete as shipped; widening to all 114 surahs is NOT this ticket** (record in deferred ledger).
- **REQ-015 (First-session vs subsequent-session grading — INV-HW3/HW4):** WHEN the submission carries grade values THEN system SHALL route them to the student's **prior ungraded** homework row (via `findLatestUngradedByStudentId`) using the one-shot guarded update of REQ-011; the newly assigned row's own grade columns SHALL remain unset at assignment time. IF the grade columns in `backend/db/schema/classes/home-work.ts` are NOT NULL today THEN the plan SHALL relax them to nullable via `bun run db push` (schema delta, push-only discipline per `docs/DATABASE_MIGRATIONS.md`) before implementing this requirement, because assignment-without-grade (INV-HW3) requires NULL grades. WHEN no prior ungraded homework exists (true first session) THEN the submission SHALL carry no grades and the grade-routing step SHALL no-op (never an error).
- **REQ-016 (Rating & note validation):** WHEN a report is submitted THEN system SHALL validate pre-DB: `studentRatingByTeacher` is an integer in `0..5`; `teacherNotes` is a non-empty-after-trim string of at most 2000 characters; homework grades, when present, are integers in `0..100`. All denials are localized `ValidationError` (422) with the `VALIDATION` code and zero DB writes. The DB CHECK constraints (`reports` 0–5, `home_work` 0–100) remain the backstop; the service never relies on them as the primary error path.
- **REQ-017 (Participant reads):** WHEN a session participant (the session's student OR its teacher) reads a report or homework THEN the system SHALL return the row; WHEN any other caller reads them THEN the system SHALL return **null** — foreign ≡ nonexistent, the DEV3-004 sessions-are-sensitive oracle ruling applied verbatim (no id-enumeration oracle). Reads SHALL perform zero writes (render purity).
- **REQ-018 (Post-submit notification choreography):** WHEN the first report for a session commits THEN the system SHALL, inside the same `withTransaction`, emit via `NotificationEngine.emitForUser` exactly: (a) one notification to the **student** in the student's persisted locale (fallback: platform default), and (b) one notification to the **linked parent** iff `students.parent_id` is non-null for that student (INV-P1 gating — unlinked ⇒ no parent emission), in the parent's persisted locale. Each emission SHALL use `type = NotificationType.SessionCompletion`, `relatedEntityType = "session"`, `relatedEntityId = session.id`, and a deterministic idempotency key `session:{sessionId}:report`. Publishing SHALL happen strictly after the caller's commit via `NotificationEngine.publishReceipts` (publish-after-commit; a rollback ghost-pushes nothing). Replies to the already-reported session SHALL emit nothing.
- **REQ-019 (Copy composition):** WHEN notification copy is composed THEN it SHALL be composed in the **recipient's** persisted locale per the recipient-locale obligation proven by `SessionRequestNotificationService` (`backend/services/classes/session-request-notification.service.ts`), interpolate only counterparty full names, and carry NO ids, grades, or note content in the stored copy (privacy hygiene — the body is a link invite, not a content mirror).

### 2.3 Security, Authorization & Tenancy

- **REQ-030 (BOLA / oracle collapse):** WHEN a non-participant (any teacher not owning the session, any student not in the session, any parent, any admin) requests the report or homework of a session THEN the system SHALL answer with the byte-identical null/NOT_FOUND channel used for a nonexistent session id — no existence disclosure (mirrors `SessionLifecycleService.getSessionById` posture in `backend/services/classes/session-lifecycle.service.ts`).
- **REQ-031 (BFLA):** WHEN a student (or parent, or admin, or anonymous caller) attempts the submission mutation THEN the system SHALL deny pre-resolver with `UNAUTHORIZED` (anonymous) / `FORBIDDEN` (wrong role) via `authScopes: { $all: { authenticated: true, role: [UserRole.Teacher] } }` — the `$all` conjunction is load-bearing — and the service SHALL re-assert teacher identity + ownership + governance inside its own layer (defense in depth; context is NOT fail-closed for governed users — see the governance defense note).
- **REQ-032 (BOPLA):** WHEN the service writes THEN it SHALL map the input field-by-field (never `{ ...input }` spread) into `ReportInsertType`/`HomeWorkInsertType`; session identity and teacher identity come exclusively from the verified session row and `ctx.user.id` — never from input.
- **REQ-033 (Input sanitization):** No LIKE/ILIKE pattern surfaces exist in this feature (no search). Free-text fields (`teacherNotes`) are stored verbatim and rendered inert client-side via React escaping; the validation layer bounds length only. (Recorded so the pentest wave does not flag the absence of `escapeLikeWildcards` — it is N/A by construction here.)
- **REQ-034 (Locked-state write discipline):** WHEN session status is `cancelled` or `disputed` THEN report submission SHALL be denied (cancelled is terminal per INV-S2; disputed is under admin arbitration per B.18/INV-S variants) with the same typed transition-denial shape used for wrong-state denials.

### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-040 (One report per session — race-proof):** WHEN two submissions race for one session THEN exactly one SHALL win. The plan SHALL first VERIFY the actual constraint surface of `backend/db/schema/classes/reports.ts`: IF no unique constraint on `session_id` exists THEN the plan SHALL add `unique` on `reports.session_id` via `bun run db push` (a new report embodies one session; `session_id` is already the sole FK after C.4) and route the `23505` loser through a cause-chain traversal (the established `isUniqueViolation` pattern) into `REPORT_ALREADY_EXISTS`. The unique constraint is the arbiter; the service never does SELECT-then-INSERT as its guard.
- **REQ-041 (Single transaction, total rollback):** WHEN submission executes THEN report creation, homework assignment, prior-homework grading, and in-tx notification rows SHALL share ONE `withTransaction` unit; a forced mid-unit failure leaves zero `reports`, zero `home_work`, zero `notifications` rows and zero publishes (proven by test).
- **REQ-042 (tx propagation):** WHEN any repository or engine call executes inside the flow THEN it SHALL receive the unit's `tx` (no `db` fallback inside the transactional path).
- **REQ-043 (Idempotency ruling):** Repeat submission (network retry, double-click) SHALL resolve to the same `SESSION_REPORT_ALREADY_EXISTS` conflict via REQ-040's arbiter — no separate idempotency-key table (notification emissions are themselves claim-keyed per REQ-018 so the engine's replay discipline holds for the side-effect).
- **REQ-044 (Hold/wallet purity):** WHEN the submission completes THEN system SHALL perform ZERO writes to `students` balance lanes, `session.fee_held`, `wallet`, or `teacher_transaction` (INV-S3: earnings only on dual confirmation; hold release is DEV3-012/013's).

### 2.5 Validation & Error Contracts

All rejections are `DomainError` subclasses; custom codes ride the verified two-arg `ConflictError(code, message)` overload or `NotFoundError("SESSION", …)`; error text is localized via the flat `errors` namespace; one bounded `logger.logDomainError` per denial (`{ code, entity, entityId, locale }`); happy paths log nothing.

| Scenario | Class | `extensions.code` |
|---|---|---|
| Anonymous caller | scope `$all.authenticated` | `UNAUTHORIZED` |
| Non-teacher caller | scope `role` / service re-check | `FORBIDDEN` |
| Governed teacher | service re-check | `FORBIDDEN` |
| Malformed session id (non-positive, non-safe-int) | `ValidationError` pre-DB | `VALIDATION` |
| Unknown / foreign session id (writes AND reads) | `NotFoundError("SESSION", …)` or null read | `SESSION_NOT_FOUND` / `null` |
| Session not `completed` | `ConflictError` two-arg custom code (reuse the lifecycle's `SESSION_INVALID_TRANSITION` code — do NOT mint a synonym) | `SESSION_INVALID_TRANSITION` |
| Report already exists for the session | `ConflictError` custom code | `SESSION_REPORT_ALREADY_EXISTS` |
| Rating outside 0–5 / notes empty / notes > bound / grade outside 0–100 / bad ayah pair / unknown SurahJuzRef | `ValidationError` | `VALIDATION` |
| Unexpected internals | boundary mask | `INTERNAL_SERVER_ERROR` |

The taxonomy stays within the closed system of `docs/graphql/domain-error-extensions-code.md`; the only NEW code is `SESSION_REPORT_ALREADY_EXISTS`.

### 2.6 GraphQL & Frontend Contracts

- **REQ-050 (Pothos objects):** `SessionReportPothosObject` and `SessionHomeWorkPothosObject` in `backend/graphql/pothos/classes/`, each exposing `id: ID!` FIRST (Apollo normalization), timestamp fields via `type: "DateTime"` (the registered scalar — no `toISOString()` into String), and enum fields (`currentSurahJuz`, `revisionSurahJuz`) typed as the Pothos `SurahJuzRef` enum, which SHALL be registered ONCE (new) in `backend/graphql/pothos/shared/enum.pothos.ts` via the enum-object form mapped from `SurahJuzRef`. The exhaustive DB-string → enum mapper discipline of `session.pothos.ts` (`toSessionStatus` pattern with the `never` tail) applies.
- **REQ-051 (Mutation):** `submitSessionReport(id: ID!, input: SubmitSessionReportInput!): SessionReport!` — `id` is the session id; the input is a closed whitelist (`teacherNotes`, `studentRatingByTeacher`, optional `homework` block with the REQ-014 fields, optional `previousGrades` block with `currentGrade`/`revisionGrade`). No server-derivable field appears in the input.
- **REQ-052 (Queries):** `sessionReport(sessionId: ID!): SessionReport` (nullable) and `sessionHomework(sessionId: ID!): SessionHomeWork` (nullable) — participant-scoped null-collapse per REQ-017/REQ-030.
- **REQ-053 (Codegen + surface freeze):** after implementing, run `bun run generate:gqlSchema` + `bun codegen`, pin the new types/fields/enum in `backend/graphql/test/schema-surface.test.ts` baseline inventory, and pin the SDL in the session SDL suite (`backend/graphql/test/session-sdl.test.ts`-style static assertions where applicable).
- **REQ-054 (Frontend documents):** `frontend/graphql/sharedDocuments/scheduling/session-report.documents.ts` with `TypedDocumentNode`s for the mutation and both queries — `id` selected FIRST in every object selection; embedded-page envelopes (if any) registered `keyFields: false` in `frontend/providers/apollo/apolloCache.ts`. **No UI views/pages in this ticket** (DEV2-014 consumes); documents are the consumable contract.
- **REQ-055 (MUI v9):** any touched frontend file obeys `sx`-only styling, `*Outlined` icon names, theme-palette colors, `React.SyntheticEvent<HTMLFormElement>` (no `FormEvent`).

### 2.7 Test Coverage

- **REQ-060 (Repository suites):** `backend/db/repo/classes/__tests__/report.repository.test.ts` + `home-work.repository.test.ts` — 100% statement/branch on new code, all inside `runInRollback`, `tx` propagated, `expectRepoError` try/catch (never `rejects.toThrow`), fixtures from `backend/db/test/entity-setup.ts` (never seed reads). Covered: insert + unique-race 23505, guarded one-shot grade update (idempotent-miss branch), prior-homework newest-first selection across multiple sessions.
- **REQ-061 (Service suite):** four tiers (branch, boundary, chaos/fuzz, security) against the real test DB via `runInRollback`: gate matrix (REQ-012's four assertions, each denial leaving zero writes), first-session vs subsequent-session grading routing, malformed input sweep, concurrent double-submit storm (exactly one winner, one report row, one notification set).
- **REQ-062 (Journey, test-first):** `test/workflows/classes/session-report-homework.journey.test.ts` — see §2.9. Committed fixtures + tracked `afterAll` hard-delete, NO `runInRollback`, notification fan-out spied via `SpiedFanoutTransport` (helpers already exist under `test/workflows/helpers/`), authorization resolved through real roles. Written BEFORE the service surface is implemented.
- **REQ-063 (GraphQL wire suite):** scope-matrix tests (401/403 pre-resolver), closed-input smuggle probes, id-shape fuzz, wire≡service payload equality, null-collapse byte-identity for foreign vs nonexistent reads, single-error envelope parity.
- **REQ-064 (Coverage target):** 100% statement/branch on ALL new service/repo/helper code; codegen drift zero.

### 2.8 Documentation & Knowledge Gates

- **REQ-070 (Canonical doc):** `docs/sessions/session-report-homework.md` — the canonical reference (gate invariants, co-creation contract, first-vs-subsequent grading ruling, notification choreography, oracle ruling, consumer table) following the house doc style (Why → Pattern → Rules → What NOT to Do → Rollout Summary → Related Documents).
- **REQ-071 (AGENTS.md updates):** `backend/db/repo/AGENTS.md` (classes repositories), `backend/services/AGENTS.md` (report service + single-writer notifications discipline), `backend/types/AGENTS.md`, `backend/graphql/AGENTS.md` (new enum registration + objects), `shared/AGENTS.md` (namespace additions), root `AGENTS.md` Important References one-line pointer.
- **REQ-072 (Consumer-doc amendment):** `docs/sessions/session-lifecycle.md` §10 consumer table SHALL be amended: INV-S7/S8 enforcement has landed in this surface (remove the "DEV3-005-owned" forward note for the report/homework seam), and `docs/sessions/session-lifecycle.md`'s report row gains the "implementation shipped" citation.

### 2.9 Cross-Actor Workflow Scenarios (Journeys)

#### Actor Table

| Actor | Role | Can Do | Cannot Do |
|---|---|---|---|
| Owning Teacher (certified, session owner) | `teacher` | submit report + homework on their COMPLETED session; read report/homework | submit on scheduled/started/cancelled/disputed sessions; submit a second report; re-grade already-graded homework |
| Session Student | `student` | read the report/homework of their session; receives notification | submit a report (role-gated); touch grades |
| Linked Parent (`students.parent_id ≠ null`) | `parent` | receive the completion-report notification | read report/homework (null collapse until DEV1-016); receive anything when unlinked |
| Foreign Teacher | `teacher` | nothing on this session | submit (ownership denial); read (null collapse) |
| Admin | `admin` | nothing via this surface (governance reads are DEV3-021's) | submit (role denial); participant reads (null collapse) |
| Anonymous | — | nothing | UNAUTHORIZED pre-resolver |

#### Ordered Step List

1. **Fixture setup (committed):** certified teacher T, student S, linked parent P, session σ in `completed` status (provision via service-level completion, not raw row surgery where feasible).
2. **Foreign Teacher → submit on σ →** typed ownership denial; zero rows, zero notifications.
3. **Student S → submit attempt →** `FORBIDDEN` (role gate + service re-check); zero side effects.
4. **Owning Teacher T → submit invalid payload (rating 7, empty notes) →** `VALIDATION` ×N pre-DB; zero writes.
5. **Owning Teacher T → submit valid report + Jadid/Madi assignment (first session, no grades) →** `reports` row + `home_work` row in ONE commit; **student S AND linked parent P each observe exactly one notification** (spied transport), each in their own persisted locale; previous-homework grading no-ops.
6. **Owning Teacher T → RESULT of step 5, resubmit same →** `SESSION_REPORT_ALREADY_EXISTS`; zero new rows, zero new notifications.
7. **Student S → read report/homework of σ →** rows returned (cross-actor visibility asserted).
8. **Linked Parent P → read attempt →** null collapse (byte-identical to foreign read).
9. **Second session σ₂ completed (subsequent session) → T submits report + new assignment + grades for the σ homework →** σ's homework row graded exactly once (guarded UPDATE), σ₂'s assignment row created with NULL grades.
10. **T → re-grade attempt for σ's homework →** guarded update matches zero rows; typed conflict (grade is write-once).
11. **Forced mid-transaction failure (chaos):** report insert succeeds, then force homework insert failure → whole unit rolls back: zero `reports`/`home_work`/`notifications` rows, zero publishes.

#### Cross-Actor EARS Criteria (observer-phrased)

- WHEN the owning teacher submits a valid report for a completed session THEN system SHALL persist the report and homework atomically AND the student SHALL observe the report via his read surface AND the student SHALL receive exactly one notification in his locale.
- WHEN the student is linked to a parent THEN the parent SHALL receive exactly one notification AND never gain read access through this surface.
- WHEN a non-owning teacher or non-participant student attempts submission THEN system SHALL reject it AND the student and parent SHALL observe zero state change and zero notifications.
- WHEN a report already exists THEN a repeat submission SHALL fail with `SESSION_REPORT_ALREADY_EXISTS` AND the student SHALL observe NO second notification.
- WHEN a subsequent session's report carries grades THEN the PRIOR assignment's row SHALL bear the grades AND the newly created assignment row SHALL remain ungraded (the student observes an ungraded new assignment).
- IF the session is not `completed` THEN the teacher SHALL receive the transition denial AND all observers SHALL see no row and no notification.

---

## 3. System Decisions & State Machine Invariants Alignment

### Decision References (`docs/specs/open-decisions-and-gaps.md`)

| Decision | Binding in this ticket |
|---|---|
| **C.4** (`reports.teacher_id` removed) | The teacher is derived ONLY via `reports.session_id → session.teacher_id`; the schema module is verified to carry no `teacher_id` column and the surface exposes no teacher field without it. |
| **B.11** (Surah/Juz enum) | Homework Surah/Juz fields are validated against the SHIPPED `SurahJuzRef` enum; enum expansion is out of scope (deferred-items row). |
| **B.2 / B.4 (escrow hold)** | Report submission writes nothing financial; `fee_held` untouched; wallet untouched (INV-S3). |
| **B.18** (`disputed`) | Disputed sessions reject report submission (arbitration gate). |
| **A.5** (audit) | No audit rows are written by this surface (non-admin workflow — mirrors the parent-link no-audit ruling); recorded explicitly to forestall reviewer drift. |
| **A.4 / notification engine** | Emissions go through `NotificationEngine` exclusively (single-writer rule); publish-after-commit via receipts. |

### State Machine & Lifecycle Invariants (`docs/specs/state-machine-invariants.md`)

| Invariant | Enforcement in this ticket |
|---|---|
| **INV-S7** (report only on `completed`) | REQ-012 gate 4 — the sole gate for the write surface lands here (the session-lifecycle slice recorded this seam as DEV3-006's); session-lifecycle doc amended accordingly (REQ-072). |
| **INV-S8** (homework only with a report) | REQ-013 atomic co-creation — homework existence without a report for the same session is structurally unreachable through the write path. |
| **INV-HW1** (homework linked to exactly one session) | `home_work.session_id` NOT NULL FK; the insert binds the verified session id only. (Session-uniqueness of homework rows: one assignment row per session is enforced by the flow's single-submission ruling; the plan SHALL verify and document whether a unique constraint exists and add one push-only if absent — recorded verification task.) |
| **INV-HW2** (grades 0–100) | Service validation (REQ-016) + existing CHECK constraints as backstop. |
| **INV-HW3 / INV-HW4** (first session assigns without grading; subsequent sessions grade the previous assignment) | REQ-015 + REQ-011 one-shot guarded grade update. Nullability prerequisite handled per REQ-015's push directive. |
| **INV-S1/S2** (terminal states) | REQ-034: `cancelled`/`disputed`/terminal-target writes denied; `completed` sessions accept a report; INV-S1 (no regression from completed) unaffected since this surface never writes `session.status`. |
| **INV-S3** (earning only on dual confirmation) | REQ-044 — zero financial writes, proven by count-delta oracles in tests. |
| **INV-P1/P3** | REQ-018(b): parent notified iff linked; P3's notification trigger here is "completed ∧ report exists" per Workflow 04 §6. |
| **INV-U-family (governance)** | REQ-012(2) service-layer governance re-check (the GraphQL context is NOT fail-closed; login/SSR gates remain primary). |

**Workflow alignment:** `docs/workflows/03-session-lifecycle-escrow.md` §5 (report structure — this ticket implements exactly that field set), §4 (first vs subsequent session semantics — REQ-015), §6 (notification choreography — REQ-018). Workflow 01 is not touched (evaluation reports reuse this substrate later via DEV2 flows; no special-casing is added here).

---

## 4. Cross-Layer Traceability Matrix

| Requirement ID | Decision / Invariant | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|---|
| REQ-001..003 | — (process) | — | — | — | baseline outcome + plan-review gate |
| REQ-010 | — | `backend/db/repo/classes/report.repository.ts` (NEW) | — | — | repo suite (`runInRollback`) |
| REQ-011 | INV-HW4 | `backend/db/repo/classes/home-work.repository.ts` (NEW) | — | — | repo suite (one-shot grade guard race) |
| REQ-012 | INV-S7, INV-U | `backend/services/classes/session-report.service.ts` (NEW) | `submitSessionReport` | — | service suite tier 1/4; wire 403/401 matrix |
| REQ-013 | INV-S8 | service transaction core | `submitSessionReport` | — | chaos forced-rollback test |
| REQ-014 | B.11 | service validation + repo | `SubmitSessionReportInput` | — | boundary sweep (ayah pairs, enum fuzz) |
| REQ-015 | INV-HW3/HW4 | service grade-routing + repo `gradeHomeWorkOnce`/`findLatestUngradedByStudentId` | input `previousGrades` block | — | service suite; journey steps 9–10 |
| REQ-016 | INV-HW2 | service validators | mutation error surface | — | boundary tier (0/5, 0/100, 2001 chars) |
| REQ-017 | Sessions-oracle ruling | `getSessionReportById` / `getSessionHomeworkById` | `sessionReport` / `sessionHomework` | — | wire null-collapse byte-identity tests |
| REQ-018/019 | INV-P3, A.4 | notification seam inside service + `NotificationEngine` | — (side effect) | — | spied-transport journey assertions; receipt ordering test |
| REQ-030/031/032 | BOLA/BFLA/BOPLA | service re-checks + field-by-field mapping | `$all` scope + closed input | — | wire smuggle + role matrix; chaos probes |
| REQ-040/043 | one-report-per-session | guarded/unique-backed insert + 23505 mapping | `SESSION_REPORT_ALREADY_EXISTS` | — | parallel-submit storm test |
| REQ-044 | INV-S3 | — (write-purity) | — | — | count-delta oracles on wallet/lanes |
| REQ-050..053 | C.4 + scalar/enum rules | — | Pothos objects, enum registration, queries, mutation | documents in `frontend/graphql/sharedDocuments/scheduling/` | schema-surface pin, session-SDL pins, documents contract tests |
| REQ-062 | journeys | — | — | — | `test/workflows/classes/session-report-homework.journey.test.ts` (test-first) |
| REQ-070..072 | — | — | — | — | knowledge-propagation task + docs diff review |

**Explicit ledger pre-seeds for `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/deferred-items.md`:** (D1) `SurahJuzRef` enum completeness (all 114 surahs) — deferred enum-content work, owner: curriculum/content stream; (D2) parent report read surface — DEV1-016; (D3) teacher submission UX — DEV2-014; (D4) rating aggregation to `teacher.average_rating` — DEV2-017; (D5) edit/amend/void a submitted report — not in MVP vocabulary (append-only by design; any future correction flow = compensating new artifacts, never UPDATE of the report truth beyond the one-shot grade seam).
