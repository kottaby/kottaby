# DEV3-021 — Deferred Items Ledger

**Plan directory**: `ai/plans/sprint_3/dev3-021-admin-session-governance/`

| ID | Item | Reason deferred | Deferred to |
|---|---|---|---|
| D-01 | Live meeting URL exposure on `adminJoinSession` (e.g. a real `joinUrl`) | No `meeting_url` column exists in the session schema (ground truth); adding meeting-provider URL bridging is the meeting-providers ticket (BLT-03 pending) | Meeting providers ticket |
| D-02 | Real-time admin dashboard WebSocket push of governance events | Notification engine covers user-facing waves; admin live-band refresh uses Apollo `refetchQueries` only | Post-sprint UX ticket |
| D-03 | Addition of dedicated `AUDIT_ACTION` enum values (`session_reschedule`, `session_cancel`, …) beyond `Override/Delete` | Enum extension is cross-cutting; `details.action` metadata carries semantics | DevOps/Dev X enum cleanup ticket |
| D-04 | Reassign on `disputed` sessions | Ownership of disputed-state writes belongs to DEV3-022 arbitration surface | DEV3-022 |
| D-05 | Baseline quality-gate failures existing before implementation (if any) | Recorded during task 0.1 | Current tickets owning those files |
