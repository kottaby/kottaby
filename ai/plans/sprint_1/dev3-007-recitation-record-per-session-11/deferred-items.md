# Deferred Items Ledger

**Feature:** `dev3-007-recitation-record-per-session-11`  
**Plan Directory:** `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11`  
**Created:** `2026-09-05`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Write-once → future audited update/correction surface for recitation records | specs non-goal 1 / plan Decision 10 | Future ticket (separately designed, audited) | 📅 Forward | Task 0.1 | Deliberately out of scope; retention rule Workflow 05 §8 |
| D2 | Parent-portal read consumer of session recitation (DEV1-016) | specs non-goal 5 / REQ-065 | DEV1-016 | 📅 Forward | Task 0.1 | Consumer must import-by-reference this ticket's service, never touch the table |
| D3 | Admin review read consumer of session recitation (DEV3-021) | specs non-goal 5 / REQ-065 | DEV3-021 | 📅 Forward | Task 0.1 | Consumer must import-by-reference this ticket's service, never touch the table |
| J1 | Journey test quality-loop (sub-loop --lifecycle duplicates) deferred until RecitationRecordService exists | 2.2 | 2.3 | ✅ Done | Task 2.3 | QL exit 0 + journey green (8/8 pass, 140 expect(), two consecutive runs; layer-wide run's 1 failure is a pre-existing admin-governance drift outside DEV3-007 — see 2.3-outcome.md) |
| D4 | Role-claim staleness window: `ctx.role` derives from the JWT claim, so a post-issuance role demotion on a still-valid token passes the pre-resolver scope wall on ANY surface; service re-checks governance but not role (bounded by the DB-row ownership predicate) | 6.1 Wave 4 (pentester LOW) | Platform auth ticket (out of DEV3-007 scope) | 📅 Forward | Task 6.1 | Platform-wide claim-sourcing behavior affecting all scoped surfaces, pre-dating this plan; plan REQ-030/031/052 pin scope-layer role gating + governance-only service re-check — no code change within this plan |
| D5 | Governance denial log via reused `assertActorGovernanceClean` emits `{code, entity, entityId}` without a `locale` key (REQ-035 bounded context); identical for the session-lifecycle surface | 6.1 Wave 4 (pentester LOW) | Platform services ticket (helper signature change affects session-lifecycle callers) | 📅 Forward | Task 6.1 | Fixing centrally in the shared helper — a per-service log would fork the helper (violates the reuse-verbatim decision) or double-log (violates exactly-one-log rule) |
| D6 | Types test-helper idiom (`Equals` probe + lib-file reader) mirrored from session sibling suites into recitation suites — second repo site each | 6.1 Wave 1 (review-types LOW) | Future test-infra cleanup ticket | 📅 Forward | Task 6.1 | Mirroring is the sanctioned sibling convention mandated by the plan's own task 1.1; consolidation requires refactoring out-of-scope session test files |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
