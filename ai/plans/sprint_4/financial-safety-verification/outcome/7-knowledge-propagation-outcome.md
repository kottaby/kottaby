# Task 7 Outcome — Knowledge Propagation & Documentation

**Plan:** `ai/plans/sprint_4/financial-safety-verification/`
**Task:** 7 — Knowledge propagation & documentation
**Date:** 2026-09-12
**Status:** ✅ Complete

---

## 1. Canonical Doc — Final State

`docs/billing/financial-safety-verification.md` (116 lines) is complete and verified in place.
No TODO placeholders remain, no "Pending authorship" notes. All five Task 7 spec sections are
present:

1. **Why — Adversarial Verification over the Shipped Escrow Substrate** — frames the
   verification-only mandate (no production code/schema/resolvers/services changed).
2. **Verified Invariants** — 7-row table with `test path:line` anchors (all verified below).
3. **How to Extend the Probes** — one rule (new invariant → new failing-capable test) plus the
   savepoint-bracket and sum-invariant recipes.
4. **Anti-Patterns (what NOT to do)** — 8 prohibitions (float money arithmetic, `rejects.toThrow()`
   inside `runInRollback`, `runInRollback` in journeys, un-gated trigger tier, type-only enum
   imports, hand-typed error sentences, seed-data queries, app-level enforcement trust).
5. **Rollout Summary** — CI-only deployment surface; per-suite table of which new tests join
   which runner command.

## 2. Anchor Verification — Every Citation Accurate (nothing fixed)

Each citation in the Verified Invariants table was spot-checked against the actual file content:

| Anchor cited in doc | Verification | Result |
|---|---|---|
| `test/workflows/sessions/session-dual-confirmation.journey.test.ts:620` (step 10, confirm-vs-sweep race) | Line 620 = `test("step 10 — confirm-vs-sweep race on one expired completion: exactly ONE financial outcome", ...)` | ✅ Accurate |
| `backend/services/classes/session-lifecycle.service.test.ts:2314` (REQ-043(d), `testOnRealPostgres`) | Line 2314 = `testOnRealPostgres("REQ-043(d): two concurrent creations with ONE unit → exactly one session + one INSUFFICIENT_BALANCE, lanes never negative", ...)` | ✅ Accurate |
| `backend/services/classes/session-lifecycle.service.test.ts:2346` (REQ-043(e), `testOnRealPostgres`) | Line 2346 = `testOnRealPostgres("REQ-043(e): the same key replayed concurrently N=4 times → exactly one session, one net debit, three DUPLICATE_REQUEST denials", ...)` | ✅ Accurate |
| `backend/db/test/logic/billing/student-payment.repository.test.ts:206-213` (Tier 4 blocked rows) | Lines 206-213 = `// ─── Tier 4: BLOCKED trigger matrix rows (DB guard raises) ───` header + `test("paid→anything: the DB guard rejects re-opening and re-deciding a decided payment", ...)` with savepoint bracket | ✅ Accurate |
| `backend/graphql/test/schema-surface.test.ts:218-225` (`myWallet`, `requestWithdrawal` field sets) | Lines 222-224 = `const WALLET_QUERY_FIELDS = ["myWallet"] as const;` + `const WALLET_MUTATION_FIELDS = ["requestWithdrawal"] as const;` (within the cited 218-225 window) | ✅ Accurate |
| `backend/db/test/repo/billing/wallet.repository.test.ts` — describes `WalletRepository — CHECK constraint probes (savepoint-bracketed)` and `WalletRepository — namespace closure` | Both describes exist (lines 474 and 432; the file also has `WalletRepository — transactional paths (runInRollback)` at 207 and `WalletRepository — defensive zero-row guards` at 448, which the doc's citation does not contradict) | ✅ Accurate |
| `backend/db/test/logic/billing/financial-immutability.test.ts` — `describeTriggerTier` blocks: `financial ledger immutability — trigger presence tier`, `— teacher_transaction tamper tier`, `— student_payments tamper tier` | All three `describeTriggerTier` blocks exist (lines 225, 270, 359); the gating const is `const describeTriggerTier = isPgliteProvider() ? describe.skip : describe;` at line 221 | ✅ Accurate |
| `test/workflows/billing/financial-safety-verification.journey.test.ts` — describes `Journey — cross-actor adversarial financial-safety verification (real services)`; doc claims 9 tests (Steps A–H) | Describe name matches exactly at line 371; exactly **9** top-level `test(` declarations confirmed (steps A, B, C, D, D2, E, F, G, H — step H is teardown) | ✅ Accurate |

**Verdict: zero citations required fixing.** The doc was not rewritten; only verification was performed.

## 3. Rule-File Policy Confirmation

`git status --porcelain` was inspected: **NO modifications to any `AGENTS.md` or
`.agents/instructions/` file.** The only modified files are this plan's own artifacts
(`tasks.md`, `deferred-items.md`, outcome files, the canonical doc) plus the untracked journey
test and outcome files — all in-scope deliverables. The hand-curated rule files were honored.

## 4. Quality Gate Result

```
DATABASE_URL=... DB_PROVIDER=postgres bun run scripts/health/sub-loop.ts \
  docs/billing/financial-safety-verification.md --lifecycle tsgo
→ ✅ All checks for lifecycle "tsgo" passed.  EXIT_CODE=0
```

Sub-loop output confirmed: `✅ tsgo passed (no errors for docs/billing/financial-safety-verification.md)`.

**D5 exemption note (known tooling gap, re-routed):** the full `duplicates` lifecycle can never
exit 0 on `.md` files — the oxlint stage replies "No files found to lint" and exits 1 for markdown
paths. This is pre-existing and re-routed as **D5** in this plan's `deferred-items.md`, whose
Status row is `✅ Re-routed → Scripts/tooling owner quality ticket`. The **tsgo lifecycle is the
gate** for markdown files; `biome`/`lint`/`jscpd` are md-exempt by config
(`eslint.config.mjs` ignores `**/*.md`; `shouldSkipJscpd` skips non-TS paths).

## 5. Synthesized Learnings Captured in the Doc

The doc distills the recurring patterns that emerged across Tasks 0–6:

- **Savepoint-bracketed constraint probes** (DB/repo tier): a failed statement aborts the
  surrounding transaction, so probes open a SAVEPOINT after fixture setup, run the violating
  statement via the `expectRepoError` try/catch helper, then `rollback to savepoint` and assert
  via the error cause chain (`constraintNameOf` for CHECK names).
- **Sum-invariant race assertions** (service/journey tiers): concurrency outcomes are expressed
  as numeric sums over `Promise.allSettled` results (winners + losers = N, winners = 1, final
  balance = expected) — never as "should not error" — so assertions stay meaningful under both
  true-parallel PostgreSQL (`testOnRealPostgres`) and the serialized PGlite sandbox.
- **`describeTriggerTier` provider gating**: the `isPgliteProvider() ? describe.skip : describe`
  pattern so trigger tiers never fail on a runtime capability gap — a logged skip, never silent.
- **Deepest-cause message assertions** for Drizzle-wrapped trigger errors: Drizzle masks driver
  errors behind a generic message, so raised trigger text is reachable only by walking the error
  cause chain.
- **`TrackedFixtures` registry contract**: every service-created row is tracked via
  `registry.track(...)` for the `afterAll` hard-delete — journeys run on committed fixtures, not
  `runInRollback`.
- **Zero-residue teardown probes**: the journey's final step (H) verifies the teardown worklist
  is complete — no fixture row outlives the test run.
- **db-CLI/sub-loop `DATABASE_URL` bootstrap gotcha (sandbox-specific)**: quality commands that
  touch DB-backed checks must be invoked with an explicit
  `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/kottaby_test" DB_PROVIDER=postgres`
  prefix in this sandbox — the ambient env does not carry it, and the sub-loop/db-CLI path fails
  to bootstrap PG connectivity without it.

## 6. Checkboxes Flipped

In `ai/plans/sprint_4/financial-safety-verification/tasks.md`:

- Line 146: `- [ ] 7. Knowledge propagation & documentation` → `- [x] 7. Knowledge propagation & documentation`
- Line 151: `- [ ] 7.IV **Instruction Verification**...` → `- [x] 7.IV **Instruction Verification**...`

**Plan status: Tasks 0–7 all complete.**
