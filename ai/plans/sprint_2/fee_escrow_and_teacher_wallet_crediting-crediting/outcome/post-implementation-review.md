# Post-Implementation Review — Aggregated (R1–R4)

**Plan:** `ai/plans/sprint_2/fee_escrow_and_teacher_wallet_crediting-crediting/`
**Date:** 2026-09-15 · **Scope basis:** `git diff --name-only` vs Phase 0 baseline (markdown-only deliverables; production trees verified zero-entry at every round via pathspec `git status --porcelain -- backend shared app frontend test scripts`)

## Scope of change (final)

| Area | Files |
|---|---|
| Plan bookkeeping | `tasks.md` (checkboxes 0–4 → `[x]`), `deferred-items.md` (D3/D4/D5 rows + Gate Rule accounting), `outcome/*.md` (7 new/updated) |
| Knowledge propagation | `docs/billing/escrow-and-wallet-crediting.md` (NEW canonical doc) |
| Production code | **NONE** — zero diffs in `backend/`, `shared/`, `app/`, `frontend/`, `test/` (plan invariant) |

## Round ledger

| Round | Reviewers | Findings (NEW) | Fixed | Remaining |
|---|---|---|---|---|
| R1 | review-content + review-security (parallel) | 1 MEDIUM + 7 LOW (+2 pre-existing logged: stale `session.ts:33-34` docblock → D5; governance-cite drift) | 12 fixes (F1–F12) + 1 orchestrator amendment | 3 LOW |
| R2 | independent re-reviewer | 0 new blocking (3 LOW remainders + 1 cosmetic) | 2 micro-fixes applied post-round | 2 adjudicated non-blocking |
| R3 | fresh independent scan | 0 blocking (all 40+ sampled citations resolve) | — | 3 non-blocking (adjudicated class) |
| R4 | final independent confirmation | 0 blocking | — | 2 non-blocking (adjudicated class) |

**Stop condition: MET** — two consecutive rounds (R3, R4) with zero blocking findings.

## Findings fixed across waves (summary)

1. **[MEDIUM] Plan-workspace path leak** in the canonical doc → replaced with durable `docs/planning/TICKETS.md` anchors; `grep "ai/plans"` on the doc is now empty.
2. **[MEDIUM] Rate-limit honesty** — the "fail-open rate limit" guard is actually an always-allow stub (`backend/lib/ratelimit.ts:75-87`); all four phrasing sites (doc §7, D4 row, 3.2 §7, 4.x) now disclose "not effectively rate-limited today".
3. **[LOW] Citation precision** — settle predicate `:448`, contract indices `:34/:46/:73` + keys `:38/:55/:79`, transport span `:108-113`, governance re-check `:622-624`, oracle-safety attribution split per arm (confirm/cancel/dispute/read), ADMIN `adjustTeacherWallet` wire-rule exception scoped.
4. **[LOW] Ledger bookkeeping** — Gate Rule expectation aligned to actual grep accounting (7 = D1–D5 rows + Status Legend + Gate-Rule self-match; in-plan targets 0); D5 row added (stale schema docblock → Financial Safety ticket).

## Adjudicated non-blocking residue (archive-time)

- `tasks.md` authoring-time anchors (`:2439` → current `:2441`; Task 4.3 "expected raw output is 3" vs actual 7) — plan-authoring text, deviations documented in `4.x §3` + Gate Rule per tasks.md rule 6 (report, not rewrite history).
- Plan-dir display-name self-citations in plan headers (`Fee Escrow & Teacher Wallet Crediting-crediting/` vs on-disk `fee_escrow_and_teacher_wallet_crediting-crediting/`) — normalize when archiving to `ai/finished_plans/`.

## Pre-existing issues filtered (baseline rule)

- **3 SDL frozen-inventory pin failures** (`schema-surface.test.ts` ×1, `sdl-static-assertions.test.ts` ×2) — caused by mutation/query names added by PRs #141/#161 merged after plan authoring; proven pre-existing (`git diff` zero on GraphQL trees; codegen-sync green). Ledgered as D3, owned by surface-freeze maintainers. All escrow/wallet-domain pins pass.
- **No global GraphQL depth/complexity limiter** — honest posture recorded (2MB transport cap + prod introspection off + fail-open stub); ledgered as D4 → Financial Safety Verification ticket.

## Verdict

**PASS** — plan deliverables complete, internally consistent, citations grep-verified, security claims honest, zero production-code footprint. Plan fit to close.
