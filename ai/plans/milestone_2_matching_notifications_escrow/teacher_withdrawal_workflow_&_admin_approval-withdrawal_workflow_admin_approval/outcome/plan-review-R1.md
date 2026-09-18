# Plan Review Report — Teacher Withdrawal Workflow & Admin Approval (Close-the-Loop Verification)

**Review Round:** R1 (generation-time Phase 1.5 gate)
**Date:** 2026-09-17
**Plan directory:** `ai/plans/milestone_2_matching_notifications_escrow/teacher_withdrawal_workflow_&_admin_approval-withdrawal_workflow_admin_approval/`
**Subagents Dispatched:** 4 parallel reviewers — `PATHS-CITATIONS`, `TESTS-CITATIONS`, `I18N-GraphQL-SCHEMA`, `ARCH-TRACEABILITY` (read-only, over `specs.md` + `plan.md` + `tasks.md` + `deferred-items.md` vs. the live tree)

---

## Summary

- **Total issues found:** 20 (+1 pre-review fix by the planning session)
- **Blocking (CRITICAL/HIGH):** 0
- **Medium:** 9
- **Low/Notes:** 11
- **Verdict:** ✅ **Plan passes all AGENTS.md rules after R1 fixes** — every finding was a mechanical citation/vocabulary correction; each fix was re-verified against the live source line before landing. No architectural, layering, i18n-prescription, or scope violations were found (the ARCH-TRACEABILITY reviewer explicitly confirmed: correct layer-instructions mapping, journey rules verbatim from `test/workflows/AGENTS.md`, zero hidden production-code edits, verbatim plan-directory strings, D1–D7 one-to-one, 5-stage pipeline on every implementation task, ticket block matches `docs/planning/TICKETS.md:1799-1846` exactly).

---

## Pre-Review Fix (planning session)

- REQ numbering hole: REQ-008 was skipped and REQ-009 used for "Forward-Item Ledger Completeness" — renumbered REQ-009 → REQ-008 across `specs.md` (×2) and `tasks.md` (×1); traceability grep re-run clean.

---

## Findings by Dimension

| Dimension | Subagent | Issues Found | Status |
|---|---|---|---|
| Paths/Citations (services + repos) | PATHS-CITATIONS | 10 (4 M / 6 L) | ✅ Fixed |
| Test-file citations + gap-claim | TESTS-CITATIONS | 5 (3 M / 2 L) | ✅ Fixed |
| i18n + GraphQL + schema citations | I18N-GraphQL-SCHEMA | 2 (1 M / 1 L) | ✅ Fixed |
| Architecture + traceability + ticket | ARCH-TRACEABILITY | 3 (1 M / 2 L) | ✅ Fixed |

---

## Detailed Findings & Fixes Applied

### Dimension 1 — Paths/Citations (MEDIUM)

1. `specs.md` AC2 row: `approveWithdrawal` span `:185-257` → **`:185-247`** (function ends :247; :257 sits in the reject docstring).
2. `specs.md` AC3 row: `rejectWithdrawal` span `:268-343` → **`:268-334`** (function ends :334).
3. `assertActorAdminActive` arms `:196,279` → **`:194,281`** (`specs.md` REQ-503 + `tasks.md` 3.2.SEC; :194 in approve, :281 in reject).
4. `debitForWithdrawalOnce` span `:163-178` → **`:163-172`** (`specs.md` ×2 + `plan.md` A1 anchor; the old range swallowed the private `guardedBalanceDebit` docblock).

### Dimension 1 — Paths/Citations (LOW)

5. `getServerTranslations` call in the admin service `:189` → **`:191`** (`specs.md` REQ-005 + `plan.md` §4).
6. `NotFoundError("WITHDRAWAL_REQUEST")` throw `:206` → **`:205`** (`plan.md` error-contract table).
7. Not-pending denial block `:209-215` → **`:207-214`** (throw at :213; `specs.md` REQ-203; `plan.md` table `:215` → `:213`).
8. `assertValidWithdrawalAmount` span `:75-93` → **`:75-86`** (`specs.md` REQ-102).
9. `normalizeAdjustmentReason` call `:281` → **`:278`** (`specs.md` REQ-303 + `plan.md` §6).
10. F11 forward note span `:196-201` → **`:198-200`** (`deferred-items.md` D2; the single-line `:199` cites were already correct).

### Dimension 2 — Test-File Citations (MEDIUM)

11. Repo drain-race mislabel: `wallet.repository.test.ts:780-857` proves **arbitration ∥ withdrawal** funds-guard races (`:780` double-arbitration, `:819` arbitration-vs-withdrawal), NOT a two-withdrawal drain race — the genuine 2-request drain lives only in finsec journey step D (`:565-593`). Fixed in `specs.md` REQ-505, `plan.md` §4 row, `tasks.md` 3.1 (now "Funds-guard races (arbitration ∥ withdrawal)").
12. `specs.md` REQ-401 cited `wallet.repository.admin.test.ts:573-638` as decided-row immutability proof — that range is settlement-write/pending-row freeze proofs. Reworded: financial-immutability `:364-457` = decided rows; admin.test `:573-638` = settlement-writes on pending rows.
13. `specs.md` REQ-506 cited `:222-228,429-433` (spy install/teardown) as the zero-dispatch assertions — the oracle is `expectNoDispatches` at **`:243-246`**. Fixed (spy-install kept as secondary cite).

### Dimension 2 — Test-File Citations (LOW)

14. `plan.md` §4 "Concurrent double settle" row: repo proof `:437-475` is sequential re-settle-miss proofs (no `Promise.allSettled` there) — relabeled "repo re-settle-miss proofs"; the concurrent proof stays journey step 6 + service race `:899-925`.
15. `tasks.md` 3.3 wire-test boundaries: approve leg `:636-689`, reject leg `:690-730` (test starts :636 / :690, not `:638-680` / `:681-720`).

### Dimension 3 — i18n / GraphQL / Schema

16. **[MEDIUM]** The DBML drift line is `db/schema.dbml:372`, not `:374` — fixed everywhere it appears (`specs.md` REQ-602, `plan.md` D5 + §3 + §7.3, `tasks.md` 2.1 ×2, `deferred-items.md` D6). This was the edit-target citation; off-by-2 would have misled the executing agent.
17. **[LOW]** Same `:189` → `:191` as finding 5.

### Dimension 4 — Architecture / Traceability

18. **[MEDIUM]** Status vocabulary mismatch: `plan.md` §9 + `specs.md` REQ-702 claimed all ledger rows land "✅ Done (recorded-pointer)" while the ledger (correctly, per the M3-peer convention) uses 🔄 Open forward-contract statuses. Both statements now say: 🔄 Open with named owners (or ✅ where completed in-plan), never ❌/⚠️ debt. The final-gate grep was ALSO made row-scoped (`grep -cE '^\| D[0-9]+ .*\| (❌|⚠️) '`) so the legend's own emoji vocabulary cannot false-positive the gate — verified to return 0 on the current ledger.
19. **[LOW]** Tasks 1.1/2.1/2.2 lacked per-task outcome-file names in their headers — added (`outcome/1.1-journey-gapfill-outcome.md`, `outcome/2.1-dbml-repair-outcome.md`, `outcome/2.2-diagram-repair-outcome.md`).
20. **[LOW]** "two doc repairs" undercounted the knowledge-propagation addendum (task 4.3) — the overview/intro lines in `plan.md` §1 and `tasks.md` now say "two doc repairs (plus the knowledge-propagation addendum from task 4.3)".

### Reviewer confirmations worth recording

- The load-bearing REQ-601 gap claim is **accurate**: no existing journey or service test attempts approve/reject on a `failed` row (finsec journey has zero settle calls at all; step-6's loser arm re-settles the `completed` row).
- Negative claims hold: no SELECT FOR UPDATE anywhere in `backend/db/repo/billing/`; `WalletRepository` exposes no update/delete-named primitive.
- i18n prescriptions are all sanctioned patterns; forbidden names (`next-intl`, `Translation.`, two-arg `getTranslations`, `t('key')`, `@/frontend/utils/logger`) appear ONLY inside negation clauses.

---

## Post-Fix Verification

- [x] Every corrected line number was re-read from the live source BEFORE the edit landed (sed spot-checks: `:194`, `:205`, `:207-214`, `:213`, `:247`, `:268-334`, `:278`, `:281`, dbml `:372`, `:75-86`, `:163-172`).
- [x] Traceability re-run clean: `for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md || echo MISSING: $r; done` → zero output (REQ-001..REQ-803 all present, contiguous 00x block after the renumber).
- [x] Ledger gate re-run: row-scoped grep returns **0**.
- [x] Anti-pattern sweep re-run: no `Translation.` prescriptions, no two-arg `getTranslations`, no `@/frontend/utils/logger`, no raw `bun test` on workflows, no bottom-nav claims, no invented paths.
- [x] Verdict recorded: **Plan passes all AGENTS.md rules** — no R2 round required (all 20 findings mechanical, fixed, and source-verified in R1).

---

## Lessons for Future Plans

- Function-span citations (`:185-257`) drift more than anchor citations — cite the signature line + a precise landmark, not the whole body.
- "Repo race" labels must name the RACING ACTORS: the funds-guard suite races arbitration-vs-withdrawal, not withdrawal-vs-withdrawal.
- A zero-dispatch claim needs the ASSERTION line, not the spy-install lines.
- Ledger-gate greps must be row-scoped when the legend itself names the forbidden emoji.
- When inheriting a sibling plan's ledger-status convention (🔄 forward-contract), propagate that vocabulary into specs/design verbatim — don't invent a "recorded-pointer ✅" variant.

---

## Traceability

**Plan files modified (all fixes):**
- `specs.md` — 10 citation/vocabulary fixes + REQ-008 renumber
- `plan.md` — 11 citation/vocabulary/scope-accounting fixes
- `tasks.md` — outcome-file headers, 3 citation fixes, ledger-gate pattern, addendum mention, REQ-008 renumber
- `deferred-items.md` — D2/D6 citation fixes, row-scoped gate

**Outcome knowledge base updated:** this report saved as `outcome/plan-review-R1.md`.

## Next Steps

- [x] Plan-generation Phase 1.5 gate COMPLETE (this report).
- [ ] Implementation starts at `tasks.md` Phase 0 (baseline + this report's read-back), then Phase 1 (journey gap-fill).
