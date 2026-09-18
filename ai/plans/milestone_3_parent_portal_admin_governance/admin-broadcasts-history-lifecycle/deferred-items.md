# Deferred Items Ledger

**Feature:** `admin-broadcasts-history-lifecycle` (GitHub issue #146 — Admin broadcasts CRUD, UI/UX: first-class broadcasts with history list, detail view, stop/retract lifecycle)  
**Plan:** `ai/plans/admin-broadcasts-history-lifecycle/`  
**Created:** 2026-09-18

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Hard-delete of broadcast records | Scope (research-04) | — (out of scope) | ❌ Blocked | — | Lifecycle is one-way active→stopped; revisit if legal/compliance requires deletion |
| D2 | Broadcast content editing after send | Scope (research-04) | — (out of scope) | ❌ Blocked | — | Sent content is immutable (verbatim-copy contract, canonical doc §8); revisit if an "edit + resend" flow is requested |
| D3 | Scheduling / delayed sends | Scope (research-04) | — (out of scope) | ❌ Blocked | — | Current send is instant, single transaction; revisit if a calendar-based send is requested |
| D4 | Live WebSocket retraction push | Scope (research-04) | — (out of scope) | ❌ Blocked | — | Retraction is DB-level; already-delivered realtime envelopes are not un-published; revisit when a realtime inbox exists |
| D5 | Per-recipient delivery/read breakdown UI | Scope (research-04) | — (out of scope) | ❌ Blocked | — | Detail view shows aggregate live counts only; revisit if per-user investigation tooling is requested |
| D6 | Un-publishing already-delivered realtime envelopes | Scope (research-04) | — (out of scope) | ❌ Blocked | — | Same rationale as D4; publish is strictly post-commit and one-way (canonical doc §9) |
| D7 | Drizzle custom-SQL migration file/journal mechanics | Plan authoring | Implementation (executor loads `drizzle-*` skills) | ❌ Blocked | — | Plan documents the SQL logic (backfill join, header table DDL), not the journal plumbing; exact mechanics resolved at implementation time |
| D8 | Re-running the historical backfill | Implementation | — (non-goal) | ❌ Blocked | — | Backfill is a guarded one-shot custom migration; re-entry is a non-goal (idempotency guard rejects re-runs) |

**Out-of-scope convention:** D1–D6 are permanent scope exclusions, not pending work. Their ❌ status records "deliberately not done"; the exit criterion below applies to *accidental* deferrals discovered during execution — D1–D6 stay ❌ by design and must be excluded from the final-gate count (treat them as a locked scope list rather than blockers). D7–D8 are workflow deferrals resolved during implementation.

---

## Status Values

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on

---

## Revisit Triggers

| ID | Revisit trigger |
|---|---|
| D1 | Legal/compliance request for broadcast record deletion |
| D2 | Product request for an "edit + resend" flow |
| D3 | Product request for calendar-based / delayed sends |
| D4 | Existence of a realtime inbox that could honor retraction push |
| D5 | Product request for per-user delivery/read investigation tooling |
| D6 | Same as D4 |
| D7 | At migration-implementation time, the executor loads the `drizzle-*` skills and resolves mechanics |
| D8 | Never (one-shot guard); only if the guard itself proves buggy |

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
- **To ✅ Done:** Item fully completed and verified
  - Add verification reference (outcome file, commit hash, review round)
  - Example: `R5 outcome` or `commit abc123f` or `Task 13.2 complete`

### When to Reference in Outcome Files

In task outcome files, reference this ledger when:
- Adding a deferred item: "Deferred X to Task Y (see deferred-items.md D3)"
- Completing a deferred item: "Resolved deferred item D3 (see deferred-items.md)"

---

## Enforcement

The **final quality gate task** (last task before Phase 7: Knowledge Propagation) MUST verify all *accidental* deferred items are resolved (D7, D8 and any rows added during execution). D1–D6 are permanent scope exclusions and are expected to remain ❌.

```bash
# Count unresolved accidental items (exclude the locked D1–D6 block)
grep -c "❌\|⚠️" ai/plans/admin-broadcasts-history-lifecycle/deferred-items.md

# Expected: 8 (the eight seeded rows) — any row ADDED during execution must be ✅/resolved.
# If a new row shows ❌/⚠️: Task is blocked — resolve it before plan completion.
```

**Exit criteria:** The plan cannot be marked complete while any execution-added deferred item (beyond the seeded D1–D8 scope/workflow rows) remains ❌ or ⚠️.

---

## Anti-Patterns (What NOT to Do)

❌ **Don't defer without logging:** "I'll handle this later" without adding to ledger  
❌ **Don't use vague descriptions:** "Fix the thing" → use specific item names  
❌ **Don't mark ✅ without verification:** Status changes must reference outcome file or commit  
❌ **Don't leave ⚠️ unresolved:** Partial items must have a plan for completion  
❌ **Don't defer critical bugs:** Security, data corruption, or blocking bugs must be fixed immediately

---

## Related Documents

- Task template: `.agents/spec-process-guide/templates/tasks-template.md` — Phase 1 setup, Final quality gate
- Execution guide: `.agents/spec-process-guide/execution/implementation-guide.md` — Deferred item workflow
- SKILL.md: `.agents/skills/spec-driven-development/SKILL.md` — Deferred-items ledger enforcement
- Research basis: `ai/plans/admin-broadcasts-history-lifecycle/outcome/research-04-constraints-and-scope.md`
