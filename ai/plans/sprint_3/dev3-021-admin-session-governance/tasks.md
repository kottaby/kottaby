# Tasks — DEV3-021 Admin Session Governance

> **Plan directory (verbatim):** `ai/plans/sprint_3/dev3-021-admin-session-governance`
> **Specs:** `specs.md` (REQ-001..REQ-081) · **Plan:** `plan.md` (D-01..D-07)

> **Execution protocol (mandatory):** (1) Pre-execution outcome read — before every task, read ALL files in `outcome/`; (2) post-task outcome write — `outcome/<task-id>-outcome.md`; (3) checkbox tracking — mark `[x]` in this file as each subtask completes; (4) test runs via `bun run test/scripts/run-test.ts`; (5) per-file quality loop via `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` exit 0; (6) ZERO changes outside this plan's file list without a ❌ deferred entry + orchestrator sign-off.

---

## Phase 0 — Pre-Implementation Baseline

- [x] 0.1 Record baseline counts (tsgo/biome/lint/duplicates) in `outcome/0.1-baseline-outcome.md`
- [x] 0.2 Initialize `deferred-items.md` from template + register known forward-owed items (D-01..D-05)
- [x] 0.3 Verify-then-claim sweep with `path:line` anchors for every reuse target listed in REQ-002 (write table in `outcome/0.2-prerequisites.md`); MISSING ⇒ ❌-defer + stop affected tasks — never patch foreign layers
- [x] 0.4 Plan-review gate — run `.agents/skills/plan-review` logic over specs+plan; findings resolved → re-run until clean; record `outcome/0.3-plan-review-outcome.md`

---

## Phase 1 — Types & i18n Substrate

- [x] 1.1 **CREATE `backend/types/classes/admin-session-governance.types.ts`** — inputs + `AdminSessionRowReturnType`; export from `backend/types/classes/index.ts` (REQ-004, REQ-010..REQ-029)
  - [x] 1.1.QL sub-loop duplicates → 0
  - [x] 1.1.TE Type-shape unit test: file-level compile assertions + zod schema round-trips (`backend/types/classes/admin-session-governance.types.test.ts`)
  - [x] 1.1.SEC Confirm fields are UI-safe (no secrets)
  - [x] 1.1.SR No other `.types.ts` introduced; canonical-only
  - [x] 1.1.IV `.agents/instructions/backend.instructions.md`
- [x] 1.2 **Zod input schemas + errors extension** — extend `shared/locale/{types,en,ar}/errors` with `session` namespace entries consumed by services (REQ-002, REQ-050, REQ-051)
  - [x] 1.2.QL / 1.2.TE (parity test routes through existing en↔ar key-parity harness) / 1.2.SEC / 1.2.SR / 1.2.IV
- [x] 1.3 **Codes registration** — append `SESSION_INVALID_TRANSITION` usages to centralized code list if needed by error contract util (verify `docs/graphql/error-handling-contract.md` first — record in 1.3.OUT whether the code already exists)

---

## Phase 2 — Repository

- [x] 2.1 **CREATE methods on SessionRepository** (`backend/db/repo/classes/session.repository.ts`): `listForAdmin`, `getAnyByIdForAdmin`, `guardReschedule`, `guardCancelPreTerminal`, `guardReassignTeacher` (REQ-010, REQ-012, REQ-020..025, REQ-040/041/042)
  - [x] 2.1.QL / 2.1.TE / 2.1.SEC (BOPLA-whitelist audit) / 2.1.SR (no N+1) / 2.1.IV
  - [x] 2.1.TE writes `backend/db/test/repo/session-repository.admin.test.ts` — 100% branch over guards; uses `runInRollback`, `tx` everywhere (Tier-1/2/3)
- [x] 2.2 **Create helper `assertCertifiedTeacher`** in TeacherRepository surface IF missing (ticket-scoped; else reuse) — outcome records decision (REQ-024)

---

## Phase 3 — Service

- [x] 3.1 **CREATE `backend/services/classes/session-admin-governance.ts`** — all six functions, namespace registration onto `SessionLifecycleService.Namespace`-style re-export via `backend/services/classes/index.ts` (REQ-010..REQ-029, REQ-040..044)
  - [x] 3.1.QL / 3.1.TE / 3.1.SEC / 3.1.SR / 3.1.IV
  - [x] 3.1.TE `backend/services/classes/session-admin-governance.service.test.ts` — 4-tier suite; Tier-3 concurrency via `Promise.allSettled` around concurrent cancel+confirm; Tier-4 non-admin role matrix
- [x] 3.2 **Notification wave emitters** — register three new wave ids with `SessionRequestNotificationService` + recipient-locale copy keys (REQ-020, REQ-022, REQ-024)
  - subtasks QL/TE/SEC/SR/IV as above

---

## Phase 4 — GraphQL

- [x] 4.1 **CREATE** `backend/graphql/pothos/classes/session-filter-input.pothos.ts` addition: `AdminSessionListFilterPothosInput` (REQ-061)
  - subtasks 4.1.QL / 4.1.TE / 4.1.SEC / 4.1.SR / 4.1.IV
- [x] 4.2 **CREATE** `backend/graphql/query/classes/admin-session-governance.query.ts` — `adminSessions`, `adminSession` (REQ-010..012, REQ-030, REQ-060)
  - subtasks as above; register in `backend/graphql/query/classes/index.ts` barrel
- [x] 4.3 **CREATE** `backend/graphql/mutation/classes/admin-session-governance.mutation.ts` — 4 mutations (REQ-020..027, REQ-030, REQ-060); register barrel
  - subtasks as above; Tier-3 idempotency retries; Tier-4 401/403 byte-identical
- [x] 4.4 **Codegen** — `bun run generate:gqlSchema && bun codegen` (REQ-060); verify generated TS types include new ops

---

## Phase 5 — Frontend & Navigation

- [x] 5.1 **CREATE** `frontend/graphql/sharedDocuments/adminSessions.documents.ts` (REQ-063) — subtasks QL/TE/SEC/SR/IV
- [x] 5.2 **CREATE view component tree** (`frontend/views/admin/session-governance/*`) per plan §5 (REQ-064)
  - [x] 5.2.1 Container/Chrome
    - subtasks QL/TE/BF/BS/SR/IV
  - [x] 5.2.2 Body + Row + StatusCell
    - subtasks QL/TE/BF/BS/SR/IV
  - [x] 5.2.3 Drawer + 3 dialogs + Join action
    - subtasks QL/TE/BF/BS/SR/IV
  - [x] 5.2.4 **Component tests** (Happy DOM + MockedProvider in `test/ui/components/admin-session-governance/*`) covering: directory render, badge matrix, all dialog open/confirm/submit paths, 403 error tenant denial display
- [x] 5.3 **CREATE route page** `app/(dashboard)/admin/session-governance/page.tsx` with `withPageAuth` admin-gate (REQ-064)
  - subtasks QL/TE/BF/BS/SR/IV + visual RTL+desktop+mobile matrix screenshots
- [x] 5.4 **Nav registration** — `frontend/views/dashboard/nav/navItems.ts` admin block addition + `navItems.test.ts` assertion update (REQ-081)
  - subtasks QL/TE/SR/IV
- [x] 5.5 **Playwright e2e** — one smoke covering filter → cancel → audit-visible path (`test/ui/e2e/admin-session-governance.spec.ts`); run via existing e2e runner
  - subtasks QL/TE/SR/IV

---

## Phase 6 — Cross-Actor Journey Tests (TEST-FIRST)

Journeys live in `test/workflows/admin/admin-session-governance.journey.test.ts` and are authored BEFORE the service (test-first); they may initially fail/pending until Phase 3 lands.

- [ ] 6.1 **W-1 cancel-with-refund journey** — fixtures (student+teacher+scheduled-with-hold) committed in `beforeAll`, deleted in `afterAll`; REAL services → REAL DB; asserts post-commit notification queue side-effect and refund landing
  - [ ] 6.1.QL / 6.1.TE / 6.1.SR / 6.1.IV
- [ ] 6.2 **W-2 reassign journey** — observer-perspective asserts (student sees new teacher, old/new teachers get waves), certification-denial reflexivity
  - [ ] 6.2.QL / 6.2.TE / 6.2.SR / 6.2.IV
- [ ] 6.3 **W-3 join journey** — audit row count delta == 1 for allowed; == 0 for denied state
  - [ ] 6.3.QL / 6.3.TE / 6.3.SR / 6.3.IV
- [ ] 6.4 **W-4 role-denial matrix** — 5 roles × 7 operations × (401|403) — byte-identical comparisons
  - [ ] 6.4.QL / 6.4.TE / 6.4.SEC / 6.4.SR / 6.4.IV

---

## Phase 7 — Knowledge Propagation

- [ ] 7.1 **CREATE `docs/admin/admin-session-governance.md`** (canonical ref covering REQ-080 topics) — subtasks QL/SR/IV
- [ ] 7.2 **AGENTS.md updates** — root AGENTS.md Important References + `backend/services/AGENTS.md` + `frontend/views/AGENTS.md` (1-2 line rule each) referencing the doc
  - subtasks QL/SR/IV
- [ ] 7.3 **Regression sweep** — full quality-gate baseline comparison; write `outcome/final-review-outcome.md`; mark all tasks `[x]`

---

## Cross-cutting Status & Ledger

- Deferred items D-01..D-05 superseded by `deferred-items.md` file (canonical ledger).
- Completion definition: EVERY `[ ]` → `[x]`, EVERY task has an outcome file, baseline deltas all ≤ baseline, ZERO ❌ items remain in `deferred-items.md`.
