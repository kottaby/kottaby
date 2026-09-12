# Plan Review Report — Dispute Resolution with Admin Arbitration

**Plan Directory:** `ai/plans/sprint_3/dispute-resolution-with-admin-arbitration/`

## Review Round: 1 (+ Round 2 delta re-verification)
## Date: 2026-09-11
## Subagents Dispatched: 8 dimension reviewers (verify-paths-exist, verify-i18n-namespaces, verify-graphql-accuracy, verify-permissions-enums, verify-existing-components, verify-three-tier-architecture, verify-cross-ref-consistency, verify-behavioral-grounding) + 1 Round-2 delta verifier

---

## Summary

- **Total issues found:** 11 actionable + 3 advisories
- **Blocking (CRITICAL/HIGH):** 6
- **Medium:** 4
- **Low/Notes:** 1 + 3 advisories (folded into task text)
- **Round 2 verdict:** CLEAN (all fixes verified against repo truth)

---

## Findings by Dimension

| Dimension | Subagent | Issues Found | Status |
|---|---|---|---|
| Paths Existence | verify-paths-exist | 2 | ✅ Fixed |
| i18n Compliance | verify-i18n-namespaces | 1 | ✅ Fixed |
| GraphQL Accuracy | verify-graphql-accuracy | 1 | ✅ Fixed |
| Permissions/Enums | verify-permissions-enums | 0 | ✅ Clean |
| Existing Components/Props | verify-existing-components | 4 | ✅ Fixed |
| Architecture Compliance | verify-three-tier-architecture | 0 (+2 advisories folded) | ✅ Clean |
| Cross-Reference Consistency | verify-cross-ref-consistency | 2 blocking + 1 minor | ✅ Fixed |
| Behavioral/Financial Grounding | verify-behavioral-grounding | 0 | ✅ Clean |

---

## Detailed Findings

### Dimension 1: Paths Existence (2)

1. **[MEDIUM]** `docs/notifications/realtime-engine.md:109` cited for "fail-open idempotency, deviation D5"
   - **Fix applied:** specs.md REQ-7.4 and plan.md concurrency table now cite `:147-151` (fail-open idempotency) — kept `:93,109` only for the publish-after-commit contract. Also dropped the bare "D5" mention (collides with that doc's own unrelated D5 deferred item).
2. **[LOW]** `RecitationRecordReturnType` does not exist.
   - **Fix applied:** plan.md type block + tasks.md 2.2 now use `RecitationReturnType` (`backend/types/classes/recitation.types.ts:15`).

### Dimension 2: i18n Compliance (1)

3. **[HIGH]** Plan said `useAppTranslation(SessionsNamespace)` — no such export exists.
   - **Fix applied:** specs.md REQ-0.5 and plan.md now use the verified handle `useAppTranslation(Sessions)` (`shared/locale/namespaces/sessions/sessions.namespace.ts:4`), consumer precedent cited (`AdminDisputesContainer.tsx:12,65`).

### Dimension 3: GraphQL Accuracy (1)

4. **[HIGH]** Proposed SDL referenced object types `Report` / `HomeWork` / `RecitationRecord` — none registered under those names.
   - **Fix applied:** plan.md SDL now uses the real registered names `SessionReport` (`report.pothos.ts:33`), `SessionHomeWork` (`home-work.pothos.ts:137`), `SessionRecitation` (`recitation.pothos.ts:55`), `AdminAuditLogEntry` (`admin/audit-trail.pothos.ts:34`); single-canonical-object-type rule preserved.
   - Confirmed-OK during review: mutation arg convention (`id` kept, `partialAmount` appended), enum auto-derivation via `gqlSchemaBuilder.enumType(DisputeResolution)` (`enum.pothos.ts:136`), codegen commands (`package.json:69-70`).

### Dimension 5: Existing Components / Props (4)

5. **[HIGH]** `ResolveDisputeOptionGroup` hardcodes Cancel/Complete; its handler silently collapses unknown values to `Cancel` (`:40-48,60-88`).
   - **Fix applied:** tasks 4.2 + plan.md Component 4 now mandate a prop-driven option list and handler rewrite.
6. **[HIGH]** `ResolveDisputeDialog` receives only `sessionId` — classification needs `fee`/`feeHeld`.
   - **Fix applied:** tasks 4.2 + plan.md prescribe threading both props from the container's existing query data (already selected by `adminDisputedSessionsQueryDocument`).
7. **[HIGH]** Student row CTA eligibility is shared with the teacher surface (`sessionBodyBranches.tsx:104-133`) — naive extension would leak the CTA to teacher rows.
   - **Fix applied:** tasks 4.3 + plan.md now mandate a role-scoped `isDisputable(session, role)` predicate; the shared `DISPUTABLE_STATUSES` set must NOT be widened.
8. **[HIGH]** `SessionDisputeConfirmDialog` hardwires `openSessionDisputeMutationDocument` (`:82,88-100`).
   - **Fix applied:** tasks 4.3 + plan.md prescribe parameterizing mutation document + result accessor as props over the fully prop-driven `SessionConfirmDialogLayout`.

### Dimension 7: Cross-Reference Consistency (2 blocking + 1 minor)

9. **[MEDIUM-blocking]** Deferred-items gate grep was self-defeating (legend lines contain ❌/⚠️).
   - **Fix applied:** tasks.md 6.1 + deferred-items.md now scope the grep to ledger rows: `grep -E '^\| D[0-9]+' … | grep -c "❌\|⚠️"`.
10. **[MEDIUM-blocking]** D4 (admin-cohort paging) had no closing task.
   - **Fix applied:** Task 6.1 gained an explicit D4 closure bullet (audit cohort size vs `resolveAudienceIds` bounds → flip to ✅ or shrink scope); D5 closure pinned to Task 6.2.
11. **[LOW]** Outcome-file naming deviated from `<task-id>-outcome.md` for gate rounds.
   - **Fix applied:** tasks.md protocol #4 amended to expressly allow the template-mandated gate names (`plan-review-R1.md`, `midpoint-review-R1.md`).

### Advisories Folded Into Tasks (from Dimension 6, otherwise CLEAN)

- Task 2.4 now mandates the `actor-context` factory + `jrn_sessions_<uuid8>` prefix (test/workflows/AGENTS.md rules 3–4).
- Task 2.2 gained the `@/backend/types` barrel note; Task 4.1's re-export was confirmed already satisfied by the sibling documents re-export.

---

## Post-Fix Verification

- [x] All stale references resolved (Round-2 grep + file re-reads)
- [x] REQ traceability specs → tasks re-run: full coverage (REQ-0…REQ-10)
- [x] Non-ASCII hygiene sweep: typographic/emoji only; zero non-English residue
- [x] Round-2 delta re-verification verdict: **ROUND 2 CLEAN** — "Plan passes all AGENTS.md rules for affected layers."

## Traceability

**Plan files modified by this round:**
- `specs.md` — i18n handle, fail-open citation fix
- `plan.md` — SDL type names, `RecitationReturnType`, UI plumbing specifics (4 items), i18n handle, concurrency citation
- `tasks.md` — gate naming exception, types barrel, journey factory/prefix, 4.2 prop-driven outcome group, 4.3 role-scoped predicate + parameterized dialog, 6.1 scoped grep + D4/D5 closure
- `deferred-items.md` — scoped exit-criteria grep

**Outcome knowledge base updated:** this report saved as `ai/plans/sprint_3/dispute-resolution-with-admin-arbitration/outcome/plan-review-R1.md`.

---

## Next Steps

- [x] Plan passes review → mark Task 1.5 `[x]` in `tasks.md`
- [ ] Implementation begins at Task 0 (baseline) in a fresh execution session, reading this outcome/ directory first
