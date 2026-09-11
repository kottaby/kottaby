# Deferred Items Ledger

**Feature:** `Subscription Validity Window & Expiry`
**Plan:** `ai/plans/sprint_1/subscription-validity-window-expiry/`
**Created:** `2026-09-11`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

Seeded at specification time (2026-09-11) with items already known from research (`outcome/research-01..04`).

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Per-subscription / per-period balance attribution ledger (candidate) | specs REQ-023 | plan.md design phase (Key Design Decisions) | ❌ Blocked | — | AC2's "zero that period's remainder" is unimplementable on the shipped flat-lane model (`backend/db/schema/students/students.ts:24-45`). plan.md MUST decide: (a) conservative lane-conditional zeroing vs (b) new allocation ledger (+schema/migration). Decision + justification recorded in plan.md; resolved when plan-review gate accepts plan.md |
| D2 | Scheduler deployment trigger for `/api/cron/expire-subscriptions` | specs REQ-020 | Final deployment/ops task | ❌ Blocked | — | No in-process scheduler, no `vercel.json`, no `scripts/cron-worker.ts` exist (research-03 §1/§7). Repo ships the fail-closed route + service; the external trigger wiring (host cron / scheduler config) is deployment work — to be documented in plan.md deployment section and the canonical doc; if no wiring mechanism lands, this is documented as an explicit ops handoff, not silently dropped |
| D3 | Optional booking-dialog error arm for `SUBSCRIPTION_EXPIRED` | specs REQ-061 | Optional frontend task (or deferred out) | ⚠️ Partial | — | The existing VALIDATION code→snackbar fallback already surfaces the localized copy with zero frontend changes; a dedicated arm in `frontend/views/student/sessions/sessionDialogErrorArms.ts` is polish. Resolved either by shipping the arm OR by plan.md ruling fallback-sufficient (documented decision) |

---

## Status Values

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on

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
- **To ⚠️ Partial:** Item partially resolved but needs follow-up
- **To ✅ Done:** Item fully resolved and verified
  - Add verification reference (outcome file, commit hash, review round)

### When to Reference in Outcome Files

In task outcome files, reference this ledger when:
- Adding a deferred item: "Deferred X to Task Y (see deferred-items.md D3)"
- Completing a deferred item: "Resolved deferred item D3 (see deferred-items.md)"

---

## Enforcement

The **final quality gate task** (last task before Phase 7: Knowledge Propagation) MUST verify all deferred items are resolved:

```bash
# Count unresolved items
grep -c "❌\|⚠️" ai/plans/sprint_1/subscription-validity-window-expiry/deferred-items.md

# Expected: 0 (excluding the Status Values legend block, which uses icons definitionally)
# If >0: Task is blocked — resolve all ❌/⚠️ ledger rows before plan completion
```

**Exit criteria:** Plan cannot be marked complete if any ❌ or ⚠️ status remains in the Ledger Table.

---

## Anti-Patterns (What NOT to Do)

❌ **Don't defer without logging:** "I'll handle this later" without adding to ledger
❌ **Don't use vague descriptions:** "Fix the thing" → use specific item names
❌ **Don't mark ✅ without verification:** Status changes must reference outcome file or commit
❌ **Don't leave ⚠️ unresolved:** Partial items must have a plan for completion
❌ **Don't defer critical bugs:** Security, data corruption, or blocking bugs must be fixed immediately

---

## Related Documents

- Specs: `ai/plans/sprint_1/subscription-validity-window-expiry/specs.md` (REQ-023 → D1, REQ-020 → D2, REQ-061 → D3)
- Task template: `.agents/spec-process-guide/templates/tasks-template.md` — Phase 1 setup, Final quality gate
- Execution guide: `.agents/spec-process-guide/execution/implementation-guide.md` — Deferred item workflow
