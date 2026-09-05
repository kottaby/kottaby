# DEV3-005 — Deferred Items Ledger

**Plan directory:** `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/`

| # | Item | Deferred To | Rationale | Status |
|---|---|---|---|---|
| D1 | Report/homework write paths (services, mutations, UI) | DEV3-006 / DEV3-007 | Consumer tickets own write surfaces; DEV3-005 ships only the INV-S7/S8 gates they must call | OPEN |
| D2 | Teacher availability / online presence UI | DEV2-011 / DEV2-012 | UI consumes `is_online`; this ticket guarantees the flag's correctness | OPEN |
| D3 | Recitation 1:1 record | DEV3-007 | Out of ticket scope | OPEN |
| D4 | Admin arbitration UI enhancements (trail rendering) | admin-arbitration UI ticket | Read-side rendering of `audit_logs`; enforcement ships here, display later | OPEN |
| D5 | Partial-refund amount arithmetic beyond DEV3-004 contract | follow-up billing ticket | DEV3-005 records decision; amount split semantics belong to billing | OPEN |

(Append new items here during implementation; every entry must name an owning ticket or final disposition at closeout — Phase 7.4.)
