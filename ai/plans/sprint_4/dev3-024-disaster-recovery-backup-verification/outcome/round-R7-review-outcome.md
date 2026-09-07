# Review Round R7 — Post-Implementation Review Wave (Phase 8.1, iteration 7 of 10)

**Dispatch:** consolidated independent reviewer (all four scopes, live).

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | LOW | restore-guard-url.ts / restore-shared.ts | Provenance: path db derived from WHATWG pathname (normalizes `.`/`..`) but libpq connects to the literal path → `../`-style targets restore into a bizarre literal db while the report labels the normalized name | **Fixed:** raw-path derivation (libpq's view) + dot-segment paths refused `[guard]` exit 2 (unassessable). Live: dot-segment → exit 2 |
| 2 | LOW | _shared.ts databaseNameFromDsn / redactDsn | Backup family ignored query `dbname=` on SOURCE DSNs → manifest labeled `(default)` while pg_dump dumped the query db (live-proven) | **Fixed:** effective-db derivation honors query dbname (last-wins, percent-decoded); manifest/live-verified `database: "app_db"` via query-form DSN |
| — | INFO doc | docs/ops/disaster-recovery.md | Guard-bullet wording nit ("named in ONE place" vs agreeing path+query form) | Accepted; doc already complements the named-db rule |

R6-delta regression check: none — %-encoded-equal path+query, trailing-slash + query, pathless query-only all correctly allowed (live PASS ×3); path/query mix still refuses. Backup family deep-read (stderr drain, perms race, journal-hash byte-verification vs drizzle-orm 1.0.0-rc.4, utcStamp collisions): NO FINDINGS.

## Verification after fix round

- Tests: **215 unit pass / 0 fail** (1398 expects) + **4 integration pass / 0 fail**
- QL: 7/7 touched files exit 0; tsgo 0; biome clean; plan-artifact grep 0
- Live: dot-segment refusal, query-dbname manifest recording, positive control **VERDICT: PASS**

**R7 result: 2 findings (2 LOW) → 2 fixed → 0 remaining. Stop-condition: not yet (need 2 consecutive zero-finding rounds).**
