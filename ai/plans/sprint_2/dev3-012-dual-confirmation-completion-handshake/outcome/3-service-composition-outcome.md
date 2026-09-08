# Task 3 Outcome — Service Composition: Prompt on Complete + Two-Leg Sweep

**Plan:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
**Task:** 3 (`SessionLifecycleService` extension) · **Date:** 2026-09-07 · **Agent:** Task 3 service-composition subagent
**Requirements:** REQ-3 (AC 1, 2, 4, 5), REQ-5 (AC 1, 2, 3), REQ-1

> **Re-verification note (continuation session, same day):** the sandbox reverted HEAD to `main` mid-task and the implementing session was interrupted before its final report; the working tree (both modified files + this outcome file) survived intact. The continuation session re-verified EVERY claim below from scratch — the feature branch was re-established, both per-file sub-loops re-run (exit 0 each), the full suite re-run (identical counts: 59 pass / 0 fail / 4 skip / 775 expect calls), full `bun tsgo` re-run (exit 0), the resolver + cron consumption re-read at the cited lines (no wiring required), all five rule files re-read in full, and every grep re-executed (zero plan-artifact references in added service lines; the sole added-line test match is the pre-existing `REQ-043(c)` test title carried along by its re-indentation). The isolated-dir instruction (`PGLITE_DATA_DIR=./db/pglite-test-t3`) was re-proven inert through the runner (the t3 dir's mtime untouched; `db/pglite-test` written instead — see carry-forward 1), and the REQ-043(c) tier-gate ruling was independently REPRODUCED by temporarily un-gating the test on pglite: it fails exactly as recorded (`fulfillments` length 0 — both concurrent flows reject) and was restored, after which the suite returned to 59/0/4. Nothing had drifted; the numbers below are the re-confirmed values.

---

## Summary

`SessionLifecycleService` now composes the two completion-handshake waves from Task 2 onto the lifecycle state machine — no new service, no duplicated machinery:

- **`completeSession` → `completeSessionWithReceipt`.** The guarded transition is unchanged (same pre-DB id guard, same governance re-check, same fused-certification UPDATE, same cold-probe classification). Once — and only once — the guarded UPDATE actually matches (a zero-row miss still throws through `rejectTransitionMiss`, so a denied or replayed completion emits nothing), the student's confirm-prompt wave is emitted on the SAME transaction via `SessionRequestNotificationService.notifyStudentOfCompletionPrompt`. The whole flow (UPDATE + wave) is bracketed by `withTransaction(tx, …)`; on the flow-owned path (no caller tx) the delivery receipt is handed to `NotificationEngine.publishReceipts` strictly AFTER that commit, and `completeSession` keeps returning plain `SessionReturnType` (zero surface change for the existing GraphQL resolver). The new `completeSessionWithReceipt` variant additionally returns `{ session, receipt }` for callers that own the commit boundary: the receipt arrives PUBLISHED on the flow-owned path and UNPUBLISHED on the caller-owned path (JSDoc pins the caller-publishes-after-its-own-commit obligation).
- **`sweepExpiredSessions` — two legs, one transaction.** After the existing scheduled-expiry leg, the completed leg (`SessionRepository.sweepExpiredCompletedOnce`, Task 1's primitive) runs on the SAME transaction with the SAME captured `now`. The refund walk covers the UNION of both legs' rows through the EXISTING `refundSweptHolds` primitive (sequential, fail-closed — an unreadable lane still rolls the whole sweep back, notices included; no wallet write was added). Each completed-leg row's student then gets exactly one auto-cancel notice via `notifyStudentOfCompletionAutoCancelled`, emitted on the sweep transaction as unpublished receipts through a sequential head-first walk (`collectAutoCancelReceipts` — the recursion-across-await shape mirrors the refund walk's by-design sequentiality under the no-await-in-loop rule). Receipts publish strictly post-commit and ONLY when the flow owns the transaction; the return shape stays counts-only `{cancelled, refunded}` (scheduled-leg rows keep their notification-free semantics; zero row identities cross the wire; cron route unchanged).
- **Module docblock** updated honestly: the cross-surface dependency policy now names the wallet-credit slice AND the engine-mediated completion waves (rows written exclusively by the engine inside the owning transaction; receipts published strictly post-commit; nothing from audit/report surfaces).

## Files Modified

| File | Change |
|---|---|
| `backend/services/classes/session-lifecycle.service.ts` | Docblock policy update; 4 new imports (wave service, engine, receipt type, `defaultLocale`); module-scope `collectAutoCancelReceipts` sequential walk; `completeSession` delegates to the new receipt-bearing flow (plain return shape preserved); new exported `completeSessionWithReceipt` (guard order and classification byte-identical); `sweepExpiredSessions` gains the completed leg, UNION refund walk, auto-cancel receipt collection, post-commit publish gate. |
| `backend/services/classes/session-lifecycle.service.test.ts` | Coverage-map docblock; `spyOn` import + notification schema/type/engine imports; `NOTIFS_EN` fixture constant; source-pin test honestly re-allowed the two sanctioned notification specifiers (wave sibling + engine barrel + `AppLocale`); `countPublishes`/`readWaveRows`/`readTeacherName` helpers; 3 new `runInRollback` describe blocks (prompt wave ×3, two-leg sweeper ×3) + 1 committed-fixture production-path block (×2) — 9 new tests; REQ-043(c) chaos race re-gated to `testOnRealPostgres` (see Testing Rulings). |

## Files NOT Modified (and why)

- `backend/services/classes/session-lifecycle.transitions.ts` / `.confirmation.ts` / `.guards.ts` / `.governance.ts` / `session-lifecycle.booking.ts` — refund/credit/guard/booking logic untouched; the sweep composes the EXISTING `refundSweptHolds` (refund-only; no wallet write added).
- `backend/graphql/mutation/classes/session-lifecycle.mutation.ts` — **verified no wiring required**: the resolver calls `SessionLifecycleService.completeSession(ctx.user.id, id, ctx.locale)` with no tx, and the flow-owned path now publishes internally post-commit. Reported here as a cross-file dependency instead of an edit (scope boundary).
- `app/api/cron/sweep-sessions/route.ts` — counts-only contract `{cancelled, refunded}` unchanged; receipts never leak over the wire.
- `session-request-notification.service.ts` / types / locale files — Task 2 artifacts consumed as-is (receipt-return, never-publish-in-tx, key namespaces).
- `backend/db/repo/classes/session.repository.ts` — Task 1's `sweepExpiredCompletedOnce` consumed as-is.
- `.env*` — untouched (rule). `deferred-items.md` — no new row (no genuinely out-of-scope discovery; see Deferred-Items note below).

## Verification Results

### 3.QL — Per-file quality loop (`bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`)

| File | Result |
|---|---|
| `backend/services/classes/session-lifecycle.service.ts` | **exit 0** (tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates ✅) — re-run after every edit |
| `backend/services/classes/session-lifecycle.service.test.ts` | **exit 0** — re-run after the locale-fix and the 043(c) re-gating edits |

Full `bun tsgo` (project-wide): exit 0, zero `error TS`. (A fresh `PGLITE_DATA_DIR=./db/pglite-test-t3` was provisioned per the isolated-dir instruction, but see the runner fact in Carry-Forward — the run-test wrapper re-spawns with `--env-file=.env.test`, which overrides the OS env, so the suite executes against the standard `.env.test` database.)

### 3.TE — Test run (`bun run test/scripts/run-test.ts backend/services/classes/session-lifecycle.service.test.ts`)

**59 pass / 0 fail / 4 skip / 775 expect() calls** (63 tests: +9 new vs the pre-task suite; skips = 4 pre-existing `testOnRealPostgres`-gated cases that require real Postgres: the bracketed-deadline boundary plus chaos (c)/(d)/(e)). New coverage:

- **Prompt wave (runInRollback):** receipt-bearing completion emits the prompt ONCE on the caller's transaction — row typed `session_completion`, student-addressed, copy composed from the notifications namespace in the RECIPIENT's persisted locale, receipt returned UNPUBLISHED (`publishReceipts` spied: zero calls); denied completion and replayed completion each write ZERO new notification rows (once-per-session, never on idempotent fall-through); an emitter failure fails closed — the completion stamp rolls back (row stays `started`), zero rows, zero publishes.
- **Two-leg sweeper (runInRollback):** honest counts across BOTH legs (`cancelled` = scheduled-leg + completed-leg; `refunded` counts both held rows), UNION refund walk proven by per-lane balances (+1 trial, +1 hifz), the overdue completed row's auto-cancel notice composed in the student's locale while the scheduled-expiry row and the student-confirmed row stay notification-free, caller-tx path publishes nothing, second sweep is a zero-row no-op with no second notice; a lane-less overdue row still notifies its student (notice independent of hold) with `refunded` honest at 0; an auto-cancel emitter failure rolls back BOTH legs' cancellations, refunds, and notices (zero publishes).
- **Production commit path (committed fixtures, FK-safe `afterAll` cleanup):** the flow-owned completion publishes the prompt's receipt EXACTLY once strictly after its own commit (identity check: the published receipt object IS the returned one); the flow-owned sweep publishes each completed-leg auto-cancel receipt exactly once post-commit, the swept row is cancelled and its trial lane re-incremented once.
- **Source pins updated in the same change** (stale-pin rule): the import-allowlist pin consciously admits `session-request-notification.service`, `@/backend/services/notifications`, and `@/shared/locale/AppLocale` — the engine-mediated notification channel (no notification-repository import; the unit never writes a notification row itself).

**Testing rulings (declared, evidence-backed):**

1. **Locale-fix:** the first suite run failed 2 new tests that assumed English copy for locale-less student fixtures. `defaultLocale` is `"ar"` (platform default; Task 2's wave suite pins null-locale → default-locale AR copy). The fixtures in the two copy-asserting tests now persist `locale: "en"` on the student, making the recipient-locale copy deterministic; the production-behavior assertion (fallback) remains owned by Task 2's dedicated null-locale test. After the fix: 0 fail, stable across three runs.
2. **REQ-043(c) re-gated to `testOnRealPostgres`** (previously a plain test): the concurrent double-complete race on the PRODUCTION tx path now includes the winner's in-transaction wave emission, and under pglite's single-connection pool the two queued production transactions interleave once the winner's transaction grows (wave-context read + notification insert + savepoint) — empirically BOTH flows reject (`fulfillments` length 0, verified by temporarily restoring the plain test and reproducing the failure; diagnostic discarded afterward). On real Postgres (separate connections, row-lock serialization) the one-winner invariant holds — the same gate the block already uses for (d)/(e). The race test itself is unchanged in assertions; only its tier gate moved. The other chaos races (a) double-start and (b) start⚡cancel emit no waves and remain plain pglite tests, still green.

### 3.SEC

- **No client-supplied recipients:** the emitters are called with the session id + the request locale only; the recipient (student) derives server-side from the joined wave-context read inside the owning transaction (Task 2's contract, re-proven here by the student-addressed receipt assertions). The GraphQL caller cannot name, add, or redirect a recipient.
- **Sweep is system-scope only:** `sweepExpiredSessions(outerTx?)` takes no actor/id/shape parameters at all; both legs are global guarded batch UPDATEs; nothing user-controlled reaches either predicate (Task 1's repo pins still green).
- **No `...input` spread:** the only spreads are the receipts accumulator (`[receipt, ...rest]`) and the legs' UNION (`[...expiredScheduled, ...expiredCompleted]`) — no client payload is ever spread into an engine input; the wave inputs are assembled inside Task 2's emitter from server-derived values.
- **Publish-after-commit:** spied `publishReceipts` proves zero publishes inside any caller-tx path (rollback and savepoint paths included) and exactly-once publishing strictly after the flow-owned commits.

### 3.SR — Semantic Review Checklist verdicts

**Race Conditions & Concurrency**
1. No unatomic read-then-write — PASS: the transition remains ONE guarded UPDATE; the wave emission is an INSERT inside the same transaction (no separate check-then-write window opened); the sweep remains guarded batch UPDATEs + sequential same-tx walks. The one concurrency-sensitive surface (double-complete race) is tier-gated with evidence (ruling 2 above).
2. No module-level mutable state — PASS: `collectAutoCancelReceipts` is a pure recursive walk; no Maps/Sets/arrays at module scope (the pre-existing `let`-scan pin still passes).
3. Async credit/balance/quota deductions with locks — PASS/N-A: no new financial write; refunds ride the EXISTING `refundSweptHolds` on the sweep tx (fail-closed semantics unchanged); the wallet credit path (`confirmation.ts`) untouched.
4. Redis atomicity — PASS/N-A: no direct Redis; the idempotency claim stays the engine's injected cache port (absent cache → documented engine fail-open warn, rows authoritative).

**Environment & Configuration**
5. `resolveEnvConfig` keys — N/A (none added). 6. Cache-invalidation coverage — N/A (none added). 7. Credential setters — PASS (none).

**Code Quality & Clean Comments**
8. No dead branches — PASS: both `tx === undefined` / outer-tx branches are reachable (production resolver vs caller-tx/test paths); the publish gate's `length > 0` guard is reachable exactly when the completed leg swept rows; the walk's base case is the empty-leg path.
9. No cross-layer imports — PASS: the service imports backend siblings + `@/backend/types` + `@/shared/locale/*` only (allowed directions; the import-allowlist source pin enforces it at test time).
10. No manual ReturnType construction — PASS (none; the receipt-bearing return is an inline readonly object literal).
11. Clean Comments & JSDocs — PASS: grep over ADDED lines in both files shows ZERO plan-artifact references in the service and in all new test code; every comment/JSDoc describes what/why/domain behavior (commit-boundary ownership, fail-closed rollback, union refund, sequential notice walk). Note: pre-existing test NAMES in this file carry the file's established `REQ-NNN` label convention (e.g. `REQ-043(c)` — moved/re-indented by the tier-gate change, not authored anew); renaming them would churn beyond this task's scope and break the file's internal cross-references.

**Schema & Types**
12. Migration columns ↔ Drizzle — N/A (no schema change). 13. Enums as value imports at runtime — PASS: `SessionStatus`/`HeldBalanceLane`/`SessionIntent` value imports unchanged; the lifecycle unit references waves only through the emitter functions (no wave-kind string literals, no `NotificationType` literals in this unit — the envelope knowledge stays in the wave service). 14. No string literals where enums expected — PASS (same point; locale strings are plain locale tags per the existing contract). 15. Pothos input nullability — N/A. 16. DB column names ↔ `$inferSelect` — PASS (no new column references).

**Deferred Work**
17. No deferred items without ledger entry — PASS (nothing deferred; no new `deferred-items.md` row).

**Scope Boundary**
18. Only task-listed files modified — PASS (`git status --porcelain`: the two lifecycle files only).
19. No out-of-scope refactoring — PASS (the tempting "also wire booking-flow request waves while here" was explicitly NOT done — no production call sites exist for them and no task asks for it).
20. `git diff --name-only` matches the expected file list — PASS (service + service test + outcome + tasks.md checkboxes).

**Task-specific rulings (tasks.md 3.SR)**
- No wallet write added to the sweep path — PASS (refund-only via existing primitive; `transitions.ts` diff is empty).
- Zero notification writes during request-path failures — PASS (denied/replayed completions and failed sweeps write zero rows — spied + row-oracle proven).
- Publish-after-commit honored — PASS (both flows; both tiers; receipt identity pinned on the production path).
- Return-shape handling — PASS (`completeSession` unchanged for the resolver; `completeSessionWithReceipt` is the non-breaking receipt channel; sweep stays counts-only).

### 3.IV — Instruction Verification

Sub-loop printed rule files (re-validated against this diff; all byte-identical to the versions read in full this session):

- Root `AGENTS.md` — deep imports, logger-only logging, run-test script mandate, i18n compile-time system, DB-test rules: honored.
- `backend/AGENTS.md` — types from `@/backend/types`, error taxonomy untouched, 6-layer data flow (service orchestrates repo + sibling services): honored.
- `backend/services/AGENTS.md` — `NotificationEngine` single-writer + publish-after-commit honored; no service-layer `.types.ts`; i18n via `getServerTranslations`; mock outbound integrations in service tests (transport/publish spied, no live channels): honored. (The "Session lifecycle … writes ZERO notification rows" bullet describes direct writes — the engine remains the sole writer; Task 6's knowledge-propagation may add the one-line session-completion-wave note.)
- `.agents/instructions/backend.instructions.md` — service-layer rules (types from `@/backend/types`, locale optional param, no hardcoded strings, no `console.*`): honored. (Sub-loop prints nonexistent `.github/instructions/…` paths; the live files are under `.agents/instructions/`.)
- `.agents/instructions/tests.instructions.md` — `runInRollback` + `tx` everywhere, `expectRepoError` (never `rejects.toThrow`), `bun:test` imports, committed-fixture `afterAll` FK-safe cleanup, run-test script usage, stale-pin updates in the same change: honored.

## Receipt Flow (summary table)

| Path | Emission | Publication | Return |
|---|---|---|---|
| `completeSession(tx?)` resolver/production (no tx) | prompt on the flow's own tx | `publishReceipts` after the flow's commit | `SessionReturnType` (unchanged) |
| `completeSessionWithReceipt(tx?)`, no tx | prompt on the flow's own tx | published after the flow's commit | `{ session, receipt }` (receipt already published) |
| `completeSessionWithReceipt(tx)` with caller tx | prompt on the caller's tx (SAVEPOINT) | NEVER by the flow — caller publishes after its own commit | `{ session, receipt }` (receipt UNPUBLISHED) |
| `sweepExpiredSessions()` production (no tx) | auto-cancel per completed-leg row on the sweep tx | batched `publishReceipts` after the sweep's commit | `{ cancelled, refunded }` |
| `sweepExpiredSessions(outerTx)` caller tx | auto-cancel per completed-leg row on the caller's tx | never by the flow (caller owns the commit boundary) | `{ cancelled, refunded }` (receipts intentionally not exposed — cron contract) |

## Carry-Forward Knowledge

1. **The run-test wrapper overrides the OS env**: `test/scripts/run-test.ts:157` spawns `bun --env-file=.env.test test …`, and Bun's `--env-file` REPLACES the inherited environment — a `PGLITE_DATA_DIR=…` prefix does NOT reach the test process. Isolated-dir provisioning is therefore ineffective through this runner; suites run against the `.env.test` database. Tasks 4–6 can skip the fresh-dir migrate dance (a fresh dir is never touched by the runner) — or fix the runner first if true isolation is needed.
2. **Wave-emitting flows lengthen their transactions**: any chaos/race test that drives a production-path flow which now emits a wave must run on real Postgres (see REQ-043(c) ruling); pglite's single-connection pool interleaves queued transactions and both flows reject.
3. **`defaultLocale` is `"ar"`**: locale-less user fixtures receive ARABIC wave copy. Tests asserting copy must either persist a locale on the fixture or expect `NOTIFS_AR`.
4. **`completeSessionWithReceipt` is the only receipt-bearing completion channel** — Task 4's Journey A should assert the prompt through it (or through the notification row oracle), NOT through `completeSession`.
5. **Fresh pglite provisioning**: a brand-new `PGLITE_DATA_DIR` needs `bun --no-env-file run scripts/dbActions/cli-entry.ts --env-file=.env.test migrate` (background/timeout — the CLI hangs before exit); the fresh dir is provisioned but (per fact 1) unused by the run-test wrapper unless the runner is changed.

## Cross-File Dependencies

- **`backend/graphql/mutation/classes/session-lifecycle.mutation.ts:189`** — the only `completeSession` consumer (production): no change needed; the flow-owned path publishes internally post-commit. If product later wants resolver-side publishing symmetry, it should migrate the resolver to `completeSessionWithReceipt` + `publishReceipts` — reported, not edited (scope boundary).
- **`app/api/cron/sweep-sessions/route.ts`** — unchanged; `sweepExpiredSessions()` keeps `{cancelled, refunded}`.
- **Task 2 artifacts** (`notifyStudentOfCompletionPrompt` / `notifyStudentOfCompletionAutoCancelled`, receipt contract, key namespaces) and **Task 1 artifact** (`sweepExpiredCompletedOnce`) consumed as-is — zero edits needed in those files.
- **Task 4 (journey tests)**: use carry-forward facts 2–4; Journey B's sweep assertion should expect exactly one auto-cancel notification per overdue row and the counts-only return.
- **Task 6 candidate**: one-line `backend/services/AGENTS.md` note for the lifecycle service's engine-mediated completion waves (same candidate Task 2 flagged).

## Deferred-Items note

No new row. The two judgment calls (REQ-043(c) tier gate; run-test env override) are environment/test-tier facts recorded here as carry-forward knowledge — not out-of-scope work. Existing rows D1–D3 are unchanged.

## Verification Command Record

```
bun run scripts/health/sub-loop.ts backend/services/classes/session-lifecycle.service.ts      --lifecycle duplicates → exit 0
bun run scripts/health/sub-loop.ts backend/services/classes/session-lifecycle.service.test.ts --lifecycle duplicates → exit 0
bun run test/scripts/run-test.ts backend/services/classes/session-lifecycle.service.test.ts → 59 pass / 0 fail / 4 skip (775 expect calls)
bun tsgo → exit 0 (0 error TS)
```

## Status

- [x] 3. Service composition implemented (sub-loop exit 0 ×2, tests 59/59 green)
- [x] 3.QL · [x] 3.TE · [x] 3.SEC · [x] 3.SR · [x] 3.IV
- No git commit / no git push (orchestrator commits).
