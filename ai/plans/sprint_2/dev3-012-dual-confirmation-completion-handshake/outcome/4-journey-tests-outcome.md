# Task 4 Outcome — Journey Tests: Dual-Confirmation Completion Handshake

**Plan:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
**Task:** 4 (journey proof) · **Date:** 2026-09-07 · **Agent:** Task 4 verify-and-complete subagent
**Requirements:** REQ-6 (+ REQ-2/REQ-3 journey-level proof), mid-point findings (a)/(b)/(c)

> **Nature of this session:** the prior Task 4 agent was killed by an infrastructure timeout
> mid-run, leaving uncommitted WIP (the new journey test, repo-test edits, no outcome file,
> no checkbox updates). This session AUDITED the WIP against the plan, kept it (it is correct
> and green), completed the missing pieces, and — the significant finding — repaired the two
> sibling session journeys whose stale pins the implemented handshake invalidated (details in
> "WIP audit" and "Cross-file dependencies"). Every claim below is re-verified from scratch in
> this session; all numbers are from captured runs in `logs/`.

> **Re-verification note (second continuation session, same day):** the outcome file above was
> found COMPLETE in the working tree (written by the first continuation session before its
> final report), with all Task 4 checkboxes marked and the D4/D5 ledger rows present. This
> session INDEPENDENTLY re-verified every claim from scratch rather than trusting the record:
> branch re-established first (`feat/dev3-012-dual-confirmation-completion-handshake`), all
> four sub-loops re-run (exit 0 ×4), the journey suite re-run TWICE consecutively (11 pass /
> 0 fail / 116 expect() both runs — idempotent teardown re-proven), the repo suite re-run
> (63 pass / 0 fail / 404 expect()), the sessions domain re-run (27 pass / 0 fail / 390
> expect() across 3 files), the whole `test/workflows` layer re-run (164 pass / 2 fail across
> 17 files), and D4/D5 re-reproduced SOLO (8 pass / 1 fail and 10 pass / 1 fail — the fails
> are exactly the step-9 out-of-domain reds described below). All static gates re-grepped:
> zero `runInRollback` usage (docblock prohibition mentions only), zero plan-artifact
> references in the new file and the repo-test diff, zero `console.*`/`any`/`rejects.toThrow`
> in new code, enum value imports verified, and the one `relatedEntityType: "session"`
> literal re-checked against the wave service's identical write. NOTHING was found drifted;
> every number below is the re-confirmed value. The only edit made by this session is this
> note.

---

## Summary

`test/workflows/sessions/session-dual-confirmation.journey.test.ts` (11 tests) proves the
dual-confirmation handshake end-to-end through the REAL `SessionLifecycleService` (production
transaction path, no outer tx) on the real test DB, with the plan's two journeys plus the
concurrency chaos leg, and `backend/db/test/repo/classes/session.repository.test.ts` gained the
two mid-point findings' repo-level tests:

- **Journey A — confirm-and-pay (steps 1–6).** Committed fixture cast (real role rows) →
  Student A books (trial-lane hold, platform fee) → Teacher T starts (student's own complete
  attempt denied oracle-safely, row untouched) → Teacher T completes → EXACTLY ONE
  `session_completion` prompt row addressed to the student + the receipt published exactly once
  post-commit targeting exactly him (spied `NotificationEngine.publishReceipts`) → Student A
  confirms → both stamps present, `fee_held=false`, teacher wallet `total_earning`/`balance`
  delta == the fee EXACTLY (one `TransactionType.Earning` ledger row, amount verbatim) →
  re-confirm (student), teacher confirm, and foreign-student confirm each write NOTHING
  (idempotent no-op / oracle-safe `SESSION_NOT_FOUND`, wallet + ledger byte-static, zero
  publishes).
- **Journey B — timeout-and-refund (steps 7–9).** Student B books; a committed fixture write
  moves the row to `completed` with a teacher stamp one hour past
  `SESSION_CONFIRMATION_WINDOW_MS` (fixture-scope fabrication; the sweep itself runs unmodified)
  → the real `sweepExpiredSessions()` cancels it, releases the hold, keeps the provenance lane
  and both stamps, and refunds the held unit to the SAME trial lane exactly once (0 → 1) →
  exactly one auto-cancel notification row for that session addressed to Student B, published
  once targeting him, no fan-out to anyone else → re-sweep matches ZERO rows / zero refunds /
  zero new notices.
- **Chaos — confirm-vs-sweep race (step 10).** A second expired completion is raced through
  `Promise.allSettled([confirmSessionCompletion, sweepExpiredSessions])` on the production path;
  the row oracle partitions the two terminal shapes exactly once — student stamp ⇒ escrow
  consumed by the credit (wallet +fee once, lane untouched, zero notices), no stamp ⇒ escrow
  released by the sweep (lane +1 once, zero credits, exactly one auto-cancel notice published to
  the student). Never both, never neither; a rejected confirm is honestly classified
  `SESSION_INVALID_TRANSITION` (`ConflictError`).
- **Mid-point finding (a)** — repo-level double-`completeSessionOnce` under
  `Promise.allSettled`: both statements fulfill (one winner + one honest null), the winner's
  stamps ARE the row's stamps (one captured instant written exactly once), escrow hold and
  student stamp untouched — the repo layer emits no wave traffic, so the duplicated statements
  serialize cleanly.
- **Mid-point finding (b)** — an admin-arbitration COMPLETE row (built through the REAL guarded
  statements `startSessionOnce` → `openDisputeOnce` → `resolveDisputeCompleteOnce`: completed,
  BOTH stamps absent, `fee_held=false`) is NEVER swept — a NULL teacher stamp can never be older
  than the cutoff — with an overdue control row in the same sweep proving the exclusion is not
  vacuous, and the settled row byte-unchanged afterwards.
- **Mid-point finding (c)** — journey fixtures can never leave eligible overdue completed rows
  behind: every session row (including both fabricated-expired ones) is registered in the
  fixture registry and hard-deleted FK-safely in `afterAll` (defensive re-probe asserts zero
  residue); a DB residue probe before this session's runs confirmed 0 eligible rows and 0
  journey rows. Two consecutive green runs of the suite prove idempotent teardown.

## WIP audit verdict (what was kept / fixed / completed)

| WIP item | Verdict | Action this session |
|---|---|---|
| `session-dual-confirmation.journey.test.ts` (714 lines, untracked) | **Correct and complete** against the Task 4 spec: both journeys, the race, spied publish, no `runInRollback`, committed fixtures + tracked `afterAll`, second-precision stamp helper per Task 1's carry-forward, zero plan-artifact references | **Kept unchanged** (11 pass / 0 fail, twice consecutively) |
| `session.repository.test.ts` modifications (findings a + b + coverage-map/docblock refresh) | **Correct**: real guarded-statement fixtures, non-vacuous control row, honest counts | **Kept unchanged** (63 pass / 0 fail) |
| Sibling journey J1 (`session-lifecycle.journey.test.ts`) | **STALE — red since the handshake landed** (4 pass / 7 fail in the killed agent's logs at 11:21–13:33, reproduced before any edit this session): (1) millisecond-precision deadline/startedAt comparisons that cannot hold in this environment (the value a service call RETURNS reports second resolution); (2) the completion step's zero-notification-delta pin, invalidated by the sanctioned prompt wave | **Fixed**: second-precision comparisons (`secondPrecisionMs` helper; `expectDeadlineWindow` brackets; step 3/5/6 cross-source equalities), the completion pin now asserts the EXACT sanctioned delta (student +1 prompt row, everyone else unchanged), the publish spy installed + the receipt's publish asserted exactly-once targeting the student, the defensive afterAll residual sweep (J2's established convention), honest docblock/title updates | 
| Sibling journey J2 (`session-lifecycle-denials.journey.test.ts`) | **STALE — red** (3 pass / 3 fail): leg 2's funded-booking deadline bracket asserted millisecond precision; legs 3/6 failed only as cascades (`secondSessionId` unset → wrong denial class) | **Fixed**: the leg-2 deadline bracket compares at the timestamps' stored second resolution (one helper + two lines); legs 3/6 pass again |
| Outcome file, Task 4 checkboxes | Missing (killed agent never wrote them) | **Completed** here |

## Files Modified

| File | Change |
|---|---|
| `test/workflows/sessions/session-dual-confirmation.journey.test.ts` | NONE this session (WIP audited and kept verbatim; authored by the prior Task 4 agent) |
| `backend/db/test/repo/classes/session.repository.test.ts` | NONE this session (WIP audited and kept verbatim: finding-(a) test rework, finding-(b) test, docblock refresh) |
| `test/workflows/sessions/session-lifecycle.journey.test.ts` | Stale-pin repair (see WIP audit): `spyOn`/`NotificationEngine`/`NotificationDeliveryReceipt`/`inArray`/`or` imports; `secondPrecisionMs` + `spyPublication`/`publishedUserIds`/`publicationCallCount` helpers; `expectDeadlineWindow` at second precision; step 3/5 cross-source equalities at second precision; step 6 exact-delta pin (+1 prompt row for the student), publish exactly-once assertion, deadline equality at second precision; afterAll defensive residual sweep; honest header/title updates |
| `test/workflows/sessions/session-lifecycle-denials.journey.test.ts` | Leg-2 deadline bracket at second precision (+ the `secondPrecisionMs` helper; comment updated) |
| `ai/plans/.../outcome/4-journey-tests-outcome.md` | This file |
| `ai/plans/.../tasks.md` | Task 4 checkboxes → `[x]` (Task 5's earlier checkbox edits left untouched) |
| `ai/plans/.../deferred-items.md` | Two rows (D4/D5) for the two pre-existing out-of-domain journey reds discovered while proving the layer's state (below) |

## Files NOT Modified (and why)

- `backend/services/**`, `backend/db/repo/**`, `backend/types/**`, `shared/locale/**`, `app/**`,
  `frontend/**` — Task 4 is test-only; every product surface was consumed as-is.
- `docs/**` and root `AGENTS.md` — Task 5's completed work, present uncommitted in the tree;
  untouched here.
- `test/workflows/notifications/**`, `test/workflows/admin/**` — their failing journeys are
  pre-existing reds in OTHER domains (evidence below); fixing them is outside this task's scope
  and this plan's boundary → recorded in `deferred-items.md` instead of silently patched.
- `.env*` — untouched (rule). No git commit / no git push (orchestrator commits).

## Verification Results

### 4.QL — per-file sub-loops (`bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`)

| File | Result |
|---|---|
| `test/workflows/sessions/session-dual-confirmation.journey.test.ts` | **exit 0** — tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates ✅ (jscpd skip: file outside scan scope) |
| `backend/db/test/repo/classes/session.repository.test.ts` | **exit 0** — all five stages ✅ |
| `test/workflows/sessions/session-lifecycle.journey.test.ts` | **exit 0** (after the stale-pin repair) |
| `test/workflows/sessions/session-lifecycle-denials.journey.test.ts` | **exit 0** (after the repair) |

No lock/port contention (retry budget unused).

### 4.TE — test runs (mandated runner, `.env.test` → PGlite `./db/pglite-test`)

| Command | Result |
|---|---|
| `bun run test/scripts/run-test.ts test/workflows/sessions/session-dual-confirmation.journey.test.ts` | **11 pass / 0 fail / 116 expect()** — run TWICE consecutively (idempotent-teardown proof; second run observes none of the first run's rows) |
| `bun run test/scripts/run-test.ts backend/db/test/repo/classes/session.repository.test.ts` | **63 pass / 0 fail / 404 expect()** (was 62 pre-task: +1 finding-(b) test; finding-(a) test reworked in place) |
| `bun run test/scripts/run-test.ts test/workflows/sessions` (whole domain) | **27 pass / 0 fail / 390 expect() across 3 files** |
| `bun run test/scripts/run-test.ts test/workflows` (whole layer) | **164 pass / 2 fail across 17 files** — the ONLY 2 fails are the pre-existing out-of-domain reds in D4/D5 below (both reproduce solo, both in domains this plan never touched) |

### 4.SEC — security audit

- **Publish boundary spied, never a real channel:** `NotificationEngine.publishReceipts` is a
  recording no-op for the entire suite (installed in `beforeAll`, restored in `afterAll`); every
  expected dispatch is asserted together with the recipient ids it targeted (prompt → exactly
  `[studentA]`; auto-cancel → exactly the swept student; no accidental fan-out to teacher/second
  student anywhere).
- **Honest authorization only:** the cast is real `users.role` rows + real role-child rows via
  `buildSessionJourneyCast`; negative steps (student completing, foreign student confirming)
  fail through the real predicates and are asserted by `DomainError.code` + the exact translated
  message via the try/catch helper — no `expect(...).rejects.toThrow()`, no monkey-patching.
- **No fixture-tracking leaks:** service-created rows (3 sessions, 3 idempotency claims) are
  registered the moment they exist; step 11 pins the worklist (20 tracked rows) before
  `afterAll` drains it; the post-teardown re-probe (sessions, wallet, both inboxes) is
  mandatory and green; DB-wide residue probe = 0 journey rows / 0 eligible overdue rows.

### 4.SR — Semantic Review Checklist verdicts (all items)

**Authorization & Tenancy** — N/A-by-layer with journey-level proof: no client-supplied id
reaches a write without the service's real ownership predicate (steps 3/6 denial probes);
no input spreads anywhere in the new test code; the sweep is exercised system-scope only.
✅

**Race Conditions & Concurrency** — ✅ No read-then-write in product code introduced (test-only
files; the race leg ASSERTS the service's one-financial-outcome contract both via
`Promise.allSettled` outcomes and the independent row/lane/wallet/ledger oracles).
✅ No unbounded module-level mutable state: module scope holds only per-suite test state
(`cast`, three session handles, the spy record) — the journey layer's established pattern.
✅ N/A credit/balance/Redis.

**Environment & Configuration** — ✅ N/A `resolveEnvConfig` / cache invalidation / credential
setters (none touched).

**Code Quality & Clean Comments** — ✅ No dead branches: both `creditWon` branches of the race
are reachable (either flow can win); every `requiredX` throw is a reachable guard.
✅ No cross-layer imports (tests import backend + shared only; `@/` aliases throughout).
✅ No manual ReturnType construction (the single `ReturnType<typeof spyPublication>` is a
type-level utility on a test helper, the repo-wide convention).
✅ **Plan-artifact sweep**: the new journey file contains ZERO `REQ-*`/`Task N`/`DEV3-*`/plan-path
references (grep-verified), and zero were added to the repo-test or J2 diffs. Declared, not
silent: the J1 repair RETAINS that file's pre-existing `REQ-019`/`REQ-022` labels on
rewritten lines (the file's established coverage-map vocabulary; scrubbing two of dozens
would be churn without honesty gain — same ruling as Task 3's REQ-043(c) note). All new
comments describe what/why/domain behavior (commit-boundary receipt semantics, second-
resolution storage facts, defensive-teardown rationale); no trivial restatements.

**Schema & Types** — ✅ No schema/migration change. ✅ Enums are VALUE imports
(`SessionStatus`, `HeldBalanceLane`, `SessionIntent`, `TransactionType`, `NotificationType`)
and members are used everywhere an enum is expected; the one string literal
(`relatedEntityType: "session"`) mirrors the column's own varchar vocabulary — the product
wave service writes the identical literal (`session-request-notification.service.ts:252`), no
enum exists for that column. ✅ Column property names match `$inferSelect` reads.

**Deferred Work** — ✅ Two genuinely out-of-scope discoveries recorded in `deferred-items.md`
(D4/D5 below); nothing deferred within this task's own scope.

**Scope Boundary** — ✅ `git diff --name-only` for this task = the four journey/repo TEST files +
plan outcome/checkbox/ledger files. The other dirty files in the tree (`AGENTS.md`,
`docs/sessions/session-lifecycle.md`, `outcome/5-*`, tasks.md's Task 5 boxes) are Task 5's
pre-existing uncommitted work, untouched. ✅ No out-of-scope refactoring ("while I'm here"
fixes to the out-of-domain journeys were explicitly NOT made — ledgered instead).

### 4.IV — Instruction verification

Sub-loop printed: root `AGENTS.md` + `.github/instructions/tests.instructions.md` (the printed
`.github/...` path does not exist in this tree; the live file is
`.agents/instructions/tests.instructions.md` — read in full, same as Tasks 1–3). The layer's
own `test/workflows/AGENTS.md` and `docs/testing/workflow-journey-tests.md` were read in full
and drive every rule below.

- **Journey layer contract** (`test/workflows/AGENTS.md` rules 1–12 + canonical doc): NO
  `runInRollback` (grep-verified: only docblock mentions of the prohibition); committed
  fixtures inside ONE `beforeAll` transaction; tracked FK-safe `afterAll` cleanup with
  mandatory post-teardown re-probes; per-run `jrn_sessions_<8hex>` prefix; honest roles via the
  actor factory; external effects intercepted (publish spy) with recipient-id assertions;
  try/catch denial helper with translated messages; `bun:test` imports; no `console.*`; no
  `any`; `@/` aliases; sequential actor-attributed steps; cross-actor visibility + denial
  assertions — ALL honored by the new file, and restored in the repaired siblings.
- **`tests.instructions.md`**: run-test script (never raw `bun test`) — used for every run;
  rollback/tx rules apply to the repo-test file, where the new finding-(b) test rides the
  existing `runInRollback` wrapper with `tx` threaded to every repo call; stale-pin rule ("a
  stale pin asserts a false contract") is the exact rule that mandated the J1/J2 repairs — the
  handshake change invalidated their pins, and the pins are updated in this change;
  no `console.*`/`any`/`rejects.toThrow`.
- **Root `AGENTS.md`**: deep imports honored; i18n via `getServerTranslations` (journey
  denial copy uses `errorsTranslations`, never hardcoded strings); run-test mandate honored.

## Cross-File Dependencies (important for Tasks 5–6)

1. **The handshake invalidated two stale sibling pins — repaired here.** Task 3's
   `completeSession` prompt emission changed J1's completion side-effect contract (the journey
   asserted a zero-notification delta); the environment's second-resolution RETURNING behavior
   broke J1/J2's millisecond-precision timestamp comparisons. Task 6's full gate should treat
   `test/workflows/sessions` as green-by-this-task; do not re-widen those assertions.
2. **`defaultLocale` is `"ar"`** (Task 3 carry-forward): the journey pins copy behavior through
   the ROW/recipient oracles and the spy rather than copy text, so it is locale-independent;
   Student fixtures persist `locale` implicitly via the cast (`en` journey locale for denial
   messages only).
3. **The sweep legs are GLOBAL batch predicates** (Task 1 carry-forward 3): Journey B's re-sweep
   asserts exactly-zero globally, which holds because each journey file's `afterAll` removes
   every eligible row before the next file runs and the seed contains no sessions — Task 6 must
   keep the whole `test/workflows` layer running per-file-clean (any future journey that
   commits an eligible overdue row and fails mid-run before cleanup would flip Journey B's
   zero assertion).
4. **`completeSessionWithReceipt` is the receipt-bearing channel; `completeSession` publishes
   internally post-commit** (Task 3 carry-forward 4): Journey A asserts the prompt through the
   production `completeSession` path (row oracle + publish spy), complementing the service
   unit's tx-path coverage.
5. **Environment fact (now load-bearing in three layers):** timestamps STORED keep full
   precision but the value a service call RETURNS reports second resolution — repo tests floor
   fixture stamps (Task 1), the service test gates the millisecond-deadline boundary to real
   Postgres (Task 3), and the journeys now compare cross-source instants at second precision
   (this task). Any new cross-source timestamp assertion in this repo must follow one of those
   three patterns.

## Out-of-scope discoveries → `deferred-items.md` (D4/D5)

- **D4 — `test/workflows/notifications/j1-targeted-single-recipient.test.ts` step 9 is red**
  (catch-up listing vs raw DB read differ by one row). Reproduces SOLO in this environment;
  the notification-domain engine/listing surface is untouched by this plan; not a session
  surface. Owned by a notifications-domain fix pass.
- **D5 — `test/workflows/admin/account-governance.journey.test.ts` step 9 is red** (governed-
  admin denial copy drift: journey expects the suspension text, the live translation answers
  "This account has been blocked."). Auth-copy drift, zero session involvement. Owned by an
  account-governance/auth-copy fix pass.

Neither is reachable from any DEV3-012 surface; both predate this task (never previously run in
this sandbox — no log history exists for either file). Recorded so Task 6's full-layer run is
not surprised.

## Carry-Forward Knowledge

1. **Sub-loop prints nonexistent `.github/instructions/...` paths** — the live instruction files
   are `.agents/instructions/*.instructions.md` (same finding as Tasks 1–3).
2. **The whole-layer `test/workflows` run currently reports exactly 2 fails** (D4/D5). The
   sessions domain (this task's layer) is fully green: 27/27 across 3 files.
3. **Journey publish-spy pattern is now duplicated in two session journeys** (J1 and the new
   file, identical 8-line helper). If a third journey needs it, promote `spyPublication` into
   `test/workflows/helpers/` (pure `export *` barrel) — NOT done here: sharing test scaffolding
   across files is a helpers-layer change outside this task's file list, and two occurrences
   stay under the duplication radar.
4. **Fixture fabrication ruling held**: Journey B/R's expired completions are committed fixture
   writes on the session row only — no product guard, probe, or transition is bypassed; the
   sweep, refund, and notifications run unmodified (plan.md design F sanctioned this).
5. Sandbox quirk (unchanged): HEAD auto-reverts to `main` between external invocations; every
   Bash batch re-verified `git branch --show-current` before edits; all four test files are
   byte-identical across branches or re-established on the feature branch, so the working tree
   survived.

## Verification Command Record

```
bun run scripts/health/sub-loop.ts test/workflows/sessions/session-dual-confirmation.journey.test.ts --lifecycle duplicates → exit 0
bun run scripts/health/sub-loop.ts backend/db/test/repo/classes/session.repository.test.ts      --lifecycle duplicates → exit 0
bun run scripts/health/sub-loop.ts test/workflows/sessions/session-lifecycle.journey.test.ts    --lifecycle duplicates → exit 0
bun run scripts/health/sub-loop.ts test/workflows/sessions/session-lifecycle-denials.journey.test.ts --lifecycle duplicates → exit 0
bun run test/scripts/run-test.ts test/workflows/sessions/session-dual-confirmation.journey.test.ts → 11 pass / 0 fail (×2 consecutive)
bun run test/scripts/run-test.ts backend/db/test/repo/classes/session.repository.test.ts           → 63 pass / 0 fail
bun run test/scripts/run-test.ts test/workflows/sessions                                           → 27 pass / 0 fail
bun run test/scripts/run-test.ts test/workflows                                                    → 164 pass / 2 fail (D4/D5, pre-existing, out of domain)
```

## Status

- [x] 4. Journey tests implemented + verified (Journey A, Journey B, race, findings a/b/c)
- [x] 4.QL (sub-loop exit 0 ×4) · [x] 4.TE (embedded above) · [x] 4.SR (all items) · [x] 4.IV
- No git commit / no git push (orchestrator commits).
