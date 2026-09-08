# Tasks — DEV3-012 Dual-Confirmation Completion Handshake (24h Timeout)

**Plan Directory:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
**Related:** `specs.md` · `plan.md` · `deferred-items.md` (same directory)
**Version:** 1.0 · **Date:** 2026-09-05

## Non-Negotiable Execution Protocol

1. **Pre-Execution Read:** read ALL files in `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/outcome/` before ANY task.
2. **Per-File Quality Loop:** `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` — exit 0 required after every modification.
3. **Semantic Review** before every checkbox.
4. **Outcome File** per completed task: `outcome/<task-id>-outcome.md`.
5. **Checkbox Tracking:** mark `[x]` here on completion.

## Layer-to-Instructions Mapping (applicable rows)

| Files touched | AGENTS.md | Instructions |
|---|---|---|
| `backend/db/repo/classes/session.repository.ts` | root, `backend/db/repo/AGENTS.md`, `backend/AGENTS.md` | `backend.instructions.md` |
| `backend/services/classes/*.ts` | root, `backend/services/AGENTS.md`, `backend/AGENTS.md` | `backend.instructions.md` |
| `backend/types/classes/session-notification.types.ts` | root, `backend/types/AGENTS.md`, `backend/AGENTS.md` | `backend.instructions.md` |
| `shared/locale/**` | root, `shared/AGENTS.md` | — |
| `test/workflows/**` | `test/workflows/AGENTS.md` | `tests.instructions.md` |
| `backend/db/test/**` | `backend/db/test/AGENTS.md`, `backend/AGENTS.md` | `backend.instructions.md`, `tests.instructions.md` |
| `docs/**` | root | — |

Ground truth: repo primitives and services EXIST as cited in specs/plan; new code is limited to: one repo primitive, one service-compose extension, two notification wave emitters, locale keys (3 files), and journey tests.

---

### Task 0: Pre-Implementation Baseline (MANDATORY)

- [x] 0. Baseline + ledger
  - `bun tsgo 2>&1 | grep -c "error TS" > /tmp/baseline-tsgo.txt`; `bun biome:check 2>&1 | grep -c warn > /tmp/baseline-biome.txt`; `bun run scripts/lint-service.ts --json --id baseline > /tmp/baseline-lint.json`
  - `deferred-items.md` exists (created with this plan — verify)
  - Write `outcome/0-baseline-outcome.md`
  - _Requirements: REQ-0_

### Task 1: Repository — Post-Completion Timeout Primitive

- [x] 1. Add `sweepExpiredCompletedOnce(now, tx?)` to `backend/db/repo/classes/session.repository.ts`
  - ONE guarded batch UPDATE: `status='completed' AND confirmed_by_student_at IS NULL AND confirmed_by_teacher_at < ${cutoff}` where `cutoff = new Date(now - SESSION_CONFIRMATION_WINDOW_MS)`; SET `status=cancelled, fee_held=false, updated_at=now`; RETURNING `*`
  - Shape mirrors `sweepExpiredScheduledOnce` (line 409); query-builder only, no raw-sql comments
  - [x] 1.1.QL Quality Loop: `bun run scripts/health/sub-loop.ts backend/db/repo/classes/session.repository.ts --lifecycle duplicates`
  - [x] 1.1.TE Test Engineering (Tier 1-4, `runInRollback` + `tx`, `expectRepoError` pattern): cutoff boundary (exactly-at-cutoff NOT swept — strict `<`); zero rows; lane-less rows returned with `heldBalanceLane=null` (nothing refunded downstream); mixed teacher-stamp ages; a student-confirmed row never matched; a `disputed`/`cancelled` row never matched
  - [x] 1.1.SEC: participant predicate is system-scope (sweep) — assert no caller-supplied id/shape reaches the WHERE; no wildcard/LIKE anywhere
  - [x] 1.1.SR: single guarded statement, status terminal, no probe; txn propagation; enums as value imports
  - [x] 1.1.IV: read rule files printed by sub-loop; validate
  - Write `outcome/1-repo-timeout-primitive-outcome.md`; mark `[x]`
  - _Requirements: REQ-3 (AC 1, 3, 4)_

### Task 2: Notification Wave Emitters

- [x] 2. Extend `SessionRequestWaveKind` + add two emitters
  - `backend/types/classes/session-notification.types.ts`: union gains `"completion_prompt" | "completion_auto_cancelled"`
  - `backend/services/classes/session-request-notification.service.ts`: add `notifyStudentOfCompletionPrompt` and `notifyStudentOfCompletionAutoCancelled` riding the existing `emitWave` machinery; idempotency keys `session-completion-prompt:{sessionId}` / `session-completion-autocancel:{sessionId}`; recipient = student; `type: NotificationType.SessionCompletion` (value import); zero authorization; receipt return
  - `shared/locale/types/notifications/index.ts` + `shared/locale/en/notifications/index.ts` + `shared/locale/ar/notifications/index.ts`: `eventSessionCompletionPromptTitle`, `eventSessionCompletionPromptBody(teacherName)`, `eventSessionAutoCancelledTitle`, `eventSessionAutoCancelledBody(teacherName)` — all three files or parity test fails
  - [x] 2.QL: sub-loop per file (`session-notification.types.ts`, `session-request-notification.service.ts`, 3 locale files)
  - [x] 2.TE: service-local tests — recipient locale selection (ar/student vs en/teacher), idempotency-key derivation, intent label composition, exhaustiveness; parity test `shared/locale/notifications-namespace.parity.test.ts` passes
  - [x] 2.SEC: emitters take no caller identity (recipients derived server-side from the joined wave-context read); no `...input` spread
  - [x] 2.SR: no new service file; no duplicated wave machinery; no `Translation`-enum misuse (namespace keys are literals in locale type files — system-consistent)
  - [x] 2.IV: rule files per sub-loop output
  - Write `outcome/2-notification-waves-outcome.md`; mark `[x]`
  - _Requirements: REQ-5, REQ-0.5_

### Task 3: Service Composition — Prompt on Complete + Two-Leg Sweep

- [x] 3. Extend `SessionLifecycleService`
  - `completeSession` (`session-lifecycle.service.ts:241`): on non-null guarded success, emit completion-prompt receipt (same tx); publish post-commit on the own-tx path; with `outerTx`, receipts propagate to the caller (document return-shape handling — receipt carried alongside the session result without breaking `SessionReturnType` surface)
  - `sweepExpiredSessions` (`session-lifecycle.service.ts:554`): add the completed leg after the scheduled leg in the SAME transaction; `refundSweptHolds` covers UNION of both legs' rows; post-commit, per completed-leg row emit auto-cancel receipts and publish
  - [x] 3.QL: sub-loop `session-lifecycle.service.ts`
  - [x] 3.TE: prompt fires exactly once per completion (not on idempotent repeats); sweep returns honest counts across both legs; fail-closed rollback leaves zero notification receipts published; locale wiring through `getServerTranslations` unchanged
  - [x] 3.SEC: emit never called with client-supplied recipient; sweep is system-scope only
  - [x] 3.SR: no wallet write added to sweep path (refund only); zero notification writes during request path failures
  - [x] 3.IV
  - Write `outcome/3-service-composition-outcome.md`; mark `[x]`
  - _Requirements: REQ-3 (AC 1,2,4,5), REQ-5 (AC 1,2,3), REQ-1_

### Task 4: Journey Tests

- [x] 4. `test/workflows/sessions/session-dual-confirmation.journey.test.ts`
  - Journey A (confirm-and-pay): certified teacher + student fixtures → book → start → complete (prompt receipt asserted) → student confirm → stamps + wallet delta == fee exactly → re-confirm zero-delta
  - Journey B (timeout-and-refund): fabricate completed row with 24h+ old teacher stamp → sweep → cancelled + lane +1 to provenance + one auto-cancel receipt → re-sweep zero
  - Race: `Promise.allSettled` concurrent confirm+sweep → exactly one financial outcome
  - No `runInRollback`; committed fixtures; `afterAll` cleanup; notification publish spied
  - Run via `bun run test/scripts/run-test.ts test/workflows/sessions/session-dual-confirmation.journey.test.ts`
  - [x] 4.QL: sub-loop on the test file
  - [x] 4.IV + [x] 4.SR (fixtures honest; permissions resolve via real roles)
  - Write `outcome/4-journey-tests-outcome.md`; mark `[x]`
  - _Requirements: REQ-6, REQ-2, REQ-3_

### Task 5: Canonical Doc Update

- [x] 5. Update `docs/sessions/session-lifecycle.md`
  - §2.1 state machine: dual-confirmation + two-leg sweep now implemented; `disputed` producer surface confirmed (pre-completion)
  - §2.2 guarded-transition table: add `sweepExpiredCompletedOnce` row
  - Resolve "DEV3-012/013" pending annotations for the 012 part (013 escrow depth stays)
  - Side-effect table additions: prompt + auto-cancel notification rows
  - Verify root `AGENTS.md` Important References line for this doc remains accurate (no new doc created; description update only if needed)
  - [x] 5.QL: sub-loop on the doc
  - Write `outcome/5-canonical-doc-outcome.md`; mark `[x]`
  - _Requirements: REQ-7_

### Task 6: Final Quality Gate + Knowledge Propagation

- [x] 6. Full verification + propagation
  - `bun quality-gate` green; deferred-items.md zero ❌/⚠️
  - Knowledge propagation: doc updates landed in Task 5; layer AGENTS.md one-line updates ONLY if a new permanent rule emerged (notification waves for lifecycle timeouts — candidate: `backend/services/AGENTS.md` session bullet already exists; add session-completion wave note if warranted, 1 line max, no code)
  - Write `outcome/6-final-gate-outcome.md`; mark `[x]`
  - _Requirements: REQ-0, REQ-7_

## Traceability Matrix

| REQ | Tasks |
|---|---|
| REQ-0 | 0, 6 |
| REQ-0.5 | 2, 5 |
| REQ-1 | 3 (prompt wiring), 4 (Journey A asserts precondition) |
| REQ-2 | 4 (Journey A — verify-only; EXISTS) |
| REQ-3 | 1, 3, 4 (Journey B) |
| REQ-4 | 5 (ruling documentation only — EXISTS) |
| REQ-5 | 2, 3 |
| REQ-6 | 4 |
| REQ-7 | 5, 6 |
