# Deferred Items Ledger

**Feature:** parent-read-only-monitoring-portal
**Plan:** `ai/plans/sprint_3/parent-read-only-monitoring-portal/`
**Created:** 2026-09-11

---

## Purpose

This ledger tracks all work deferred from one task to another (or forward to another ticket) to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Deep curriculum-traversal statistics (percentage-through-curriculum, per-ayah completion maps over `lessons`/`progress`) | specs REQ-016 (ruling R-D) | Future curriculum ticket (not in this plan) | 📅 Forward | — | `progress`/`lessons` are skeletons with no writers (`backend/db/schema/classes/progress.ts:19-33`, `lessons.ts:17-29`); MVP progress = row count + latest homework surah/juz position per track |
| D2 | DEV1-017 "Parent Session Completion Notification" deep-link target contract — the portal's report view URL (`/parent/children/[studentId]?tab=reports...`) is the notification target | specs REQ-013/REQ-040 (ruling R-I) | DEV1-017 (sibling ticket) | 📅 Forward | — | Emitter ALREADY ships: `SessionReportNotificationService.notifySessionReportReady` (`backend/services/classes/session-report-notification.service.ts:147`) emits `session_completion` when `students.parent_id` set; display surface owned by DEV1-017. This plan only guarantees the deep-linkable route exists. |
| D3 | E2E browser journey coverage of the portal (Playwright lane) | specs REQ-054 | DEV1-019 (sibling ticket, consumes this portal) | 📅 Forward | — | This plan ships service/db journey coverage at `test/workflows/parents/`; full E2E is DEV1-019's scope |
| D4 | First-class attendance table (dedicated attendance entity with per-date rows) | specs REQ-012 (ruling R-B) | Future product ticket IF required | 📅 Forward | — | NOT a gap for MVP: attendance is a derived read over `session.status` + `startedAt`/`endedAt`; introduce a table only if product later requires explicit absence/makeup semantics |

---

## Status Values

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Intentionally deferred OUT of this plan to a named future ticket; does not block this plan's completion (tracks cross-ticket handoffs; the paymob-gateway plan precedent)

---

## Usage Guidelines

### When to Add a Deferred Item

Add a row to this table when:
1. A task discovers work that belongs to a different task/phase
2. A technical constraint requires splitting work across tasks
3. A dependency is discovered that blocks immediate completion
4. A TODO comment is added to code with "deferred to Task X"

**Format:**
```markdown
| D<next-id> | <Brief description> | <source-task-id> | <target-task-id> | ❌ Blocked | — | <Context/rationale> |
```

### When to Update Status

Update the status when:
- **To 🔄 In Progress:** Target task begins working on the item
- **To ⚠️ Partial:** Item partially resolved but needs follow-up work
- **To ✅ Done:** Item fully resolved and verified — add verification reference (outcome file, commit hash, review round)

### When to Reference in Outcome Files

In task outcome files, reference this ledger when:
- Adding a deferred item: "Deferred X to Task Y (see deferred-items.md D<n>)"
- Completing a deferred item: "Resolved deferred item D<n> (see deferred-items.md)"

---

## Enforcement

The **final quality gate task** (last task before Knowledge Propagation) MUST verify all in-plan deferred items are resolved:

```bash
# Count unresolved items
grep -c "❌\|⚠️" ai/plans/sprint_3/parent-read-only-monitoring-portal/deferred-items.md

# Expected: 0
# If >0: Task is blocked — resolve all ❌/⚠️ items before plan completion
```

**Exit criteria:** Plan cannot be marked complete if any ❌ or ⚠️ status remains. `📅 Forward` rows are cross-ticket contracts — they remain open here BY DESIGN and are closed only when the owning ticket ships (tracked in its own plan, not this one).

> Authoring-time state: D1..D4 are all 📅 Forward; zero ❌/⚠️ rows — the ledger starts clean.
