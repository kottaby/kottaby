# Trackable Implementation Tasks — DEV2-021 Audit Trail Completeness Verification

# tasks.md — DEV2-021 Audit Trail Completeness Verification

> **Plan directory (verbatim — every header, ledger path, outcome path, and self-reference in this document uses this exact string):** `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification`
> **Specs of record:** `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/specs.md` (REQ-001..REQ-096)
> **Plan of record:** `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/plan.md` (D1..D10)
> **Property-Based Testing notes:** no property libraries; coverage expressed as branch matrices, reconciliation/count oracles, chaos rollback/replay proofs per REQ-070..074.

---

## Non-Negotiable Execution Protocol (MANDATORY for EVERY task)

1. **Pre-Execution Outcome Knowledge Read (MANDATORY):** BEFORE starting any task, read ALL existing files under `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/outcome/`. Incorporate prior decisions, hazards, baselines, and ledger entries. Never re-litigate a resolved item without a new ledger entry.
2. **Post-Edit Verification (MANDATORY):** after EVERY file creation/modification, run `bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates` and require exit code 0.
3. **Test Execution (MANDATORY):** run test files ONLY via `bun run test/scripts/run-test.ts <test-path>` (NEVER raw `bun test`).
4. **Semantic Review Self-Check (MANDATORY):** before marking complete: atomicity of writes, ZERO dead code, NO cross-layer imports, enums as value imports, `DomainError`-only taxonomy, `logger` only (never `console.*`), field-by-field DTO construction, i18n via sanctioned channel per layer, NO `runInRollback` in `test/workflows/**`.
5. **Outcome Documentation (MANDATORY):** write `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/outcome/<task-id>-outcome.md` per completed task.
6. **Checkbox Tracking (MANDATORY):** tick `[ ]` → `[x]` on the task line AND each completed subtask immediately upon completion.

---

## Phase 0: Pre-Implementation Baseline

- [ ] 0.1 [Record baseline error counts & initialize deferred-items ledger]
  - Record baselines: `bun tsgo` (exit + count), `bun run biome:check` (count), lint-service count; capture verbatim `git diff --name-only` set.
  - Initialize `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/deferred-items.md`, PRE-SEEDED with the four resolved-pointer rows from plan.md §8 (FWD-adjust-emitter, FWD-suspend-emitter, READINESS-1.3-checkbox-flip, DOC-audit-trail-§10-amend) — zero ❌ markers at seed time.
  - Write `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/outcome/0-baseline-outcome.md`.
  - _Requirements: REQ-001_

- [ ] 0.2 [Verify reuse substrate & substrate grounding (Verify-then-Claim)]
  - Verify-then-claim against the LIVE tree (record `path:line` anchors in the outcome):
    - `AuditService.createAuditLog` (`backend/services/admin/audit.service.ts:82-90`) and `AUDIT_DETAILS_MAX_LENGTH` truncation.
    - Emitters: user-management create/update/delete/reactivate call sites (`backend/services/admin/user-management.service.ts:312-313, 374, 437-439`), cold-start override (`backend/services/admin/cold-start-certification.service.ts:201-212`), broadcast (`backend/services/notifications/admin-broadcast.service.ts:393-402`) incl. replay guard.
    - `AuditTrailService.listAuditTrail` + snapshot tx (`backend/services/admin/audit-trail.service.ts:228-256`); repo `AuditTrailRepository.listEntries/countEntries` (`backend/db/repo/audit/audit-trail.repository.ts:142-176`).
    - `audit_logs` schema + indexes (`backend/db/schema/audit/audit-logs.ts`) and immutability triggers (`backend/db/migration/3-immutability-triggers.sql`).
    - `AuditActionType` enum (`backend/enum/audit/audit-action-type.enum.ts`) and pgEnum values (`backend/db/schema/enums.ts`).
    - Canonical types (`backend/types/audit/audit-log.types.ts`, `backend/types/contracts/admin-audit.contract.types.ts`).
    - Harness: `test/workflows/helpers/` (`TrackedFixtures`, actor factories), `test/workflows/AGENTS.md` rules 1-5, `withAuditDeleteTriggersSuspended` (`test/helpers/db-cleanup.ts`), existing journeys (`test/workflows/admin/audit-trail.journey.test.ts`, `admin-user-lifecycle.journey.test.ts`, `admin-user-denials.journey.test.ts`, `cold-start-certification.journey.test.ts`).
    - Existing locks: `backend/db/test/logic/audit/audit-immutability.test.ts`, `audit-trail.repository.test.ts`, `backend/services/admin/audit-trail.service.test.ts`, `backend/graphql/test/audit-trail.query.test.ts`.
  - IF any reuse artifact is missing → record ❌ ledger row in `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/deferred-items.md` and BLOCK dependents — never fork a second writer/scanner.
  - _Requirements: REQ-001, REQ-010, REQ-011_

- [ ] 0.3 [Phase 1.5 Plan-Review Gate]
  - Invoke `@plan-review` over the trio (`specs.md`, `plan.md`, `tasks.md`) under `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/`.
  - Resolve ALL findings; write `outcome/plan-review-R1.md` with verdict.
  - GATE: Phases 1-6 MUST NOT begin until the gate passes.
  - _Requirements: REQ-083_

---

## Phase 1: Canonical Registry Module

- [ ] 1.1 [Create `backend/services/admin/audit-action-registry.ts` + barrel export]
  - CREATE the module exactly per plan.md §5.1 (frozen `ADMIN_AUDIT_ACTIONS`, `AdminAuditActionDescriptor` interface, six `implemented` rows + two `forward` rows); NO new `.types.ts` file (interface lives IN the module as part of the registry contract since it is consumed only by audit tests + scan — if Shared consumption emerges, hoist to `backend/types/contracts/` in that task instead).
  - Add `export * from "./audit-action-registry";` to `backend/services/admin/index.ts` (single `./` segment; no imports in barrel).
  - Applicable instruction files: `.agents/instructions/backend.instructions.md`.
  - _Requirements: REQ-003, REQ-010_
  - [ ] 1.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/admin/audit-action-registry.ts --lifecycle duplicates` (exit 0) + `bun tsgo` clean + same for `backend/services/admin/index.ts`.
  - [ ] 1.1.TE **Test Engineering**: type/value surface asserted by the registry unit test in 1.2 (Tier 1).
  - [ ] 1.1.SEC **Security & Tenancy Audit**: descriptor carries zero PII and zero credentials — confirm by inspection.
  - [ ] 1.1.SR **Semantic Review**: single enumeration, no duplication of emitter facts beyond `emitterFile`/`serviceMethod` anchors; forward rows lack emitter anchors by design.
  - [ ] 1.1.IV **Instruction Verification**: validate against `.agents/instructions/backend.instructions.md` + `backend/services/AGENTS.md`.

- [ ] 1.2 [Registry unit matrix — structure, vocabulary, integrity]
  - CREATE `backend/services/admin/audit-action-registry.test.ts` (4-Tier):
    - Tier 1 Branch: every descriptor has non-empty `operation`, valid `AuditActionType` enum member, `entityType` within frozen vocabulary.
    - Tier 2 Boundary: no duplicate `operation` keys; `producerStatus === "implemented"` rows MUST have non-empty `emitterFile`+`serviceMethod`; `forward` rows MUST have empty anchors.
    - Tier 3 Chaos: registry is frozen (mutation attempt fails under strict TS/freeze semantics); enumeration count pinned (6 implemented + 2 forward) — changed count fails the test (drift guard).
    - Tier 4 Security: no descriptor field contains PII-shaped strings (regex denylist).
  - _Requirements: REQ-010, REQ-019, REQ-070_
  - [ ] 1.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/admin/audit-action-registry.test.ts --lifecycle duplicates` (exit 0).
  - [ ] 1.2.TE **Test Engineering**: run via `bun run test/scripts/run-test.ts backend/services/admin/audit-action-registry.test.ts`.
  - [ ] 1.2.SEC **Security & Tenancy Audit**: Tier 4 denylist present.
  - [ ] 1.2.SR **Semantic Review**: enum values imported (never literals); counts pinned.
  - [ ] 1.2.IV **Instruction Verification**: `.agents/instructions/backend.instructions.md` + `.agents/instructions/tests.instructions.md`.

---

## Phase 2: Single-Writer & Completeness Static Scan

- [ ] 2.1 [Create static scan suite `backend/db/test/logic/audit/audit-single-writer-scan.test.ts`]
  - Tier 1 Branch: scan `backend/services/**/*.ts` (excluding `audit.service.ts` itself and `*.test.ts`) — assert `auditLogs` insert occurs ONLY inside `AuditService.createAuditLog`; assert every `producerStatus: "implemented"` descriptor's `emitterFile` exists on disk and its source contains a `createAuditLog(` call AND a `withTransaction(` (or equivalent caller-tx) within the same file; deny paths enumerated in JR-C-1 do not call `createAuditLog` on denial branches (pattern assertion on the denial order in `user-management.service.ts`).
  - Tier 2 Boundary: scan is exhaustive over the directory glob (count assertion of scanned files), excludes test/helpers/seeds directories explicitly.
  - Tier 3 Chaos: introduce a deliberate catalog divergence check via fixture string (a temp string written by the test itself) to prove the scanner would catch a rogue insert (self-test of the oracle).
  - Tier 4 Security: assert no service source embeds raw SQL that inserts into `audit_logs` outside the writer (grep for `INSERT INTO audit_logs`).
  - MUST NOT modify production code; pure static scan.
  - _Requirements: REQ-011, REQ-032, REQ-070_
  - [ ] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/test/logic/audit/audit-single-writer-scan.test.ts --lifecycle duplicates` (exit 0).
  - [ ] 2.1.TE **Test Engineering**: run via `bun run test/scripts/run-test.ts backend/db/test/logic/audit/audit-single-writer-scan.test.ts`.
  - [ ] 2.1.SEC **Security & Tenancy Audit**: scan proves no shadow writers (BFLA on write path).
  - [ ] 2.1.SR **Semantic Review**: absolute repo-root anchored globs; no hardcoded line numbers that rot (anchor on function names, not `path:line`).
  - [ ] 2.1.IV **Instruction Verification**: `.agents/instructions/backend.instructions.md` + `.agents/instructions/tests.instructions.md`.

---

## Phase 3: Per-Action Behavioral Verification (Service Tier)

- [ ] 3.1 [Create `backend/services/admin/audit-completeness.service.test.ts` — per-action rows via `runInRollback`]
  - Uses `runInRollback` and passes `tx` to ALL repo calls; creates fixtures via `entity-setup.ts` helpers ONLY.
  - For each `implemented` descriptor: perform the service call inside the rollback tx with a REAL admin actor id, then read `audit_logs` through a tx-scoped query asserting: exactly one NEW row, `actorId` = caller id, `actionType`/`entityType` match descriptor, `entityId` matches (or `null` for broadcast), `details` parses as JSON and is ≤ 2000 chars, `createdAt` within window.
  - Broadcast: run with spied engine cache (mock at engine boundary only) — assert fresh path mints exactly 1 row, replay mints 0.
  - Rolls back cleanly at suite end (no residue; `runInRollback` guarantees).
  - _Requirements: REQ-012..REQ-018, REQ-020, REQ-023, REQ-024, REQ-040, REQ-070, REQ-071, REQ-073_
  - [ ] 3.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/admin/audit-completeness.service.test.ts --lifecycle duplicates` (exit 0).
  - [ ] 3.1.TE **Test Engineering**: `bun run test/scripts/run-test.ts backend/services/admin/audit-completeness.service.test.ts`; Tier 2 boundary on details-length truncation (payload > 2000 chars → stored truncated, no error).
  - [ ] 3.1.SEC **Security & Tenancy Audit**: Tier 4 — PII denylist scan of stored `details` (no email/phone/passwordHash/pre-post pairs); tampered-actor input cannot alter `actorId`.
  - [ ] 3.1.SR **Semantic Review**: no `expect(...).rejects.toThrow()`; try/catch helper + translated substrings via `getServerTranslations("en").errorsTranslations`; enum value imports only.
  - [ ] 3.1.IV **Instruction Verification**: `.agents/instructions/backend.instructions.md` + `.agents/instructions/tests.instructions.md`.

- [ ] 3.2 [Chaos tier — rollback co-fate & concurrency]
  - Add to the same suite (or `audit-completeness.chaos.test.ts` if size requires):
    - Co-fate: orchestrate a failure AFTER the audit insert within the same transaction (e.g. force a later guarded statement to throw) → assert zero matching audit rows survive.
    - Concurrency: run two distinct admin mutations in parallel (separate connections via real services) → assert both rows present and `listAuditTrail` snapshot returns consistent total.
  - _Requirements: REQ-023, REQ-040, REQ-041, REQ-095, REQ-096_
  - [ ] 3.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` (exit 0).
  - [ ] 3.2.TE **Test Engineering**: `bun run test/scripts/run-test.ts <file>`; assert no flakes across 3 consecutive runs.
  - [ ] 3.2.SEC **Security & Tenancy Audit**: parallel producer uses a DIFFERENT admin id — rows carry distinct actor ids.
  - [ ] 3.2.SR **Semantic Review**: no timing-dependent sleeps; synchronization via barriers/promise joins only.
  - [ ] 3.2.IV **Instruction Verification**: `.agents/instructions/backend.instructions.md` + `.agents/instructions/tests.instructions.md`.

---

## Phase 4: Cross-Actor Journey (TEST-FIRST harness compliance)

- [ ] 4.1 [Create `test/workflows/admin/audit-trail-completeness.journey.test.ts` — Journey 1 (produce→observe→reconcile)]
  - Committed fixtures in `beforeAll` inside ONE committing transaction; actors: Admin Producer A, Admin Observer B (different id), target student + teacher + parent fixtures; tracked in `TrackedFixtures`; unique prefix `jrn_audc_${randomUUID().slice(0,8)}`.
  - Execute Journey 1 steps 1-8 from specs §2.9 via REAL services against the real test DB; observer reads via real `AuditTrailService`; reconcile counts scoped to the run prefix (entity ids created by this run).
  - afterAll: teardown via `withAuditDeleteTriggersSuspended` — delete audit rows FIRST (`actor_id` FK RESTRICT + immutability trigger), then notifications, role children, users; mandatory post-teardown re-probes proving baselines restored.
  - _Requirements: REQ-012..REQ-024, REQ-090..REQ-092, REQ-072, REQ-073, REQ-074_
  - [ ] 4.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts test/workflows/admin/audit-trail-completeness.journey.test.ts --lifecycle duplicates` (exit 0).
  - [ ] 4.1.TE **Test Engineering**: `bun run test/scripts/run-test.ts test/workflows/admin/audit-trail-completeness.journey.test.ts`; repeat run proves residue-free (baselines stable).
  - [ ] 4.1.SEC **Security & Tenancy Audit**: observer is a DIFFERENT admin — cross-actor visibility proof; PII denylist on `details`.
  - [ ] 4.1.SR **Semantic Review**: NO `runInRollback`; try/catch denial pattern; translated substrings; per rules in `test/workflows/AGENTS.md`.
  - [ ] 4.1.IV **Instruction Verification**: `.agents/instructions/tests.instructions.md` + `test/workflows/AGENTS.md`.

- [ ] 4.2 [Extend the same suite — Journey 2 (denials mint zero rows) + Journey 3 (rollback/replay)]
  - Anonymous + student/parent/teacher/supervisor denial probes on representative admin mutations and the trail read; whole-table row-count oracle before/after (JR-C-1).
  - Tampered-actor input probe (REQ-094); broadcast replay probe (REQ-096); forced-rollback probe (REQ-095).
  - _Requirements: REQ-030..REQ-035, REQ-093..REQ-096_
  - [ ] 4.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts test/workflows/admin/audit-trail-completeness.journey.test.ts --lifecycle duplicates` (exit 0).
  - [ ] 4.2.TE **Test Engineering**: `bun run test/scripts/run-test.ts test/workflows/admin/audit-trail-completeness.journey.test.ts`.
  - [ ] 4.2.SEC **Security & Tenancy Audit**: denial audience matrix complete (anonymous, student, parent, teacher, supervisor).
  - [ ] 4.2.SR **Semantic Review**: count oracles not spies (no external channels on audit surface); honest authorization (real role context).
  - [ ] 4.2.IV **Instruction Verification**: `.agents/instructions/tests.instructions.md` + `test/workflows/AGENTS.md`.

---

## Phase 5: Immutability Re-Verification & Documentation Gates

- [ ] 5.1 [Re-verify immutability lock + amend `docs/admin/audit-trail.md` §10]
  - Re-run `bun run test/scripts/run-test.ts backend/db/test/logic/audit/audit-immutability.test.ts` and `.../audit-trail.repository.test.ts`; record pass evidence in outcome.
  - Amend ONLY §10 "Test Locks" of `docs/admin/audit-trail.md` to register: `backend/services/admin/audit-action-registry.ts(+test)`, `backend/db/test/logic/audit/audit-single-writer-scan.test.ts`, `backend/services/admin/audit-completeness.service.test.ts`, `test/workflows/admin/audit-trail-completeness.journey.test.ts`.
  - Do NOT flip `docs/planning/PRODUCTION_READINESS.md` §1.3 checkboxes (REQ-081 → ledger pointer).
  - [ ] 5.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts docs/admin/audit-trail.md --lifecycle biome` (markdown docs — biome/structure validation per sub-loop handling; skip tsgo on md).
  - [ ] 5.1.TE **Test Engineering**: re-run results recorded in outcome with exit codes.
  - [ ] 5.1.SEC **Security & Tenancy Audit**: doc amendment is pointer-only; no contract text altered.
  - [ ] 5.1.SR **Semantic Review**: one-owner doc discipline preserved; no duplicated contract statements.
  - [ ] 5.1.IV **Instruction Verification**: `.agents/instructions/backend.instructions.md`.
  - _Requirements: REQ-042, REQ-080, REQ-081_

---

## Phase 6: Full Quality Gate & Regression Sweep

- [ ] 6.1 [Run gates in order and record evidence]
  - `bun tsgo` → `bun oxlint` → `bun run biome:check` → `bun run scripts/lint-service.ts -f <touched files> --id dev2-021` → `bun run check:duplicates` → `bun quality-gate`.
  - Re-run ALL touched suites via `bun run test/scripts/run-test.ts` (3 service/logic suites + 1 workflow suite) + re-run the pre-existing audit locks (`audit-immutability`, `audit-trail.repository`, `audit-trail.service`, `audit-trail.query`).
  - _Requirements: REQ-070..074_
  - [ ] 6.1.QL **Quality Loop**: every touched file passes `--lifecycle duplicates`.
  - [ ] 6.1.TE **Test Engineering**: all suites exit 0 with run-test logs captured.
  - [ ] 6.1.SEC **Security & Tenancy Audit**: final denial matrix green.
  - [ ] 6.1.SR **Semantic Review**: no `jscpd:ignore`, no `oxlint-disable`, no cache deletion.
  - [ ] 6.1.IV **Instruction Verification**: `.agents/instructions/{backend,tests}.instructions.md`.

## Phase 7: Knowledge Propagation & Closeout

- [ ] 7.1 [Outcome docs + ledger closure]
  - Ensure each task wrote its outcome doc; write final `outcome/7-closeout-outcome.md` summarizing evidence, baseline deltas, git diff set, and forward pointers.
  - Update `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/deferred-items.md` statuses: forward rows marked ✅-registered (registry rows exist) with owner pointers intact; readiness checkbox row remains open for release manager.
  - _Requirements: REQ-082_
  - [ ] 7.1.QL: n/a (docs-only) — run sub-loop on ledger file if applicable.
  - [ ] 7.1.TE: n/a.
  - [ ] 7.1.SEC: final confirm zero ❌ unresolved beyond sanctioned forward rows.
  - [ ] 7.1.SR: cross-check every REQ id in specs.md is cited by ≥1 task.
  - [ ] 7.1.IV: `.agents/instructions/tests.instructions.md`.
