# Deferred Items Ledger

**Feature:** `dispute-resolution-with-admin-arbitration`
**Plan:** `ai/plans/sprint_3/dispute-resolution-with-admin-arbitration/`
**Created:** `2026-09-11`

---

## Purpose

Tracks work deliberately deferred by this plan (or discovered during execution and handed between tasks). Every item must reach ✅ Done — or be explicitly re-routed to an owning ticket — before the final quality gate task (6.1) completes.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Dispute time-window (e.g. "within N days of completion") | planning | none — product decision | ✅ Done | planning ruling D-9 (plan.md) | No source doc defines a window; adding one now would invent policy. Out of scope; revisit only if product requests it. |
| D2 | Payment-gateway money refunds (Paymob/Stripe chargeback) for awarded refunds | planning | paymob-gateway-integration follow-up | ✅ Done | planning scope ruling (specs.md Scope) | This plan reverses internal ledger value only (session credit + wallet); gateway money refunds remain backlog (`ai/plans/sprint_1/paymob-gateway-integration/deferred-items.md:63`). |
| D3 | Student-rates-teacher evaluation rows inside admin case review | planned REQ-6 | sprint-3 student-evaluation ticket | ✅ Done | planning ruling D-7 (plan.md) | Case review exposes today's real artifacts (report incl. `studentRatingByTeacher`, homework, recitation, audit). When the evaluation ticket ships, `getAdminDisputeCase` gains one composed field. |
| D4 | Admin-notified fanout paging for very large admin cohorts | Task 2.6 | Task 6.1 review | ❌ Blocked | — | `resolveAudienceIds` bounded query is fine at current admin scale; add cursor paging only if the audit finds a cap breach. |
| D5 | `docs/sessions/session-lifecycle.md` + state-machine diagram updates reflecting `completed → disputed` | Tasks 2.5–5.1 | Task 6.2 | 🔄 In Progress | — | Canonical doc update happens in Knowledge Propagation after behavior is final. |

---

## Status Values

- ✅ **Done** — completed and verified (reference outcome file/commit)
- ⚠️ **Partial** — partially completed, follow-up planned
- ❌ **Blocked** — unresolved; plan cannot complete until addressed
- 🔄 **In Progress** — actively being worked

---

## Usage Guidelines

Add a row when work is discovered mid-task that belongs elsewhere; reference the ID in outcome files ("Deferred X (see deferred-items.md D2)" / "Resolved D2").

### Exit criteria (enforced by Task 6.1)

```bash
# Scope to ledger rows only (the legend below legitimately mentions the marker emoji)
grep -E '^\| D[0-9]+' ai/plans/sprint_3/dispute-resolution-with-admin-arbitration/deferred-items.md | grep -c "❌\|⚠️"
# Expected: 0
```

Items owned by other tickets (D1–D3) resolve by recording the owning ticket and leaving the plan's own scope clean; D4/D5 must be ✅ before the gate.

---

## Related Documents

- Tasks: `ai/plans/sprint_3/dispute-resolution-with-admin-arbitration/tasks.md`
- Design decisions D-1…D-10: `ai/plans/sprint_3/dispute-resolution-with-admin-arbitration/plan.md`
