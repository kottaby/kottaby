# Review Round R1 — Post-Implementation Review Wave (Phase 8.1, iteration 1 of 10)

**Scope:** `git diff ffce457..feat/dev3-024-…` — 17 scripts/ops files, package.json, .gitignore, docs/ops, plan artifacts.
**Dispatch (parallel, independent):** review-types, review-backend, review-frontend (scope-verification), pentester.
**Baseline filter:** Phase-0 baseline green → all findings feature-new.

## Findings (11 actionable: 1 CRITICAL / 2 HIGH / 1 MEDIUM / 7 LOW + INFO notes)

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | CRITICAL | restore-guard.ts | Percent-encoding guard bypass: `prod.rds.amazonaws.co%6d` passes (Bun URL does not decode non-special-scheme hosts) while libpq decodes → managed host reached | Fixed: percent-decode host labels before assessment (libpq semantics); malformed escapes → refuse. Live-verified: `%6d` → exit 2 zero spawns |
| 2 | HIGH | restore-guard.ts | Trailing-dot hostname (`…amazon.com.`) defeats $-anchored managed markers | Fixed: strip trailing dots (URL + conninfo forms). Live-verified refused |
| 3 | HIGH | restore-guard.ts | Lone `hostaddr=<ip>` conninfo spawns unassessed | Fixed: hostaddr-without-host → refuse [guard] exit 2 (URL-form IP hosts remain allowed for drills — documented). Live-verified refused |
| 4 | MEDIUM | restore-shared/verify | `--from` manifest-controlled `artifactFile` traversal = arbitrary-file hash oracle + arbitrary pg_restore path | Fixed: artifactFile bare-filename-only (refuse separators/`..`), resolved-parent confinement, artifactBytes cross-check. Live-verified: traversal manifest → exit 1 tamper-class |
| 5 | LOW | restore-shared.ts | `artifactBytes` never cross-checked | Fixed with #4 |
| 6 | LOW | backup-database.ts | System-path out-dirs warned not refused | Fixed: exit-2 refusal for non-disposable system paths |
| 7 | LOW | dbActions/envFile.ts consumer side | Absolute `--env` paths broken (cwd join) | Fixed: CLIs resolve absolute paths before bootstrap. Live-verified |
| 8 | LOW | backup-database.ts | db-less DSN username fallback could land in manifest `database` | Fixed: `(default)` fallback; test updated |
| 9 | LOW | _shared/backup/guard | `decodeUrlSegment` + POSTGRES_PROTOCOLS duplicated | Fixed: hoisted to _shared.ts |
| 10 | LOW | restore-verify.ts:181 | Literal `-1` instead of ORACLE_ERROR_OFFENDING_COUNT sentinel | Fixed: import |
| 11 | LOW | restore-verify/backup | Explicit `--env` bootstrap failure unscrubbed (asymmetric) | Fixed: symmetric scrubbing |
| — | INFO | lock ENOENT race, publish check-then-rename window, OR-MIG one-directional absent pass, SpawnRunner twin names, `[backup]` tag taxonomy, adjacency-test brittleness, conninfo-shape scrub gap | Conscious trade-offs / hardening nits; fail-closed in all cases | Documented; ENOENT wrap applied as cheap hardening |

review-frontend: scope grep empty (zero frontend/app/shared files) → NO FINDINGS; tsgo 0.

## Verification after fix round

- Tests: **157 unit pass / 0 fail** (4 suites, 1109 expects) + **4 integration pass / 0 fail** (run-test runner)
- QL: 10/10 touched files sub-loop duplicates exit 0; tsgo 0; biome clean; plan-artifact grep 0
- Live regression matrix: all guard vectors (encoded host, malformed escape, trailing dot, hostaddr-only, last-wins duplicate, traversal manifest) refused pre-spawn with correct exit codes; positive control restore-verify → **VERDICT: PASS**; absolute --env live-verified; cleanup clean

**R1 result: 11 findings found → 11 fixed → 0 remaining.**
