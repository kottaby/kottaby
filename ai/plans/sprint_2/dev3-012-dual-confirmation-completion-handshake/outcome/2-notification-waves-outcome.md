# Task 2 Outcome — Notification Wave Emitters (Completion Handshake)

**Task:** 2 of `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/` (REQ-5, REQ-0.5)
**Date:** 2026-09-07 · **Agent:** Task 2 subagent (notification waves)
**Branch:** `feat/dev3-012-dual-confirmation-completion-handshake` (verified before and during edits; sandbox auto-reverts HEAD to `main` between invocations — working tree survives, re-checkout performed as needed)

> **Re-verification note (continuation session, same day):** the sandbox reverted HEAD to `main` mid-task; the working tree survived. The continuation session re-verified EVERY claim below from scratch — feature branch re-checked out, all 7 sub-loops re-run (exit 0 each), both test suites re-run (identical pass counts), full `bun tsgo` re-run (0 `error TS`), all greps re-executed (zero plan-artifact comment references, zero `Translation.` enum usage, zero `...input` spread, no new service files), and all rule files re-read. Nothing was found drifted; the numbers below are the re-confirmed values.

---

## Summary

The session wave-kind vocabulary grew from 6 to 8 kinds and two student-facing completion-handshake emitters landed on the EXISTING `SessionRequestNotificationService.emitWave` machinery — no new service, no duplicated wave-compose logic:

- `SessionRequestWaveKind` gains `"completion_prompt" | "completion_auto_cancelled"`.
- `notifyStudentOfCompletionPrompt(sessionId, locale, tx?, options?)` — kind `completion_prompt`, recipient = student (derived server-side), idempotency key `session-completion-prompt:{sessionId}`, row type `NotificationType.SessionCompletion`.
- `notifyStudentOfCompletionAutoCancelled(sessionId, locale, tx?, options?)` — kind `completion_auto_cancelled`, recipient = student, key `session-completion-autocancel:{sessionId}`, row type `NotificationType.SessionCompletion`.
- Inside the machinery, a small private `resolveWaveEnvelope(sessionId, waveKind)` replaced the two hardcoded literals in `emitWave` (notification type + idempotency key): the six request-intake waves keep `NotificationType.SessionRequest` + `session:{id}:{kind}` byte-identically; the two completion waves ride `SessionCompletion` under their own key namespaces (a completion emission can never collide with — or replay-substitute for — a request emission on the same session row). `composeWaveCopy` gained the two copy cases (teacher name interpolated via the counterparty slot, no intent label — intent remains the request wave's sanctioned context only).
- Receipt contract preserved: with a caller `tx` the emitters return the engine receipt VERBATIM and NEVER publish (caller publishes post-commit via `NotificationEngine.publishReceipts`); transaction-less, the engine commits and publishes exactly once.
- Locale triplet extended (compile-time parity-gated): `eventSessionCompletionPromptTitle`, `eventSessionCompletionPromptBody(teacherName)`, `eventSessionAutoCancelledTitle`, `eventSessionAutoCancelledBody(teacherName)` — types + en + ar, Arabic copy natural and domain-accurate.

## Files Modified

| File | Change |
|---|---|
| `backend/types/classes/session-notification.types.ts` | `SessionRequestWaveKind` union 6 → 8 kinds; docblock updated. No new interfaces. |
| `backend/services/classes/session-request-notification.service.ts` | Module docblock (6 → 8 waves); two `composeWaveCopy` cases; new private `resolveWaveEnvelope`; `emitWave` input uses the envelope; two new namespace emitters. |
| `shared/locale/types/notifications/index.ts` | 4 new typed slots (2 string titles, 2 `(teacherName: string) => string` bodies) in a new "Session completion-handshake event copy" section. |
| `shared/locale/en/notifications/index.ts` | 4 English values. |
| `shared/locale/ar/notifications/index.ts` | 4 Arabic values (e.g. `علّم ${teacherName} جلستك كمكتملة — يرجى تأكيد الاكتمال حتى تُحتسب الجلسة.`). |
| `shared/locale/notifications-namespace.parity.test.ts` | Mandated inventory 49 → 53 slots; function-slot split 14 → 16; sample args for the two new bodies; counts/comments updated. |
| `backend/services/classes/session-request-notification.service.test.ts` | Coverage map updated; `WaveCase` gained `expectedType` + `idempotencyKeyOf`; WAVE_CASES 6 → 8 (Tier-1 matrix now covers both new emitters); new Tier-1 / Tier-2 / Tier-3 / Tier-4 completion-wave blocks (details below). |

## Files NOT Modified (and why)

- `backend/db/repo/classes/session.repository.ts`, `backend/services/classes/session-lifecycle.service.ts`, `backend/graphql/**`, `app/api/cron/**`, frontend, journey tests — Task 1 / Task 3 / Task 4 scope; emitters are internal primitives and wire-in is Task 3's composition.
- `backend/types/contracts/session-notification.contract.types.ts` — `SessionEventNotificationType` already reserves `NotificationType.SessionCompletion`; no edit needed.
- `docs/**` — Task 5.
- `.env*` — untouched (rule).
- `deferred-items.md` — no new row: no genuinely out-of-scope discovery. D3 (teacher paid-notice, out of ACs by design) already covers the only candidate.

**Scope note (declared, not silent):** `shared/locale/notifications-namespace.parity.test.ts` was not in the original 5-file list, but the task mandates the parity test PASSES — its "mandated inventory is exhaustive (49 slots)" and "no OTHER slot is function-valued" tests fail BY CONSTRUCTION the moment the four keys land on the locale maps. Extending the inventory + function-slot list + sample args is the parity gate's own required maintenance; done minimally.

## Verification Results

### 2.QL — per-file quality loops (`bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`)

| File | Exit |
|---|---|
| `backend/types/classes/session-notification.types.ts` | 0 |
| `backend/services/classes/session-request-notification.service.ts` | 0 |
| `shared/locale/types/notifications/index.ts` | 0 |
| `shared/locale/en/notifications/index.ts` | 0 |
| `shared/locale/ar/notifications/index.ts` | 0 |
| `shared/locale/notifications-namespace.parity.test.ts` | 0 |
| `backend/services/classes/session-request-notification.service.test.ts` | 0 (after fixing 4 self-introduced `no-await-in-loop` warnings by converting completion-wave loops to `test.each` / thunk+`Promise.all`) |

Full `bun tsgo` (project-wide): 0 `error TS` lines. Rule files printed by sub-loop were read (see 2.IV).

### 2.TE — tests (all via the mandated runner, isolated DB: `PGLITE_DATA_DIR=./db/pglite-test-t2`)

- The fresh isolated pglite dir required one-time schema provisioning: `PGLITE_DATA_DIR=./db/pglite-test-t2 bun --no-env-file run scripts/dbActions/cli-entry.ts --env-file=.env.test migrate` (24/24 tables; exit 0).
- `PGLITE_DATA_DIR=./db/pglite-test-t2 bun run test/scripts/run-test.ts backend/services/classes/session-request-notification.service.test.ts` → **34 pass / 0 fail** (485 expect calls). New coverage:
  - Tier 1: 8-wave caller-tx matrix (row shape, derived recipient, recipient-locale copy, deterministic claim key via `buildEmitClaimKey`, log silence, zero publishes in-tx); completion waves pinned to `session_completion` under their own key namespaces; ar/student vs en/teacher locale inversion; caller `locale` argument proven error-copy-only (copy follows the RECIPIENT's persisted locale); corrupt-intent fail-closed parity (`SESSION_INTENT_CORRUPT`, exactly one bounded log, zero rows).
  - Tier 2: empty teacher name composed verbatim into the prompt copy; hostile unicode/RTL/emoji/markup teacher name composed verbatim into BOTH completion waves.
  - Tier 3 (committed cast, 8 → 10 sessions, `afterAll` FK-safe cleanup intact): completion prompt own-commit + keyed replay (prior receipt, zero new rows/publishes) + NO cross-namespace key collision (request wave on the same session claims a separate identity — exact claim-key sequence asserted); completion auto-cancel own-commit exactly once + replay.
  - Tier 4: hostile-id fuzz — repo NEVER called before pre-DB rejection for both completion emitters; derived-recipient invariance across two participant pairs (recipients come ONLY from the joined read; nothing leaks to the counterpart teacher).
- `PGLITE_DATA_DIR=./db/pglite-test-t2 bun run test/scripts/run-test.ts shared/locale/notifications-namespace.parity.test.ts` → **104 pass / 0 fail**.

### 2.SEC

- Emitters take NO caller-identity parameters (only `sessionId`, `locale`, `tx`, `options`); recipients derive server-side from the joined `findWaveContextById` read inside the caller tx — proven at runtime by the two-pair invariance tests.
- No `...input` spread anywhere in the new code; the engine `NotificationEmitInput` is assembled field-by-field from server-derived values.
- Zero authorization by design (internal primitives) — the owning lifecycle flow gates who triggers a wave (Task 3's wiring).

### 2.SR — Semantic Review Checklist verdicts

**Race Conditions & Concurrency**
1. No unatomic read-then-write — PASS: one joined read, then the ONLY write is engine-owned inside the caller tx; no second write path introduced.
2. No module-level mutable state — PASS: `resolveWaveEnvelope` is pure; no new module state.
3. Async credit/balance/quota deductions with locks — N/A (no financial writes here; refund/credit paths untouched).
4. Redis atomicity — N/A/PASS: no direct Redis; idempotency claim is the engine's injected SET-NX-EX port.

**Environment & Configuration**
5. `resolveEnvConfig` keys — N/A (none added).
6. Cache-invalidation coverage — N/A (none added).
7. No credential/secret setters accepting empty strings — PASS (none).

**Code Quality & Clean Comments**
8. No dead branches — PASS: both new switch cases reachable; `resolveWaveEnvelope` default legitimately handles the 6 request kinds; `composeWaveCopy` `never` guard stays compile-time-only and unreachable.
9. No cross-layer imports — PASS: service imports backend+shared only; shared locale files import nothing outside shared (types file has zero imports; en/ar import only the shared types file).
10. No manual ReturnType construction — PASS (none).
11. Clean Comments & JSDocs — PASS: grep over all 7 files for `REQ-|Task 2|DEV3-012|plan paths` → zero matches; every comment describes what/why/domain behavior; no trivial restatements.

**Schema & Types**
12. Migration columns ↔ Drizzle — N/A (no schema change).
13. Enums as value imports at runtime — PASS: `NotificationType` remains a VALUE import (used in `resolveWaveEnvelope`); `SessionIntent` value import unchanged; no `import type` for runtime-used enums.
14. No string literals where enum members expected — PASS: row type is `NotificationType.SessionCompletion` / `.SessionRequest` members, never `"session_completion"` literals in product code.
15. Pothos input nullability — N/A (no Pothos change).
16. DB column names ↔ `$inferSelect` — N/A (no new columns).

**Deferred Work**
17. No deferred items without ledger entry — PASS (nothing deferred; see `deferred-items.md` note above).

**Scope Boundary**
18. Only task-listed files modified — PASS with the declared parity-test exception above; `session.repository.ts` appears dirty in git status from the parallel Task 1 subagent, NOT from this task.
19. No out-of-scope refactoring ("while I'm here") — PASS.
20. `git diff` matches the expected file list — PASS (this task's footprint: 5 source files + parity test + service test + outcome + tasks.md checkboxes).

**Task-specific rulings (tasks.md 2.SR)**
- No new service file — PASS (emitters added to the existing namespace; `resolveWaveEnvelope` is a private same-file helper).
- No duplicated wave machinery — PASS (parameterization of type+key inside `emitWave`; context read / intent guard / recipient-locale composition / receipt return all reused as-is).
- No `Translation`-enum misuse — PASS (namespace keys are plain typed literals in the locale triplet; no `Translation.` enum anywhere).
- Receipt contract / publish-after-commit — PASS (spied transport asserts `publishCount = 0` on every caller-tx path; own-commit path publishes exactly once).
- Idempotency-key derivation — PASS (`session-completion-prompt:{id}` / `session-completion-autocancel:{id}`, deterministic per session; exact claim keys pinned via `buildEmitClaimKey`).

### 2.IV — Instruction Verification

Rule files printed/read and validated against the changed files:

- Root `AGENTS.md` — deep imports, logger-only logging, DB-test rules (rollback/tx/no-rejects/expectRepoError), i18n compile-time system, run-test script mandate: all honored.
- `backend/AGENTS.md` — canonical types from `backend/types/`, error-handling taxonomy untouched, single-writer boundaries: honored.
- `backend/services/AGENTS.md` — `NotificationEngine` single-writer + publish-after-commit honored (line 13 rule); no service-layer `.types.ts`; i18n via `getServerTranslations`: honored. Carry-forward: the "Session lifecycle … writes ZERO notification rows" bullet describes direct writes (engine stays the single writer); Task 6 may add a one-line session-completion-wave note.
- `backend/types/AGENTS.md` — canonical type extended in place; no new interfaces; barrel rules untouched: honored.
- `shared/AGENTS.md` — layer isolation (zero cross-layer imports in shared files), typed interpolation `(param: string) => string`, no frontend/codegen references in locale types: honored.
- `.agents/instructions/backend.instructions.md` — service-layer rules (types from `@/backend/types`, locale optional param, no hardcoded strings, no `console.*`): honored. (Note: sub-loop printed `.github/instructions/...` paths which do not exist in this tree; the live instruction files are under `.agents/instructions/` and were read.)
- `.agents/instructions/tests.instructions.md` — `runInRollback` + `tx` everywhere, `expectRepoError` (never `rejects.toThrow`), `bun:test` imports, committed-fixture `afterAll` cleanup (extended cast covered by the existing FK-safe sweep), run-test script usage: honored. Pre-existing module-level `getServerTranslations` constants follow the file's established convention.

## Carry-Forward Knowledge

1. **Isolated test DB bootstrap**: a fresh `PGLITE_DATA_DIR` has no schema — run `bun --no-env-file run scripts/dbActions/cli-entry.ts --env-file=.env.test migrate` with the dir env-prefixed once (the CLI exits 0 despite the post-success pool-close warnings). Tasks 3/4 can reuse `./db/pglite-test-t2` (already migrated) or provision their own.
2. **Wave envelope seam**: any future wave kind needs (a) a `SessionRequestWaveKind` member, (b) a `composeWaveCopy` case with locale keys in all three files (tsgo enforces), (c) an `resolveWaveEnvelope` case (request-kind default is explicit — do not silently absorb new kinds), (d) a `WAVE_CASES` entry in the service test.
3. **Sandbox quirk**: HEAD auto-reverts to `main` between external invocations; working tree survives. Always `git checkout feat/...` in the same batch as any commit-producing step (no commit made here, per rules).
4. `resolveIntentLabel`'s exhaustiveness guard and the `composeWaveCopy` `never` guard now cover 8 kinds compile-time; adding a 9th kind without cases fails `bun tsgo`.

## Cross-File Dependencies

- **Task 3** consumes: `notifyStudentOfCompletionPrompt` (wire into `completeSession` post-success on the tx path; publish post-commit), `notifyStudentOfCompletionAutoCancelled` (per swept completed-leg row; publish post-commit), and the receipt/`publishReceipts` contract.
- **Locale keys** are compile-time coupled to `composeWaveCopy` — parity triplet + tsgo are the gates.
- **Contract** `SessionEventNotificationType` already includes `SessionCompletion` — no contract edit was needed (verified).
- **Task 6** candidate: one-line `backend/services/AGENTS.md` session bullet note for the session-completion waves (optional knowledge propagation).

## Verification Command Record

```
bun run scripts/health/sub-loop.ts <7 files> --lifecycle duplicates   → exit 0 each
PGLITE_DATA_DIR=./db/pglite-test-t2 bun run test/scripts/run-test.ts \
  backend/services/classes/session-request-notification.service.test.ts → 34 pass / 0 fail
PGLITE_DATA_DIR=./db/pglite-test-t2 bun run test/scripts/run-test.ts \
  shared/locale/notifications-namespace.parity.test.ts                  → 104 pass / 0 fail
bun tsgo                                                               → 0 error TS
```
