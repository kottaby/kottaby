# Deferred Items Ledger

**Feature:** DEV3-005 — Session Status State Machine Enforcement
**Plan:** `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/`
**Created:** 2026-09-05

## Purpose

Tracks work explicitly deferred by this plan with owning tickets. Plan cannot close with a blocked or partial row that lacks an owning ticket.

## Ledger Table

| ID | Deferred Item | Source Task | Owning Ticket | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | `assertSessionCompletedForReport` / `assertReportSubmittedForHomework` consumption — gates shipped here, CALL SITES ship in report/homework mutations | 1.1 | DEV3-006 | 🔄 Reserved | — | dev3-006 plan REQ-012/013 already assumes these gates; contract recorded in `docs/sessions/session-lifecycle.md` §10 (amended by Task 4.1) |
| D2 | `priorOnline` seam hardening — restore must NOT resurrect teachers who manually toggled offline mid-session (needs the DEV2-011 toggle surface to exist for the seam to be exercisable end-to-end) | 2.2/2.3 | DEV2-011, DEV2-012 | 🔄 Reserved | — | Today no toggle surface exists, so `is_online` cannot be manually false while a lock is held; the seam is documented in plan §Concurrency |
| D3 | `session_status_history` / transition audit table (persisting per-transition history; lifecycle doc earlier noted a "status-history seam" owning cancel-reason persistence — cancel reason IS already persisted on `session.cancel_reason`, so history table is the only remainder) | 0.2 | DEV3-013 / admin audit stream | 🔄 Reserved | — | No history table exists in `backend/db/schema/`; out of DEV3-005 scope (3 SP); audit-trail surface is governed by `docs/admin/audit-trail.md` stream |
| D4 | Teacher directory hiding query consumption of INV-S6 flag (INV-A3: in-session teacher hidden from Available Teachers directory) | 2.x | DEV2-013 / DEV3-008 | 🔄 Reserved | — | INV-A2 write-side is landed here; the read-side directory filter ships with the matching/directory tickets |

## Status Values

Done · Partial · Blocked · 🔄 Reserved (deferred knowingly to a named owning ticket — does not block this plan's completion). A Partial or Blocked row is an unresolved row; every row in this ledger is Reserved.

## Enforcement

Final gate (Task 4.2): the unresolved-row scan (`grep -c` over the blocked/partial status glyphs) must return **0**. 🔄 rows are acceptable ONLY when an owning ticket is named in the row — every row above is Reserved with its owning ticket named.
