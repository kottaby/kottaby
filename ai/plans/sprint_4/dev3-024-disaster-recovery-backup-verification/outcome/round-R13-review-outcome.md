# Review Round R13 — Post-Implementation Review Wave (Phase 8.1, iteration 13)

**Dispatch:** consolidated independent reviewer (all four scopes, live) + fix round.

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | LOW | _shared.ts / backup-database.ts | Backup family lacked the dot-segment path gate (restore side has it since R7): source DSN `…/a/../db` → libpq db literally `a/../db`, manifest recorded WHATWG-normalized `db` (live-proven) | **Fixed:** `rawDsnPathHasDotSegments` (raw + percent-decoded) → `[env]` exit 2 "source DSN path contains dot-segments — use the literal database name". Live: refused |
| 2 | LOW | restore-shared.ts redactTargetDatabaseName | libpq folds backslash escapes inside quoted conninfo values (live-proven `'a\b'`→`ab`, `'a\\b'`→`a\b`, `"a\b"`→`ab`); label kept them literal → report provenance divergence | **Fixed:** `\<char>` fold inside quoted values (single-quote after `''`-fold; double-quote backslashes only); unit-asserted against the libpq-effective names |
| 3 | INFO doc | docs/ops/disaster-recovery.md | Dot-segment clause missing from backup source-DSN bullet | Fixed |

R12-delta regression sweep: encoded controls `%09/%0A/%0D` allowed with decoded literal labels; DEL `\x7F` byte-verified (refused in spans, allowed+converging in query); raw tab in query refused live on both families. Divergence sweep (backup gates ↔ restore-guard-url.ts, both directions): span math byte-identical; remaining asymmetries justified (userinfo-%decode, malformed-escape, service/host channels — read-only family, documented).

## Verification after fix round

- Tests: **245 unit pass / 0 fail** (+8) + **4 integration pass / 0 fail**
- QL: 6/6 touched files exit 0; tsgo 0; biome clean; plan-artifact grep 0
- Live: dot-segment refusal / plain positive control — correct

**R13 result: 2 findings (2 LOW) → fixed → 0 remaining. Stop-condition: not yet (R14 must be zero).**
