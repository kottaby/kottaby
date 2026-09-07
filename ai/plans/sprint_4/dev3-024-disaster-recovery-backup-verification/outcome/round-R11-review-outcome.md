# Review Round R11 — Post-Implementation Review Wave (Phase 8.1, iteration 11)

**Dispatch:** consolidated independent reviewer (all four scopes, live) + fix round.

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | LOW | _shared.ts / backup-database.ts | Backup-side raw `?` in authority span ungated: `postgresql://postgres?k@host/db` parsed by WHATWG as userinfo-less host — manifest `(default)` while pg_dump dumped the named db (live-proven; restore guard refuses the same shape → family parity break) | **Fixed:** `rawDsnHasAmbiguousAuthority` mirrors restore-guard-url.ts span math (raw `?`/`#` in authority span → `[env]` exit 2; R4 pathless refinement preserved). Live: refusal zero-side-effects |
| 2 | LOW | backup-database.ts | db-less source DSN accepted → libpq username-default completion with `(default)` manifest provenance (unverifiable; restore family refuses db-less targets since R5) | **Fixed:** db-less source refused `[env] exit 2` "source database name is unspecified"; `(default)` marker now unreachable. Live: refusal; `?dbname=` and path forms allowed |
| 3 | INFO doc | docs/ops/disaster-recovery.md | Backup-side source-DSN refusals undocumented | Fixed (one bullet) |

R10-delta regression sweep: gate misfire matrix clean (`%23` path/query/authority pass, empty query pass, pathless query pass, `?`-in-password fail-closed upstream at dialect parse); unified message consistent across code+tests; zero-side-effect assertions intact; live A/B (plain + encoded-literal db) labels match archive headers both directions.

## Verification after fix round

- Tests: **232 unit pass / 0 fail** (+3 new, 3 stale expectations updated) + **4 integration pass / 0 fail**
- QL: 4/4 touched files exit 0; tsgo 0; biome clean; plan-artifact grep 0
- Live: authority-`?` refusal / db-less refusal / query-dbname allowed / plain allowed — all correct

**R11 result: 2 findings (2 LOW) + 1 INFO → fixed → 0 remaining. Stop-condition: not yet (R12 must be zero).**
