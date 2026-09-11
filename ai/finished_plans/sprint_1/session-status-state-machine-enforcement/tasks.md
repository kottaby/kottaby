# Session Status State Machine Enforcement: Trackable Implementation Tasks

> **Plan directory (verbatim):** `ai/plans/sprint_1/session-status-state-machine-enforcement`
> **Specs:** `ai/plans/sprint_1/session-status-state-machine-enforcement/specs.md` · **Plan:** `ai/plans/sprint_1/session-status-state-machine-enforcement/plan.md`
> **Ledger:** `ai/plans/sprint_1/session-status-state-machine-enforcement/deferred-items.md` · **Outcomes:** `ai/plans/sprint_1/session-status-state-machine-enforcement/outcome/`

## Non-Negotiable Execution Protocol

- **P1.** Before ANY task: read specs.md, plan.md, ALL files under `outcome/`, and the ledger.
- **P2.** After EVERY edit: `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` — exit 0 or fix.
- **P3.** Tests only via `bun run test/scripts/run-test.ts <test-path>` (NEVER raw `bun test`). Repository/service unit tests use `runInRollback` + `tx`; journey tests (`test/workflows/`) NEVER use `runInRollback` — committed fixtures, tracked, hard-deleted in `afterAll`.
- **P4.** Semantic self-review before `[x]`: single-tx atomicity with `tx` everywhere; zero dead code / `console.*`; no cross-layer imports; enums value-imported; domain errors localized via `getServerTranslations(locale)` + `ctx.t("namespace")`; exactly one `logDomainError` per denial.
- **P5.** On completing X.Y write `outcome/X.Y-outcome.md` (commands, exit codes, anchors, deviations).
- **P6.** Flip `[ ]`→`[x]` only after P2–P5 pass. No batch-checking.
- **P7.** Cite only verified files; instruction files: `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`; layer rules: root `AGENTS.md`, `backend/services/AGENTS.md`, `backend/db/repo/AGENTS.md`, `backend/AGENTS.md` (paths verified; re-verify on cite).

---

## Phase 0 — Baseline & Verify-Then-Claim

- [x] 0.1 Record baseline + init ledger
  - Run `bun tsgo`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id baseline`, `bun oxlint` and log counts into `outcome/0.1-baseline-outcome.md`.
  - Create `deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md`.
  - _Requirements: REQ-0_
- [x] 0.2 Ground-truth verification sweep (READ-ONLY)
  - Verify and anchor into `outcome/0.2-outcome.md`: enum members (`backend/db/schema/enums.ts` `session_status` incl. `disputed`); writer signatures (`session.repository.ts`: `startSessionOnce`, `completeSessionOnce`, `cancelSessionOnce`, `openDisputeOnce`, `resolveDisputeCancelOnce`, `resolveDisputeCompleteOnce`, `findTransitionProbe`); dispute GraphQL ops (`backend/graphql/mutation/classes/session-lifecycle.mutation.ts` resolve/dispute ops); teacher schema `is_online` (`backend/db/schema/teachers/teacher.ts`); existing teacher-repo methods (`findById`, `lockForCertificationCheck` — confirm NO `setOnline` exists yet); locale keys in `shared/locale/types/errors/labels.ts` (`sessionInvalidTransition`, `sessionNotFound`, `teacherNotCertified`) and en/ar bodies under `shared/locale/{en,ar}/errors/index.ts`.
  - _Requirements: REQ-0, REQ-0.5_

## Phase 1 — Transition Matrix & Gate Module

- [x] 1.1 Create `backend/services/classes/session-lifecycle.enforcement.ts`
  - Contents (per plan §Service/Repository Contracts): `SESSION_TRANSITION_MATRIX`, `isSessionTransitionAllowed(from, to)`, `assertSessionCompletedForReport`, `assertReportSubmittedForHomework`, `assertTeacherNotInActiveSession`. Pure matrix + tx-propagated assertions; denials via `ConflictError` + localized messages (`sessionInvalidTransition`; NEW keys `homeworkRequiresReport`, `teacherInActiveSession`). Session/report reads via existing repo surfaces only (`SessionRepository.findById`; for reports read, use a minimal `ReportRepository` EXISTS-style read IF one exists after 0.2 — otherwise create `backend/db/repo/classes/report.repository.ts` with ONLY `existsReportForSession(sessionId, tx)` and record the extension contract in the ledger).
  - Re-export through `backend/services/classes/index.ts` barrel per barrel rules (`export *`; `./` paths; max one `/`).
  - _Requirements: REQ-1, REQ-3_
  - [x] 1.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/classes/session-lifecycle.enforcement.ts --lifecycle duplicates` (+ any new repo file) — exit 0.
  - [x] 1.1.TE **Tests** (`backend/services/classes/session-lifecycle.enforcement.test.ts`, `runInRollback`): Tier 1 — every matrix edge allow/deny truth table; gate pass paths. Tier 2 — gates on `disputed`/`cancelled`/unknown-id sessions; report-missing vs report-present. Tier 3 — concurrent `assertSessionCompletedForReport` calls during a racing completion (`Promise.allSettled`). Tier 4 — gates after tx rolled back (no phantom pass).
  - [x] 1.1.SEC **Security**: ids are server-derived (no client shape accepted); denial vocabulary reuses existing codes; no existence oracle widening (gates are internal-only, participation checked by callers).
  - [x] 1.1.SR **Semantic Review**: zero dead exports; no inline matrix duplicates elsewhere; enums value-imported.
  - [x] 1.1.IV **Instruction Verification**: validate against `.agents/instructions/backend.instructions.md` + auto-discovered AGENTS.md printed by sub-loop.
- [x] 1.2 i18n keys (en/ar parity)
  - Add `homeworkRequiresReport`, `teacherInActiveSession` to `shared/locale/types/errors/labels.ts`, `shared/locale/en/errors/index.ts`, `shared/locale/ar/errors/index.ts`; update parity inventory in `shared/locale/sessions-namespace.parity.test.ts` if it pins the key set (verify first).
  - _Requirements: REQ-0.5, REQ-3_
  - [x] 1.2.QL / TE (parity test via run-test) / SEC (no leakage in messages) / SR / IV — same pattern as 1.1, scoped to the three edited files.

## Phase 2 — INV-S6 In-Session Lock Wiring

- [x] 2.1 `TeacherRepository.setOnline` (guarded write)
  - Add to `backend/db/repo/teachers/teacher.repository.ts` exactly per plan signature; update `backend/db/repo/teachers/index.ts` only if the barrel doesn't already `export *` the file.
  - _Requirements: REQ-2_
  - [x] 2.1.QL **Quality Loop** on the repo file — exit 0.
  - [x] 2.1.TE **Repo tests** (`backend/db/test/repo/teachers/teacher.repository.test.ts`, EXTEND): set false on online teacher ⇒ flip; set true ⇒ flip; unknown id ⇒ null; redundant same-value write ⇒ row returned, no-op value change; executed under `runInRollback` with `tx` propagation proven by deadlock-free completion.
  - [x] 2.1.SEC / SR / IV per protocol.
- [x] 2.2 Compose lock into `startSession`
  - In `backend/services/classes/session-lifecycle.service.ts` (`startSession`, ~:195): after successful `startSessionOnce`, same-tx `TeacherRepository.setOnline(teacherId, false, tx)`; capture `priorOnline` (teacher row read inside tx) for release semantics (ledger D2 note). Teacher lookup uses id from the transitioned session row — never from caller input.
  - _Requirements: REQ-2, REQ-5_
  - [x] 2.2.QL / TE (service test: start ⇒ online false; roll-back fault injected ⇒ no lock persisted) / SEC / SR / IV.
- [x] 2.3 Compose release into `completeSession` / `cancelSession` / `resolveSessionDispute`
  - Release `setOnline(teacherId, true, tx)` ONLY when the exited row's pre-state was `started` (use the classify/probe already present in `session-lifecycle.transitions.ts`; for dispute resolution from `scheduled` there is NO lock to release — assert that distinction in tests). Honour the `priorOnline` capture from 2.2 (never resurrect a teacher who was offline at start).
  - _Requirements: REQ-2, REQ-5_
  - [x] 2.3.QL / TE (complete-from-started ⇒ unlock; cancel-from-scheduled ⇒ no lock touch; resolve-from-started-dispute ⇒ unlock; resolve-from-scheduled-dispute ⇒ none; forced mid-tx fault ⇒ full rollback incl. teacher row) / SEC / SR / IV.

## Phase 3 — Journey Verification (Dispute + Lock + Denials)

- [x] 3.1 New journey `test/workflows/sessions/session-state-machine.journey.test.ts`
  - Cover specs J1 (dispute → queue visibility → duplicate-deny → cross-actor denial of teacher-complete on disputed → admin resolve Cancel with lane-intact refund + unlock → repeat-deny) and J2 (online teacher → start ⇒ offline → cancel/complete ⇒ restored). Plus illegal-transition sweep: completed→start, cancelled→any, disputed→start, scheduled→complete — each denied with `SESSION_INVALID_TRANSITION` and zero DB delta (row equality assertion).
  - Journey discipline: NO runInRollback; fixtures committed; `afterAll` hard-delete; run via `bun run test/scripts/run-test.ts test/workflows/sessions/session-state-machine.journey.test.ts`.
  - _Requirements: REQ-4, REQ-5, REQ-2_
  - [x] 3.1.QL / TE (Tier 1–4 per specs; races via `Promise.allSettled` on duplicate resolve) / SEC (non-admin resolve denied `FORBIDDEN`; participant-only ops deny foreign actors) / SR / IV.
- [x] 3.2 Regression: existing suites remain green
  - Run `bun run test/scripts/run-test.ts backend/services/classes/session-lifecycle.service.test.ts` and `bun run test/scripts/run-test.ts backend/db/test/repo/classes/session.repository.test.ts`; record pass counts; fix ONLY if the lock/release composition altered expectations (ratchet, not rewrite).
  - _Requirements: REQ-5_
  - [x] 3.2.QL / IV per protocol.

## Phase 4 — Docs, Ledger Close, Knowledge Propagation

- [x] 4.1 Documentation amendments
  - `docs/sessions/session-lifecycle.md` §10 consumer table: INV-S6 (lock + release landed, cite anchors), INV-S7/S8 gates live at `session-lifecycle.enforcement.ts` with anchors, dispute-surface verified by journey; remove stale "this-ticket-owned" forwards for these rows only.
  - `docs/specs/state-machine-invariants.md` §1.1 implementation-reference note: INV-S6 enforced; dispute verified.
  - Verify `AGENTS.md` (root) INV/session doc line pulls are not stale before touching; change only if stale.
  - _Requirements: REQ-6_
  - [x] 4.1.QL (sub-loop on edited md files — duplicates lifecycle) / SR / IV.
- [x] 4.2 Final gate & ledger close
  - Re-run full-file quality loop for every file touched this plan; confirm baseline counts unchanged; `grep -c "❌\|⚠️" ai/plans/sprint_1/session-status-state-machine-enforcement/deferred-items.md` audit (any residual must reference an owning ticket).
  - Write `outcome/4.2-final-review-outcome.md` summarizing coverage, journeys, and verified invariants INV-S1..S8.
  - _Requirements: REQ-0, REQ-6_
  - [x] 4.2.QL / SR / IV per protocol.

---

## Traceability Index

| Requirement | Tasks |
|---|---|
| REQ-0 | 0.1, 0.2, 4.2 |
| REQ-0.5 | 1.1, 1.2 (all tasks enforce) |
| REQ-1 (matrix) | 1.1 |
| REQ-2 (INV-S6) | 2.1, 2.2, 2.3, 3.1 |
| REQ-3 (INV-S7/S8 gates) | 1.1, 1.2 |
| REQ-4 (dispute verify) | 3.1 |
| REQ-5 (denial/rollback) | 2.2, 2.3, 3.1, 3.2 |
| REQ-6 (docs) | 4.1, 4.2 |
