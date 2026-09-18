# Mid-Point Backend Review Gate — R1 (Task 4.5)

**Plan:** `ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display`
**Scope:** Task 3–4 files only (backend read surface + SDL regen/schema pin/wire matrix)
**Reviewers:** review-backend · review-types · review-config (3 parallel, read-only)
**Review target:** branch `feat/parent-session-completion-notification-display`, delta `c4971c6..8b28e41` (+ docblock fix)
**Date:** implementation session (PostgreSQL 17 sandbox, DB_PROVIDER=postgres)

---

## Verdict

**ZERO CRITICAL · ZERO HIGH · ZERO MEDIUM findings.** Backend delta approved to proceed to frontend tasks (lifecycle isolation respected — no cross-stage interleaving).

Aggregated findings: 3 LOW (1 actionable doc-drift fix, applied; 2 process notes, recorded) + 2 INFO + 2 bookkeeping caveats. All grep-locks PASS.

---

## Findings (aggregated, deduplicated, pre-existing filtered)

| # | Severity | Location | Finding | Disposition |
|---|---|---|---|---|
| 1 | LOW | `backend/services/parents/parent-monitoring.service.ts:10-11` | Header docblock said "READ COMMITTED" while every portal transaction opens `repeatable read` (the new method's own docblock was already correct) | ✅ FIXED — one-line docblock correction; identical change was quality-loop-validated twice (sub-loop `--lifecycle duplicates` exit 0) by the fix subagent before the sandbox branch-flip race forced a re-apply; committed |
| 2 | LOW | `backend/graphql/test/schema-surface.test.ts:608-613` | `RECONCILED_VERIFICATION_PLAN_PURCHASE_MUTATION_FIELDS` grows the mutation pin beyond Task 4's declared delta — justified: `purchaseVerificationPlan` pre-exists at baseline SDL (`schema.graphql:689`) and the mutation-set pin is red without it | ✅ Accepted — pre-existing drift reconciliation, documented in-file and in 4.1 outcome §4.5; recorded for traceability, no action |
| 3 | LOW | `backend/graphql/test/parent-monitoring.wire.test.ts:760-775` | New linked-child fixtures use direct test-process writes that the wire server must read — under a PGlite topology the success cell would fail and negative arms would pass vacuously | ✅ Accepted — empirically green twice on real PostgreSQL 17 (shared server visibility), no wire-only session-creation mutation exists (R-K); environment-visibility assumption recorded here |
| 4 | INFO | `backend/services/parents/parent-monitoring.service.ts:364-368` | 4th param named `outerTx?` vs research-00 §4 frozen text `tx?` — identical to the file's five pre-existing portal methods (`:162/:195/:241/:279/:320`) | ✅ No action — file convention wins; structurally exact |
| 5 | INFO | workspace checkout | External sandbox process intermittently flips HEAD to `main` (plan baseline) | ✅ Mitigated — reviews executed against branch content via `git diff main...branch` / worktree; future commits move to a dedicated worktree |

**review-types: 0 blocking findings.** Types surface fully conformant: `ParentSessionTargetReturnType` appended exactly per frozen signature (readonly, number, order); canonical naming (ReturnType in TS contexts, `ParentSessionTarget` wire name confined to objectRef/SDL/pins); zero duplicate definitions (forward-contract bridge fully removed from the journey); zero relative imports; enum VALUE imports correct at both runtime sites; i18n key matches sibling shape conventions; generated `gql/graphql.ts` zero-diff is CORRECT (operation-driven codegen; no document selects the field until the frontend documents task).

**review-config: ALL LOCKS PASS (7/7).**
1. `backend/db/schema/` delta EMPTY (R-K) ✅
2. Zero new Mutation fields (R-K) — 18 grep hits classified, all benign (comments/moved test docs/pin reconciliation of pre-existing SDL) ✅
3. Emission substrate byte-frozen (R-A) — full delta file list classified: 19 files, all EXPECTED, zero unexpected; engine/envelope/session-report-notification intersection empty ✅
4. `notifications` namespace byte-frozen (R-A) — zero files under `shared/locale/{types,en,ar}/notifications/` ✅
5. No env-config changes — `backend/lib/env*` and `.env.example` diffs empty ✅
6. Generated SDL delta = exactly +10/−0 sanctioned lines ✅
7. drizzle.config.ts + migrations unchanged ✅

---

## 4.5.SR — Semantic Review (gate-level)

Findings cross-checked against research-00 §3 rulings R-C/R-K/R4 and §4 frozen signatures — every mitigation has a verifying artifact:
- Frozen flow: `isPositiveSafeInt → ValidationError` BEFORE `requireActor` and rate limit; rate limit BEFORE transaction; gate+read sealed in ONE repeatable-read transaction (TOCTOU intact) — verified in code + service tests (ordering pin).
- R4 log discipline: ONE bounded `logDomainError` per denial arm; context key set exactly `["code","entity","entityId","locale"]`, `entity:"sessions"`, zero session-row fields — service test pins the key set.
- Constant-denial oracle: null arm byte-identical to link-gate denial copy per locale (service fingerprints en+ar) and byte-identical 403 bodies on the wire + 5× chaos probes.
- authScopes: shared `parentOnlyAuthScopes` const reused; `$all` conjunction intact; schema-surface snapshot pin.
- Suite baselines: service 88/0 · wire 38/0 · schema-surface 71/0 · `test:graphql` lane 188/0 · journey 6/0.

## 4.5.IV — Instruction Verification (gate-level)

Reviewers cite: root `AGENTS.md`, `backend/AGENTS.md`, `backend/services/AGENTS.md`, `backend/graphql/AGENTS.md`, `backend/types/AGENTS.md`, `shared/AGENTS.md`, `shared/locale/AGENTS.md`, `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`. Delta validates against them; pre-existing `helpers.ts` docblock drift (READ COMMITTED wording) is OUT of this plan's delta — logged as pre-existing, not blocking, NOT touched (scope boundary).

---

## Deferred Items

- **D5 (this gate) → ✅ Done** with this outcome as verification reference.
- D2/D3 already ✅ (flipped at Tasks 4/2 with outcome references). D4 → Task 8, D6 → Task 10 remain scheduled.

## Next

Proceed to frontend tasks (Task 5 documents + cache; Task 6 resolver Parent cell) — no backend work remains open.
