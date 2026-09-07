# Review Round R3 — Post-Implementation Review Wave (Phase 8.1, iteration 3 of 10)

**Dispatch:** review-types+backend (combined) + pentester (parallel, fresh/independent).

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | CRITICAL | restore-guard-url.ts | Authority-span bypass: `?`/`#` inside the raw authority (`postgresql://postgres:?@prod.rds.amazonaws.com/db`) — WHATWG ends authority at first `?`, libpq scans to first `/` and takes last `@` → guard assessed `postgres` as host while pg_restore dialed the managed host (live-proven end-to-end restore) | **Fixed:** `assessRawUriAuthority()` runs FIRST on the raw span: `?`/`#`/control chars → refuse unassessable; userinfo percent-decoding to `@`//` → refuse. Live v1/v2: exit 2 zero spawns |
| 2 | HIGH | restore-guard.ts conninfo channel | `hostaddr` assessed vacuously — `host=127.0.0.99 hostaddr=198.51.100.9` allowed; libpq connects to the hostaddr | **Fixed:** conninfo hostaddr mirrors query-channel rule — non-loopback → refuse; loopback → allowed. Live v3/v4 (v4: real conninfo-form restore → VERDICT PASS) |
| 3 | MEDIUM | restore-guard-url.ts + child env | `?service=` (and PGSERVICEFILE forwarding) lets a service file steer the endpoint — unassessable indirection | **Fixed:** `service=` refused on both URL-query and conninfo channels. Live v5: exit 2 |
| 4 | LOW | restore-shared.ts | `dbname='my''db'` report label missing `''`-escape fold | Fixed: fold to `my'db` |

types+backend reviewer verdict: R2 deltas behavior-preserving, extraction seams clean, standing invariants verified (exit codes, tags, lock release, scrubbing, ORACLES purity, verdict PASS-iff, 0 plan-artifact refs, no cross-layer imports). INFO items: 2 dead exports (documented), check-then-use realpath residual (operator-trust boundary, documented), empty-authority-URL false positive (fail-closed, documented).

## Verification after fix round

- Tests: **184 unit pass / 0 fail** (1235 expects; +11 new) + **4 integration pass / 0 fail**
- QL: 4/4 touched files exit 0 (no oxlint disables); tsgo 0; biome clean; plan-artifact grep 0
- Live matrix v1-v6: authority-span `?`/`#` refusals, non-loopback hostaddr refusal, service refusal, loopback-hostaddr conninfo restore **VERDICT: PASS**, plain-URL positive control **VERDICT: PASS**

**R3 result: 4 findings found (1 CRITICAL) → 4 fixed → 0 remaining. Stop-condition: not yet.**
