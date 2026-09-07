# Review Round R10 — Post-Implementation Review Wave (Phase 8.1, iteration 10 of 10+)

**Dispatch:** consolidated independent reviewer (all four scopes, live) + fix round.

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | LOW | backup-database.ts / _shared.ts | Backup raw-`#` gate covered only the path span (R9): query `dbname=pt10q#k` → dump of literal `pt10q#k`, manifest `pt10q` (live-proven A/B); authority-span `pt10u#ser@` → WHATWG swallow, manifest `(default)` while dumping as role `pt10u#ser` | **Fixed:** `rawDsnHasFragment` gate extended to ALL THREE channels (authority span, path span, raw query) mirroring restore-guard-url.ts; unified `[env]` exit-2 message; `%23`-encoded forms allowed with decoded literal labels. Live a-d all correct |
| 2 | INFO doc | docs/ops/disaster-recovery.md | `--clean` scope wording ("drops and recreates public objects" — it drops dump-contained objects only) | Fixed |

R9-delta regression sweep: no gate misfires (`%23` paths pass, query `#` can't trip the path span, integration env shapes green); `preserveFailedStaging` refactor byte-equivalent semantics (retained `_FAILED` dir, scrubbed stderr, lock release — unit-covered).

## Verification after fix round

- Tests: **229 unit pass / 0 fail** (26+88+5+110; +7 new) + **4 integration pass / 0 fail**
- QL: 4/4 touched TS files exit 0; tsgo 0; biome clean; plan-artifact grep 0
- Live: query-`#` refusal / authority-`#` refusal / query-dbname allowed manifest match / plain control — all correct

**R10 result: 1 finding (1 LOW) + 1 INFO → fixed → 0 remaining. Stop-condition: not yet (R11 and R12 must both be zero).**
