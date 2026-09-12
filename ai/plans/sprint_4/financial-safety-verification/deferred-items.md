# Deferred Items Ledger

**Feature:** `financial-safety-verification`
**Plan:** `ai/plans/sprint_4/financial-safety-verification/`
**Created:** `2026-09-11`

---

## Purpose

Tracks out-of-authority findings surfaced by verification and any work handed between this plan's tasks. Every item must reach ✅ Done — or be explicitly re-routed to an owning ticket — before Task 6 (final quality gate) completes.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task / Owner | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Missing DB unique index on `teacher_transaction(session_id)` — duplicate-per-session prevented only by app-level exactly-once predicate (`session.repository.ts:433-455`) | Plan generation | Production Launch Checklist ticket | 🔄 In Progress (re-route) | — | Partial unique index `WHERE session_id IS NOT NULL` recommended; out of scope for a verification ticket (schema change) |
| D2 | Arbitration-Complete consumes escrow hold with **no wallet credit** (`session.repository.ts:303-305` comment: deferred to later ticket) | Plan generation | Dispute economics follow-up (sprint_3 dispute plan lineage) | 🔄 In Progress (re-route) | — | Verified behavior, intentional upstream; must stay visible in launch checklist |
| D3 | Withdrawal pending → completed/failed settle/reject flow absent; `requestWithdrawal` has no idempotency key (F11 note, `wallet.service.ts:199-201`) | Plan generation | Admin Financial Auditing (Sprint 3) / future F11 | 🔄 In Progress (re-route) | — | Verification asserts current debit-on-request semantics only |
| D4 | Schema-push-provisioned DBs lack the immutability trigger tier (`docs/admin/audit-trail.md:58`) | Plan generation | Ops/migration policy ticket | 🔄 In Progress (re-route) | — | Test envs (PGlite bootstrap, migrated PG) carry triggers; production provisioning path must use migrations |

---

## Usage Guidelines

- Status flips: 🔄 → ✅ Done (with outcome/commit reference) or ✅ Re-routed (owning ticket + link).
- No new ❌ Blocked items may survive to Task 6 (this line is prose, not a ledger hit — enforcement greps the table only); genuine defects found by probes are fixed immediately at minimal scope instead of deferred.

---

## Anti-Patterns (What NOT to Do)

- Don't verify-by-inspection where a test can assert.
- Don't expand scope into D1–D4 production changes inside this plan.
- Don't delete ledger rows; closure happens by status + reference.
