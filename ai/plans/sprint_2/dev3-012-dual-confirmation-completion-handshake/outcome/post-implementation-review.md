# Post-Implementation Review — DEV3-012 Dual-Confirmation Completion Handshake

**Plan:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
**Scope:** `git diff --name-only ffce457..HEAD` (baseline origin/main) · Reviewers: review-types, review-backend, pentester (parallel) · review-frontend: **N/A** — zero `frontend/` or `app/` files in the diff (no UI delta per plan no-UI ruling).

## Aggregate findings (new code only): 0 CRITICAL · 0 HIGH · 0 MEDIUM · 7 LOW (deduplicated to 5)

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | LOW | `resolveWaveEnvelope` default branch lacks `never` exhaustiveness guard (flagged by types, pentest; tracked since mid-point R1 #2) | **FIX** — mirror `composeWaveCopy` guard |
| F2 | LOW | `sweepExpiredSessions(outerTx)` collects auto-cancel receipts but counts-only return exposes no publish channel | **FIX (JSDoc only)** — pin the contract explicitly |
| F3 | LOW | `completeSessionWithReceipt` inline anonymous return type | Accepted — matches pre-existing inline style of sweep return |
| F4 | LOW | Corrupt-intent poison row rolls back whole sweep (mandated fail-closed contract; new vector vs pre-plan) | Deferred — operational hardening (per-row quarantine) → ledger row |
| F5 | LOW | Sweep batch unbounded (mirrors pre-existing scheduled-leg shape; bearer-gated, not attacker-influenced) | Deferred → ledger row |
| F6 | LOW | Completed-leg predicate omits `fee_held = true` (defense-in-depth; no producer can create the shape; consistent with scheduled-leg family) | Accepted as designed — plan design section A specifies the exact predicate; deviation would require design ruling |
| F7 | LOW | Rewritten lines in J1/J2 retain pre-existing `REQ-NNN` label vocabulary | Accepted — pre-existing file convention, declared |

## Pre-existing (filtered, not counted)
emitWave caller-tx error-branch locale recompute; transport-only spy ambiguity; REQ-NNN titles at baseline; run-test env-file override; sandbox HEAD auto-revert; unbounded scheduled-leg sweep; raw names in wave copy (inert text-node rendering); backend/services/AGENTS.md:15 stale bullet (Task 6); D4/D5 out-of-domain reds.

## Scoped re-runs (all green)
repo 63/0 · lifecycle service 59/0/4skip · waves 34/0 · parity 104/0 · journeys 11/0 + J1 10/0 + J2 6/0 · tsgo 0 errors.

## Verdict: PASS — F1+F2 dispatched to fix round, then confirmation iterations per stop condition.

---

## Fix Round (PW-fix) — Task ID PW-fix

Branch re-verified (`feat/dev3-012-dual-confirmation-completion-handshake`) before every command batch (sandbox auto-reverts HEAD; dirty target files pin it). Edits left UNCOMMITTED per fix-round rules — no commit/push; tasks.md, deferred-items.md, .env untouched.

### F1 — compile-time exhaustiveness guard in `resolveWaveEnvelope`

File: `backend/services/classes/session-request-notification.service.ts` — the wave-kind switch's `default` branch, now lines 208–218.

- The `default` branch (which carries the 6 request-intake kinds; `completion_prompt` and `completion_auto_cancelled` remain explicit cases above) gained the exhaustiveness pin mirroring `composeWaveCopy`'s guard mechanism (typed exhaustiveness parameter assignment, lines 176–180): `const exhaustive: Exclude<SessionRequestWaveKind, "completion_prompt" | "completion_auto_cancelled"> = waveKind;`. A literal `never` pin is impossible here because this default IS reachable at runtime for the 6 request kinds — the pin therefore uses the exact complement of the explicit cases, so adding a 9th union member without an explicit envelope fails to compile.
- Runtime behavior unchanged: the assignment is erased at runtime and the idempotency-key template consumes the same value (`session:${sessionId}:${exhaustive}` ≡ `session:${sessionId}:${waveKind}`); no throw added on the reachable path.
- New code comment contains zero plan-artifact references. Biome normalized the annotation to its single-line canonical form during the scoped re-run.

### F2 — JSDoc contract pin on `sweepExpiredSessions`

File: `backend/services/classes/session-lifecycle.service.ts` — sweep JSDoc, now lines 663–681. Doc-only; no signature/return-shape/behavior change.

- The auto-cancel notice paragraph now pins the outer-tx contract explicitly: called WITH an outer transaction, the auto-cancel receipts are still collected on that transaction, but the counts-only `{cancelled, refunded}` return exposes no publish channel — a caller-owned transaction NEVER publishes; production (the cron route) calls without `outerTx`, so the flow-owned post-commit publish path is the only live one.
- `@param outerTx` tightened to the same contract (receipts collected on the SAVEPOINT but stay unpublished — the counts-only return hands nothing back to publish; flow-owned post-commit publish is the only live one).
- Existing JSDoc style/tone preserved (em-dashes, capitalized NEVER, backticked identifiers); zero plan-artifact references.

### Verification (all mandatory, all green)

| Check | Result |
|---|---|
| `bun run scripts/health/sub-loop.ts backend/services/classes/session-request-notification.service.ts --lifecycle duplicates` | exit 0 — tsgo ✅ · oxlint ✅ · biome:check ✅ · lint:type-aware ✅ · check:duplicates ✅ |
| `bun run scripts/health/sub-loop.ts backend/services/classes/session-lifecycle.service.ts --lifecycle duplicates` | exit 0 — tsgo ✅ · oxlint ✅ · biome:check ✅ · lint:type-aware ✅ · check:duplicates ✅ |
| `PGLITE_DATA_DIR=./db/pglite-test-fix bun run test/scripts/run-test.ts backend/services/classes/session-request-notification.service.test.ts` | exit 0 — **34 pass / 0 fail** (485 expect calls) |
| `PGLITE_DATA_DIR=./db/pglite-test-fix bun run test/scripts/run-test.ts backend/services/classes/session-lifecycle.service.test.ts` | exit 0 — **59 pass / 4 skip / 0 fail** (775 expect calls) |
| `bun tsgo` | exit 0 — 0 `error TS` |
| scoped `biome check` (both edited files) | exit 0 — "Checked 2 files … No fixes applied." |

Diff footprint: exactly the two target files — `git diff --stat`: session-lifecycle.service.ts (+15/−7), session-request-notification.service.ts (+8/−2). Status: both `M` + the untracked review file; nothing else touched. No lock/port errors encountered (no retries needed).

---

## R2 Fix Round — Task ID R2-fix

Branch re-verified (`feat/dev3-012-dual-confirmation-completion-handshake`) before every command batch (sandbox auto-revert quirk). Edits left UNCOMMITTED per fix-round rules — no commit/push; tasks.md, deferred-items.md, .env untouched.

### Finding R2 (LOW) — second-precision floor-math helper duplicated 4×

Disposition: consolidated WITHIN the `test/workflows` layer only. `backend/db/test/repo/classes/session.repository.test.ts` left UNCHANGED — its file-local `secondPrecisionInstant` stays put (a backend→test/workflows import would be a cross-layer violation; a single occurrence per layer is at/below the 2-occurrence promotion threshold).

### Canonical helper

- **`secondPrecisionMs(instant: Date | number): number`** — new module `test/workflows/helpers/second-precision.ts` (flat kebab-case module per `test/workflows/AGENTS.md` rule 10), re-exported through the pure `export *` barrel (one export line + one header bullet, alphabetical position preserved). Pure math, zero imports; merged JSDoc carries both original rationales (fixture-stamp fabrication + cross-source comparison key).
- Name/signature rationale: of the two variants (`secondPrecisionInstant(ms): Date` / `secondPrecisionMs(instant): number`), took the "accept an optional-ms/Date input" option on the `secondPrecisionMs` shape — it keeps all 13 comparator call sites in the lifecycle/denials journeys a PURE import-swap (identical call expressions), while the single builder call site (`expiredTeacherStamp()` in the dual-confirmation journey) wraps the result in `new Date(...)` — identical value semantics (floor to whole seconds), no assertion or test-logic change anywhere. Overload-swap (`secondPrecisionInstant` returning Date for ms / ms for Date) was rejected: same-name/alternate-return semantics are less clean than one union-input→ms contract.
- The backend repo test's `secondPrecisionInstant` was deliberately NOT re-pointed at the shared helper (cross-layer); the two helper names remain intentionally distinct per layer.

### Files touched (git numstat, this round only)

| File | Δ |
|---|---|
| `test/workflows/helpers/second-precision.ts` | NEW (23 lines) |
| `test/workflows/helpers/index.ts` | +3/−0 (header bullet + `export *` line) |
| `test/workflows/sessions/session-dual-confirmation.journey.test.ts` | +5/−12 (import added; local `secondPrecisionInstant` removed; `expiredTeacherStamp` wraps `new Date(secondPrecisionMs(…))`, rationale folded into its doc) |
| `test/workflows/sessions/session-lifecycle.journey.test.ts` | +1/−10 (import added; local `secondPrecisionMs` removed) |
| `test/workflows/sessions/session-lifecycle-denials.journey.test.ts` | +1/−10 (import added; local `secondPrecisionMs` removed; the "see secondPrecisionMs" comment still resolves — to the imported helper) |

`helpers.self-test.test.ts` intentionally NOT extended: the addition is a pure floor-math function (no new harness/db behavior); it is exercised by all three journey suites, and the R2 touch-list confines edits to the barrel + 3 journey files + this outcome file.

### Verification (all mandatory, all green)

| Check | Result |
|---|---|
| `bun run scripts/health/sub-loop.ts test/workflows/sessions/session-dual-confirmation.journey.test.ts --lifecycle duplicates` | exit 0 — tsgo ✅ · oxlint ✅ · biome:check ✅ · lint:type-aware ✅ · check:duplicates ✅ (note: sub-loop reports test/workflows files are outside the jscpd scan scope → duplicates check skips; layer-level dedup proven by the single definition remaining) |
| same for `session-lifecycle.journey.test.ts` | exit 0 — all sub-checks ✅ |
| same for `session-lifecycle-denials.journey.test.ts` | exit 0 — all sub-checks ✅ |
| `bun run test/scripts/run-test.ts test/workflows/sessions/session-dual-confirmation.journey.test.ts` | exit 0 — **11 pass / 0 fail** (116 expect calls) |
| `bun run test/scripts/run-test.ts test/workflows/sessions/session-lifecycle.journey.test.ts` | exit 0 — **10 pass / 0 fail** (181 expect calls) |
| `bun run test/scripts/run-test.ts test/workflows/sessions/session-lifecycle-denials.journey.test.ts` | exit 0 — **6 pass / 0 fail** (93 expect calls) |
| `bun tsgo` | exit 0 — 0 `error TS` |
| Extra: `bun run test/scripts/run-test.ts test/workflows/helpers` (barrel consumers: self-test + smoke) | exit 0 — 21 pass / 0 fail |
| Extra: scoped `biome check` (barrel + new helper module) | exit 0 — "Checked 2 files … No fixes applied." |

Diff footprint (this round): exactly the 4 test-layer files above + this outcome file — `backend/*` diffs in the tree are the untouched PW-fix round edits. No lock/port errors encountered (no retries needed).

---

## R3 Fix Round — Task ID R3-fix

Branch re-verified (`feat/dev3-012-dual-confirmation-completion-handshake`) before every command batch (sandbox auto-revert quirk). Edits left UNCOMMITTED per fix-round rules — no commit/push; tasks.md, deferred-items.md, .env untouched. Disposition of the R3 findings: **F1 rework (MEDIUM)** — the PW-fix round's `Exclude<…>` default-branch annotation in `resolveWaveEnvelope` was proven vacuous (tautology against the grown union), so the guard was rebuilt on `composeWaveCopy`'s mechanism; **R3 LOW** — the test matrix got a compile-time exhaustiveness pin.

### Fix 1 (MEDIUM) — REAL exhaustiveness guard in `resolveWaveEnvelope`

File: `backend/services/classes/session-request-notification.service.ts` — `resolveWaveEnvelope` switch, now lines 197–226 (+14/−1).

- The vacuous `default` annotation `Exclude<SessionRequestWaveKind, "completion_prompt" | "completion_auto_cancelled">` (a re-computing tautology that survived the empirical 9th-member compile) is GONE. The six request-intake kinds are now SIX EXPLICIT CASES — `teacher_request`, `outcome_accepted`, `outcome_declined`, `outcome_auto_rejected`, `outcome_queued`, `outcome_alternatives_offered` — sharing one return body via empty-case fall-through (biome `noFallthroughSwitchClause` and oxlint verified to allow empty-case fall-through; probed against the repo's exact biome 2.5.12 config + oxlint 1.81 `--deny-warnings` before adopting the style). The shared body is byte-identical in behavior: `NotificationType.SessionRequest` + `` `session:${sessionId}:${waveKind}` `` (`waveKind` is narrowed to the six-case union inside the body, so every idempotency key is unchanged).
- After the six cases AND the two unchanged completion cases, `default` now mirrors `composeWaveCopy`'s proven guard verbatim (lines 218–224): `const exhaustive: never = waveKind;` + `throw new Error(\`Unexpected wave kind: ${String(exhaustive)}\`)`. With all eight union members matched explicitly the branch is genuinely unreachable in type space, so a 9th kind without an explicit envelope case makes `waveKind` non-never there and FAILS TO COMPILE — the comment now states exactly that guarantee.
- Runtime behavior: for all eight valid kinds identical to before (the old `exhaustive` template variable and the new narrowed `waveKind` produce the same keys); the previously-reachable-through-default request kinds now return via their own cases, and the default is a fail-closed throw consistent with `composeWaveCopy`'s runtime safety.

### Fix 2 (LOW) — WAVE_CASES exhaustiveness pin

File: `backend/services/classes/session-request-notification.service.test.ts` — matrix declaration + `waveCaseByKind` signature, now lines 274–369 (+18/−4). Type-only; zero test-logic change (all 8 entries byte-identical, both consumption sites unchanged).

- The annotation `const WAVE_CASES: readonly WaveCase[]` (which widens every entry's `waveKind` back to the full union, defeating inference) became `const WAVE_CASES = [ … ] satisfies readonly WaveCase[]` — `satisfies` keeps each entry's `waveKind` a literal.
- Pin: `type MissingWaveCases = Exclude<SessionRequestWaveKind, (typeof WAVE_CASES)[number]["waveKind"]>;` consumed by `waveCaseByKind`'s return type — `[MissingWaveCases] extends [never] ? WaveCase : never` — so a 9th union kind without a matrix entry collapses the lookup's return type to `never` and fails to compile on the `return found` statement. The pin rides the existing lookup helper (the function that already throws for unregistered kinds) because the repo bans both of the obvious standalone pin forms: `void pin;` → type-aware `sonarjs/void-use` error; `export const pin` → biome `noExportsInTest` error; an unused module-level pin const → tsgo `noUnusedLocals` TS6133 (underscore prefix does NOT exempt module-level consts). A chained `WaveCasesExhaustive extends true ? WaveCase : never` variant was REJECTED after proof: a never-poisoned intermediate satisfies `extends true` and the pin silently no-ops — the shipped pin uses a single direct conditional on `MissingWaveCases` exactly because of that trap (caught by the real-repo mutation run below; interim shape produced NO test-file errors and was reworked before verification).

### Empirical 9th-kind proof (the R3 demand)

Two independent proofs; the 9th member used is `"completion_window_extended"` (no envelope case, no matrix entry), applied TEMPORARILY and reverted byte-identical (`cmp` vs backup) immediately after each run — the types file is NOT modified in the tree.

1. Throwaway replica OUTSIDE the repo (`/tmp/r3fix-9th-kind-proof/replica.ts`, compiled with the repo's own tsgo binary, `tsgo --ignoreConfig --noEmit --strict --noUnusedLocals`):
   - 8 members → exit 0 (clean).
   - 9th member → exit 1: `replica.ts(50,13): error TS2322: Type '"completion_window_extended"' is not assignable to type 'never'.` (switch guard) and `replica.ts(84,3): error TS2322: Type '{ waveKind: "teacher_request"; … } | …' is not assignable to type 'never'.` (matrix pin).
2. REAL repo, FINAL code (one batch: backup → insert member → `bun tsgo` → restore → `cmp`):
   - With the 9th member → `bun tsgo` exit 1 with `backend/services/classes/session-request-notification.service.ts(178,13)` AND `(222,13): error TS2322: Type '"completion_window_extended"' is not assignable to type 'never'.` (the new guard fires exactly like `composeWaveCopy`'s proven guard at 178) plus `backend/services/classes/session-request-notification.service.test.ts(374,3): error TS2322: Type '{ waveKind: "teacher_request"; side: "teacher"; … }' is not assignable to type 'never'.` and its TS2339 cascade (`Property 'emit' does not exist on type 'never'` at every matrix consumer) — the pin bites.
   - After restore → `bun tsgo` exit 0 (recorded again in the table below). For contrast, the R3 review's premise stands: under the OLD vacuous annotation this same mutation compiled clean.

### Verification (all mandatory, all green)

| Check | Result |
|---|---|
| `bun run scripts/health/sub-loop.ts backend/services/classes/session-request-notification.service.ts --lifecycle duplicates` | exit 0 — tsgo ✅ · oxlint ✅ · biome:check ✅ · lint:type-aware ✅ · check:duplicates ✅ |
| `bun run scripts/health/sub-loop.ts backend/services/classes/session-request-notification.service.test.ts --lifecycle duplicates` | exit 0 — tsgo ✅ · oxlint ✅ · biome:check ✅ · lint:type-aware ✅ · check:duplicates ✅ (duplicates sub-check reports test files outside jscpd scan scope → skips, same as R2 journey files) |
| `PGLITE_DATA_DIR=./db/pglite-test-r3fix bun run test/scripts/run-test.ts backend/services/classes/session-request-notification.service.test.ts` | exit 0 — **34 pass / 0 fail** (485 expect calls) |
| `PGLITE_DATA_DIR=./db/pglite-test-r3fix bun run test/scripts/run-test.ts backend/services/classes/session-lifecycle.service.test.ts` | exit 0 — **59 pass / 4 skip / 0 fail** (775 expect calls) |
| `bun tsgo` (final state, types file restored) | exit 0 — 0 `error TS` |
| Empirical 9th-kind proof (both forms above) | replica: 8→exit 0, 9→exit 1 (2 errors) · real repo: 9→exit 1 (service 178/222 + test 374,3 cascade), restored→exit 0 |

Diff footprint (this round): exactly the two target files — `git diff --stat`: session-request-notification.service.ts (+14/−1), session-request-notification.service.test.ts (+18/−4) — plus this outcome append. The `backend/types/classes/session-notification.types.ts` mutation existed only inside single command batches and was restored byte-identical (cmp-verified). Pre-existing dirty files from PW-fix/R2 rounds untouched. No lock/port errors encountered (no retries needed).
