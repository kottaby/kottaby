# Plan Review Report — admin-financial-auditing-payments-wallet

## Review Round: 1
## Date: 2026-09-11
## Subagents Dispatched: verify-backend-layers · verify-graphql-frontend-layers · verify-tests-cross-cutting (3 parallel explore agents)

---

## Summary

- **Total issues found:** 14 distinct (deduped; one citation drift appeared in two reviews)
- **Blocking (CRITICAL/HIGH):** 3
- **Medium:** 5
- **Low/Notes:** 6
- **Verdict after fixes:** Plan passes all AGENTS.md rules for affected layers.

---

## Findings by Dimension

| Dimension | Subagent | Issues Found | Status |
|---|---|---|---|
| Backend repos/services/types/enum/migrations | verify-backend-layers | 7 | ✅ Fixed |
| GraphQL/Pothos + frontend/app/locale | verify-graphql-frontend-layers | 7 | ✅ Fixed |
| Journey/repo/UI tests + cross-cutting hygiene | verify-tests-cross-cutting | 4 (actionable) | ✅ Fixed |

---

## Detailed Findings

### Dimension 1: Backend layers

1. **CRITICAL** — `plan.md` D-2 mechanics / `tasks.md` 2.1 — a new `*-sqlite.sql` migration file is auto-bundled into the PG pipeline unless registered in `EXCLUDED_FILES` (`backend/db/scripts/applyCustomMigrations.ts:58-68`); SQLite trigger syntax would abort `bun db migrate`.
   - **Fix Applied:** Task 2.1 now requires registering `5-teacher-transaction-settlement-sqlite.sql` in `EXCLUDED_FILES`; plan.md D-2 mechanics rewritten accordingly.
2. **HIGH (factual inversion)** — `plan.md` Deployment / D-2 + `specs.md` Constraints claimed pglite needs the sqlite variant. Truth: `backend/db/scripts/migrate.ts:24-54` runs pglite on the **postgres** dialect; `backend/db/pglite-pool.ts:19-23` supports PL/pgSQL — the PG file covers PG+pglite; sqlite variant targets the legacy libsql dialect only.
   - **Fix Applied:** specs.md constraints, plan.md D-2 mechanics, and Deployment section rewritten to the verified dialect reality.
3. **MEDIUM** — `plan.md` Component 1 omitted the repo bare-read rule (dual-branch `queryDb(tx)` idiom, `backend/AGENTS.md:24`).
   - **Fix Applied:** explicit "Repo-layer directive" added to Component 1 and Task 2.3.
4. **LOW** — analytics counter cited as `:419-431` (plan) / `:427-434` (specs); actual predicate sits at `platform-analytics.repository.ts:427-434`.
   - **Fix Applied:** plan.md corrected to `:427-434`.
5. **LOW** — Task 2.1 docblock fix scoped too narrowly: `backend/db/schema/billing/wallet.ts:11-16` carries the same stale trigger claim.
   - **Fix Applied:** Task 2.1 now covers both docblocks.
6. **LOW (design gap)** — null-wallet wallet-inspector teacher identity source unspecified.
   - **Fix Applied:** `getTeacherWalletForAdmin` signature prose (plan.md Component 2) + Task 2.5 bullet now specify the teacher→user fallback lookup.
7. **LOW** — Pothos page-object precedent cited at `audit-trail.query.ts:43`; real definition lives at `backend/graphql/pothos/admin/audit-trail.pothos.ts:56`.
   - **Fix Applied:** plan.md Component 3 citation corrected.

### Dimension 2: GraphQL + frontend

8. **HIGH** — Admin-mutation audit census omitted: `test/workflows/admin/audit-completeness.catalog.ts` deferred row (ref D-002) must flip to three `wired` rows, `ACTION_TYPE_COVERAGE.Adjust` must flip `fixture`→`wired`, and producer lanes must be added to `audit-completeness.journey.test.ts` (enforced by `backend/db/test/logic/audit/audit-census-drift.test.ts`).
   - **Fix Applied:** plan.md Component 3 registry bullets + Task 3.1 now carry the catalog/coverage/lane updates.
9. **MEDIUM** — SDL enum casing: `gqlSchemaBuilder.enumType(<TS enum>)` renders TS member names — `Credit`/`Debit`, not `CREDIT`/`DEBIT`.
   - **Fix Applied:** plan.md SDL delta + specs.md journey prose corrected.
10. **MEDIUM** — `AdminTeacherWallet.wallet: Wallet` would have reused the capped-ledger `WalletViewType`-bound object (contradicting D-5).
    - **Fix Applied:** `AdminTeacherWallet` redesigned with flat nullable `balance`/`totalEarning` + constant `currency`; types block updated.
11. **MEDIUM** — Apollo `keyFields: false` typePolicies for the id-less wrapper types omitted (`frontend/providers/apollo/apolloCache.ts` precedent exists).
    - **Fix Applied:** plan.md Component 4 bullet + Task 4.1 bullet added.
12. **LOW** — `TeacherTransactionPothosObject` is module-private (`pothos/billing/wallet.pothos.ts:86`).
    - **Fix Applied:** one-line `export` touch-up called out in plan.md Component 3 + Task 3.1.
13. **LOW** — schema-surface freeze test (`backend/graphql/test/schema-surface.test.ts`) inventory update not named; hook-import source (`@apollo/client/react`) unpinned.
    - **Fix Applied:** both pinned in Task 3.1 / Task 4.1.

### Dimension 3: Tests + cross-cutting

14. **MEDIUM** — "extend `backend/db/test/repo/billing/`" — that directory does not exist (zero wallet/student-payment repo tests today).
    - **Fix Applied:** plan.md Testing Strategy + Task 2.3 now say CREATE.
15. **MEDIUM** — journey teardown regime for `teacher_transaction` rows unspecified (DELETE-blocked); regime pinned: hard-delete FIRST inside `withImmutabilityTriggersSuspended(["teacher_transaction"])`, never tracked-fixture-register them; audit rows via `withAuditDeleteTriggersSuspended` (subscription-purchase journey precedent).
    - **Fix Applied:** plan.md journey bullet + Task 2.4.
16. **MEDIUM** — journey prefix `jrn_adminfin_` diverged from the `journeyPrefix("billing")` convention.
    - **Fix Applied:** Task 2.4 uses `journeyPrefix("billing")`.
17. **LOW** — UI suite placement normalized to flat `test/ui/components/admin/AdminFinances*.test.tsx` (PlatformAnalytics precedent); pipeline-exemption note added to tasks.md protocol. — **Fixed.**

## Fix Dispatch

Applied directly by the orchestrator (docs-only edits): specs.md (constraints, journeys), plan.md (D-2 mechanics, Components 1-4, SDL, Data Models, Testing, Deployment, citations), tasks.md (2.1, 2.3, 2.4, 2.5, 3.1, 4.1, 4.3, protocol exemption).

## Post-Fix Verification

- [x] Traceability: every `REQ-n` in specs.md appears in tasks.md (grep — zero misses)
- [x] Structure: plan.md contains Overview+Decisions, Data Models, API SDL + error/permission matrix, Service/Repo signatures + concurrency + journey design, UX/Nav (incl. role matrix + permission mapping), Security mitigations, Testing, Deployment
- [x] Anti-pattern sweep: no instructed `Translation.` enum, no two-arg `getTranslations`, no `@/frontend/utils/logger`, no raw `bun test` on workflows, no `AppDataGrid` usage — all remaining mentions are "forbidden" documentation
- [x] No truncation: last lines of all four artifacts verified complete
- [x] Ledger: D1's payload-identical confirmation observed during review; formal recording lands in Task 2.1's outcome

## Lessons for Future Plans

- The custom-migration bundler (`applyCustomMigrations.ts` `EXCLUDED_FILES`) is a plan-affecting detail for ANY new `backend/db/migration/*.sql` file — cite it whenever the plan adds SQL.
- pglite == postgres dialect; `*-sqlite.sql` files serve ONLY the legacy libsql path. Never claim "tests need the sqlite variant".
- Admin mutations are never done until the audit-completeness catalog + schema-surface freeze inventories move with them.
- Pothos `enumType(TsEnum)` renders TS member names into SDL — never invent casing.

---

**Verdict: PASS (post-fix). Plan cleared for implementation.**
