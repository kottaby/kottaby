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
| D1 | Per-subscription / per-period balance attribution ledger (candidate) | specs REQ-023 | plan.md design phase (Key Design Decisions) | ✅ Done | outcome/plan-review-R1.md | AC2's "zero that period's remainder" is unimplementable on the shipped flat-lane model (`backend/db/schema/students/students.ts:24-45`). plan.md Decision D2 (§2.1) — ratified at the Phase 1.5 plan-review gate — adopted the interim semantic: **O1 conditional lane zeroing** — zero the expiring plan's lane ONLY when no other `active` (post-flip, in-window) or `pending` subscription of the student credits the same lane, one guarded UPDATE inside the sweep transaction, `balance_trial` structurally exempt. O2 (attribution ledger) is the recorded future-work refinement for shared-lane co-subscriptions and remains deferred beyond this ticket; O3 rejected (fails AC2) |
| D2 | Scheduler deployment trigger for `/api/cron/expire-subscriptions` | specs REQ-020 | Final deployment/ops task | ❌ Blocked | — | No in-process scheduler, no `vercel.json`, no `scripts/cron-worker.ts` exist (research-03 §1/§7). Repo ships the fail-closed route + service; the external trigger wiring (host cron / scheduler config) is deployment work — to be documented in plan.md deployment section and the canonical doc (9.1); this row's ❌ is the single sanctioned residual through Phase 8 and MUST flip to ✅ at 9.1, or completion is blocked |
| D3 | Booking-dialog error arm for `SUBSCRIPTION_EXPIRED` (lands with the booking UI, not this ticket) | specs REQ-061 | The future sessions-booking UI surface's ticket | ✅ Done | outcome/plan-review-R1.md | The plan-review gate falsified the earlier "VALIDATION fallback already surfaces the copy" claim: the client map has NO row for custom domain codes (`mapValidationRow` matches `VALIDATION` only, `frontend/providers/apollo/error-link.map.ts:242-258`; `normalizeGraphQLErrorCode` folds only `RATE_LIMIT_EXCEEDED`, `:58-65`; unmapped codes → `null`), AND no wired consumer of `createSessionMutationDocument` exists in `frontend/` (grep-verified) — so there is no booking dialog to arm this sprint, and zero frontend changes is correct for surface-absence reasons. Resolution: localized copy travels server-side (`ValidationError` message + `extensions.code`); the future booking-UI ticket MUST map `SUBSCRIPTION_EXPIRED` → the new `subscriptionExpired` key; this obligation is recorded in REQ-061 and in the canonical doc (9.1) |

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

# Expected: exactly 1 before Phase 9 (D2's sanctioned ❌ — the external-trigger ops
# handoff that only the 9.1 canonical doc can close), 0 after 9.1.
# The "Status Values" legend block uses both icons definitionally — count only
# Ledger Table rows. If anything other than D2's row is ❌/⚠️ before Phase 9,
# or any ❌/⚠️ remains after 9.1: Task is blocked — resolve the rows first.
```

**Exit criteria:** Plan cannot be marked complete if any ❌ or ⚠️ status other than D2's sanctioned pre-9.1 row remains in the Ledger Table; after 9.1 the allowed count is zero.

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
