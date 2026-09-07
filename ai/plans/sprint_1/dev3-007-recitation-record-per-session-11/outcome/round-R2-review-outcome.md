# Review Iteration Round R2 — Findings & Resolutions

**Branch:** `feat/dev3-007-recitation-record-per-session-11` (review base `ffce457..HEAD`).
**Process:** 4 independent reviewers dispatched fresh (no prior-round context). review-frontend agent exceeded its turn budget before reporting — its scope is re-covered by a fresh frontend reviewer in R3 (recorded here for honesty; no silent gap).

## Findings

| # | Source | Severity | Finding | Resolution |
|---|---|---|---|---|
| R2-1 | pentester | LOW | `getSessionRecitation` raised a masked 5xx (PG 22003) for positive-safe-integer sessionIds above the int4 ceiling (2^31−1 but ≤ MAX_SAFE_INTEGER) instead of the contractual collapse-to-null (read contract: NO error path; plan §3.5 read row "null, NEVER an error"). Read-fuzz corpus stopped at `"12abc"` — class unpinned. | **FIXED** — read-path pre-DB guard extended with `SESSION_ID_INT4_CEILING = 2_147_483_647` (collapse → null); service fuzz cell + wire read cell added. Write-path overflow → masked INTERNAL is plan-pinned (deliberate masking probe) and untouched. Evidence: `outcome/fix-r2-read-int4-collapse-outcome.md`; service 23 pass / wire 26 pass; sub-loop ×3 exit 0; tsgo 0. |
| R2-2 | review-backend | INFO | Test-local cause-chain walkers (`hasUniqueViolationCode` / `hasPostgresErrorCode`) in repo/service test files re-implement the `isUniqueViolation` traversal idiom — third instance of the duplication genre; layering-justified (repo-tier tests must not import `@/backend/services/shared`; service variant generalized for the P0001 chaos probe). Test-only; no action. | Documented (dedup genre, ledger D6-adjacent) |
| R2-3 | review-types | — | **0 new findings.** test-d negatives mutation-proven (stripping directives → exactly 8 expected compile errors; restored). | n/a |
| R2-4 | review-frontend | — | Agent exceeded max turns — no report. Scope re-covered in R3. | Carried to R3 |
| R2-5 | pentester | — | Environment caveat (fail-closed): stale dev server on TEST_PORT 3066 + sandbox branch-flip hot-rebuilt a schema without recitation fields → 22 false wire failures; clean boot from feature branch → 25/25 (now 26/26). A stale schema only DENIES new ops, never grants — no security impact. | Documented |

All R1-known items (D4/D5/D6 ledger rows, admin-governance drift, type-guard idiom, RECONCILED_*, resolver narrowing guards, foreign-teacher service-collapse ruling) re-observed and correctly filtered by every reviewer.

## Iteration ledger

- **New findings: 1 LOW (fixed in-round) + 1 INFO (documented)**
- **Blocking findings: 0**
- Suites at round end: repo 11 · service 23 · journey 8 · wire 26 · schema-surface 41 · sdl-static 39 · documents 10 · documents-contract 20 · types-static 6 · i18n parity 10 — all green; tsgo 0; biome 0.
