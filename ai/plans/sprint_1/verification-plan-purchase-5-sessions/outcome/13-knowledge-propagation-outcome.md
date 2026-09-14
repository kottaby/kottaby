# Task 13 Outcome — Knowledge propagation & docs

> Orchestrator-executed. Branch: `feat/verification-plan-purchase-5-sessions`.

## What was done

1. **Rewrote the stale consumer-guidance paragraph** in `docs/billing/subscription-purchase.md`
   (§10 "Teacher verification purchase"): replaced the outdated "rides this exact flow — no
   special-casing" claim (plan-review R1 / D3 finding: spec fiction against the physical
   schema) with the SHIPPED contract — the dedicated zero-argument `purchaseVerificationPlan`
   mutation, the nullable `student_payments.student_id` owner, the skipped junction insert, the
   purchase-time atomic flip, and the activation students-first credit-skip, with a pointer to
   the new canonical doc.
2. **Created the canonical contract doc** `docs/teachers/verification-plan-purchase.md`
   consolidating: the wire contract (inputless, server-resolved plan by shared title constant),
   the 8-step purchase flow, activation students-first probe, status semantics table
   (purchase-time flip + accepted `in_evaluation` re-purchase posture), idempotency/replay
   semantics, the error-code inventory, the full testing map (repo/service/activation/graphql/
   journey/UI/parity), and the admin-audit NULL-owner consistency note. Links to
   `docs/teachers/applicant-lifecycle.md` and `docs/billing/subscription-purchase.md`.
3. **Rule files untouched** (policy, no exceptions): `AGENTS.md` and `.agents/instructions/*`
   are hand-curated; the discovered gotchas live in the plan's outcome files and the docs above.

## Recurring patterns / gotchas worth propagating (captured in the docs)

- Plan identity by shared `as const` title constant — seed and service derive from it
  (drift-pinned by `plan-seed.test.ts` + the constants suite).
- Unmount-on-close dialog convention (conditional render, never `open={false}` mounted) —
  MUI exit transitions are pathological under Happy DOM (see 9-outcome.md).
- MUI v9 Alert severity classes are `MuiAlert-color*`.
- Guarded single-statement transitions with state folded into WHERE + RETURNING — zero-row is
  the miss signal, disambiguated at the service tier.
- Admin-audit count/list parity must mirror join semantics when nullable owners land.

## Verification

- `bun run scripts/health/sub-loop.ts docs/billing/subscription-purchase.md --lifecycle duplicates` → exit 0 (markdown files are checked for the mechanical stages; type stages no-op on docs).
- Content cross-check: every claim in the new doc matches the shipped code paths (service steps, activation probe, error codes) as verified by the review waves; the testing-map file list matches the repo tree.

## Deferred-items coordination (Task 12's reclassification condition satisfied)

The explicit hand-off notes now exist in the outcome files AND the docs references are updated:
D2 (paymob rebase sync point), D3 (student-catalog exposure), D4 (DEV2-006 booking-side
5-session enforcement) are marked ✅ Done in `deferred-items.md` as cross-ticket coordination
notes with their hand-off references. D1 (payment-failed UX posture) is documented in the
status-semantics table above + specs REQ-5.6. D5 stays with the maintainers (hand-curated rule
files). D6-D12 carry their own verification/future-ticket references.
