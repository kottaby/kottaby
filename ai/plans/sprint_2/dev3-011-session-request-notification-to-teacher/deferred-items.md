# Deferred Items Ledger

**Feature:** `dev3-011-session-request-notification-to-teacher`  
**Plan Directory:** `ai/plans/sprint_2/dev3-011-session-request-notification-to-teacher`  
**Created:** `2026-08-31`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Session intake + accept/decline mutations + session-row authorship (the ONLY writer of `session` rows) | plan.md D1 | DEV3-004 / DEV3-005 | ✅ | plan | Resolved-pointer: owned by DEV3-004/005 intake+accept/decline tickets |
| D2 | B.16 ROUTE resolution (in-session detection + preference → which outcome wave to fire) | plan.md D2 | DEV2-011 + DEV3-008 + DEV3-004 | ✅ | plan | Resolved-pointer: availability/matching/session-engine tickets |
| D3 | Queue persistence for the `queue` preference (no pending-request entity exists in schema) | plan.md D3 | session-engine design (DEV3-004 era) | ✅ | plan | Resolved-pointer: session-engine design ticket |
| D4 | Actionable accept/decline CTA metadata on the realtime payload (engine-owned projection widening) | plan.md D4 | DEV3-010 lineage / session engine UI ticket | ✅ | plan | Resolved-pointer: realtime payload allowlist frozen here |
| D5 | Alternative-teacher computation for `offer_alternatives` (matching engine surplus) | plan.md D5 | DEV3-008 | ✅ | plan | Resolved-pointer: matching engine ticket |
| D6 | Any discovered freeze-suite baseline drift (e.g. pre-DEV3-016 inventories) | plan.md D6 | freeze-suite owner ticket | ✅ | plan | Resolved-pointer: only if drift discovered during Phase 0-5 verification; record evidence — DRIFT CONFIRMED at task 3.1 (7 pre-existing red legs across schema-surface/sdl-static-assertions from merge #28 `31f01c1` + #32 `7449297d`; suites left unedited/un-re-anchored); full evidence in `outcome/3.1-outcome.md` |
| D7 | Caller-tx replay double-publish posture (a tx-owning caller that publishes a replayed priorReceipt re-publishes; mitigate by publishing only fresh receipts) | plan.md D7 | engine contract documentation | ✅ | plan | Resolved-pointer: reckless-publish is caller-side |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
