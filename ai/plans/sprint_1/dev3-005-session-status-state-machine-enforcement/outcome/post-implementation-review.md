# Post-Implementation Review Wave — Outcome

**Date:** 2026-09-08 · **Branch:** `feat/dev3-005-session-state-machine` · **Scope:** full diff vs `main` @ `ffce457`
**Dispatch model:** 3 independent parallel review subagents (review-types, review-backend, pentester). review-frontend NOT dispatched — the diff contains zero `frontend/`/`app/` files (backend-only plan), so that reviewer's scope is empty by construction.

## R1 — Findings (aggregated, deduplicated, filtered vs Phase 0 baseline)

Phase 0 baseline was all-zero (0.1 outcome); all 14 diff code files are new-or-plan-modified, so every finding below is feature-specific unless marked PRE-EXISTING.

| # | Severity | Location | Finding | Disposition |
|---|---|---|---|---|
| 1 | MEDIUM | `transitions.ts:239-247` + `service.ts:299/370/539` | INV-S6 release is an unconditional `setOnline(true)`; a teacher holding two concurrently-`started` sessions would unlock on the first exit (found independently by backend AND pentester — deduped to one) | **Ledger D2 extended** (out of plan scope; owning tickets DEV2-011/012): condition release on `NOT EXISTS(other started session)` + two-session regression test BEFORE any `is_online` exclusability consumer (DEV3-008 booking exclusion) |
| 2 | MEDIUM | `service.ts:233-239` + `teacher.repository.ts` docblock | `priorOnline` captured but never consulted; docblock overstated the composition contract | **Docblock fixed** to state the truthful contract (unconditional restore; seam owned by future toggle work); behavior unchanged (ledger D2 already owns the seam) |
| 3 | LOW | `enforcement.ts:21` | Plan-artifact reference "plan Decision 1" in production JSDoc (zero-tolerance rule) | **Reworded** to domain rationale |
| 4 | LOW | `enforcement.ts:22-23` | Docblock falsely attributed the journey sweep to the matrix | **Reworded** — consistency pinned by enforcement truth-table tests |
| 5 | LOW | `journey.test.ts:2,37` / `enforcement.test.ts:2` | Plan-artifact refs ("REQ-J6", ticket ids) in test docblocks | **Removed**, domain phrasing |
| 6 | LOW | `service.ts:239` | Lock-direction `setOnline(..., false, tx)` result ignored (fail-open asymmetry vs fail-closed release) | **Hardened**: zero-row lock write → `logger.error` + throw → same-tx rollback (defensive; structurally unreachable — same-tx `findById` precedes) |
| 7 | LOW | `service.test.ts:153-156` area | `absentSessionId` names a min-id result `maxId` | **Renamed** `minRow/minId` in `enforcement.test.ts` (where the pattern actually lives); `service.test.ts`'s `maxId` verified truthful (real `max()`), untouched |
| 8 | LOW | `service.ts:364-371,529-540` | New session→lane→teacher ordering vs booking's teacher→lane ordering = theoretical deadlock cycle (retryable 40P01, no corruption) | **Ledger Non-Blocking Notes** (no owning ticket exists; normalize order / 40P01 retry if ever observable) |
| 9 | LOW | `enforcement.ts:198-212` | `assertTeacherNotInActiveSession` is check-then-act — DEV2-011 toggle would inherit a TOCTOU window; gate probes `started` while lock persists through `disputed` | **Ledger D2 extended**: fuse `NOT EXISTS(started session)` into the toggle UPDATE's WHERE (guarded write) |
| 10 | LOW | `enforcement.ts:162-176` | INV-S8 pass/deny is a report-existence oracle unless the consumer participant-scopes first (denial messages verified leak-free; surface grep-verified internal-only) | **Ledger D1 extended**: DEV3-006 MUST participant/owner-scope BEFORE the gate |
| 11 | LOW | `service.test.ts:2021-2120` | REQ-043(a)/(b)/(c) re-gated to `testOnRealPostgres` (skip on PGlite) | Sanctioned seam, documented in 2.2; CI covers real PG — no action |
| 12 | PRE-EXISTING | `transitions.ts:212-227` | Raw `Error` fail-closed throw precedent (`refundHeldLaneToProvenance`) | Non-blocking (new code mirrors it deliberately) |
| 13 | PRE-EXISTING | `service.ts:618-628` | Sweeper covers `scheduled` only; abandoned `started` exits manually | Accepted design (DEV2-012 owns inactivity sweeping) |

**R1 totals: 2 MEDIUM + 8 LOW new, 2 PRE-EXISTING. Zero CRITICAL/HIGH.**

## R1 Verified-clean (per reviewer checklists)

- TOCTOU: every transition = single guarded UPDATE; pre-state from the write's own `RETURNING` — no read-then-write gap on any shipped path; gates read-only with REQUIRED tx.
- Layering: service→repo respected; barrels conform; no cross-layer imports; enums value-imported.
- BOLA/IDOR: zero GraphQL/resolver exposure of new internals; ids server-derived; uniform denials preserved.
- Privilege escalation: no toggle surface exists; `resolveSessionDispute` = GraphQL admin gate + defense-in-depth DB-role recheck; B.18 holds.
- Injection: fully parameterized raw SQL; no LIKE wildcards.
- Lock DoS: none — failed starts roll back atomically (fault-injection proven); release fail-closed.
- Locale parity: 53-key sets identical labels/en/ar; compile-time gate + parity suite green.
- Dead code: none (unconsumed gates/matrix are ledger-contracted future-consumer exports).

## R2 — Re-review (fresh independent subagent)

All 7 fix-cluster findings **RESOLVED** (resolution evidence per item in the re-review record). One new LOW found (N1): rewritten JSDoc clause "classification and the suites ask it what is legal" overstated matrix consultation — docs-only, one-line precision fix.
Gates at R2: tsgo 0 errors · biome clean · test battery 105 pass / 9 skip / 0 fail (17 enforcement + 55+6 service + 20+2 repo + 13+1 journey) — exactly baseline.

## R3 — Closure

N1 reworded + deduplicated into a single precise sentence; sub-loop `--lifecycle duplicates` exit 0; biome clean; zero plan-artifact refs. **R3 VERDICT: 0 feature-specific findings remaining.**

## Final gate at wave close

tsgo 0 · oxlint 0/0 · biome clean · sub-loop duplicates exit 0 on all edited files · suites at exact baseline (twice-green honored on the journey suite) · ledger unresolved-marker scan 0 (all rows 🔄 Reserved with owning tickets).
