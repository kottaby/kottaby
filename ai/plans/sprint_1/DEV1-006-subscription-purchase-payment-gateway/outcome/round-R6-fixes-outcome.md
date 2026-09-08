# Round-R6 Fixes — Verification Outcome (Task R6-verify)

**Date:** 2026-09-08 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

All seven R6 items (F1–F7) were found **already applied and coherent** in the working tree by the verifying pass; one fallout item (stale NULL-lane posture prose in the canonical doc, §7) was repaired. Touched files: 9 modified by the fix round + this outcome + worklog.

## 1. Per-Fix Verification

| Fix | Expected (R6 dispatch) | Found in tree | Verdict |
|---|---|---|---|
| **F1 — activation NULL-lane → quarantine** | `{ processed: false }` + one correlated `logger.error`, no throw; docblock fixed; NULL-lane test rewritten to pin quarantine | `readActivationPlan` now returns `null` on `balanceLane === null` (message: "Payment webhook quarantined: plan balance lane is not configured — nothing mutated", context = `reference`/`subscriptionId`/`planId` — no financial values); `confirmPayment` returns `{ processed: false }` pre-write (zero statements precede the plan read, so the unit commits nothing); `ValidationError` + `ErrorsTranslations` plumbing removed (locale still feeds the notification bundle only). Namespace docblock + return contract rewritten (quarantine channel: no mutation, ONE correlated error log, honest ack, operator follow-up owns the settled charge). Test rewritten: "NULL balance lane at activation **quarantines** — processed:false, zero mutation, error logged with correlation ids" — pins `outcome` equality, exactly ONE `logger.error` with the three correlation ids, pending pair / zero credit / no notification seams | ✅ Verified |
| **F2 — mySubscriptions docblock governance claim** | Correct the governance-FORBIDDEN claim | `backend/graphql/query/subscription.query.ts`: docblock now states the read raises exactly ONE denial (service-side identifier VALIDATION) and there is NO governance FORBIDDEN channel on reads — `listOwn` is the owner-scoped read (owner predicate IS the read scope); governance denials are a write-surface concern | ✅ Verified |
| **F3 — "plan/lan" → "plan/lane"** | Typo fix | `backend/graphql/mutation/subscription-purchase.mutation.ts`: "plan/lane denials" | ✅ Verified |
| **F4 — domain-log entity attribution (purchase service)** | subscriptions/plans/users pairs + vocabulary unification with activation service | 4 log sites fixed with inline rationale comments: foreign-key replay probe → `entity: "users"` (caller id); duplicate-key block → `entity: "subscriptions"` (surface-only, no attributable id); payment-reference unique violation → `entity: "plans"` with `planId` (colliding subscription row never existed); missing idempotency key → `entity: "users"`. Full-file grep: zero singular `subscription` tags remain; every tag now names the table whose id rides it (`users`/`subscriptions`/`plans`) — matches the activation service's table-name vocabulary (`subscriptions`/`student_payments`) | ✅ Verified |
| **F5 — Object.hasOwn guards on `BALANCE_LANE_BY_VALUE`** | Prototype-safe lookups in usePlanForm.ts | Both lookups guarded: `validate()` uses `!Object.hasOwn(BALANCE_LANE_BY_VALUE, form.balanceLane)` (docblock cross-references the gateway-adapter-registry house idiom), and the submit conversion falls back to `undefined` through the same guard (an unknown raw value can never inherit an `Object.prototype` member into the wire payload) | ✅ Verified |
| **F6 — webhook per-read deadline + cancel + masked envelope + route test** | 30s deadline, injectable for tests, reader cancelled, same masked envelope, new test | `readChunkWithDeadline()`: each `reader.read()` races a timer sized from `export const BODY_READ_DEADLINE_MS = { current: 30_000 }` (single-field holder = the canonical test seam; no production writer); on ANY raced rejection the reader is `cancel()`ed best-effort **after** the race settled (cancel-earlier would resolve the read being raced and could let a partial body win) and the error propagates to the same `PAYMENT_WEBHOOK_BODY_UNREADABLE` masked envelope. Recursive body reader routes every pull through it. New test: stalled stream (one chunk, never closes/errors) with deadline injected to 25 ms → 400 masked envelope, zero payload echo, exactly ONE correlated `log.error` with a requestId, `cancelCalls === 1`, service never invoked, elapsed ≪ 5 s, deadline restored in `finally`; over-cap test additionally pinned to an explicit `x-request-id` so the bare-"bb" probe can't false-positive against a random hex | ✅ Verified |
| **F7 — activation replay-ack docblock tightened** | Future status-writers note | `confirmPayment`'s `activatePendingOnce` comment now reads: zero rows ⇒ an already-activated replay **under today's writer set** (the activation predicate is this status's only writer so far); "When a non-activation status writer (suspension/cancellation/expiry) lands, revisit this branch to distinguish replay from terminal-state suppression" | ✅ Verified |

## 2. Fallout Repaired by the Verifier

| Item | Finding | Repair |
|---|---|---|
| **D1 — canonical doc §7 stale NULL-lane posture** | The R6 diff updated `docs/billing/subscription-purchase.md` invariant 6 (§ "Key invariants") to the quarantine posture, but two activation-time claims in §7 still described the OLD fail-closed rollback: the `confirmed`-path fixed order said "NULL-lane fail-closed guard (the whole unit rolls back; the gateway retry re-classifies once the lane is configured)", and the Lane crediting rules said "the service's fail-closed lane guard ensures this case never carries financial weight" | §7 step 3 rewritten: "NULL-lane QUARANTINE guard (a lane-clear is REACHABLE — an admin can clear a plan's lane after the purchase commits — so a NULL lane acks `{ processed: false }`, mutates nothing, and logs one correlated error; operator follow-up owns the settled charge until the lane is re-configured)". Crediting rule now: "the service's NULL-lane quarantine ensures this case never carries financial weight (the delivery acks `{ processed: false }` before any credit runs)". The §6 purchase-order "NULL-lane fail-closed guard" was left intact — purchase time genuinely throws `PLAN_LANE_UNCONFIGURED` (verified against the service source). Post-repair grep: no remaining activation-time rollback claims for the lane | 

## 3. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ EXIT 0 / 0 errors (interim + final, incl. after the docs repair) |
| `backend/services/billing/subscription-activation.service.test.ts` | ✅ **12 pass / 1 skip (real-PG-gated concurrency) / 0 fail** (108 expect calls) — includes the rewritten quarantine test |
| `app/api/payments/webhook/test/payments-webhook-route.test.ts` | ✅ **33 pass / 0 fail** (131 expect calls) — includes the new deadline-stall test (32 → 33) |
| `backend/services/billing/subscription-purchase.service.test.ts` | ✅ **18 pass / 1 skip / 0 fail** (127 expect calls) |
| `test/workflows/billing/subscription-purchase.journey.test.ts` | ✅ **10 pass / 0 fail** (89 expect calls) — the required 10/10 |
| `backend/graphql/test/subscription-purchase.schema.test.ts` | ✅ **14 pass / 0 fail** (86 expect calls) |
| `backend/graphql/test/subscription-purchase.roles.test.ts` | ✅ **10 pass / 0 fail** (32 expect calls) |
| `backend/graphql/test/subscription-purchase.replay.test.ts` | ✅ **9 pass / 0 fail** (42 expect calls) |
| `test/ui/components/admin/PlanCatalogContainer.test.tsx` (scoped: `KOTTABY_TEST_RUNNER_OK=1 TEST_SERVER_MODE=production` + `.env.test.ci` + the four UI preloads) | ✅ **7 pass / 0 fail** (57 expect calls) |
| `shared/locale/plans-namespace.parity.test.ts` | ✅ **4 pass / 0 fail** (266 expect calls) |
| Extra insurance (graphql files touched by F2/F3 docblocks): `sdl-static-assertions` / `schema-surface` | ✅ **33/0** (179 expects) · **42/0** (264 expects) |
| sub-loop `<file> --lifecycle duplicates` | ✅ EXIT 0 on all **8 code files**. ⚠️ `docs/billing/subscription-purchase.md` cannot pass this lifecycle: the sub-loop's oxlint stage reports "No files found to lint" for any markdown file and exits 1 — **pre-existing tooling limitation, not R6 fallout** (control run on the UNMODIFIED `docs/billing/plan-catalog.md` fails identically). Its tsgo stage passes; clone-scanning for `docs/**` is out of scope by project config (`.jscpd.json` ignores `docs/**`, format = typescript/tsx) and the project-wide jscpd gate is green |
| `bun run check:duplicates` | ✅ **0 clones** |
| `bun run biome:check` (write+unsafe) | ✅ 1456 files checked, **no fixes applied** — no formatting fallout |
| Artifact grep `git diff --name-only ffce457 HEAD \| xargs grep -inE "dev1-006"` | ✅ zero source hits — every hit is the uppercase ticket id inside pre-existing `ai/plans/sprint_1/DEV1-006-…` planning/outcome artifacts (the sanctioned home of the ticket id); no lowercase `dev1-006` in any source file |
| `git status` | ✅ exactly the 9 R6 files (+ the docs repair folded into `docs/billing/subscription-purchase.md`) + this outcome + worklog; NO COMMITS |

## 4. Notes for the Orchestrator

- F1's quarantine sits BEFORE any write in the `confirmed` unit (the two reads are its only statements), so the `{ processed: false }` return commits an empty transaction — the "sibling quarantine posture" claim in the docblock is literally true and the test's zero-mutation assertions pin it.
- F6's deadline holder is exported as `{ current: 30_000 }` (not a bare number) precisely so the suite can shorten/restore it; the docblock marks it as the canonical test seam and no production path writes it. `Promise.race` keeps the losing timer inert (the deadline rejection stays handled — no unhandled-rejection noise on fast bodies).
- F4 rationale comments now sit at each of the four corrected log sites, so the next reviewer sees WHY a `plans` id rides a subscription-conflict log (the colliding row never existed).
- The sub-loop markdown limitation is worth a tooling ticket (oxlint stage should skip non-lintable extensions instead of failing "No files found to lint") — logged here as pre-existing, out of R6 scope.
- Pre-existing carries unchanged (QG-4 lint-service heap, B-1 snapshot.json gate-sanctioned formatting commit, PRE-1 plan-catalog anonymous-leg 401/403 split). Nothing committed.
