# Plan Review Report — Parent Read-Only Monitoring Portal

**Plan directory (verbatim):** `ai/plans/sprint_3/parent-read-only-monitoring-portal`
**Review Round:** 1 (Phase 1.5 gate, pre-implementation)
**Date:** 2026-09-12
**Subagents Dispatched:** 9 read-only review agents — verify-paths-exist, verify-i18n-namespaces, verify-graphql-accuracy, verify-component-props, verify-permissions-enums, verify-existing-components, verify-three-tier-architecture, verify-cross-ref-consistency, security-probing (security added beyond the template's 8; this plan's core risk is authorization)

## Summary

| Severity | Found | Fixed | Status |
|---|---|---|---|
| HIGH | 2 | 2 | ✅ all fixed |
| MEDIUM | 7 | 7 | ✅ all fixed |
| LOW / nits | ~20 | ~20 | ✅ all fixed |
| **Total** | **~29** (2 dupes across dimensions counted once where identical) | all | **Verdict: PASS after R1 fix wave** |

Two dimensions passed clean with zero findings: verify-graphql-accuracy, verify-permissions-enums.

## Findings by Dimension

| Dimension | Subagent | Issues Found | Status |
|---|---|---|---|
| verify-paths-exist | review agent 1 | 7 (1 HIGH: wrong finished-plan paths; 6 drift/count) | ✅ Fixed |
| verify-i18n-namespaces | review agent 2 | 3 (1 HIGH: missing `types/message.ts` ceremony step) | ✅ Fixed |
| verify-graphql-accuracy | review agent 3 | 0 (1 informational: SDL `extend type` sketch is notation only) | ✅ Pass |
| verify-component-props | review agent 4 | 2 (line-drift nit; MetricCard existence wording) | ✅ Fixed |
| verify-permissions-enums | review agent 5 | 0 | ✅ Pass |
| verify-existing-components | review agent 6 | 1 (entity-setup path, 4+1 sites) | ✅ Fixed |
| verify-three-tier-architecture | review agent 7 | 5 (1 MED: apolloCache `keyFields: false` task missing) | ✅ Fixed |
| verify-cross-ref-consistency | review agent 8 | 9 (numeric drift 26/28, 8/10, 9/10; REQ map/req-line mismatches; glossary R-set) | ✅ Fixed |
| security-probing | review agent 9 | 3 (1 MED: suspended/blocked child governance unrulled) | ✅ Fixed |

## Detailed Findings

### HIGH
1. **Wrong finished-plan paths** (specs.md:13) — cited `ai/finished_plans/sprint_3/dev1-015-…`/`sprint_2/dev3-011-…`; actual dirs carry no ticket prefix. **Fix:** corrected to `ai/finished_plans/sprint_3/student-confirmation-of-parent-link/` and `ai/finished_plans/sprint_2/session-request-notification-to-teacher/` (verified with ls).
2. **i18n ceremony missing `shared/locale/types/message.ts`** — the `Translations` interface needs `parentMonitoringTranslations: ParentMonitoringLabels;` or the namespace handle (plan §5.7/step 2, `defineNamespace` getter) cannot compile. **Fix:** added explicit steps to plan.md §5.7 (renumbered ceremony) and tasks.md 4.1 ("eight artifacts"), precedent `parentLinkTranslations` at `shared/locale/types/message.ts:39` verified.

### MEDIUM
3. **apolloCache task missing** — ten new GraphQL types; the six without `id` (ParentAttendancePage, ParentReportPage, ParentHomeworkPage, ParentHomeworkTrack, ParentHomeworkPosition, ParentChildProgress) need `keyFields: false` in `frontend/providers/apollo/apolloCache.ts` (policy at `frontend/graphql/AGENTS.md:87-96`, registry `:45-116`). **Fix:** new task 5.4 (full QL/TE-N/A/SEC-N/A/SR/IV pipeline, `_Requirements: REQ-030, REQ-053_`) + `frontend/providers/**` row in the Layer-to-Instructions table.
4. **Server-vs-client contradiction (auto-select)** — plan §5.1/tasks 5.2 had the server page auto-selecting the first child, contradicting specs NFR 5.1 (guard-only shell). **Fix (PINNED):** server page is guard-only; the CLIENT root container resolves missing `?student=` after `myLinkedChildren` resolves. Applied in plan.md §4.3/§5.1 and tasks.md 5.2/5.3.
5. **Governance ruling gap (suspended/blocked child)** — `requireLinkedChild` specified only `isDeleted` behavior. **Fix:** explicit ruling — soft-delete severs access immediately (`docs/workflows/04-parent-supervision-handshake.md:164`); suspended/blocked does NOT sever monitoring (monitoring ≠ login posture). Added to specs REQ-021 (+AC3), plan §4.2, and pinned into service-test matrix.
6. **Numeric drift 26/28, eight/ten, nine/ten** (plan.md:20, plan.md:297, tasks.md:138/190). **Fix:** 28 REQs / ten types / ten objects everywhere.
7. **REQ-030.3 type-set wording** — specs promised `ParentReturnType` + `Progress*`; plan deliberately creates neither. **Fix:** aligned specs to plan §2.3's actual projection types.
8. **Query executor conventions missing** in repo tasks. **Fix:** tasks 2.2/2.3 now mandate `queryDb(tx)` bare reads + module-level Prepared Statements 2.0 per `backend/db/repo/AGENTS.md` / `docs/drizzle/prepared-statements.md`.
9. **Traceability map/lines mismatch** — `REQ-002` missing from 2.1's `_Requirements:`, `REQ-062` missing from 8.1's. **Fix:** both added; map re-verified 28/28 REQ ↔ tasks, zero orphans both directions.

### LOW / nits (all fixed)
entity-setup path (5 spots) → `backend/db/test/entity-setup.ts`; registry "20 handles" → 19; `progress.ts:19-33` → `:19-34`; student.repository export range → `:230-608`; `ErrorRetryAlert.tsx:34` → `:28`; `defineNamespace` precedent `parentLink.namespace.ts:3-6` → `:4-7`; `withTransaction` import `:27` → `:29`; MetricCard existence reworded (view-local `frontend/views/admin/analytics/MetricCard.tsx:34` MUST NOT be imported); `useAppTranslation(parentMonitoring)` → `(ParentMonitoring)` handle; plan barrel-import surface normalized to `@/backend/types`; "two new routes" → stub-replacement + one new segment; glossary R-F..R-J enumeration added to specs §6.2 (+ R-G extended with the confirmed-child fullName posture, precedent `session-report-notification.service.ts:191`); D5 rate-limit deferral row added to deferred-items.md; ledger-enforcement grep scoped via `awk` (legend glyphs no longer self-match); tasks/specs D1..D4 relics updated to D1..D5; typo "serverance".

## Fix Subagents Dispatched

| Fixer | Owned File(s) | Findings Addressed | Result |
|---|---|---|---|
| Fixer A | `specs.md` | HIGH-1, MED 2/5/6/7 (specs side), 6 LOW | ✅ all landed |
| Fixer B | `plan.md` | HIGH-2 (§5.7), MED 4/6/8 (+governance §4.2), 8 LOW | ✅ all landed |
| Fixer C | `tasks.md` | apolloCache task 5.4, pinned-rule 5.2/5.3, repo conventions 2.2/2.3, traceability lines, mapping rows | ✅ all landed |
| Fixer D | `deferred-items.md` | D5 rate-limit deferral row | ✅ landed |
| Orchestrator (direct) | `specs.md` §6.2 R-G bullet, `plan.md:611` fixture path, tasks.md ledger-grep scoping, D4→D5 relics (×3) | residual items | ✅ landed |

## Post-Verification (re-run after fixes)

- [x] **Traceability sweep** — `for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md; done` → zero misses (28/28 REQs in tasks; all `_Requirements:` ids exist in specs).
- [x] **Cross-file pinned rule** — `plan.md:433/:481/:486` and `tasks.md` 5.2/5.3 all state guard-only server page + client-side `?student=` resolution. No contradiction remains.
- [x] **Anti-pattern sweep** — zero live occurrences of `Translation.` enum use, two-arg `getTranslations`, `@/frontend/utils/logger`, `useLazyQuery`, bottom-nav, raw `bun test` on workflow lanes (only prohibition statements remain, which is correct).
- [x] **Ledger gate** — `awk '/^## Ledger Table/,/^## Status Values/' deferred-items.md | grep -c "❌\|⚠️"` → 0; D1..D5 all 📅 Forward.
- [x] **Self-reference string** — `ai/plans/sprint_3/parent-read-only-monitoring-portal` byte-exact in every artifact header.
- [x] **Truncation check** — tails of specs.md (682 lines), plan.md (659 lines), tasks.md (458 lines), deferred-items.md (81 lines) re-read post-fix; all end on complete lines/sections.

## Lessons for Future Plans

1. **Count claims drift silently** ("26 REQs", "eight objects", "20 handles") — numeric claims need a grep-based recount pass before signing off any artifact.
2. **Finished-plan directory names changed convention** (ticket prefixes dropped in sprint_3/4 archives) — verify with `ls`, never from memory.
3. **The locale ceremony has NINE artifacts, not eight** — `shared/locale/types/message.ts` (`Translations` interface) is the step everyone forgets because it's not `parentLink/`-namespaced.
4. **Any new no-`id` GraphQL type always needs an `apolloCache.ts` `keyFields: false` entry** + a matching tasks.md row; reviewers should grep the SDL for id-less types as a standard check.
5. **Ledger grep gates must be legend-scoped** (`awk` section bounds) or the Status Values glyphs fail their own gate.
6. **Ambiguous ticket refs need ratified rulings in the plan**, not silence: the ticket's "unlinked → 403" cites INV-P3, but canonically that is INV-P1 (INV-P3 = completion notification). Ruling recorded in specs §6/plan D10; executing agents follow canonical sources.

## Traceability

This record lives at `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/plan-review-R1.md` and satisfies specs REQ-060 (Phase 1 plan-review gate) / tasks.md task 1.1. Re-review AFTER implementation in Phase 7 (`outcome/post-implementation-review.md`, REQ-061).

## Next Steps

1. Implementation begins at `tasks.md` Phase 0 (task 0.1: baseline re-confirmation) — Phase 1 gate itself is satisfied by THIS file.
2. Executors read ALL of `outcome/` first (especially `research-00-planning-basis.md` + this file).
3. On completion: Phase 8 knowledge propagation → `docs/parents/monitoring-portal.md`; file DEV1-017/DEV1-019 forward contracts stay tracked in the ledger.
