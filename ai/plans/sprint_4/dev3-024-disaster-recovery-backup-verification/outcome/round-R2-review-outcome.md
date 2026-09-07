# Review Round R2 — Post-Implementation Review Wave (Phase 8.1, iteration 2 of 10)

**Scope:** feature diff vs baseline (fresh independent reviewers; R1 fixes specifically re-attacked).
**Dispatch:** review-types+backend (combined, live-probed) + pentester (parallel).

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | CRITICAL | restore-guard.ts | URI query string is an unassessed second host channel: libpq honors `?host=`/`?hostaddr=` as OVERRIDES of the authority host (live-proven: pg_restore dialed the query host past an assessed authority) — `%6d`-class bypass revived via the query | **Fixed:** query channel extracted, percent-decoded (malformed escape → refuse), last-occurrence, and assessed through the SAME pipeline as conninfo values; ANY managed/unassessable channel (authority host, query host, query hostaddr, conninfo host/hostaddr) → `[guard]` exit 2 zero-spawn. New tier-4 tests; live-verified v1-v4 |
| 2 | LOW | restore-shared.ts redactTargetDatabaseName | conninfo `dbname=` first-occurrence (libpq last-wins) + no unquoting → wrong database in report/stdout | Fixed: last-occurrence + quote stripping |
| 3 | LOW | backup-artifacts.ts isSystemOutDir | Lexical resolve misses symlinked out-dir escaping into system paths | Fixed: realpath re-check after mkdir → refuse exit 2 |
| — | INFO | WHATWG strips \t\n\r from URL hosts (libpq doesn't) → raw-control-char host refusal added (fail-closed); verification-use TOCTOU (documented, local-write trust boundary); empty-host URL false-positive (fail-closed, documented); IDN hosts refuse at charset gate (fail-closed) | | Applied where cheap, else documented |

## Verification after fix round

- Tests: **173 unit pass / 0 fail** (1177 expects) + **4 integration pass / 0 fail**
- QL: 7/7 touched files exit 0 (max-lines refactors: `restore-guard-url.ts` extracted, DSN helpers hoisted to `_shared.ts` — public APIs unchanged); tsgo 0; biome clean; plan-artifact grep 0
- Live matrix: `?host=prod.rds.amazonaws.com` → exit 2 `[guard]`; `?hostaddr=192.0.2.1` → exit 2; `?host=127.0.0.1` benign → guard-allowed, pg_restore honors query channel (verify-class exit, NOT a guard refusal — correct); positive control → **VERDICT: PASS**

**R2 result: 3 findings found (1 CRITICAL) → 3 fixed → 0 remaining. Stop-condition: not yet (R2 had findings).**
