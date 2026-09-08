# Review Round R14 — Post-Implementation Review Wave (Phase 8.1, iteration 14)

**Dispatch:** consolidated independent reviewer (all four scopes, live) + fix round.

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | MEDIUM | restore-shared.ts redactTargetDatabaseName | libpq folds `\<char>` in UNQUOTED conninfo values too (live-proven: `dbname=r14\db` → restores `r14db`; `\ ` extends across whitespace) — report label diverged from the real restored db on a destructive operation | **Fixed:** unquoted branch spans `\<char>` escapes incl. `\<whitespace>` extension and folds per libpq scan rules. Live-matrix unit coverage |
| 2 | MEDIUM | _shared.ts + backup-database.ts | Backup source-DSN query endpoint-override channel unassessed: `?host=`/`?hostaddr=`/`?port=` steered the dump endpoint while the run record rendered the dead authority (live-proven; `?hostaddr=8.8.8.8` would ship the dump off-box) | **Fixed:** `rawDsnQueryHasEndpointOverride` → `[env]` exit 2 "endpoint override in query string is not supported — put host/port in the DSN authority"; benign query params (dbname/sslmode/application_name) allowed. Live a-d all correct |

R13-delta regression sweep: dot-segment whole-segment rule exact and in parity (11-shape matrix both families; live backup of literal `r14..db` succeeded with correct label); trailing single-dot path `/.` correctly refused; backslash-fold quoted branches correct.

## Verification after fix round

- Tests: **251 unit pass / 0 fail** (35+98+113+5) + **4 integration pass / 0 fail**
- QL: touched files exit 0 (backup-database.ts pulled back under the 300-line cap via shared `backupSourceDsnRefusal`); tsgo 0; biome clean; plan-artifact grep 0
- Live: host/hostaddr/port override refusals; benign query params allowed; plain control — all correct

**R14 result: 2 findings (2 MEDIUM) → fixed → 0 remaining. Stop-condition: not yet (R15 must be zero).**
