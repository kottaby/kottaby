# Mid-Point Backend Review R1 — Task 6.5

**Plan:** `ai/plans/sprint_1/subscription-validity-window-expiry/`
**Task:** 6.5 — Backend review checkpoint (after 6.1, before lock-in/final gates)
**Executed:** 2026-09-12 · **Agent:** Midpoint Backend Reviewer (single reviewer, dispatch-free fixes)
**Reviewed tree:** `feat/subscription-validity-window-expiry` @ `32cf61c` (= `origin/feat/subscription-validity-window-expiry`; Phase 0 baseline `origin/main` @ `2bdea32`, empty baseline diff ⇒ every file in the plan diff is new code attributable to this plan)
**Inputs read:** worklog.md (all entries), specs.md, plan.md, tasks.md, deferred-items.md, ALL outcome files (plan-review-R1, research-01..04, 0.1, 2.1, 2.2, 2.3, 3.1, 4.1, 4.2, 5.1, 5.2, 6.1), root/backend/db-repo/services/app AGENTS.md, backend/db/test + backend/db/schema AGENTS.md, test/workflows/AGENTS.md, `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`

---

## Summary

| Severity | Count | Fixed | Adjudicated/logged |
|---|---|---|---|
| CRITICAL | 0 | — | — |
| HIGH | 0 | — | — |
| MEDIUM | 0 | — | — |
| LOW | 2 | 2 | — |
| **Total findings** | **2** | **2** | 2 logged (not counted — see below) |

Two LOW findings (one misleading docblock clause, one duplicated inline type where a named interface exists). Both fixed in-place and re-verified (`sub-loop --lifecycle duplicates` exit 0 per file; affected suites re-run green; whole-repo tsgo 0). Zero architectural, race-condition, env-config, dead-code, schema, or test-discipline findings. The adjudicated items (oxlint max-lines override on `student.repository.ts`; pre-existing `health-route.probe.test.ts` three-route pin failure) are **not re-flagged** per the gate brief; the latter was reproduced as failing identically on pristine `origin/main` by the 6.1 task and is logged only.

### Environment note (hazard defense, for the record)

This session's sandbox repeatedly reset the checkout to `main` @ `2bdea32` between tool calls (the recurring warfare the 4.1/5.1/5.2/6.1 outcomes recorded). At review start the worktree was on `main` with all Phase 0–6 artifacts absent from the tree — **not** a wipe: the local branch `feat/subscription-validity-window-expiry` and its origin counterpart both held `32cf61c` with every plan artifact intact (verified via read-only `git show`/`git diff` before any checkout). Recovery was a plain non-destructive `git checkout feat/subscription-validity-window-expiry` (no `reset`, no `-f`, no history mutation, no commits; local == origin throughout). Every guarded operation re-verified the branch inside the same shell command; pre-edit copies of every touched file are at `/tmp/6-5-backup-*` and post-edit finals at `/tmp/6-5-final-*`. Untracked residue from prior sessions (`scripts/one-shot-5.2.sh`, `scripts/one-shot-6.1.sh`) left untouched (orchestrator's recovery tooling).

---

## Findings by Dimension

| # | Dimension | Verdict | Findings |
|---|---|---|---|
| 1 | Architecture compliance (layering, barrels, logger, no console.*) | **CLEAN** | Route delegates to the service via the sanctioned `@/backend/services/billing` barrel; service orchestrates repos via `@/backend/db/repo` barrel; repos own every guarded statement. The service's single `tx.select(plans)` batch read is plan-mandated (§5.1) and follows the existing services-touch-schema precedent (`subscription-purchase.service.ts`, `auth.service.ts`, `recitation.service.ts`). Logger only from `@/backend/lib/logger`; `console.*` zero (the one grep hit is a source-pin assertion string in a test). No frontend imports in backend; shared/ untouched except the sanctioned 3-file locale key. |
| 2 | TOCTOU / races | **CLEAN** | `expireDueActive`: ONE guarded UPDATE, predicate (`status='active' AND end_date IS NOT NULL AND end_date <= $now`) evaluated SQL-side under the row lock, `RETURNING` projection. `zeroLaneIfNoCoveringSubscription`: identity + `COALESCE(…) > 0` + `NOT EXISTS` anti-join fused with the write. `hasUncoveredExpiredLane`: EXISTS/anti-EXISTS fused into one statement (read-then-throw with no follow-on write ⇒ zero TOCTOU per plan §5.2). `now` captured ONCE inside the sweep transaction and passed to the flip; zeroings share the flip's transaction (`withTransaction(outerTx, …)`; production opens its own tx). No module-level mutable state in any shipped file. |
| 3 | Dead code / unused exports | **CLEAN** | All new exports consumed (`expireDueActive`, `hasUncoveredExpiredLane`, `zeroLaneIfNoCoveringSubscription`, `SubscriptionExpiryService.expireDue`, both canonical types, the route). All imports used; no unreachable branches — the service's "unreachable" invariant aborts (missing plan row, out-of-vocabulary lane) are deliberate fail-closed guards, exercised-adjacent via the NULL-lane and mapped-lane tiers and documented as such. |
| 4 | Race conditions in repo methods / enum discipline | **CLEAN** | Predicates are SQL-side; zero SELECT-then-UPDATE. Enum VALUE imports wherever the enum is a runtime value (`SubscriptionStatus` in the flip and in both probes' bound parameters; `SubscriptionCreditLane` as map keys and bound lane parameter). `SubscriptionCreditLane` is type-position-only in `subscription.repository.ts` (correct — the runtime value arrives as the caller's bound argument). No string literals where enums are expected; no `sql.raw`; no `--` inside any `sql` template. |
| 5 | Env-config | **CLEAN** | Raw `getEnv` only; **no `env-config-keys.ts` exists** (verified); zero new env keys — only the three pre-existing `CRON_*` keys; no `vercel.json`, no `scripts/cron-worker.ts`, no `backend/services/cron/`. Route gate ordering is fail-closed: mode gates (`external` AND `true`) answer the bare 404 BEFORE any auth work; bearer gate before the sweep; empty/missing secret fails closed to 401; query-string secret never consulted (dedicated negative test). |
| 6 | Clean comments | **CLEAN** | Zero plan-meta in code: grep over every `.ts`/`.mts` in the plan diff for REQ ids, task ids, plan paths, "Phase N" — no hits (the only `oxlint-disable` string is prose inside `oxlint.config.mts`'s own rule text). Docblocks are domain prose; the route documents the single sanctioned bare-404 exemption without meta references. |
| 7 | Schema / migration drift | **CLEAN** | `subscriptions_active_end_date_idx` matches plan D5 exactly: `index("subscriptions_active_end_date_idx").on(t.endDate).where(sql\`${t.status} = 'active'\`)` — name, column, WHERE clause. `bun run db push` re-run this session: **"No changes detected"** (drift-free; no custom SQL migration exists or is needed). Repo predicate stays literally `status='active'`-equivalent via the `SubscriptionStatus.Active` enum member. |
| 8 | Error handling | **CLEAN** | Route: masked envelopes only — bare 404 (disabled), masked 401 `DomainError("UNAUTHORIZED")`, masked 500 `INTERNAL_SERVER_ERROR` with the raw throw text absent (asserted by test); honest counts `{ expired, lanesZeroed }` on success with no row identities. Booking gate: `logger.logDomainError` immediately before the `ValidationError("SUBSCRIPTION_EXPIRED", t.subscriptionExpired)` — same shape as the `INSUFFICIENT_BALANCE` sibling. Service: `logger.error` reserved for invariant aborts (anomalies), `warn` for the NULL-lane config gap, `debug` for the empty sweep; client-safe constant copy on aborts. Counts are honest (flip length + guarded `true` returns only). |
| 9 | Test quality | **CLEAN** | Repo/service/booking suites: `runInRollback` + `tx` on EVERY call, entity-setup fixtures only, try/catch helpers (`expectRepoError` / `expectBookingDenial` / `expectSweepFailure`), zero `.rejects.toThrow` (grep-verified). Journey: NO `runInRollback`, ONE committing `beforeAll` tx, `TrackedFixtures` + post-teardown re-probes, `journeyPrefix("billing")`, `provisionStudentActor`, `publishReceipts` spy seam, `catchJourneyError` + `expectSingleDenial`, translated-copy assertions, Student-B byte-identical probe, replay `{0,0}`. Route test: env keys saved/restored, service mocked at the barrel boundary, zero-DB pure tier. All suites via `bun run test/scripts/run-test.ts` only. |
| 10 | Scope | **CLEAN (1 note)** | `git diff --name-only origin/main...HEAD` = 34 paths: exactly the plan's code/test/schema/types/locale/config files + plan artifacts (tasks.md, worklog.md, outcome/*). One extra path: `scripts/recover-branch.sh` — sandbox-recovery infrastructure pre-staged and documented in the 4.1 worklog entry, not product code; left untouched. No file outside the plan diff was modified by this review beyond the two in-plan LOW fixes + the 6.5 deliverables. |

---

## Detailed Findings

### Finding 1 — [LOW] Misleading docblock clause in `hasUncoveredExpiredLane`

- **Location:** `backend/db/repo/billing/subscription.repository.ts:263-266` (`@returns` clause)
- **Expected:** The `false`-shape list must mirror the method's own vocabulary: `false` ⇔ (no expired row on the lane) OR (expired row present but live coverage exists).
- **Actual:** `"`false` covers every other shape: no expired row, **an uncovered lane**, or live coverage." — "an uncovered lane" is exactly the `true` case in this method's vocabulary, making the clause contradictory (or, read charitably, a redundant subset of "no expired row").
- **Fix applied:** Reworded to the precise binary split: "no expired row on the lane, or an expired row that live coverage still backs." Comment-only change; no behavior delta.
- **Re-verification:** `bun run scripts/health/sub-loop.ts backend/db/repo/billing/subscription.repository.ts --lifecycle duplicates` → **exit 0** (tsgo → oxlint → biome → lint:type-aware → duplicates all green); `subscription-expiry.repository.test.ts` re-run → **5 pass / 0 fail**.

### Finding 2 — [LOW] Duplicated inline pair type in the sweep service

- **Location:** `backend/services/billing/subscription-expiry.service.ts:189`
- **Expected:** The dedupe map's value type should reuse the file's own named `ZeroingPair` interface (declared ~60 lines above, used by `zeroPairsSequentially`).
- **Actual:** `const zeroingPairs = new Map<string, { studentId: number; lane: SubscriptionCreditLane }>();` — a structurally identical inline duplicate of `ZeroingPair` (two sources of truth for the same shape).
- **Fix applied:** `const zeroingPairs = new Map<string, ZeroingPair>();` — type-identical, one-line change, no behavior delta.
- **Re-verification:** `bun run scripts/health/sub-loop.ts backend/services/billing/subscription-expiry.service.ts --lifecycle duplicates` → **exit 0**; `subscription-expiry.service.test.ts` re-run → **8 pass / 0 fail**; whole-repo `tsgo` → **0 errors**.

### Logged items (adjudicated — NOT counted as findings)

1. **`oxlint.config.mts` max-lines override for `student.repository.ts` (300 → 340)** — declared deviation documented in `outcome/4.2-outcome.md`; mirrors the `user-management.service.ts` precedent; justification comment is plan-meta-clean. Ratified; no action.
2. **`app/api/health/test/health-route.probe.test.ts` "three routes" pin** — fails identically on pristine `origin/main` (verified pre-existing via worktree run recorded by task 6.1; the route row it would need post-dates the pin). Owner = the health surface's Phase 7/8 lock-in. Logged, not fixed (file outside this plan's diff).
3. **`scripts/recover-branch.sh`** — committed branch content beyond the plan's file list; sandbox-recovery tooling, not product code (see Scope note). Left untouched.

---

## Post-Fix Verification Checklist

| Check | Command | Result |
|---|---|---|
| Schema drift | `bun run db push` | `[i] No changes detected` ✓ |
| Whole-repo typecheck | `bun run tsgo` → `grep -c "error TS"` | **0** ✓ |
| Repo suite (flip + probe) | `bun run test/scripts/run-test.ts backend/db/test/logic/billing/subscription-expiry.repository.test.ts` | **5 pass / 0 fail** (26 assertions) ✓ |
| Zero-lane repo suite | `…/student-zero-lane.repository.test.ts` | **13 pass / 0 fail** (45 assertions) ✓ |
| Sweep service suite | `…/subscription-expiry.service.test.ts` | **8 pass / 0 fail** (47 assertions) ✓ |
| Booking ladder suite | `…/session-lifecycle.booking.test.ts` | **26 pass / 0 fail** (2208 assertions) ✓ |
| Cron route suite | `app/api/cron/expire-subscriptions/test/expire-subscriptions-route.test.ts` | **11 pass / 0 fail** (39 assertions) ✓ |
| Route-inventory registry suite | `backend/lib/gateway/route-inventory.test.ts` | **15 pass / 0 fail** (38 assertions) ✓ |
| Gateway static assertions | `backend/lib/gateway/static-assertions.test.ts` | **17 pass / 0 fail** ✓ |
| Journey (Tier-4 capstone) | `test/workflows/billing/subscription-expiry.journey.test.ts` | **7 pass / 0 fail** (77 assertions) ✓ |
| Locale parity | `shared/locale/errors-namespace.parity.test.ts` | **21 pass / 0 fail** ✓ |
| Sibling repo regression | `…/subscription.repository.test.ts` | **6 pass / 0 fail** ✓ |
| Sibling cron route regression | `app/api/cron/sweep-sessions/test/sweep-sessions-route.test.ts` | **9 pass / 0 fail** ✓ |
| Sub-loop after fix 1 | `sub-loop.ts backend/db/repo/billing/subscription.repository.ts --lifecycle duplicates` | **exit 0** ✓ |
| Sub-loop after fix 2 | `sub-loop.ts backend/services/billing/subscription-expiry.service.ts --lifecycle duplicates` | **exit 0** ✓ |
| Plan-meta grep over plan diff | REQ/task/phase/path tokens in code comments | **0 hits** ✓ |
| Anti-pattern safelist | `env-config-keys.ts` / `vercel.json` / `cron-worker.ts` / `backend/services/cron/` / `console.*` / `oxlint-disable` / `jscpd:ignore` | **all absent** ✓ |

**Deliverable state:** 2 LOW fixes applied and re-verified; `tasks.md` 6.5 flipped [x] with this file as evidence; worklog `---` section appended (Task ID: 6-5). No commits made (per gate instructions); branch left at `32cf61c` with origin in sync.

---

## Lessons

1. **The sandbox's restore-to-`main` warfare is the dominant execution risk, not the code.** Every artifact loss in this plan's history traces to the checkout reset, never to a code defect. The working countermeasure set: (a) verify branch + artifact presence with read-only `git show`/`git diff` BEFORE any recovery action; (b) re-checkout with a plain (non-forced) `git checkout` only when local == origin at the expected commit; (c) re-verify the branch inside the same shell command as every mutation or test run (flips occur at tool boundaries, not mid-command); (d) keep `/tmp` pristine/final copies of every touched file so any post-session reset is recoverable; (e) prefer UNTRACKED files for new deliverables (they survive resets; tracked-file edits do not).
2. **Docblocks are contracts too.** The one prose defect found (Finding 1) sat in the most safety-critical sentence of the most safety-critical new predicate — the truth-table vocabulary. Review passes should read `@returns` clauses as testable claims and check them against the suite's assertion set.
3. **Named types should win over inline shapes the moment a shape is used twice** (Finding 2): the dedupe map and the walk helper described the same pair independently; the reviewer-only fix cost one line and removed a future drift seam.
4. **Plan-ratified layering exceptions should carry their rationale with them.** The service's single `inArray` batch read is plan-mandated and precedented; the 5.1 outcome records the adjudication — that documentation is what let this review close the dimension in one pass instead of re-litigating it.
