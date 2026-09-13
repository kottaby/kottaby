# Task 13 — Knowledge propagation & docs — Outcome

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions`

## Summary

The shipped verification-plan purchase contract is now propagated to the operator/consumer docs:

1. `docs/billing/subscription-purchase.md` §10 — the stale "rides this exact flow — no
   special-casing" bullet (which predated the implementation and described lane crediting that no
   longer happens) was replaced with the SHIPPED contract: the dedicated inputless
   `purchaseVerificationPlan` mutation (identity exclusively from `ctx.user.id`, idempotency via
   the `X-Idempotency-Key` header context), the nullable `student_payments.student_id` owner, and
   the activation credit-skip for applicant-owned subscriptions with the students-first probe order
   that keeps student lanes structurally unaffected — plus the WHY (the schema/INV-TV binding: a
   verification subscription gates the teacher-applicant lifecycle, not a student's session
   balance). Cross-link added to the new teacher-side doc.
2. `docs/teachers/verification-plan-purchase.md` — NEW canonical reference consolidating the whole
   flow in original prose: the inputless GraphQL surface, the end-to-end purchase pipeline (guards
   → server-side plan resolution by canonical title → gateway checkout before the tx → the single
   atomic transaction with its fixed 11-step write order), the guard contract table (UNAUTHORIZED,
   VALIDATION, FORBIDDEN, APPLICANT_NOT_FOUND, APPLICANT_COOLDOWN_ACTIVE,
   APPLICANT_ALREADY_CERTIFIED, PLAN_NOT_FOUND, PLAN_PRICE_CHANGED, DUPLICATE_REQUEST,
   PAYMENT_NOT_FOUND — with the fail-closed denial-ordering note), the guarded single-statement
   transition semantics (zero-row no-op for in_evaluation/passed), activation behavior
   (students-first probe, credit-skip, receipt to the purchaser, quarantine on amount/currency
   drift, accepted payment-failed aftermath), idempotency semantics (per-attempt key, rotate on
   success only, replay → DUPLICATE_REQUEST, 23505 savepoint handling, claims never cleaned up),
   the testing map (which suite owns which contract), consumer obligations (frontend code
   branching, catalog title-uniqueness warning, cooldown clearing), honest known postures
   (student-catalog exposure of the seeded plan; pre-checkout gateway mint vs a future stateful
   provider), and cross-links to `docs/teachers/applicant-lifecycle.md` and
   `docs/billing/subscription-purchase.md`.
3. `ai/plans/.../tasks.md` — checkbox 13 flipped to `[x]`.

## Files created / updated

| File | Change |
|---|---|
| `docs/billing/subscription-purchase.md` | §10 "Teacher verification purchase" bullet rewritten to the shipped contract (dedicated surface, NULL ledger owner, activation credit-skip, INV-TV why, cross-link). No other section touched. |
| `docs/teachers/verification-plan-purchase.md` | **CREATE** — the canonical reference (§1 plan+surface, §2 flow, §3 transitions, §4 guard table, §5 activation, §6 idempotency, §7 testing map, §8 obligations/postures, §9 references). Follows the `docs/teachers/` conventions established by `applicant-lifecycle.md` (metadata header block, illustrative-NON-authoritative code blocks citing canonical paths, tables, references section). |
| `ai/plans/sprint_1/verification-plan-purchase-5-sessions/outcome/13-knowledge-propagation-outcome.md` | This file. |
| `ai/plans/sprint_1/verification-plan-purchase-5-sessions/tasks.md` | Checkbox 13 → `[x]`. |

## Accuracy protocol

Every claim in the new doc was verified against the shipped code before writing (no copying from
plan artifacts): `verification-purchase.service.ts` (stage order, savepoint-bracketed claim, 23505
handling, NULL-owner insert, re-application condition, guarded flip, backfill, oracle-safe replay),
`purchase-guards.helpers.ts` (key ceiling, `PLAN_PRICE_CHANGED` field payload),
`applicant-lifecycle.service.ts` (guard branch order: cooldown arm before the certified arm, strict
`>`), `subscription-activation.service.ts` (students-first probe, both-rows pin, neither-row abort,
recipient-locale receipt, post-commit publish), the mutation file (inputless, `authenticated: true`
only, uncaught error posture), and the shared constants. The doc contains ZERO plan-artifact
references (no REQ-x, no task ids, no specs/plan filenames) — grep verified below. The open
coordination notes from the deferred-items ledger are reflected honestly as accepted postures /
forward-notes in §8 without ticket ids (student-catalog exposure; pre-checkout checkout-mint
ordering; payment-failed aftermath with re-purchase permitted from `in_evaluation`).

## Verification

| Check | Result |
|---|---|
| `bunx @biomejs/biome check docs/` | No diagnostics — `docs/` is in biome's ignore configuration ("Checked 0 files … these paths were provided but ignored: docs/"), i.e. markdown is outside its scan set; nothing to format or fix |
| `bun run check:duplicates` | 0 clones — the new doc is original prose; no doc/plan text duplication introduced |
| Plan-artifact reference grep over both docs | zero matches for `REQ-[0-9]`, `Task [0-9]`, `tasks\.md`, `specs\.md`, `plan\.md` |
| Sub-loop on the new md file (protocol attempt) | tsgo passed; oxlint then exits 1 with "No files found to lint" — the md file is outside every linter's scan set (a tool-scope artifact, not a lint violation); biome + jscpd confirm 0 findings above |
| Scope discipline | NO edits to `AGENTS.md`, `.agents/instructions/*`, or `CLAUDE.md` (hand-curated; SKILL.md policy). No source/test file touched. Full quality gate NOT run (orchestrator owns it). Nothing committed. |

## Deferred items

None added — documentation-only task (ledger D1–D8 unchanged; D2/D3/D4 hand-off notes are now
additionally reflected in the shipped docs as accepted postures/forward-notes, which is exactly
what Task 13 was positioned to provide).
