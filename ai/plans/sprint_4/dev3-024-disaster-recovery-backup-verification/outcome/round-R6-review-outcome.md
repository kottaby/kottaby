# Review Round R6 — Post-Implementation Review Wave (Phase 8.1, iteration 6 of 10)

**Dispatch:** consolidated independent reviewer (all four scopes, live).

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | MEDIUM | restore-guard-url.ts / restore-shared.ts | URI query `dbname=` override unassessed: `path?dbname=other` restored into `other` while the report recorded `path` (live-proven) — provenance integrity gap in the same "query params override" class closed for host in R2 | **Fixed:** query `dbname` extracted (last-wins, percent-decoded); path≠query → refuse ambiguity `[guard]` exit 2; query-only-over-empty-path → explicit target (recorded); report records the effective db. Live: mix refused zero-spawn; query-only → VERDICT PASS with correct report db |
| 2 | LOW | restore-shared.ts buildRestoreChildEnv | Per-request `extra` env merged unfiltered over the allowlist (latent endpoint-completion regression path) | **Fixed:** `extra` filtered through RESTORE_CHILD_ENV_KEYS; test renamed/extended (PGDATABASE/PGSERVICE/PGHOST/PGUSER/PGHOSTADDR never pass) |
| 3 | INFO | backup-toolchain.ts | Backup children still forwarded PGSERVICE/PGSERVICEFILE (family parity) | Fixed (stripped) |
| 4 | INFO doc | docs/ops/disaster-recovery.md | Crashed-run partial report cleanup undocumented | Fixed (operator line) |

R5-delta regressions: none — all documented drill flows still carry dbnames; integration suite green; no test asserted the old "unknown" label. Closed probe: conninfo `dbname=''` fail-closed on every quoting variant (libpq role-default semantics — refusal is correct).

## Verification after fix round

- Tests: **207 unit pass / 0 fail** (+8) + **4 integration pass / 0 fail**
- QL: 0 across 7 touched TS files; tsgo 0; biome clean; plan-artifact grep 0
- Live: ambiguity refusal / query-dbname-allowed PASS / plain-URL control PASS

**R6 result: 2 findings (1 MEDIUM, 1 LOW) + 2 INFO → all fixed → 0 remaining. Stop-condition: not yet.**
