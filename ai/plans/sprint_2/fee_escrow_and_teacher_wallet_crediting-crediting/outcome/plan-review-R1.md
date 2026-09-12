# Plan Review Report — Fee Escrow & Teacher Wallet Crediting (Close-the-Loop Verification)

## Review Round: 1

**Date:** 2026-09-11
**Plan Directory:** `ai/plans/sprint_2/Fee Escrow & Teacher Wallet Crediting-crediting/`
**Inputs reviewed:** `specs.md`, `plan.md`, `tasks.md`, `deferred-items.md`
**Subagents Dispatched:** 1 (read-only review agent, plan-review skill workflow + citation verification)

## Summary

| Metric | Count |
|---|---|
| Total findings | 6 |
| CRITICAL | 0 |
| HIGH | 1 (fixed) |
| MEDIUM | 3 (fixed) |
| LOW | 2 (fixed) |
| Final verdict | **PASS** (all findings resolved and re-verified) |

## Findings by Dimension

| Dimension | Issues Found | Status |
|---|---|---|
| verify-paths-exist | 1 (wrong Segregated plan directory name, 3 spots) | ✅ fixed |
| verify-i18n-namespaces | 0 (insufficientBalance/sessionNotFound/sessionInvalidTransition/duplicateRequest all verified en+ar) | ✅ |
| verify-permissions-enums | 0 (enum vocabularies + mirrors match) | ✅ |
| verify-cross-ref-consistency | 0 (REQ ↔ tasks mapping complete; D1/D2 consistent across all artifacts) | ✅ |
| internal-contradiction / accuracy | 4 (replay wording; `in_progress` status name; SDL excerpt shapes; null-fee test overclaim) | ✅ fixed |
| house-rule sweep | 0 (no Translation enum, no two-arg getTranslations, no raw `bun test`, no invented paths remaining) | ✅ |

## Detailed Findings & Fixes Applied

1. **[HIGH] Broken cross-plan path** — `specs.md` cited `ai/plans/sprint_1/Segregated Session Balance-crediting/` (3 places); the on-disk directory is `ai/plans/sprint_1/segregated_session_balance-crediting/`. **Fix:** replaced all 3 occurrences; also made `plan.md` decision D2's "Segregated plan D1" reference an exact path citation.
2. **[MEDIUM] REQ-1 AC5 replay semantics wrong** — said replayed requests "return the first booking's session"; shipped code throws `ConflictError("DUPLICATE_REQUEST")` with zero new rows (booking.ts replay-by-throw; journey test :492 literally asserts this). **Fix:** AC5 reworded to the throw semantics.
3. **[MEDIUM] Non-existent status name** — `plan.md` state machine used `in_progress`; `session_status` enum is `{scheduled, started, completed, cancelled, disputed}`. **Fix:** two rows now use `started`.
4. **[MEDIUM] SDL excerpt inaccurate** — wrong arg names/types (`sessionId: Int!`), a phantom `idempotencyKey` mutation arg, `SessionSubmitInput`/`WithdrawalInput`/`WalletView`/`TeacherTransaction` shapes. **Fix:** excerpt rewritten to the real wire shapes — `id: ID!` args, header-carried idempotency key (`ctx.idempotencyKey`, propagation-only), `CreateSessionInput`, `myWallet: Wallet!`, `requestWithdrawal(input: RequestWithdrawalInput!): Wallet!`.
5. **[LOW] Null-fee fail-closed overclaim** — REQ-3 evidence implied test :1109 covers the `confirmation.ts:123-127` throw; it does not (booking-invariant boundary test). **Fix:** evidence row now honestly states the branch is unreachable while the booking invariant holds, and flags it as a Sprint 4 candidate edge case.
6. **[LOW] Deferred-items gate ambiguity** — raw `grep -c "❌\|⚠️"` returns 3 (D1, D2, legend line). **Fix:** Task 4.3 now states the expected raw output (3) alongside the in-plan-target-zero rule.

## Post-Fix Verification

- Traceability re-run: every `REQ-*` token in `specs.md` appears in `tasks.md` — zero misses.
- Truncation check: last lines of all four artifacts complete.
- SDL fixes verified against `backend/graphql/mutation/classes/session-lifecycle.mutation.ts` (:87-317) and `backend/graphql/mutation/billing/wallet.mutation.ts` (:46-75).
- No new findings introduced by the fixes (all edits are citation/wording level; no scope change).

## Lessons for Future Plans

- Cross-plan citations must be resolved with `ls`, not transcribed from conversation: plausible-but-wrong directory casings (`Segregated Session Balance-…` vs real `segregated_session_balance-crediting`) survive prose review.
- On verification-kind plans, replay arms are a classic place where the ticket's intuitive wording ("return the session") diverges from shipped behavior ("throw DUPLICATE_REQUEST") — always ground EARS criteria in the actual error taxonomy.

## Verdict

**PASS — plan proceeds to execution (Task 1 onward).**
