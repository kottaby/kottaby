# Plan Review — Round 1 (plan-review skill gate, Phase 1.5)

**Plan**: `ai/plans/sprint_1/Admin Subscription Management-admin-subscription-management/`
**Reviewer**: orchestrator agent (Phase 1.5 mandatory gate)
**Date**: 2026-09-17
**Scope**: `specs.md` + `plan.md` + `tasks.md` + `deferred-items.md`, against AGENTS.md rules for every touched layer.

## Method

Per `@plan-review` skill: mapped every planned file to its layer AGENTS.md (backend/graphql, backend/services, backend/db/repo, backend/types, backend/enum, shared/locale, frontend views, frontend graphql docs, app router, test/workflows, test/graphql) and audited each of the skill's check dimensions, PLUS the canonical type table (canonical object per entity, no local types in Pothos), and the audit-census rule.

## Findings & dispositions

| # | Dimension | Finding | Disposition |
|---|-----------|---------|-------------|
| R1-1 | Type pattern | ✅ All new types are in `backend/types/billing/subscription-admin.types.ts` and the plan bans local Pothos type defs. `ProrationDirection` is a real TS enum in `backend/enum/billing/` per the Pothos enum rule. | pass |
| R1-2 | AGENTS.md (backend/graphql) | ✅ Prelude `adminOnlyAuthScopes` + `requireAdminUser` is the canonical shape; enums registered once in `shared/enum.pothos.ts`; side-effect import wiring; single object type reused. | pass |
| R1-3 | Audit census rule | The plan REPLACES the D-001 deferred census row with wired rows (task 9) — this satisfies the census-drift test constraint that every admin mutation be catalogued. | pass |
| R1-4 | Audit verb vocabulary | Pinned to the 7-member enum; verbs mapped: extend→Update, renew→Create, cancel→Suspend, change→Override. Matches the deferred-row expectations and record TOTAL coverage constraints. | pass |
| R1-5 | i18n rules | Specs §REQ-0.5 capture the REAL behavior verified by exploration (namespace handles + property access, single-arg `getTranslations`, `getServerTranslations` single-arg, `ctx.t` async) — draft initially echoed the root AGENTS.md's stale two-arg wording; FIXED in the specs during this gate (R1 body rewrites). | fixed at drafting |
| R1-6 | Frontend logger path | Root AGENTS.md lists `@/frontend/utils/logger` — that file does not exist; verified the real module is `frontend/lib/logger.ts` and the plan references nothing of the stale form (only the safelist note, phrased without the literal path). | pass |
| R1-7 | Auth 401/403 discipline | `admin-prelude.ts` verified: `$all{authenticated, role:[Admin]}` → unauthorized throws, role miss → ForbiddenError localized. Resolvers do not hand-roll 401/403 checks. | pass |
| R1-8 | Repository conventions | Guarded single-statement transitions, tx-last params, explicit `updatedAt`, no SELECT-then-UPDATE, lane balance storage on students. New repo signatures mirror `activatePendingOnce`/`setActiveStatusOnce`. | pass |
| R1-9 | Test rules | DB tests via `runInRollback` + `expectRepoError`; journey under `test/workflows/billing/` with committed fixtures, no runInRollback, real actor provisioning; GraphQL integration tests via `testClient` + `setupTestServerLifecycle`; no raw `bun test` on workflows (use `run-test.ts`). | pass |
| R1-10 | Traceability | `grep -oE 'REQ-[0-9]+'` sweep: every REQ-n in specs.md appears referenced in tasks.md (spot-checked REQ-1..REQ-10 rows in the traceability matrix). | pass |
| R1-11 | Anti-pattern sweep (orchestrator-set checklist) | `Translation.` enum — absent except in safelist description of what's ABSENT; two-arg `getTranslations` — not used; `@/frontend/utils/logger` — absent; raw `bun test` on workflows — absent; bottom-nav — absent; fabricated paths — none (all cites verified at exploration time). | pass |
| R1-12 | Consistency | Mutation count (4 mutations + 1 query) was inconsistent in earlier draft (`five` vs `four` vs `6 fields`); FIXED in R1 (specs.md scope + auth AC + success criteria; plan.md overview + anti-pattern safelist; tasks.md §3 codegen expectation). | fixed at R1 |
| R1-13 | Scope sanity | No DB migration needed (verified: uses existing enums/columns); if that changes mid-implementation the plan forces an outcome-file + ledger update. | pass |

## Verdict

**PASS** — all violations found during the R1 sweep were fixed inline before this file was written (see "fixed at drafting" rows).

## Re-run instructions for future rounds (if this plan is edited)

1. Re-run the anti-pattern grep: `grep -rn "Translation\.\|@/frontend/utils/logger\|bun test test/workflows\|bottom[- ]nav" *.md` from the plan root.
2. Re-run traceability: REQ ids in specs.md must all appear in tasks.md.
3. Re-verify line citations against HEAD with grep (line numbers drift as this branch evolves).