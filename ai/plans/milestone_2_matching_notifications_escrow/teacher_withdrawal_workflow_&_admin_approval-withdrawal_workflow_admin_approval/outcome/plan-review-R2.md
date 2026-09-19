# Plan Review Report — Teacher Withdrawal Workflow & Admin Approval (Close-the-Loop Verification)

**Review Round:** R2 (execution-time drift-writeback round — Task 0.2 Plan-Review Gate)
**Date:** 2026-09-17
**Plan directory:** `ai/plans/milestone_2_matching_notifications_escrow/teacher_withdrawal_workflow_&_admin_approval-withdrawal_workflow_admin_approval/`
**Subagents Dispatched:** 1 executing subagent (task 0.2 gate) — read-back + independent verification + mechanical writeback. No parallel reviewer fan-out: R1 was the full 4-reviewer round (`PATHS-CITATIONS`, `TESTS-CITATIONS`, `I18N-GraphQL-SCHEMA`, `ARCH-TRACEABILITY`); this round handles exactly the one drift surfaced by Task 0.1.

## Verdict

✅ **PASS — the plan remains approved for implementation.** R2 is a drift-writeback round (per `tasks.md` 0.2.SR: "any spec↔code drift discovered during execution is written back into specs/plan/tasks in the same commit"), NOT a re-review of the whole plan. One citation-anchor drift (found by Task 0.1, independently re-verified here) was corrected in 4 places across 3 plan files; zero architectural, scope, i18n, or test-coverage findings.

---

## Summary

- **Total issues found:** 1 (the D7 anchor drift inherited from Task 0.1's baseline sweep)
- **Blocking (CRITICAL/HIGH):** 0
- **Medium:** 0
- **Low/Notes:** 1 (mechanical line-anchor correction — fixed)

---

## 1. R1 Verdict Read-Back

`outcome/plan-review-R1.md` was read in full. Its Summary verdict, quoted verbatim:

> "**Verdict:** ✅ **Plan passes all AGENTS.md rules after R1 fixes** — every finding was a mechanical citation/vocabulary correction; each fix was re-verified against the live source line before landing. No architectural, layering, i18n-prescription, or scope violations were found (the ARCH-TRACEABILITY reviewer explicitly confirmed: correct layer-instructions mapping, journey rules verbatim from `test/workflows/AGENTS.md`, zero hidden production-code edits, verbatim plan-directory strings, D1–D7 one-to-one, 5-stage pipeline on every implementation task, ticket block matches `docs/planning/TICKETS.md:1799-1846` exactly)."

And its Post-Fix Verification closing line, quoted verbatim:

> "- [x] Verdict recorded: **Plan passes all AGENTS.md rules** — no R2 round required (all 20 findings mechanical, fixed, and source-verified in R1)."

Note on the "no R2 round required" wording: R1 meant no *re-review* was required. The 0.2.SR execution rule still obliges an R2 *record* when drift is discovered during execution — which is exactly what Task 0.1 found and what this document records.

---

## 2. The Drift Found by Task 0.1

Task 0.1's baseline verification (`outcome/0-baseline-outcome.md` §4, D7 row) found ONE inaccuracy in the deferred-items ledger: the D7 Notes column cited "the code taxonomy (`backend/lib/errors/error-code-taxonomy.ts:52-62`) maps CONFLICT→409/VALIDATION→422", but the HTTP-status mapping actually lives at **`:45-47`**; `:52-62` is the `LEGACY_ERROR_CODE_ALIASES` docblock/constant. The claim itself is true — only the line anchor drifted. 0.1 (correctly, per its verify-and-report scope) did not fix it and queued it for 0.2's semantic review.

## 3. Independent Verification (this round, live tree re-read)

`backend/lib/errors/error-code-taxonomy.ts` re-read directly (not from 0.1's report). Verified layout:

| Lines | Content |
|---|---|
| `:41` | `export const ERROR_CODE_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({` — the full map spans **`:41-51`** |
| `:42`–`:50` | rows: `BAD_REQUEST: 400` :42 · `UNAUTHORIZED: 401` :43 · `FORBIDDEN: 403` :44 · **`CONFLICT: 409` :45 · `DUPLICATE_REQUEST: 409` :46 · `VALIDATION: 422` :47** · `RATE_LIMITED: 429` :48 · `SERVICE_UNAVAILABLE: 503` :49 · `INTERNAL_SERVER_ERROR: 500` :50 |
| `:51` | `});` (map closes) |
| `:53-58` | `LEGACY_ERROR_CODE_ALIASES` docblock |
| `:59-61` | `export const LEGACY_ERROR_CODE_ALIASES: Readonly<Record<string, ErrorCode>> = Object.freeze({ RATE_LIMIT_EXCEEDED: "RATE_LIMITED" });` |

**Conclusion:** the plan's claim "maps CONFLICT→409/VALIDATION→422" is anchored by **`:45-47`** (the exact rows cited: CONFLICT :45, DUPLICATE_REQUEST :46, VALIDATION :47 — the `DUPLICATE_REQUEST: 409` row sits between them, so `:45-47` is the tightest contiguous span covering both cited mappings). `:52-62` indeed holds the legacy-alias docblock + constant, not the HTTP-status map. Task 0.1's finding is confirmed exactly.

## 4. Corrections Applied (same-commit writeback per 0.2.SR)

Exhaustive sweep first: grepped ALL plan-dir files (`specs.md`, `plan.md`, `tasks.md`, `deferred-items.md`, `outcome/*`) for `error-code-taxonomy`, `:52-62`, bare `:52` variants, and `LEGACY_ERROR_CODE_ALIASES`. Result: the taxonomy filename appears in exactly 6 places; 4 are live plan citations (all four, by their surrounding wording, refer to the HTTP-status map — none legitimately cites `LEGACY_ERROR_CODE_ALIASES`), and 2 are 0.1's historical drift record (must keep quoting the old anchor). Corrections:

| File:line | Context | Before | After |
|---|---|---|---|
| `specs.md:102` (REQ-104 ruling) | "(`ERROR_CODE_HTTP_STATUS`, `backend/lib/errors/error-code-taxonomy.ts:52-62` — `VALIDATION: 422`, `CONFLICT: 409`)" | `:52-62` | **`:45-47`** |
| `plan.md:67` (D3 422-reconciliation context) | "taxonomy `backend/lib/errors/error-code-taxonomy.ts:52-62`" | `:52-62` | **`:45-47`** |
| `plan.md:408` (A8 anchor row "Error taxonomy / wire codes") | "`backend/lib/errors/error-code-taxonomy.ts:52-62` · `docs/graphql/domain-error-extensions-code.md`" | `:52-62` | **`:45-47`** |
| `deferred-items.md:25` (D7 Notes — the row 0.1 flagged) | "the code taxonomy (`backend/lib/errors/error-code-taxonomy.ts:52-62`) maps CONFLICT→409/VALIDATION→422" | `:52-62` | **`:45-47`** |

Deliberately NOT touched:

- `outcome/0-baseline-outcome.md:123` and `:131` — these ARE the drift record (they quote the old `:52-62` anchor in order to describe the finding); rewriting them would falsify history.
- `tasks.md` — contains zero taxonomy citations (verified by grep).
- Other `:52`-family matches in the plan dir (`wallet.query.ts:52-57` ×2, `wallet.mutation.ts:62-67`, `enums.ts:52`, `teacher_transaction_session_id_idx :52`) are different files with different subjects — legitimate, untouched.
- Every corrected line's surrounding wording is byte-identical; only the anchor token changed.

## 5. No Other Drift — What Was Checked

**R1 post-fix verification list, re-verified against the live tree this round** (all ten R1-corrected anchors):

- [x] `approveWithdrawal` span `:185-247` (admin-financial-auditing.service.ts — signature :185, closes :247) ✅
- [x] `rejectWithdrawal` span `:268-334` (signature :268, closes :334) ✅
- [x] `assertActorAdminActive` arms `:194` (approve) / `:281` (reject) ✅
- [x] `getServerTranslations` call `:191` (approve; :275 in reject) ✅
- [x] `NotFoundError("WITHDRAWAL_REQUEST")` throw `:205` ✅
- [x] Not-pending denial block `:207-214` (ConflictError throw at `:213`) ✅
- [x] `normalizeAdjustmentReason` call `:278` ✅
- [x] `debitForWithdrawalOnce` span `:163-172` (wallet.repository.ts) ✅
- [x] `assertValidWithdrawalAmount` span `:75-86` (wallet.service.ts) ✅
- [x] Stale DBML check `amount >= 0` at `db/schema.dbml:372` ✅ (still present pre-task-2.1, exactly as REQ-602 plans)

**Task 0.1's own anchor spot-checks** (outcome §4 table): D1–D6 all verified ✅ accurate by 0.1; D7 was the single inaccuracy and is fixed by this round. REQ-104 + REQ-701 read back from `specs.md` — both consistent with the live tree (REQ-701's ratification list (a)–(d) all hold: scope reconciliation intact, REQ-104 ruling now carries the corrected anchor, REQ-202 reserve-at-request intact, INV-W8 D6 ruling intact).

**Mechanical gates re-run this round (real output):**

- Traceability: `for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md || echo "MISSING: $r"; done` → **no MISSING output** (REQ-001..REQ-803 all present in `tasks.md`).
- Ledger gate: `grep -cE '^\| D[0-9]+ .*\| (❌|⚠️) ' deferred-items.md` → **0**.
- Post-writeback grep: `:52-62` survives ONLY in `outcome/0-baseline-outcome.md:123,131` (historical record — correct); all 4 live citations read `:45-47`.
- `git status --porcelain`: only the 4 plan files modified + the (0.1-authored) untracked baseline outcome — **zero changes outside the plan directory**.

## 6. Instruction Verification (0.2.IV)

`.agents/spec-process-guide/` directory confirmed present (47 files across `ai-reasoning/`, `prompting/`, `methodology/`, `resources/`, `templates/`, `execution/`, `examples/`, `process/`). Templates read this round:

- `templates/README.md` — full template inventory (requirements / design / tasks / quick / micro / checklists / plan-review).
- `templates/plan-review-template.md` — structure followed by this report (round header, summary, findings, post-fix verification, lessons, traceability, next steps).
- `templates/checklists.md` — phase quality-gate checklists.
- `templates/tasks-template.md` — QL→TE→SEC→SR→IV subtask sequence + outcome/checkbox protocol (confirms this round's gate sequence and that 0.2.QL/.TE/.SEC are legitimately n/a for a read-only verification task).

## 7. Subtask Ledger (0.2.x)

- **0.2.QL/.TE/.SEC**: n/a per plan (verification task; no production/test file touched — markdown-only plan-dir writeback). ✅
- **0.2.SR Semantic Review**: the one spec↔code drift discovered (D7 anchor) was written back into `specs.md` + `plan.md` + `deferred-items.md` in this same working-tree change-set; R1's full corrected-anchor list re-verified against the live tree; no other drift found. ✅
- **0.2.IV Instruction Verification**: `.agents/spec-process-guide/` templates re-read (§6 above). ✅

---

## Lessons for Future Plans

- Line-anchor drift is the dominant failure mode for generated citations — 0.1's pre-flight sweep of ledger anchors caught what generation-time review missed; cheap `path:line` spot-checks at baseline pay for themselves.
- When a citation names a map AND specific rows, cite the tightest row-span that covers the named rows (`:45-47`), not the whole constant (`:41-51`) — narrower anchors are more drift-resistant.
- Report-only drift findings must be queued with an explicit owner and target round (0.1 did this correctly: "queued for 0.2, owner: next executing agent") — otherwise reported-not-fixed items evaporate.

---

## Traceability

**Plan files modified this round:**

- `specs.md` — 1 anchor correction (REQ-104).
- `plan.md` — 2 anchor corrections (D3 context, A8 anchor row).
- `deferred-items.md` — 1 anchor correction (D7 Notes — the flagged row).
- `tasks.md` — task `0.2` heading + `0.2.QL/.TE/.SEC` + `0.2.SR` + `0.2.IV` checkboxes flipped to `[x]` (no other task touched).
- `outcome/plan-review-R2.md` — this report (new).

**Not modified:** `outcome/plan-review-R1.md` (read-only verdict record), `outcome/0-baseline-outcome.md` (historical drift record), everything outside the plan directory.

**Outcome knowledge base updated:** this report saved as `outcome/plan-review-R2.md`.

## Next Steps

- [x] R1 verdict read back + drift written back (this report).
- [ ] Orchestrator: commit the plan-dir change-set (specs.md, plan.md, deferred-items.md, tasks.md, outcome/0-baseline-outcome.md, outcome/plan-review-R2.md) — satisfies 0.2.SR's same-commit rule.
- [ ] Implementation proceeds: Phase 1 (task 1.1 journey gap-fill), Phase 2 doc repairs, Phase 3 verification re-runs, Phase 4 consolidation/final gate.
