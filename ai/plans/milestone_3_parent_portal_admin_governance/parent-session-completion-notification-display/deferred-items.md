# Deferred Items Ledger

**Feature:** Parent Session Completion Notification Display (DEV1-017 — display-only slice)
**Plan:** `ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display`
**Created:** 2026-09-17

---

## Purpose

This ledger tracks all work deferred from one task to another in the plan `ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display`, so no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete. Planning-time deferrals (D1–D7) are seeded below from research-00 `outcome/research-00-planning-basis.md` (§2 baseline facts, §3 rulings R-A..R-K, §6 frozen task map).

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Resolver test suite RED at planning time (2026-09-17) — 2 stale type-first cases in `frontend/lib/notification-route-resolution.test.ts` (pre-matrix two-stage arg order; baseline 5 pass / 2 fail, verified 2026-09-17 per research-00 §2) — reconciled OUT-OF-BAND the same day | 0 (baseline record) | 6 | ✅ Done | Out-of-band reconciliation 2026-09-17 (8 pass / 0 fail via `bun run test/scripts/run-test.ts frontend/lib/notification-route-resolution.test.ts`; sub-loop --lifecycle duplicates exit 0) | Reconciled OUT-OF-BAND on 2026-09-17 (pre-implementation, a standalone fix outside the plan — the user's request, not plan execution): the stale type-first suite was rewritten to the CURRENT 3-param signature `(relatedEntityType, notificationType?, role?)` (frontend/lib/notification-route-resolution.ts:188) with new session-matrix + role-less-stage coverage (UserRole enum-based role assertions); the resolver itself is byte-unchanged. Task 6's remaining scope narrows to the Parent-cell coverage + the 4th `relatedEntityId?` param (added with the resolver change) and the two call sites — not reconciliation; Task 6 still verifies the suite stays green (8 pass / 0 fail) and adds Parent cases. Task 0 records the CURRENT (green) baseline plus the RED→green history so Task 6's additions are provably regression-free. Run via `bun run test/scripts/run-test.ts frontend/lib/notification-route-resolution.test.ts`. |
| D2 | `schema-surface.test.ts` SDL pin for `parentSessionTarget` — field lands in Task 3 (`backend/graphql/query/parents/parent-monitoring.query.ts`), SDL pin updated in Task 4 (`backend/graphql/test/schema-surface.test.ts:531-535` area) after `bun run generate:gqlSchema` + `bun codegen` (R-J) | 3 | 4 | ✅ Done | Task 4 outcome (4.1-sdl-wire-outcome.md): SDL regen +10 lines (field + object type), schema-surface pins landed (71 pass / 0 fail), `bun run test:graphql` 188/0; rename-drift probe caught by 4 pins then reverted byte-identical | Authored at the Task 3/4 boundary: field definition precedes schema regen; the pin cannot be updated before the regen exists. REQ-031. |
| D3 | `parentMonitoring` parity-test extension for the new key `sessionTargetUnavailableNotice` (en/ar/types triple + RTL correctness, R-H) — follows the Task 2 key triple | 2 | 2 | ✅ Done | Task 2 outcome (2.1-i18n-outcome.md): types/en/ar triple landed; parity belt extended and green 160 pass / 0 fail via `bun run test/scripts/run-test.ts shared/locale/parentMonitoring-namespace.parity.test.ts`; QL exit 0 ×4 files | Same task, sequenced after the triple lands; extend the existing parity belt (precedent: `shared/locale/notifications-namespace.parity.test.ts`). REQ-041. |
| D4 | `ParentHomeworkEntryReturnType.sessionId` presence verification — IF missing, add to the closed projection + mapper + `parent-monitoring.documents.ts` + codegen (R-G conditional branch) | 7 (planning research) | 8 | ❌ Blocked | — | "Verify at implementation" ruling from research-00 §3 R-G; resolves inside Task 8's tab-threading work (REQ-013/REQ-014). If already present, mark ✅ with the verification reference. |
| D5 | Mid-point backend review wave (review-backend / review-types / review-config over Task 3–4 files) | 3 | 4.5 | ✅ Done | Task 4.5 outcome (midpoint-review-R1.md): 0 CRITICAL/HIGH/MEDIUM; 1 LOW doc-drift fixed; config grep-locks 7/7 PASS | Task 4.5 review gate (REQ-060); must complete before Task 5 begins (lifecycle isolation — no cross-stage interleaving). |
| D6 | `docs/parents/monitoring-portal.md` DEV1-017 display-contract section update (knowledge propagation) | 3 (field + link contract established) | 10 | ❌ Blocked | — | Extends the binding deep-link contract at `docs/parents/monitoring-portal.md:207` and the DEV1-017 forward item `:307` with the resolver/portal display behavior. REQ-061. |
| D7 | Out-of-scope records — NOT plan work: in-portal notification widget/embedded cards; email/push delivery channels; DEV1-019 E2E browser journey (sibling milestone_4 ticket); rate-limit hardening beyond the portal limiter | — | — | ✅ Done | research-00 §3 R-A/R-C/R-K | Explicit non-goals, recorded not deferred — documented here so they are never silently dropped. |

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
  - Example: `R5 outcome` or `commit abc123f` or `Task 6 outcome`

### When to Reference in Outcome Files

In task outcome files, reference this ledger when:
- Adding a deferred item: "Deferred X to Task Y (see deferred-items.md D3)"
- Completing a deferred item: "Resolved deferred item D3 (see deferred-items.md)"

---

## Enforcement

The **final quality gate task** (Task 9 — post-implementation review wave + quality gates, before Task 10 knowledge propagation) MUST verify all deferred items are resolved:

```bash
# Count unresolved items
grep -c "❌\|⚠️" ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display/deferred-items.md

# Expected: 0
# If >0: Task is blocked — resolve all ❌/⚠️ items before plan completion
```

**Exit criteria:** Plan cannot be marked complete if any ❌ or ⚠️ status remains. D1 was resolved out-of-band on 2026-09-17 (reconciled pre-implementation, outside plan execution — already ✅ with verification reference). D2–D6 must each flip to ✅ with a verification reference from its target task's outcome (D2 → Task 4, D3 → Task 2, D4 → Task 8, D5 → Task 4.5, D6 → Task 10). D7 stays ✅ (explicit non-goal — recorded, never re-opened).

---

## Anti-Patterns (What NOT to Do)

❌ **Don't defer without logging:** "I'll handle this later" without adding to ledger
❌ **Don't use vague descriptions:** "Fix the resolver tests" → cite the file, the failing count, and the ruling (R-F)
❌ **Don't mark ✅ without verification:** Status changes must reference outcome file or commit
❌ **Don't leave ⚠️ unresolved:** Partial items must have a plan for completion
❌ **Don't defer critical bugs:** Security, data corruption, or blocking bugs must be fixed immediately
❌ **Don't record out-of-scope work as deferred work:** non-goals get a ✅ out-of-scope row (D7), never a ❌ row

---

## Related Documents

- Plan basis (binding contract): `ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display/outcome/research-00-planning-basis.md`
- Task template: `.agents/spec-process-guide/templates/tasks-template.md` — Phase 1 setup, Final quality gate
- Execution guide: `.agents/spec-process-guide/execution/implementation-guide.md` — Deferred item workflow
- SKILL.md: `.agents/skills/spec-driven-development/SKILL.md` — Deferred-items ledger enforcement
