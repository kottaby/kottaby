# DEV3-006 — Session Report & Homework Infrastructure: Trackable Implementation Tasks

> **Plan directory (verbatim — used in every header, ledger path, outcome path, and self-reference below):** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure`
> **Specs of record:** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/specs.md`
> **Plan of record:** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/plan.md`
> **Deferred-items ledger:** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/deferred-items.md`
> **Outcome directory:** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/`
> **Scope ruling for this ticket:** backend infrastructure + GraphQL surface + frontend **documents only**. NO UI views/pages ship (DEV2-014 owns the submit UX). Therefore: NO `.BF`/`.BS` agent-browser loops, nav changes, or view tasks anywhere in this plan. Phase 4 contains typed documents + contract tests only.

---

## Non-Negotiable Execution Protocol

Every task in this file is executed under the following protocol. ANY deviation invalidates the task's completion claim.

### P1. Pre-Execution Outcome Knowledge Read
Before starting ANY task `X.Y`, the agent MUST read:
1. `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/specs.md` and `plan.md` (freshly, not from memory).
2. ALL files already present under `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/` — especially outcomes of prerequisite tasks.
3. `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/deferred-items.md` — so previously deferred items are not silently re-implemented or re-deferred without ledger entries.

### P2. Post-Edit Verification (Quality Loop)
After EVERY file edit, run:
```bash
bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates
```
Exit code MUST be 0 before the edit is considered applied. This runs tsgo + biome + lint-service + oxlint scoped to the file plus duplicate-detection. Verify-then-claim: only files/symbols referenced after this loop passes may be cited as EXISTING.

### P3. Test Execution Discipline
- Backend/repo/service/journey tests run ONLY via:
  ```bash
  bun run test/scripts/run-test.ts <test-path>
  ```
  (NEVER raw `bun test` — it skips `--env-file=.env.test`.)
- Repository and service-surface unit tests use `runInRollback` (they spawn no own transactions).
- Journey tests (`test/workflows/**`) NEVER use `runInRollback` (services spawn their own transactions): fixtures are committed in `beforeAll`, tracked, and hard-deleted in `afterAll`.

### P4. Semantic Review Self-Check (before marking ANY `[x]`)
Self-review against:
- Single-transaction atomicity where required; `tx` propagated to EVERY repository/engine call inside a unit (no `db` fallback).
- Zero dead code, zero TODO/FIXME/placeholder comments, zero `console.*` (logger only: `@/backend/lib/logger` backend, `@/frontend/lib/logger` frontend).
- No cross-layer imports (`shared/` never imports `@/frontend/**`, `@/backend/**`, `@/app/**`; no service-layer `.types.ts` files — canonical types live in `backend/types/` only; no local types in Pothos resolvers).
- Enums as VALUE imports (not `import type`) wherever used in runtime expressions; enum members, never raw string literals.
- All errors are `DomainError` subclasses with localized messages; exactly ONE bounded `logger.logDomainError` per denial (`{ code, entity, entityId, locale }`); happy paths log nothing.
- i18n contract exactly as shipped: services use `getServerTranslations(locale)` (ONE argument) from `@/shared/locale/server-graphql`; resolvers use `ctx.t("namespace")`; client uses `useAppTranslation(<NamespaceHandle>)`; `ErrorsLabels` is FLAT with domain-prefixed keys.

### P5. Outcome Documentation
On completing task `X.Y`, write `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/X.Y-outcome.md` containing: what was done, files changed, commands run with exit codes, tests run with pass/fail counts, verification evidence (quality-loop outputs, anchors `path:line`), deviations from plan (each either fixed or deferred into the ledger), and residual risks.

### P6. Checkbox Tracking
Flip `- [ ]` → `- [x]` ONLY after P2–P5 fully pass for that line. Subtasks gate their parent: a parent task may not be checked until every subtask is checked. Never batch-check.

### P7. Instruction-File Reality Constraint
The ONLY instruction files that exist are `.agents/instructions/frontend.instructions.md`, `.agents/instructions/backend.instructions.md`, and `.agents/instructions/tests.instructions.md`. Cite ONLY AGENTS.md paths verified to exist in the bundle (e.g. `shared/AGENTS.md`, `frontend/AGENTS.md`, `app/AGENTS.md`, `frontend/graphql/AGENTS.md`, `backend/services/AGENTS.md`, `backend/db/repo/AGENTS.md`, `backend/types/AGENTS.md`, `backend/graphql/AGENTS.md` — re-verify each before citing; `frontend/views/AGENTS.md` and `frontend/components/ui/AGENTS.md` do NOT exist).

---

## Phase 0: Pre-Implementation Baseline

- [ ] 0.1 [Record baseline error counts & initialize deferred-items ledger]
  - Run and capture raw outputs + counts into `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/0-baseline-outcome.md`:
    - `bun run tsgo` (or the repo's configured type-check script — verify script name in `package.json` first)
    - `bun run biome:check`
    - `bun run lint-service`
    - `bun run oxlint`
  - Record each tool's total error/warning count as the pre-implementation floor; every later task must not raise any count above this baseline (any raise must be fixed before check-off, never deferred silently).
  - Create `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md`.

    Ledger pre-seeds (from specs §Traceability — copy verbatim as rows D1–D5):
    - **D1** — `SurahJuzRef` enum completeness (expand 5 surah examples → all 114 surahs). Owner: curriculum/content stream. Status: DEFERRED.
    - **D2** — Parent report read surface (parent `sessionReport`/`sessionHomework` visibility via `students.parent_id`). Owner: DEV1-016 (parent portal). Status: DEFERRED.
    - **D3** — Teacher report submission/browsing UX (submit form, report views). Owner: DEV2-014. Status: DEFERRED.
    - **D4** — Aggregating `teacher.average_rating` from `reports.student_rating_by_teacher`. Owner: DEV2-017. Status: DEFERRED.
    - **D5** — Edit/amend/void semantics for submitted reports (compensating-artifact flow; append-only by design here). Owner: future ticket. Status: DEFERRED.
  - _Requirements: REQ-001_

- [ ] 0.2 [Prerequisite verification — ground-truth gate before any claim]
  - Verify the following exist in the bundled/working codebase; record `path:line` anchors for each in `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/0.2-outcome.md`. Any MISS downgrades the dependent task's assumption and MUST be reconciled against `plan.md` before proceeding:
    - `backend/db/schema/classes/reports.ts` and `backend/db/schema/classes/home-work.ts` (table modules exist).
    - `backend/types/classes/report.types.ts` (`ReportSelectType`/`ReportInsertType`) and `backend/types/classes/home-work.types.ts` (`HomeWorkSelectType`/`HomeWorkInsertType`).
    - `backend/enum/shared/surah-juz-ref.enum.ts` (35 members; no `isSurahJuzRef` guard yet).
    - `backend/db/schema/enums.ts` registers `surahJuzRef` pgEnum.
    - `backend/services/classes/session-lifecycle.governance.ts` — the governance re-check helper consumed by REQ-012(2) (record its exact exported function name; plan calls it `assertActorGovernanceClean` — CONFIRM or adapt).
    - `backend/services/classes/session-lifecycle.service.ts` — the oracle-collapse posture to mirror (record actual anchor).
    - `backend/services/shared/user-provisioning.helpers.ts` — the `isUniqueViolation` cause-chain helper (or its actual home if moved).
    - `backend/services/classes/session-request-notification.service.ts` — recipient-locale copy-composition precedent.
    - `NotificationEngine` (`emitForUser`, `publishReceipts`), `NotificationType.SessionCompletion`, `NotificationEngineCallOptions`, `NotificationDeliveryReceipt` — record their actual module paths.
    - `SessionRepository.findTransitionProbe` (reuse target) in `backend/db/repo/classes/session.repository.ts`.
    - `ConflictError` two-arg `(code, message)` overload availability; `NotFoundError("SESSION", …)` constructor shape; `ValidationError` constructor shape (`backend/errors/` — record actual paths).
    - `docs/graphql/domain-error-extensions-code.md` (taxonomy; confirm `SESSION_REPORT_ALREADY_EXISTS` is not already claimed).
    - `docs/sessions/session-lifecycle.md` §10 consumer table (REQ-072 amendment target).
    - `test/workflows/helpers/` — cast helpers + `SpiedFanoutTransport` + `test/workflows/AGENTS.md` (per invariant 10, these exist; VERIFY, else Phase-2 journey task must scaffold them).
    - `backend/db/test/entity-setup.ts` fixture factory.
    - `scripts/health/sub-loop.ts` per-file instruction discovery — mirror EXACTLY the per-file AGENTS.md mapping it prints (run it once on a known file and paste its discovery output into the outcome).
    - `backend/graphql/test/schema-surface.test.ts` and the session SDL test file (record actual names/paths).
    - `frontend/graphql/sharedDocuments/scheduling/` barrel structure and `frontend/providers/apollo/apolloCache.ts`.
    - Locale machine: `shared/locale/` errors + notifications namespace files (en + ar), their typed interfaces, and the parity-suite harness.
  - Verify DEV3-004's session-lifecycle surface is merged/available on the working branch (this ticket consumes its governance helper, transition probe, and oracle ruling).
  - _Requirements: REQ-001, REQ-002, REQ-003_

---

## Phase 1: Types, Enums & Database Schema

- [ ] 1.1 [Schema verification gate R1–R6 — READ-ONLY, before any schema edit]
  - Read (do not edit) `backend/db/schema/classes/reports.ts` and `backend/db/schema/classes/home-work.ts` bodies and record, with line anchors, in `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/1.1-outcome.md`:
    - **R1:** `reports.session_id` unique-constraint presence/absence (importers show no `unique`/`uniqueIndex` import — CONFIRM against body).
    - **R2:** nullability of `home_work.current_grade` and `home_work.revision_grade` (`.notNull()` present or absent).
    - **R3:** `home_work.session_id` unique-constraint presence/absence.
    - **R4:** `reports` carries NO `teacher_id`/`teacherId` column key (C.4).
    - **R5:** existing CHECK constraints: `reports.student_rating_by_teacher` 0–5; `home_work.*_grade` 0–100.
    - **R6:** `session` probe-row shape consumed (`id`, `status`, `teacherId`, `studentId`) vs `SessionSelectType` in `backend/types/classes/session.types.ts`.
  - Emit the verdict table: for each of R1/R2/R3 mark `{ ADD unique | relax nullable | no-op }` — this verdict drives (and bounds) task 1.2.
  - Note: NO file is modified in this task; it is the verify-then-claim hard gate.
  - _Requirements: REQ-040, REQ-015, INV-HW3, C.4, INV-S8/INV-HW1_

- [ ] 1.2 [Schema amendments — push-only, conditional on 1.1 verdicts]
  - Files (ALL edits conditional on 1.1 verdicts; do not apply a change whose verdict was "no-op"):
    - `backend/db/schema/classes/reports.ts` — if R1 verdict = ADD: add `unique("reports_session_id_unique").on(t.sessionId)` to the table config (update imports accordingly).
    - `backend/db/schema/classes/home-work.ts` — if R2 verdict = relax: make `currentGrade`/`revisionGrade` nullable (remove `.notNull()`); if R3 verdict = ADD: add `unique("home_work_session_id_unique").on(t.sessionId)`.
  - Apply via `bun run db push` ONLY (`docs/DATABASE_MIGRATIONS.md` discipline: `cleanGenerate`/`reset` forbidden; no hand SQL needed — Drizzle expresses unique + nullable DDL; these operations are non-destructive on duplicate-free tables).
  - Add static schema assertions into the existing schema test surface (or a focused module test pinned next to the repo suites, per codebase convention recorded in 0.2):
    - `reports` table config carries the `reports_session_id_unique` constraint and NO `teacherId` column key (C.4 pin).
    - `home_work` carries `home_work_session_id_unique`; grade columns nullable; CHECK constraints unchanged.
  - Instruction files: `.agents/instructions/backend.instructions.md`; verify-then-cite `backend/db/repo/AGENTS.md` / schema-layer AGENTS.md only if present in the bundle.
  - _Requirements: REQ-040, REQ-015, INV-HW1, INV-HW3, C.4_
  - [ ] 1.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/schema/classes/reports.ts --lifecycle duplicates` and `bun run scripts/health/sub-loop.ts backend/db/schema/classes/home-work.ts --lifecycle duplicates` (exit code 0 for each). Baseline counts from 0.1 must not rise.
  - [ ] 1.2.TE **Test Engineering**: Tier 1 — static schema-config assertions green; Tier 2 — boundary: confirm push produced exactly the intended DDL (inspect generated/pushed statements; record in outcome); no Tier 3/4 applicable to DDL itself (carried by repo tests).
  - [ ] 1.2.SEC **Security & Tenancy Audit**: confirm NO column added exposes actor identity redundantly (C.4); confirm constraints do not alter any wallet/escrow-adjacent table (zero-touch list: `session`, `students`, `wallet`, `teacher_transaction`, `notifications`).
  - [ ] 1.2.SR **Semantic Review**: schema diffs are minimal and verdict-scoped; naming matches house conventions; no leftover commented-out columns; no dead imports after conditional edits.
  - [ ] 1.2.IV **Instruction Verification**: validate against `.agents/instructions/backend.instructions.md` + any auto-discovered AGENTS.md printed by `scripts/health/sub-loop.ts` for these paths (paste discovery output into outcome).

- [ ] 1.3 [Enum guard + canonical types extension]
  - Files:
    - `backend/enum/shared/surah-juz-ref.enum.ts` (UPDATE) — add `isSurahJuzRef(value: unknown): value is SurahJuzRef` using the exact pattern of `isApplicantStatus` in `backend/enum/teachers/applicant-status.enum.ts` (value import of the enum; `Object.values`-based membership check). NO new enum members (D1 ledger row governs expansion).
    - `backend/types/classes/report.types.ts` (EXTEND in place) — add `ReportReturnType`, `HomeWorkGradeFieldsInput`, `HomeWorkBlockInput`, `HomeWorkAssignInput`, `SessionReportSubmitInput` exactly per plan §2.4. `SurahJuzRef` imported as a VALUE-imported type usage (type position OK as `import type`; the enum itself stays a value import at guard/validation sites).
    - `backend/types/classes/home-work.types.ts` (EXTEND) — add `HomeWorkReturnType`.
    - `backend/types/classes/session-notification.types.ts` (EXTEND, existing file) — add `SessionReportWaveParticipant`, `SessionReportWaveContext`, `SessionReportWaveContextRow` per plan §2.4 (verify the existing exported names before extending; adapt names to actual file content but keep semantics: student/teacher/parent-or-null wave context).
    - `backend/types/classes/index.ts` (UPDATE barrel) — re-export the new symbols.
  - HARD RULES: no service-layer `.types.ts` files; no type definitions inside Pothos resolvers; all additions live in `backend/types/`.
  - Instruction files: `.agents/instructions/backend.instructions.md`; `backend/types/AGENTS.md` (verify existence first).
  - _Requirements: REQ-003, REQ-014, REQ-016_
  - [ ] 1.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts <each edited file> --lifecycle duplicates` (exit 0 each).
  - [ ] 1.3.TE **Test Engineering**: Tier 1 — compile-guard test (or type-level spec per `backend/types/AGENTS.md` convention): `isSurahJuzRef` returns true for all 35 shipped members and false for `""`, arbitrary strings, numbers, null/undefined; types compile-check the new interfaces against representative literals (assignability smoke in a colocated type test if the layer provides one).
  - [ ] 1.3.SEC **Security & Tenancy Audit**: enum guard rejects unknown values (BOPLA filter for the input pipeline); types expose no server-derivable fields as writable input members (`id`, `sessionId`, timestamps absent from all `*Input` types).
  - [ ] 1.3.SR **Semantic Review**: no duplicated type shapes across files; Select→Return alias discipline; barrel exports alphabetically/conventionally ordered per existing file style; no `any`.
  - [ ] 1.3.IV **Instruction Verification**: match auto-discovered instruction set from `scripts/health/sub-loop.ts` for each edited path.

- [ ] 1.4 [i18n keys — errors namespace + notification copy slots (en/ar parity)]
  - Files (verify exact module paths against the bundled `shared/locale/` before editing; namespace registration checklist lives in `shared/AGENTS.md`):
    - `errors` namespace (FLAT, domain-prefixed keys) — ADD: `sessionReportAlreadyExists`, `homeworkAlreadyGraded`, plus any validation keys not already covered by existing generic keys (audit first; only add keys that genuinely do not exist: candidates `sessionReportNotesRequired`, `sessionReportNotesTooLong`, `sessionRatingRange`, `homeworkGradeRange`, `homeworkAyahRangeInvalid`, `homeworkSurahJuzInvalid`, `homeworkAssignmentBlocksRequired`). Reuse existing keys verbatim where they already express the denial (do not mint synonyms).
    - `notifications` namespace — ADD copy slots per plan §4.2: `eventSessionReportReadyTitle`, `eventSessionReportReadyBody` (student; interpolates teacher full name only), `eventSessionReportReadyParentBody` (parent; interpolates student + teacher full names only). NO grades/notes/ids in copy (REQ-019 privacy).
    - en + ar locale files updated in lockstep; the typed `Translations`/namespace interfaces updated accordingly.
    - Parity/inventory suites that pin namespace key sets — UPDATE their inventories (record actual suite paths from 0.2).
  - Contract reminders: services will call `getServerTranslations(locale)` (ONE argument); resolvers use `ctx.t("namespace")`; keys are FLAT (`t.errorsTranslations.sessionReportAlreadyExists`-style access, no nested invented groupings).
  - Instruction files: `.agents/instructions/backend.instructions.md`; `shared/AGENTS.md` (mandatory read — it hosts the namespace registration checklist).
  - _Requirements: REQ-002, REQ-016, REQ-018, REQ-019_
  - [ ] 1.4.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts <each edited locale file> --lifecycle duplicates` (exit 0 each).
  - [ ] 1.4.TE **Test Engineering**: Tier 1 — run the namespace parity suites (`bun run test/scripts/run-test.ts <parity-suite-path>`); en/ar key parity mechanical pass; interpolation-parameter arity pinned for each new notification slot (placeholder counts match between locales).
  - [ ] 1.4.SEC **Security & Tenancy Audit**: notification bodies interpolate ONLY counterparty full names — static review that no grade/note/id placeholder exists in any new copy string (REQ-019); error messages are generic (no existence disclosure deltas between code paths).
  - [ ] 1.4.SR **Semantic Review**: flat key naming convention honored; no duplicated copy across keys; no hardcoded strings left in any edited module; interfaces compile.
  - [ ] 1.4.IV **Instruction Verification**: `shared/AGENTS.md` checklist items each ticked and evidence pasted into outcome.

---

## Phase 2: Repositories & Backend Services

> Journey test is TEST-FIRST: task 2.1 is written and committed RED before any service-surface implementation. Repository tasks (2.2–2.4) provide the substrate the journey will call through; the service surface (2.6–2.8) must not begin before 2.1's RED run is recorded.

- [ ] 2.1 [Write session-report/homework journey test — TEST-FIRST]
  - Create `test/workflows/classes/session-report-homework.journey.test.ts` — one file covering the specs §2.9 workflow (steps 1–11 verbatim).
  - If `test/workflows/` scaffolding is missing (per 0.2 verification), this task ALSO scaffolds the layer per Architectural Invariant 10: `test/workflows/AGENTS.md` + `test/workflows/helpers/` cast helpers with REAL permission-group membership rows (never monkey-patched permission resolution) + `SpiedFanoutTransport` for notifications.
  - Provision actor cast (committed fixtures in `beforeAll`, tracked IDs, hard-delete in `afterAll` — `runInRollback` FORBIDDEN):
    - Certified owning teacher T (real role + verification state), session student S, linked parent P (`students.parent_id = P.id`), unlinked-parent student variant S′ for the INV-P1 negative branch, foreign teacher Ft, admin A.
    - Sessions: σ in `completed` status (provision via DEV3-004's service-level completion path where feasible — NOT raw UPDATE surgery; raw fixture seeding only where the service path is not composeable, and justify in outcome), σ₂ as the second completed session (created at journey time per step 9).
  - Steps as sequential service calls with explicit `actorUserId`, asserting BOTH cross-actor visibility AND side-effect counts after every step (assertion oracle = plan §4.4 side-effect matrix table — copy it into the test file header comment as the living spec):
    1. Setup committed; baseline row counts recorded (`reports`, `home_work`, `notifications`, wallet lanes, `session.fee_held`).
    2. Foreign teacher submits on σ → `NotFoundError`-class denial (`SESSION_NOT_FOUND`); zero rows; zero notifications; zero publishes (spied transport empty).
    3. Student S submits → `FORBIDDEN` (`DomainError` with the role-denial code the service uses); zero side effects.
    4. Owner T submits invalid payloads (rating 7; empty notes; notes 2001 chars; grade 101; grade −1; `fromAyah > toAyah`; unknown SurahJuzRef value; non-integer ayah) → each `VALIDATION`; zero rows across ALL three tables after the sweep.
    5. Owner T submits valid report + Jadid/Madi assignment (first session, NO `previousGrades`) → asserts: 1 `reports` row (no `teacher_id` column touched; verify row has expected `sessionId`, notes, rating), 1 `home_work` row with grades NULL, spied transport shows EXACTLY 2 publishes (student in S's persisted locale, parent P in P's locale; each with `type = NotificationType.SessionCompletion`, `relatedEntityType = "session"`, `relatedEntityId = σ.id`); notification bodies contain names only.
    6. Owner T resubmits same session → `ConflictError` code `SESSION_REPORT_ALREADY_EXISTS`; notification count unchanged; transport replays nothing new.
    7. Student S reads report + homework of σ via service read functions → rows returned with full columns.
    8. Parent P reads → `null` for both; byte/semantic identity with foreign-teacher read result (compare normalized results).
    9. σ₂ completed; owner T submits report + new assignment + `previousGrades` → asserts: σ's `home_work` row now graded (exact submitted values, `updatedAt` advanced), σ₂'s assignment row grades NULL, 1 new `reports` row, notifications: student + parent each exactly +1 (cumulative 2 each).
    10. Owner T attempts re-grade of σ's homework (fresh submit carrying `previousGrades` for a subsequent completed session σ₃ OR the dedicated re-grade path — per the service surface; assert the one-shot guard yields typed `CONFLICT` with `homeworkAlreadyGraded` message); σ's grades unchanged.
    11. Forced mid-transaction rollback: run a harness submission whose homework insert is forced to fail AFTER the report insert executed (mechanism: temporarily violate the `home_work` CHECK via an out-of-range grade smuggled past service validation using a raw-tx probe OR a fault-injection option the service exposes for tests — choose and justify; NO production-only backdoor flags). Assert: zero `reports` rows, zero `home_work` rows, zero `notifications` rows, zero publishes for that attempt (full unit rollback).
    - DENIAL coverage inside the journey: anonymous-equivalent (service called with invalid actor) → typed auth denial per service contract; governed teacher (flip T's governance state, attempt submit, restore) → `FORBIDDEN`.
    - Wallet/escrow purity: after ALL steps, assert wallet lanes / `session.fee_held` / `teacher_transaction` counts equal baseline (REQ-044 oracle).
  - Spy discipline: notification fan-out intercepted via `SpiedFanoutTransport` (helpers already exist per 0.2 — VERIFY; if absent, create under `test/workflows/helpers/` as part of the scaffold leg). NEVER hit real email/SMS/push channels.
  - Run RED first (expected failure — service surface does not exist yet) and record the red output in the outcome; the test turns green only after tasks 2.2–2.8 complete.
  - Verify command: `bun run test/scripts/run-test.ts test/workflows` (never raw `bun test`).
  - Instruction files: `.agents/instructions/tests.instructions.md`, `.agents/instructions/backend.instructions.md`; `test/workflows/AGENTS.md` (create per invariant 10 if scaffolding).
  - _Requirements: REQ-062, REQ-013, REQ-018, REQ-030, REQ-040, REQ-041, REQ-044, INV-S7, INV-S8, INV-HW3, INV-HW4, INV-P1, INV-S3_

- [ ] 2.2 [Implement ReportRepository]
  - Create `backend/db/repo/classes/report.repository.ts`:
    - `insertReport(insert: ReportInsertType, tx?: DBTransaction): Promise<ReportSelectType>` — single `INSERT … RETURNING *`; plain tx-bound call.
    - `findBySessionId(sessionId: number, tx?: DBQueryExecutor): Promise<ReportSelectType | null>` — single parameterized id-equality read; Drizzle Prepared Statements 2.0 (`sql.placeholder(...)`) permitted per `docs/drizzle/prepared-statements.md` for this simple-read shape.
  - Update barrel `backend/db/repo/classes/index.ts` (export) and root `backend/db/repo/index.ts` ONLY if it does not already re-export the classes barrel (verified in 0.2).
  - Discipline: every method takes `tx` LAST and propagates it; NO `--` comments inside `sql` templates; canonical types only (`backend/types/classes/report.types.ts`); zero business logic (no validation, no error-class throwing beyond repository-error plumbing per existing repo conventions recorded in 0.2).
  - Create `backend/db/repo/classes/__tests__/report.repository.test.ts`:
    - All inside `runInRollback`; fixtures via `backend/db/test/entity-setup.ts` (NEVER seed-table reads).
    - Tier 1 (branch/stmt 100% on new code): happy insert + RETURNING shape; `findBySessionId` hit and miss (null); nullable/exact column mapping.
    - Tier 2 (boundary): insert with maximal notes length; rating 0 and 5 via raw repo (constraint-level sanity; service-level range validation lives elsewhere).
    - Tier 3 (chaos): unique-race — two concurrent `runInRollback`-scoped inserts for the same session id executed sequentially-but-uncoordinated inside one test (second insert MUST raise `23505`); capture via `expectRepoError` try/catch (NEVER `rejects.toThrow`); assert error is the raw PG violation (mapping to `SESSION_REPORT_ALREADY_EXISTS` is the SERVICE's job — pinned here as "repo does not translate").
    - Tier 4 (security): insert with notes containing SQL metacharacters/quotes stores verbatim (parameterization proof); verify returned row round-trips the payload byte-identical.
    - `tx` propagation: pass `tx` explicitly in every call; test that calling with explicit tx inside `runInRollback` rolls back (row absent after block, observable via a fresh executor read).
  - Instruction files: `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`; `backend/db/repo/AGENTS.md` (verify existence in 0.2).
  - _Requirements: REQ-010, REQ-040, REQ-060_
  - [ ] 2.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/repo/classes/report.repository.ts --lifecycle duplicates` and the test file (exit code 0 each).
  - [ ] 2.2.TE **Test Engineering**: 4-Tier framework executed as itemized above; run `bun run test/scripts/run-test.ts backend/db/repo/classes/__tests__/report.repository.test.ts` green; statement/branch coverage on the new module = 100% (evidence in outcome).
  - [ ] 2.2.SEC **Security & Tenancy Audit**: no LIKE/ILIKE surface; bound parameters only; no cross-tenant predicate needed (session-scoped reads only — justify in audit notes); no BOPLA shape (insert param is typed `ReportInsertType`, caller maps field-by-field).
  - [ ] 2.2.SR **Semantic Review**: atomic single statements; `tx` last-arg convention uniform; zero dead code; naming matches existing repositories in the folder; no console logging.
  - [ ] 2.2.IV **Instruction Verification**: validate against `.agents/instructions/backend.instructions.md` + layer AGENTS.md auto-discovered by `scripts/health/sub-loop.ts` (paste discovery output into outcome).

- [ ] 2.3 [Implement HomeWorkRepository]
  - Create `backend/db/repo/classes/home-work.repository.ts`:
    - `insertHomeWork(insert: HomeWorkInsertType, tx?: DBTransaction): Promise<HomeWorkSelectType>` — INSERT … RETURNING; grades may be NULL (1.2 relaxation) — assignment-without-grade MUST be storeable (INV-HW3).
    - `findBySessionId(sessionId: number, tx?: DBQueryExecutor): Promise<HomeWorkSelectType | null>`.
    - `findLatestUngradedByStudentId(studentId: number, tx?: DBTransaction): Promise<HomeWorkSelectType | null>` — JOIN `home_work → session` on `session.student_id = $1`, predicate `current_grade IS NULL AND revision_grade IS NULL`, ORDER BY newest-first (session id or homework created_at — match existing conventions; pin choice), LIMIT 1.
    - `gradeHomeWorkOnce(id, grades: { currentGrade; revisionGrade }, tx?: DBTransaction): Promise<HomeWorkSelectType | null>` — ONE guarded statement: `UPDATE home_work SET current_grade = $g1, revision_grade = $g2, updated_at = now() WHERE id = $id AND current_grade IS NULL AND revision_grade IS NULL RETURNING *`. Returns `null` on zero-row match (INV-HW4 write-once guard) — NO exception here.
  - Barrel updates as in 2.2.
  - Create `backend/db/repo/classes/__tests__/home-work.repository.test.ts`:
    - All in `runInRollback`; fixtures via `entity-setup.ts`; `expectRepoError` pattern for raw constraint failures.
    - Tier 1: insert with full Jadid+Madi payload; insert with NULL grades (INV-HW3 row); `findBySessionId` hit/miss; `findLatestUngradedByStudentId` returns the NEWEST ungraded row across multiple authored sessions and skips already-graded rows; `gradeHomeWorkOnce` happy path returns updated row with grades + bumped `updated_at`.
    - Tier 2: grade values at exact bounds 0 and 100 (raw repo tier; service guards range semantics); ordering determinism across several sessions seeded out of insertion order.
    - Tier 3 (chaos/guard): double `gradeHomeWorkOnce` on the same row — second call returns `null` (idempotent-miss branch); parallel simulated re-grade attempts (sequential tx simulation within test harness limits) — exactly one winner; unique-race on `home_work.session_id` (R3 constraint) produces `23505`.
    - Tier 4 (security): enum-typed SurahJuzRef columns reject out-of-enum raw values at the DB tier (observed via raw executor probe — defense-in-depth evidence; the service's `isSurahJuzRef` guard is the primary gate); metacharacter payloads bound safely.
  - Instruction files: same set as 2.2.
  - _Requirements: REQ-011, REQ-015, REQ-040 (session-unique), REQ-060, INV-HW2, INV-HW3, INV-HW4_
  - [ ] 2.3.QL **Quality Loop**: sub-loop on repository + test file (exit 0 each).
  - [ ] 2.3.TE **Test Engineering**: tiers above executed; `bun run test/scripts/run-test.ts backend/db/repo/classes/__tests__/home-work.repository.test.ts` green; 100% statements/branches on the new module.
  - [ ] 2.3.SEC **Security & Tenancy Audit**: student scoping happens via `session.student_id` join only (no caller-supplied homework id accepted by `findLatestUngradedByStudentId`); guarded UPDATE predicate cannot touch any other row (verify no full-table write possible even under parameter tampering — parameters are typed + bound).
  - [ ] 2.3.SR **Semantic Review**: three-read/one-write API surface minimal; no helper exported that is unneeded by 2.8's service (YAGNI — flag and remove any speculative method); exact plan §4.1 signature conformance.
  - [ ] 2.3.IV **Instruction Verification**: as 2.2.IV.

- [ ] 2.4 [Extend SessionRepository — report-gate lock + wave-context read]
  - UPDATE `backend/db/repo/classes/session.repository.ts` (ADD ONLY — existing methods untouched):
    - `lockForReportGate(sessionId: number, tx: DBTransaction): Promise<SessionTransitionProbeRowType | null>` — `SELECT id, status, teacher_id, student_id FROM session WHERE id = $1 FOR UPDATE` (tx REQUIRED — no optional fallback; the probe row type reuses the EXISTING transition-probe row type, augmented only if its current shape lacks a needed column — record what it actually selects in 0.2 and add a column ONLY if provably missing).
    - `findReportWaveContextById(sessionId: number, tx?: DBTransaction): Promise<SessionReportWaveContextRow | null>` — one joined read: session → users(student) [id, full name, locale] + users(teacher) [id, full name, locale] + `students.parent_id` → LEFT JOIN users(parent) [id, full name, locale]. Column choices must match real schema columns verified in 0.2 (name/locale column existence CONFIRMED — if users lack a locale column, resolve the recipient-locale source from the actual schema and record the deviation decision in the outcome + plan note).
  - Extend `backend/db/repo/classes/__tests__/session.repository.test.ts` (or the colocated suite per convention) with cases:
    - Tier 1: lock returns probe for existing id, null for missing; wave context for linked-parent session returns 3 participants; unlinked returns `parent: null` (INV-P1 data shape).
    - Tier 3: two `runInRollback` units contending `lockForReportGate` on the same row — second blocks/then observes committed state (document the harness limitation if true cross-connection locking cannot be simulated; simulate via sequential lock probes and assert predicate re-evaluation correctness).
    - Tier 4: wave-context read exposes exactly the named columns (no `*` select — column whitelist pinned in test).
  - Verify NO existing `FOR UPDATE` on `session` rows today (bundle evidence) to keep 2.4 the sole row-lock writer under this name; record anchor.
  - Instruction files: as 2.2.
  - _Requirements: REQ-012 (gate probe), REQ-018 (wave context), D2/D6 (plan)_
  - [ ] 2.4.QL **Quality Loop**: sub-loop on modified repo + tests (exit 0).
  - [ ] 2.4.TE **Test Engineering**: suites above green via `run-test.ts`; no regressions in the existing session repository suite.
  - [ ] 2.4.SEC **Security & Tenancy Audit**: wave-context read is id-addressed only; reveal set = {student, teacher, linked parent of that student} — nothing broader; lock is read-lock-for-gate (no write to `session` performed by THIS surface).
  - [ ] 2.4.SR **Semantic Review**: additions only; no refactor of shipped methods; probe row-type reuse (no duplicate type); no cross-layer imports.
  - [ ] 2.4.IV **Instruction Verification**: as 2.2.IV.

- [ ] 2.M [Mid-Point Review Gate]
  - Halt implementation; run a consolidated checkpoint BEFORE writing guards/notification/service surface:
    - All Phase 1 tasks and 2.1–2.4 outcomes present in `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/`; all checkboxes of completed tasks flipped with evidence.
    - Full-suite quick run: `bun run test/scripts/run-test.ts backend/db/repo` green; `bun run test/scripts/run-test.ts test/workflows` shows the journey RED only on missing-service errors (not on harness/fixture bugs — fix harness NOW if red for the wrong reason).
    - Quality-loop totals vs 0.1 baseline: zero delta.
    - Verify deferred-items ledger unchanged since 0.1 except intentional appends.
    - Review plan adherence: any deviation discovered in 2.2–2.4 resolved (fixed in place) or formally deferred with a NEW ledger row.
  - Write `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/2.M-midpoint-gate.md` with a GO/NO-GO verdict; NO-GO blocks 2.5+.
  - _Requirements: REQ-001, REQ-041_

- [ ] 2.5 [Implement session-report guards module (pure validators)]
  - Create `backend/services/classes/session-report.guards.ts` — pure functions, ZERO DB access, errors thrown as localized `ValidationError`s using `getServerTranslations(locale)` (ONE argument):
    - `assertPositiveSessionId(id: unknown, t): asserts id is number` — positive safe-integer (pattern from the session-lifecycle guards — record the actual existing id-guard helper found in 0.2 and REUSE it if exported; do not duplicate).
    - `assertTeacherNotes(notes: string, t): string` — trim; non-empty-after-trim; ≤ 2000 chars; returns the TRIMMED value (stored verbatim otherwise, REQ-033).
    - `assertRating0To5(rating: number, t)` — integer, inclusive 0..5.
    - `assertGrade0To100(grade: number, t)` — integer, inclusive 0..100 (VALIDATION — DB CHECK stays backstop only).
    - `assertHomeWorkBlock(block: HomeWorkBlockInput, t)` — both ayah values positive safe integers; `fromAyah ≤ toAyah`; `isSurahJuzRef(block.surahJuz)` else VALIDATION.
    - `validateAssignment(input: HomeWorkAssignInput, t)` — at least one of `jadid`/`madi` present when the homework block is supplied; each present block passes `assertHomeWorkBlock`.
    - `validatePreviousGrades(g: HomeWorkGradeFieldsInput, t)` — both grades pass `assertGrade0To100`.
  - All guards accept the SAME translations-tree handle shape used across the service (single resolution at service head, passed down — no repeated `getServerTranslations` calls).
  - Create `backend/services/classes/__tests__/session-report.guards.test.ts`:
    - Tier 1: every guard's accept/reject branches.
    - Tier 2 (boundary): notes length exactly 2000 accept / 2001 reject; whitespace-only notes reject; rating −1/0/5/6/0.5/NaN/Infinity; grades −1/0/100/101/0.5; `fromAyah = toAyah` accept; `fromAyah > toAyah` reject; non-safe-integers reject; ayah 0 reject.
    - Tier 3 (fuzz): randomized payload sweep (seeded, deterministic) over all guards — only VALIDATION class errors ever thrown, never other classes.
    - Tier 4 (security): every rejected payload leaves ZERO observable side effects (guards are pure — assert via absence of injected dependencies); enum-typed values arrive as strings from the wire and are rejected unless member (verify `isSurahJuzRef` integration, not string equality against hardcoded literals in the guard).
  - Instruction files: `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`; `backend/services/AGENTS.md` (verify in 0.2).
  - _Requirements: REQ-014, REQ-016, REQ-033, REQ-002_
  - [ ] 2.5.QL **Quality Loop**: sub-loop on guards + test (exit 0).
  - [ ] 2.5.TE **Test Engineering**: tiers above; `bun run test/scripts/run-test.ts backend/services/classes/__tests__/session-report.guards.test.ts` green; 100% branch coverage.
  - [ ] 2.5.SEC **Security & Tenancy Audit**: error messages localized and shape-uniform (no input-echo disclosure); no regex/ReDoS-prone patterns in validators (length is bounded by counting, not pattern-matching).
  - [ ] 2.5.SR **Semantic Review**: guards export exactly what 2.7 consumes (YAGNI); no side effects; enum used via VALUE import.
  - [ ] 2.5.IV **Instruction Verification**: as 2.2.IV.

- [ ] 2.6 [Implement session-report notification seam]
  - Create `backend/services/classes/session-report-notification.service.ts`:
    - `notifySessionReportReady(sessionId: number, locale: string, tx: DBTransaction, options?: NotificationEngineCallOptions): Promise<NotificationDeliveryReceipt[]>` per plan §4.2/D6:
      - Reads wave context ONCE via `SessionRepository.findReportWaveContextById(sessionId, tx)`.
      - Composes copy in EACH recipient's persisted locale (recipient-locale obligation proven by `backend/services/classes/session-request-notification.service.ts` — mirror its composition approach).
      - Emits via `NotificationEngine.emitForUser`, in the caller's `tx`:
        - student: `type: NotificationType.SessionCompletion`, `relatedEntityType: "session"`, `relatedEntityId: sessionId`, idempotency key `session:{sessionId}:report`.
        - parent IFF `students.parent_id ≠ null` (INV-P1) — same key and related-entity fields; the engine recipient-digest differentiates claims.
      - Body interpolation: counterparty full names ONLY (REQ-019) — no grades/notes/ids in stored copy.
      - Returns receipts; publishing is the CALLER's post-commit act (this module NEVER publishes).
  - Governance: this module performs NO governance checks (it emits for recipients, not the actor) — record rationale in the file header comment to forestall review drift.
  - Create `backend/services/classes/__tests__/session-report-notification.test.ts` (runInRollback):
    - Tier 1: linked session ⇒ receipts length 2 with correct recipients/types/related fields; unlinked session ⇒ receipts length 1 (student only).
    - Tier 2: locale composition — student emission composed in student's locale, parent in parent's (inject distinct locales; assert copy placeholders resolved); missing-parent row ⇒ parent emission absent.
    - Tier 3: duplicate invocation with same key inside separate committed scopes ⇒ engine claim replay path (assert no double-row emit per recipient where the engine's claim seam is observable); forced engine failure propagates typed error (transaction safety handled upstream).
    - Tier 4: copy contains NO grade/note/session-id content — assert regex absence of digits sequences matching grades/ratings beyond permitted name interpolation (REQ-019 privacy pin).
  - Instruction files: as 2.5.
  - _Requirements: REQ-018, REQ-019, INV-P1, INV-P3_
  - [ ] 2.6.QL **Quality Loop**: sub-loop on module + test (exit 0).
  - [ ] 2.6.TE **Test Engineering**: tiers above; green run; 100% branch coverage on the new module.
  - [ ] 2.6.SEC **Security & Tenancy Audit**: recipients derived ONLY from the session's joined identity rows (never from input); parent emission gated strictly on stored `parent_id`; PII minimization in logs (module logs nothing — confirm).
  - [ ] 2.6.SR **Semantic Review**: single-read discipline (exactly ONE wave-context query per call); no publishing inside; enum VALUE import for `NotificationType`; no stringly-typed notification type.
  - [ ] 2.6.IV **Instruction Verification**: as 2.2.IV.

- [ ] 2.7 [Implement SessionReportService — write surface]
  - Create `backend/services/classes/session-report.service.ts` with EXACT pipeline order (plan §4.2):
    - `submitSessionReport(teacherUserId, sessionId, input: SessionReportSubmitInput, locale, outerTx?, options?): Promise<ReportReturnType>`:
      0. Pre-DB: id shape → notes → rating → assignment block validity → previousGrades validity (all 2.5 guards; zero DB touched on failure).
      1. Governance re-check via the verified helper from `backend/services/classes/session-lifecycle.governance.ts` (actual exported name recorded in 0.2) — governed ⇒ `FORBIDDEN` denial.
      2. `withTransaction(outerTx)`:
         - 2a. `probe = SessionRepository.lockForReportGate(sessionId, tx)`; `null` → `NotFoundError("SESSION", t…sessionNotFound)`; `probe.teacherId !== teacherUserId` → SAME `NotFoundError` (oracle identity, REQ-030); `probe.status !== SessionStatus.Completed` → `ConflictError("SESSION_INVALID_TRANSITION", …)` (covers scheduled/started/cancelled/disputed per REQ-034; ENUM VALUE import for `SessionStatus`).
         - 2b. `ReportRepository.insertReport({ sessionId, teacherNotes: trimmed, studentRatingByTeacher }, tx)` — field-by-field mapping (BOPLA); catch → `isUniqueViolation` cause-chain traversal → `ConflictError("SESSION_REPORT_ALREADY_EXISTS", t…sessionReportAlreadyExists)`; any other cause rethrown.
         - 2c. If `input.previousGrades` present: `target = HomeWorkRepository.findLatestUngradedByStudentId(probe.studentId, tx)`; if `target` non-null → `graded = HomeWorkRepository.gradeHomeWorkOnce(target.id, grades, tx)`; `graded === null` → `ConflictError(t…homeworkAlreadyGraded)` (plain `CONFLICT` code per plan D8). If `target` null → silently no-op ONLY the first-session case (D5 split: with a prior-but-graded history the guarded-miss path already surfaced; document the reachable-state analysis in code comment + outcome).
         - 2d. If `input.homework` present: map blocks field-by-field into `HomeWorkInsertType` (`jadid` → `current_from_ayah/current_to_ayah/current_surah_juz`, `madi` → `revision_*`); grades NOT set on the new row (INV-HW3); `insertHomeWork(…, tx)`; a `23505` from `home_work_session_id_unique` maps to the SAME `SESSION_REPORT_ALREADY_EXISTS` ruling only when its constraint identity matches (constraint-name-scoped cause-chain check) — otherwise rethrow.
         - 2e. `receipts = notifySessionReportReady(sessionId, locale, tx, options)`.
      3. AFTER own commit: `NotificationEngine.publishReceipts(receipts, locale, options)` (publish-after-commit; rollback ⇒ zero publishes).
      4. Return the report row (RETURNING payload; no re-read).
    - Denial logging: exactly ONE `logger.logDomainError({ code, entity, entityId, locale })` per denial path; none on success.
  - Replay-throw, NEVER replay-return (plan D3).
  - Create `backend/services/classes/__tests__/session-report.service.test.ts` (`runInRollback`; fixtures via `entity-setup.ts`; notification engine receipts observable via injected/spy options per engine's test facilities recorded in 0.2):
    - Tier 1 (branch): each gate denial in isolation (governed, unknown session, foreign owner — SAME NotFound shape compared field-by-field vs unknown-session denial, non-completed for each of scheduled/started/cancelled/disputed → `SESSION_INVALID_TRANSITION`, duplicate → `SESSION_REPORT_ALREADY_EXISTS`) each leaving ZERO rows in `reports`/`home_work`/`notifications`; happy path with and without homework block; first-session (no prior homework) + `previousGrades` absent; happy path returns the inserted row.
    - Tier 2 (boundary): full payload at all validator bounds passing once (integration of guard+write); homework with jadid-only, madi-only, both.
    - Tier 3 (chaos): double-submit STORM — fire N (≥4) concurrent `submitSessionReport` calls for the same session on separate connections; assert EXACTLY one success, N−1 `SESSION_REPORT_ALREADY_EXISTS`, exactly ONE `reports` row, ONE `home_work` row, ONE student + ONE parent notification row; forced mid-tx failure (per journey step 11 mechanism) ⇒ total rollback incl. notifications table, zero publishes; today's already-graded re-grade ⇒ `CONFLICT`.
    - Tier 4 (security): smuggle-shaped input objects containing extra keys are dropped by field-by-field mapping (assert DB row contains ONLY intended columns — esp. no caller-set id/sessionId/timestamps); governed-teacher denial precedes any DB write (trace via zero-row assertion + log call count); `ctx`-style foreign teacher vs unknown session produce IDENTICAL thrown shape (code + message + localization resolved in same locale).
    - Count-delta oracles (REQ-044): wallet tables/`session.fee_held`/`teacher_transaction`/`students` lane counts UNCHANGED across all tests.
  - Instruction files: `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`; `backend/services/AGENTS.md`.
  - _Requirements: REQ-012, REQ-013, REQ-015, REQ-016, REQ-030, REQ-032, REQ-034, REQ-040, REQ-041, REQ-042, REQ-043, REQ-044, INV-S7, INV-S8, INV-HW3, INV-HW4, INV-S3_
  - [ ] 2.7.QL **Quality Loop**: sub-loop on service + test (exit 0).
  - [ ] 2.7.TE **Test Engineering**: 4-tier suite green via `run-test.ts`; 100% statement/branch on the service module; storm determinism evidence in outcome (repeat run ×3 — DEV3-004 precedent).
  - [ ] 2.7.SEC **Security & Tenancy Audit**: BOLA (oracle collapse + owner gate + governance re-check), BOPLA (field-by-field only), BFLA (service re-asserts teacher role/ownership even though resolver scopes also guard — defense in depth); verify NO input field can steer `sessionId`/`studentId`/`teacherId`.
  - [ ] 2.7.SR **Semantic Review**: pipeline order matches plan exactly; tx propagated to ALL repo/engine calls (grep `, tx)` completeness); single-withTransaction; publish strictly post-commit; zero dead branches.
  - [ ] 2.7.IV **Instruction Verification**: as 2.2.IV.

- [ ] 2.8 [Implement SessionReportService — read surface]
  - In `backend/services/classes/session-report.service.ts` (same module) add:
    - `getSessionReport(callerUserId, sessionId, locale, tx?): Promise<ReportReturnType | null>` — validate id shape pre-DB; participant gate via the EXISTING `SessionRepository.findTransitionProbe` (reuse, no FOR UPDATE on reads): `null` probe → `null`; caller is neither `teacherId` nor `studentId` → `null` (parents/admins/foreigners all collapse, REQ-017/030); participant → `ReportRepository.findBySessionId(sessionId, tx)`.
    - `getSessionHomework(callerUserId, sessionId, locale, tx?): Promise<HomeWorkReturnType | null>` — same gate; then `HomeWorkRepository.findBySessionId`.
    - Reads perform ZERO writes (render purity) and NO governance re-check on the reader (rationale recorded in comment + outcome: reads expose only the caller's own session; historical rows survive later governance flips per INV-U5).
  - Extend `backend/services/classes/__tests__/session-report.service.test.ts`:
    - Tier 1: participant pair reads hit; non-participant teacher/student/parent/admin all receive EXACTLY `null`; unknown session id ⇒ `null` (byte/structural identity asserted by comparing the two `null`-returning calls' observable outputs).
    - Tier 3: read under concurrent submission (issue read mid-storm harness) — never throws, never returns partial FABRICATED shape (either full row or null — ENABLED BY WAL isolation; document observed behavior).
    - Tier 4: enumeration probe — iterate foreign ids 1..K vs nonexistent ids; assert indistinguishable results and identical timing-bucket class (timing assertion coarse — document approach).
  - Instruction files: as 2.7.
  - _Requirements: REQ-017, REQ-030, REQ-031 (queries unaffected by role scope), REQ-061_
  - [ ] 2.8.QL **Quality Loop**: sub-loop on service + test (exit 0).
  - [ ] 2.8.TE **Test Engineering**: additions green; combined service suite re-run fully green; coverage still 100%.
  - [ ] 2.8.SEC **Security & Tenancy Audit**: oracle collapse verified field-by-field; no log line leaks existence (read path logs NOTHING — assert logger spy silence per house rule).
  - [ ] 2.8.SR **Semantic Review**: reuse of existing probe (NO new FOR UPDATE on reads); no duplicated predicate logic — single private participant-check helper if shared by both reads; zero dead code.
  - [ ] 2.8.IV **Instruction Verification**: as 2.2.IV.

- [ ] 2.9 [Journey test GREEN gate]
  - Run `bun run test/scripts/run-test.ts test/workflows` — the journey written in 2.1 MUST now pass fully (all 11 steps + denial branches + purity oracles).
  - If any journey assertion fails: fix the SERVICE/repo surface (NEVER weaken the journey assertions — the journey encodes specs §2.9; any weakening requires a spec amendment, which is out of authority for this execution).
  - Repeat the full journey run 2 more times for flake/fan-out determinism evidence; paste summaries into `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/2.9-outcome.md`.
  - _Requirements: REQ-062, REQ-041, REQ-013, REQ-018_

---

## Phase 3: GraphQL Resolvers & API Handlers

- [ ] 3.1 [Pothos enum registration + report/homework objects + input types]
  - Files:
    - `backend/graphql/pothos/shared/enum.pothos.ts` (UPDATE) — register `SurahJuzRef` ONCE via enum-object form (`gqlSchemaBuilder.enumType(SurahJuzRef, { name: "SurahJuzRef" })`); VALUE import; verify no duplicate registration exists.
    - `backend/graphql/pothos/classes/report.pothos.ts` (NEW) — `SessionReportPothosObject`: `id: ID!` FIRST, then `sessionId`, `teacherNotes`, `studentRatingByTeacher`, `createdAt`/`updatedAt` with `type: "DateTime"` (registered scalar — NEVER `toISOString()` into String).
    - `backend/graphql/pothos/classes/home-work.pothos.ts` (NEW) — `SessionHomeWorkPothosObject`: `id` first; all plan §3.1 fields; Surah/Juz fields typed as the Pothos enum with EXHAUSTIVE DB-string → enum mappers ending in `const exhaustive: never` (pattern: `toSessionStatus` in `session.pothos.ts` — verify actual mapper name during implementation and mirror it).
    - `backend/graphql/pothos/classes/session-report-input.pothos.ts` (NEW) — `HomeWorkBlockInput`, `HomeWorkGradeInput`, `HomeWorkAssignmentInput`, `SubmitSessionReportInput` per plan §3.1 (closed whitelists; nullable `homework`/`previousGrades`).
    - Barrels: verify `backend/graphql/pothos/classes/index.ts` existence/shape (0.2) and wire the new modules per the barrel's existing convention.
  - Instruction files: `.agents/instructions/backend.instructions.md`; `backend/graphql/AGENTS.md` (verify in 0.2).
  - _Requirements: REQ-050, REQ-051, REQ-003_
  - [ ] 3.1.QL **Quality Loop**: sub-loop on each new/edited file (exit 0).
  - [ ] 3.1.TE **Test Engineering**: Tier 1 — mapper unit checks (every shipped `SurahJuzRef` member round-trips; unknown DB string hits the `never` tail → typed error); object field-exposure shape check via the SDL assertions in 3.4 (deferred to that task but authored here).
  - [ ] 3.1.SEC **Security & Tenancy Audit**: object surfaces expose NO column beyond plan §3.1 (no internal/audit fields); input objects contain NO server-derivable field (no `id`, no `sessionId`, no grades at assignment level, no timestamps).
  - [ ] 3.1.SR **Semantic Review**: `id` first on both objects; DateTime scalar discipline; no resolver-local types; `never`-tail exhaustiveness compiles (TS enforces).
  - [ ] 3.1.IV **Instruction Verification**: as 2.2.IV against the newly edited paths.

- [ ] 3.2 [Mutation resolver: submitSessionReport]
  - Create `backend/graphql/mutation/classes/session-report.mutation.ts`:
    - `submitSessionReport(id: ID!, input: SubmitSessionReportInput!): SessionReport!`.
    - `authScopes: { $all: { authenticated: true, role: [UserRole.Teacher] } }` — the `$all` conjunction is LOAD-BEARING (BFLA; anonymous → 401 pre-resolver; non-teacher → 403 pre-resolver).
    - Resolver body: `ctx.user` narrowing guard; parse `id` to positive-safe-int (reuse the house id-parsing helper located in 0.2 — do not re-implement); field-by-field argument pass (NO `{...input}` spread) into `SessionReportService.submitSessionReport(ctx.user.id, sessionId, mappedInput, ctx.locale, undefined, options)` — `options` (transport/cache passthrough) wired ONLY if the house resolver convention provides it (record from 0.2; else omit and note).
    - NO resolver-level try/catch: `DomainError`s propagate to the boundary finalizer with `extensions.code`; unexpected errors mask to `INTERNAL_SERVER_ERROR` by the existing transport.
    - Update barrel `backend/graphql/mutation/classes/index.ts` (+1 import line) per existing convention.
    - i18n: any resolver-local copy via `ctx.t("namespace")` ONLY (expected: none — service owns messages; assert emptiness in SR).
  - Instruction files: `.agents/instructions/backend.instructions.md`; `backend/graphql/AGENTS.md`.
  - _Requirements: REQ-051, REQ-031, REQ-032_
  - [ ] 3.2.QL **Quality Loop**: sub-loop on resolver (exit 0).
  - [ ] 3.2.TE **Test Engineering**: wire tests written in 5.1 consume this resolver — HERE add unit-adjacent checks available at this layer (authScopes object shape asserted via the schema-surface metadata if the harness permits; else covered fully in Phase 5 — note the coverage carrier).
  - [ ] 3.2.SEC **Security & Tenancy Audit**: `$all` conjunction verified in source; identity from `ctx.user.id` ONLY; no input-derived actor/tenant selection; locale from `ctx.locale`.
  - [ ] 3.2.SR **Semantic Review**: resolver is thin (<= ~25 LOC logic); no business rules; no spread; no error swallowing.
  - [ ] 3.2.IV **Instruction Verification**: as 2.2.IV.

- [ ] 3.3 [Query resolvers: sessionReport / sessionHomework]
  - Create `backend/graphql/query/classes/session-report.query.ts`:
    - `sessionReport(sessionId: ID!): SessionReport` (nullable); `sessionHomework(sessionId: ID!): SessionHomeWork` (nullable).
    - `authScopes: { authenticated: true }` (401 pre-resolver for anonymous).
    - Id shape guard pre-service; delegate to read functions from 2.8; return the nullable row directly (NO local wrapping/defaults).
    - Barrel `backend/graphql/query/classes/index.ts` (+1 import line).
  - Instruction files: as 3.2.
  - _Requirements: REQ-052, REQ-017, REQ-030_
  - [ ] 3.3.QL **Quality Loop**: sub-loop on resolver (exit 0).
  - [ ] 3.3.TE **Test Engineering**: shape-guard branches covered in Phase 5 wire suite; here assert the resolver file compiles into the schema with nullable return types (SDL check lands in 3.4).
  - [ ] 3.3.SEC **Security & Tenancy Audit**: no authorization decisions in resolver beyond scope (scoping lives in service); null-collapse not re-shaped here.
  - [ ] 3.3.SR **Semantic Review**: symmetric pair of resolvers; zero branching logic; no try/catch.
  - [ ] 3.3.IV **Instruction Verification**: as 2.2.IV.

- [ ] 3.4 [Codegen, schema-surface freeze & SDL pins]
  - Run `bun run generate:gqlSchema` then `bun codegen`; commit regenerated artifacts.
  - Update `backend/graphql/test/schema-surface.test.ts` baseline inventory: add `SessionReport`, `SessionHomeWork`, `SurahJuzRef` enum, the three input types, `Mutation.submitSessionReport`, `Query.sessionReport`, `Query.sessionHomework` (this baseline freezes the ENTIRE schema — update only by these additions).
  - Extend the session SDL suite (actual file per 0.2, e.g. `backend/graphql/test/session-sdl.test.ts`): static SDL assertions for exact field lists/order (`id` FIRST), nullability (`SessionReport`/`SessionHomeWork` query results nullable; mutation non-null), `DateTime` field types, and the input whitelist member sets.
  - Verify `docs/graphql/domain-error-extensions-code.md` remains append-only and the new code `SESSION_REPORT_ALREADY_EXISTS` is recorded there (if the doc is the code registry — update it; if registry lives elsewhere per 0.2, update THAT instead and record).
  - Instruction files: as 3.2.
  - _Requirements: REQ-053, REQ-050, REQ-002_
  - [ ] 3.4.QL **Quality Loop**: sub-loop on hand-edited test files (exit 0). Generated artifacts excluded from duplicate-lifecycle claims but included in compile pass.
  - [ ] 3.4.TE **Test Engineering**: run `bun run test/scripts/run-test.ts backend/graphql/test` — surface + SDL suites green; codegen drift must be ZERO (re-run codegen; git diff empty on generated files — paste diff evidence).
  - [ ] 3.4.SEC **Security & Tenancy Audit**: confirm no unintended schema surface appeared (schema diff review line-by-line vs. the additions list — anything extra = STOP and reconcile).
  - [ ] 3.4.SR **Semantic Review**: baseline inventory changes are purely additive; SDL pins assert EXACT shapes (no partial assertions where full is possible).
  - [ ] 3.4.IV **Instruction Verification**: as 2.2.IV.

---

## Phase 4: Frontend GraphQL Documents (documents-only — NO views, NO nav, NO .BF/.BS loops)

> This ticket ships no UI (specs §1 non-goals; plan D11). The mandatory 2×agent-browser loops apply ONLY to view/page tasks and are inapplicable here by scope ruling; their absence is deliberate, recorded to forestall review drift.

- [ ] 4.1 [Typed documents module + barrels + document contract tests]
  - Create `frontend/graphql/sharedDocuments/scheduling/session-report.documents.ts`:
    - `submitSessionReportMutationDocument: TypedDocumentNode<…>` selecting on `SessionReport`: `id` FIRST, then full plan §3.1 field list.
    - `sessionReportQueryDocument` and `sessionHomeworkQueryDocument` (nullable roots) with `id` first on every object selection; `createdAt`/`updatedAt` ride DateTime (codegen `string`); enum fields select as codegen `SurahJuzRef` members.
  - Update `frontend/graphql/sharedDocuments/scheduling/index.ts` barrel (+3 exports); root `frontend/graphql/sharedDocuments/index.ts` ONLY if it does not re-export the scheduling barrel (verified in 0.2).
  - Apollo cache: NO `keyFields: false` additions needed (both objects carry `id`; no envelope types on this surface) — VERIFY in `frontend/providers/apollo/apolloCache.ts` and record the no-change decision with anchor in the outcome.
  - Add document contract tests (location per frontend test convention recorded in 0.2): selection-set AST assertions — `id` is the first selection on every object type; no field outside the plan §3.1 contract is selected; documents reference only codegen-known fields (type-checked by codegen output).
  - NO component, page, store, hook, or nav file is touched. If any temptation arises (e.g., "minimal submit button"), STOP and add the impulse to the deferred ledger instead — DEV2-014 owns it (D3).
  - Instruction files: `.agents/instructions/frontend.instructions.md`; `frontend/AGENTS.md`, `frontend/graphql/AGENTS.md` (verify existence in 0.2).
  - _Requirements: REQ-054, REQ-055_
  - [ ] 4.1.QL **Quality Loop**: sub-loop on documents module + barrels + tests (exit 0).
  - [ ] 4.1.TE **Document Contract Tests**: AST/selection assertions above; `bun run test/scripts/run-test.ts <documents-test-path>` green; codegen types resolve (compile via the frontend typecheck pass).
  - [ ] 4.1.SEC **Security Audit (document-level)**: selection sets request NO field not in the server contract (prevents quiet over-fetch); no inline GraphQL string literals bypassing TypedDocumentNode.
  - [ ] 4.1.SR **Semantic Review**: zero UI code; zero hardcoded strings (documents contain no copy); naming matches sibling documents files; no dead exports.
  - [ ] 4.1.IV **Instruction Verification**: `.agents/instructions/frontend.instructions.md` + `frontend/graphql/AGENTS.md` items checked; `scripts/health/sub-loop.ts` discovery output pasted for the edited paths.

---

## Phase 5: Integration & Differential Testing

- [ ] 5.1 [GraphQL wire suite — scope matrix, smuggle probes, null-collapse byte identity]
  - Create/extend the wire-suite file (location per GraphQL test conventions recorded in 0.2, e.g. `backend/graphql/test/classes/session-report.wire.test.ts`):
    - **Auth matrix (pre-resolver):** anonymous mutation → 401 envelope; student/parent/admin mutation → 403 envelope; anonymous queries → 401. Each asserts single-error envelope parity (exactly one error, expected `extensions.code`, no data leakage in message).
    - **Closed-input smuggle probes:** submit with extraneous top-level input fields (`id`, `sessionId`, `teacherId`, `createdAt`, grades at assignment level) → `GRAPHQL_VALIDATION_FAILED` pre-resolver; unknown query fields rejected.
    - **Id-shape fuzz:** non-numeric, negative, zero, float, overflowing session ids → uniform typed denial (no 500s).
    - **Wire ≡ service payload equality:** a successful submit and both successful reads return payloads field-identical to the service-layer return (reprise of the session wire-suite discipline).
    - **Null-collapse byte identity:** foreign-teacher read response vs nonexistent-session read response → byte-identical normalized GraphQL response bodies for both queries (serialize-and-compare); participant read returns the row.
    - **Domain errors at the wire:** wrong-state submit → `SESSION_INVALID_TRANSITION`; duplicate submit → `SESSION_REPORT_ALREADY_EXISTS`; validation junk → `VALIDATION` — each with localized message in the requested Accept-Language (en + ar pass).
  - All via the house GraphQL test harness (transport-level, recorded in 0.2) — NOT service calls.
  - Instruction files: `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`.
  - _Requirements: REQ-063, REQ-031, REQ-030, REQ-051, REQ-052_
  - [ ] 5.1.QL **Quality Loop**: sub-loop on the wire suite (exit 0).
  - [ ] 5.1.TE **Test Engineering**: `bun run test/scripts/run-test.ts <wire-suite-path>` green; matrix completeness checked against plan §3.4 permission matrix — one row per cell, asserted.
  - [ ] 5.1.SEC **Security & Tenancy Audit**: this task IS the audit at the transport tier; ensure denial envelopes disclose no existence deltas and no stack traces (masking pass through the boundary finalizer).
  - [ ] 5.1.SR **Semantic Review**: no mocked services (wire tests hit the real stack with test-DB fixtures); envelope helper reused (no ad-hoc parsing).
  - [ ] 5.1.IV **Instruction Verification**: as 2.2.IV.

- [ ] 5.2 [Differential regression & coverage gate]
  - Run the FULL affected suites and capture results:
    - `bun run test/scripts/run-test.ts backend/db/repo` (all repository suites incl. pre-existing session suite — zero regressions).
    - `bun run test/scripts/run-test.ts backend/services/classes` (all service suites incl. pre-existing lifecycle suite — zero regressions).
    - `bun run test/scripts/run-test.ts backend/graphql` (surface + SDL + wire).
    - `bun run test/scripts/run-test.ts test/workflows` (journey green, 3 consecutive runs).
    - Frontend documents tests.
  - Coverage gate: 100% statements/branches on ALL new backend modules (repositories ×2, guards, notification module, service, resolvers) — paste coverage report excerpt in the outcome.
  - Codegen drift final check: `bun run generate:gqlSchema && bun codegen` → `git diff --stat` empty on generated artifacts.
  - Baseline comparison vs 0.1: tsgo/biome/lint-service/oxlint totals ≤ baseline (any rise fixed before check-off).
  - Write `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/5.2-outcome.md` with the full matrix (suite → tests passed/failed/skipped counts → deltas).
  - _Requirements: REQ-060, REQ-061, REQ-063, REQ-064_

---

## Phase 6: Post-Implementation Review Waves (parallel-ordered)

> Waves run as independent review passes. Each appends findings to `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/6-review-waves.md`. Critical findings BLOCK completion until fixed; nits are fixed in-wave or deferred via a NEW ledger row.

- [ ] 6.1 [Review wave: types & schema]
  - Reviewer pass over: Phase 1 diffs (schema verdicts honored exactly; constraints named as planned; nullability final state), `backend/types/` additions (canonical discipline; no service `.types.ts`; barrels), enum guard pattern-conformance to `isApplicantStatus`, DateTime/enum typing at the Pothos layer.
  - Confirm C.4: no `teacher_id` anywhere in `reports` schema/types/Surface (grep evidence pasted).
- [ ] 6.2 [Review wave: backend services, repos & concurrency]
  - Deep review of: pipeline order vs plan §4.2 (step-for-step), `tx` propagation completeness (every call inside the unit), FOR UPDATE gate scope, 23505 cause-chain scoping (constraint-name precision), grade-once guard correctness, D5 first-session semantics, publish-after-commit ordering, denial logging budget (exactly one logDomainError per denial), REQ-044 purity (grep for accidental wallet/fee writes).
  - Re-examine concurrency tests' real-world fidelity; verify storm determinism evidence.
- [ ] 6.3 [Review wave: frontend (documents scope)]
  - Documents module conformance (selection rules, typing, barrels); confirm genuinely ZERO view/page/nav diffs in the changeset (changeset listing pasted); apolloCache no-op decision re-verified.
  - Explicitly record: `.BF`/`.BS` agent-browser loops not applicable (no UI surface) — pointer to specs §1 non-goals to preempt reviewer escalation.
- [ ] 6.4 [Pentester wave]
  - Threat sweep against REQ-030/031/032/033/034 and plan §6: oracle-collapse byte identity (re-run evidence), `$all` scope presence, governance re-check presence (with the ctx-not-fail-closed rationale), BOPLA field-by-field mapping proof (diff `SubmitSessionReportInput` members vs `ReportInsertType` write set), LIKE/injection N/A justification, notification privacy (names-only bodies), audit-log absence intentional (A.5 alignment recorded), rate-limit stub posture acknowledged.
  - Attempt at least one adversarial smuggle beyond the wire suite (e.g., nested extra keys inside `homework` block) and record result.
- [ ] 6.5 [Deferred-items reconciliation]
  - Re-read `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/deferred-items.md`: every row D1–D5 still valid (not accidentally implemented, not claimable as done); any NEW deferral introduced across Phases 1–5 is recorded with owner/status; any item RESOLVED in-flight is marked with the resolving task id.
  - If the ledger drifted from specs' pre-seeds, reconcile and note authority source.
  - _Requirements: REQ-001, REQ-002_

---

## Phase 7: Knowledge Propagation & Documentation

- [ ] 7.1 [Canonical doc: docs/sessions/session-report-homework.md]
  - Write the canonical reference in house doc style (Why → Pattern → Rules → What NOT to Do → Rollout Summary → Related Documents) covering: gate invariants (INV-S7 write gate; governance re-check), report+homework co-creation contract (INV-S8), first-vs-subsequent grading ruling (INV-HW3/HW4 + D5 split), one-shot grade guard, one-report-per-session unique arbiter + `SESSION_REPORT_ALREADY_EXISTS`, oracle-collapse reads (D9), notification choreography (REQ-018/019, recipient-locale, publish-after-commit, idempotency key `session:{id}:report`), append-only posture (D10), pure-wallet discipline (INV-S3), and the consumer table (DEV2-014 submit UX, DEV2-015 Surah/Juz UI, DEV1-016/017 parent portal, DEV2-017 rating aggregation, DEV3-012/013 dual-confirmation/escrow, DEV2-019 admin tracking) with "what each may rely on" rows.
  - _Requirements: REQ-070_

- [ ] 7.2 [Session-lifecycle doc amendment + AGENTS.md propagation]
  - `docs/sessions/session-lifecycle.md` (UPDATE) — §10 consumer table: amend the INV-S7/S8 enforcement note — this surface LANDED in DEV3-006 (remove the "DEV3-005-owned/forward" phrasing; cite `docs/sessions/session-report-homework.md`); amend the report row to "implementation shipped" with the plan-directory citation.
  - AGENTS.md updates (each a minimal, surgical addition; verify file existence before editing):
    - `backend/db/repo/AGENTS.md` — classes repositories: report/home-work repos + `lockForReportGate`/`findReportWaveContextById` additions; one-report/one-homework-per-session constraint names.
    - `backend/services/AGENTS.md` — `SessionReportService` entry (write gate, atomic co-creation, publish-after-commit) + single-writer Notifications discipline reaffirmation.
    - `backend/types/AGENTS.md` — new type exports.
    - `backend/graphql/AGENTS.md` — `SurahJuzRef` enum registration + new objects/mutation/queries.
    - `shared/AGENTS.md` — new errors keys + notification slots (namespace additions section).
    - Root `AGENTS.md` — Important References one-line pointer to `docs/sessions/session-report-homework.md`.
  - _Requirements: REQ-071, REQ-072_

- [ ] 7.3 [Final outcome synthesis & closure]
  - Write `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/outcome/final-outcome.md`:
    - Executive summary vs specs: every REQ-0xx mapped to {task id → outcome file → verification evidence} in a traceability table (use specs §4 matrix as the skeleton; fill implementation columns).
    - Phase 6 findings resolution record (each finding: fixed-in-task / deferred-with-ledger-row).
    - Final test matrix (5.2 + post-fix reruns), coverage evidence, drift evidence, baseline compliance evidence.
    - Deferred-items final snapshot (D1–D5 + any additions).
    - Known limitations & handoff notes for DEV2-014 (consumable documents list: exact export names + file path), DEV1-016 (parent read surface boundary), DEV2-017 (rating rows location).
  - Flip ALL remaining checkboxes only after this file exists.
  - _Requirements: REQ-001, REQ-070, REQ-071, REQ-072_

---

### Completion Definition (all must hold)
1. Every checkbox above is `[x]` with an outcome file on disk backing it.
2. `bun run test/scripts/run-test.ts test/workflows`, repo suites, service suites, `backend/graphql` suites, wire suite, and document tests — all green.
3. Quality-loop totals ≤ Phase-0 baseline; codegen drift zero.
4. Ledger `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/deferred-items.md` current and reconciled.
5. `docs/sessions/session-report-homework.md` published; session-lifecycle condo amended; AGENTS.md propagation complete.
