# DEV3-005 — Session Status State Machine Enforcement — Tasks

**Plan directory:** `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/`
**Spec:** `specs.md` · **Design:** `plan.md` · **Ledger:** `deferred-items.md`

Genres: every backend task carries the mandatory subtask pipeline (QL / TE / SEC / SR / IV). Instruction-file basis: `.github/instructions/{backend,tests}.instructions.md` (verified to exist) plus layer `AGENTS.md` files. Verification commands: quality loop `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`; workflow tests `bun run test/scripts/run-test.ts test/workflows/sessions/<file>`; unit tests `bun run test/scripts/run-test.ts <path>`.

---

## Phase 0 — Pre-Implementation Baseline

- [ ] **0.1 Re-verify ground truth.** Confirm `session-lifecycle.service.ts`, `transitions.ts`, `guards.ts`, `session.repository.ts`, `teacher.repository.ts`, `audit-logs` schema, and existing mutations match plan.md §2/§3. Confirm `backend/lib` error classes location for the new `SessionInvalidTransitionError` and confirm locate existing `audit` repo helper (or record CREATE). Output: note appended to `outcome/README.md`.
- [ ] **0.2 Locale keys pre-flight.** Inventory `shared/locale/**/sessions*` namespaces for existing keys (`notFound`, `forbidden`, `invalidTransition`); add missing `sessions.transitions.*` keys in BOTH locales. (REQ-001/REQ-002)
  - [ ] 0.2.QL `bun run scripts/health/sub-loop.ts <edited locale files> --lifecycle duplicates`
- [ ] **0.3 Error baseline ledger.** Write `outcome/error-ledger.md`: table of code → class → translation key → HTTP/GraphQL mapping (REQ-001).

## Phase 1 — Schema & Types (DB)

- [ ] **1.1 Audit action enum values.** Inspect `audit_action_type` enum; add `session_transition` (+ `session_dispute_opened`, `session_dispute_resolved` if not present) and regenerate via `bun run db` generate → push. If values already exist, mark NO-OP. (REQ-018)
  - [ ] 1.1.QL · [ ] 1.1.SR (enum naming matches existing style) · [ ] 1.1.IV (backend.instructions.md + schema AGENTS.md)
- [ ] **1.2 Type surface check.** Confirm `SessionSelectType`, `SessionReturnType` cover `cancelReason`, disputed fields; extend `backend/types/…` only if a field is missing (REQ-003). No new resolver-local types.
  - [ ] 1.2.QL · [ ] 1.2.IV

## Phase 2 — Repository Layer

- [ ] **2.1 `session.repository.ts` EXTEND:** `getSessionStatusForGate(sessionId, tx?)` (prepared stmt), `hasSessionReport(sessionId, tx?)` (prepared stmt) reading `reports` table. (REQ-015, REQ-016, REQ-017)
  - [ ] 2.1.QL `bun run scripts/health/sub-loop.ts backend/db/repo/classes/session.repository.ts --lifecycle duplicates`
  - [ ] 2.1.TE 4-tier tests in `backend/db/repo/classes/__tests__` (Tiers 1/2/3/4 per REQ-2.7): runInRollback, tx propagation, prepared-statement param binding (null session → false, not throw)
  - [ ] 2.1.SEC: statements are parameterized (no sql.raw with interpolation)
  - [ ] 2.1.SR · [ ] 2.1.IV
- [ ] **2.2 `teacher.repository.ts` EXTEND:** `setTeacherOnlineLock(teacherId, online, tx)` and `recalcTeacherOnlineFromSessions(teacherId, tx)` (set-based `NOT EXISTS` recalc). (REQ-012, REQ-013, REQ-014)
  - [ ] 2.2.QL · [ ] 2.2.TE (concurrent recalc correctness via sequential two-tx simulation inside rollback harness; boundary: teacher with 0 / 1 / 2 started sessions) · [ ] 2.2.SEC (no caller-supplied SQL) · [ ] 2.2.SR · [ ] 2.2.IV
- [ ] **2.3 Audit writer.** Dedicated insert helper (extend existing audit repo if present; else CREATE `backend/db/repo/audit/audit-logs.repository.ts` + barrel export). (REQ-018)
  - [ ] 2.3.QL · [ ] 2.3.TE (insert-only; details JSON round-trip) · [ ] 2.3.SEC (details size cap; JSON serializable guard) · [ ] 2.3.SR · [ ] 2.3.IV

## Phase 3 — Service Layer (`SessionLifecycleService`)

- [ ] **3.1 Transition matrix + error.** `TRANSITION_MATRIX` in `transitions.ts`; `assertTransitionAllowed(from,to)`; `SessionInvalidTransitionError extends DomainError` (code `SESSION_INVALID_TRANSITION`, message via translation key). Wire into start/complete/cancel/dispute/resolve entry points. (REQ-010, REQ-011)
  - [ ] 3.1.QL `bun run scripts/health/sub-loop.ts backend/services/classes/session-lifecycle.transitions.ts --lifecycle duplicates`
  - [ ] 3.1.TE **exhaustive 25-pair matrix test** (all from×to pairs: allowed vs `SESSION_INVALID_TRANSITION`) — test-first for illegal pairs
  - [ ] 3.1.SEC (terminal states immutable under replay) · [ ] 3.1.SR · [ ] 3.1.IV
- [ ] **3.2 INV-S6 lock wiring.** `applyInSessionLock` on `startSession`; `releaseInSessionLock` (recalc) on `completeSession`, `cancelSession` (when leaving `started`), and `resolveSessionDispute` (refund→cancelled arm when previously started… verify reachability per B.18; disputed may be entered from scheduled/started/completed — release recalc covers all three). All inside the same tx as the status flip. (REQ-012, REQ-013, REQ-014)
  - [ ] 3.2.QL · [ ] 3.2.TE (Tiers 1–3 incl. two-session race per J-3) · [ ] 3.2.SEC (lock can only be driven by transitions) · [ ] 3.2.SR · [ ] 3.2.IV
- [ ] **3.3 Audit trail write.** `writeTransitionAuditRow` called from every transition helper incl. dispute open/resolve with outcome in `details`. (REQ-018, REQ-019, REQ-020)
  - [ ] 3.3.QL · [ ] 3.3.TE (every mutation ⇒ matching audit row assertions; actor correctness) · [ ] 3.3.SR · [ ] 3.3.IV
- [ ] **3.4 Gates.** `assertSessionReportAllowed` + `assertSessionHomeworkAllowed` exported from service barrel; gate implementations use 2.1 repo reads with caller `tx`. (REQ-015, REQ-016)
  - [ ] 3.4.QL · [ ] 3.4.TE (boundary states: started/disputed/cancelled ⇒ throw; completed ⇒ pass; homework without report ⇒ throw) · [ ] 3.4.SEC (gates disclose nothing on miss) · [ ] 3.4.SR · [ ] 3.4.IV
- [ ] **3.5 Cancel reason persistence.** Wire validated/trimmed/capped reason into `cancelSession` write path (replaces DEV3-004 validate-discard). (REQ-021)
  - [ ] 3.5.QL · [ ] 3.5.TE (0 chars, 500 chars, 501 chars ⇒ capped, whitespace-only ⇒ null) · [ ] 3.5.SEC (BOPLA: only reason written) · [ ] 3.5.SR · [ ] 3.5.IV
- [ ] **3.6 Convention guard.** `backend/db/test/` (or `scripts/`-level test) scanning for raw `.set({ status` writes to `session` outside sanctioned files (`session-lifecycle.transitions.ts`, repository). (REQ-022)
  - [ ] 3.6.QL · [ ] 3.6.IV

## Phase 4 — GraphQL & Error Mapping

- [ ] **4.1 Resolver pass-through verification.** Mutations unchanged structurally; assert `ctx.t("sessions")` used for new error paths and `extensions.code` = ledger values end-to-end via `backend/graphql/test/session-lifecycle-mutations.test.ts` extensions (EXTEND that file). (REQ-001/2.5/2.6)
  - [ ] 4.1.QL · [ ] 4.1.TE (GraphQL-tier: non-participant ⇒ `SESSION_FORBIDDEN`; non-admin resolve ⇒ `UNAUTHORIZED`; illegal transition ⇒ `SESSION_INVALID_TRANSITION`) · [ ] 4.1.SEC (Tier 4 matrix) · [ ] 4.1.SR · [ ] 4.1.IV

## Phase 5 — Cross-Actor Journey Tests (TEST-FIRST for journeys)

Created/extended under `test/workflows/sessions/` (pattern: `session-lifecycle.journey.test.ts` exists — **EXTEND, do not fork**) using real service calls + real DB fixtures committed in `beforeAll`, cleaned in `afterAll` (NO `runInRollback` here; per workflow-test convention in `test/workflows/`):

- [ ] **5.1 J-1 lock-and-report journey:** start ⇒ is_online false; report gate throws while started; complete ⇒ gate passes, is_online true; audit rows in order. (REQ-012, REQ-013, REQ-014, REQ-015, REQ-018)
- [ ] **5.2 J-2 dispute arbitration journey:** complete ⇒ student disputes ⇒ admin resolves uphold (→completed) on fixture A; refund (→cancelled + lane restore unchanged from DEV3-004) on fixture B; audit trail sequence asserted. (REQ-019, REQ-020)
- [ ] **5.3 J-3 concurrent-lock journey:** two started sessions for one teacher; complete sequentially; assert lock false→false→true; audit rows for both.
- [ ] **5.4 J-4 cancel-with-reason journey:** started ⇒ cancel w/ reason ⇒ persisted `cancel_reason`, lock released, audit row.
- Run each with: `bun run test/scripts/run-test.ts test/workflows/sessions/session-lifecycle.journey.test.ts`
  - [ ] 5.x.IV (tests.instructions.md)

## Phase 6 — Full Verification

- [ ] **6.1** `bun run test/scripts/run-test.ts backend/db/test/…` (repo tier), `bun run test:db` scoped filters for session tests, `bun run test/services` for service tier (targeted paths via run-test.ts).
- [ ] **6.2** `bun quality-gate` full pass (tsgo → oxlint → biome → lint → duplicates).
- [ ] **6.3** `bun run generate:gqlSchema` + confirm SDL unchanged (no schema drift) — documents contract stability (REQ 2.6).

## Phase 7 — Knowledge Propagation & Closeout

- [ ] **7.1** Update `docs/sessions/session-lifecycle.md`: INV-S6/S7/S8 rows → SHIPPED by DEV3-005; document gate signatures for DEV3-006/007; audit-trail contract (fields, enum values); cancel-reason persistence note.
- [ ] **7.2** Update `docs/specs/state-machine-invariants.md` implementation-reference note (DEV3-005 line) to reflect shipped gates/matrix.
- [ ] **7.3** Write `outcome/README.md` + `outcome/self-review.md` (REQ→implementation pointer table; deviations; verification evidence with command outputs).
- [ ] **7.4** Reconcile `deferred-items.md` — every item either resolved or has owner ticket + rationale.

---

### Definition of Done

All REQ-001…REQ-022 satisfied; 25-pair matrix test green; INV-S6/7/8 enforced with journey evidence; audit trail on every transition; zero GraphQL schema changes; `bun quality-gate` green; docs updated.
