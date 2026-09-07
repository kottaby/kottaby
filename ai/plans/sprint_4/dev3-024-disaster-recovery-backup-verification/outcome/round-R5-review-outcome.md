# Review Round R5 — Post-Implementation Review Wave (Phase 8.1, iteration 5 of 10)

**Dispatch:** consolidated independent reviewer (all four scopes: types/contracts + backend/races + frontend-scope + pentest-probes, live).

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | MEDIUM | restore-shared.ts RESTORE_CHILD_ENV_KEYS + guard | Env-completed endpoints: under-specified DSNs (no dbname) let ambient `PGDATABASE`/`PGSERVICE` choose the target database (live-proven: `--clean` restore landed in an ambient-env canary DB with VERDICT PASS) | **Fixed (two layers):** (a) database-less targets refused `[guard]` exit 2 (URL empty-path and conninfo-no-dbname); (b) endpoint-deciding env keys (PGDATABASE/PGHOST/PGPORT/PGUSER/PGSERVICE/PGSERVICEFILE/PGHOSTADDR) removed from the child-env allowlist. Live: both refusals exit 2; ambient-canary probe → scratch restored, canary DB untouched |
| 2 | LOW | restore-structure.ts defaultReportFileWriter | Report write followed pre-placed hard/symlinks (live-proven clobber of a linked canary) | **Fixed:** lstat-first refusal of ANY pre-placed entry + atomic `wx` exclusive create, 0600. Live: symlink/hardlink probes → exit 1 `[verify]`, canary byte-identical |
| 3 | INFO doc | docs/ops/disaster-recovery.md | Bare `[verify]` tag missing from the documented tag list | Fixed |

Pentest sweep: 8 additional bypass vectors (multi-host comma, uppercase query keys, percent-encoded trailing dot, fullwidth-dot Unicode, libpq `\'` escape divergence, conninfo comma hosts, env-completion, report clobber) — all host channels remain refused; the two successful probes are the findings above (both closed). Positive control: real backup → restore → **VERDICT: PASS** (24/24 structural, 7/7 oracles).

## Verification after fix round

- Tests: **199 unit pass / 0 fail** (+10 new) + **4 integration pass / 0 fail**
- QL: oxlint/eslint/biome/tsgo all 0 on touched files; plan-artifact grep 0
- Live: (a)/(b) refusals, (c) ambient-canary isolation, (d) report-link refusal — all correct

**R5 result: 2 findings (1 MEDIUM, 1 LOW) → 2 fixed → 0 remaining. Stop-condition: not yet.**
