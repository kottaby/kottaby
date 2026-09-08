# Review Round R12 — Post-Implementation Review Wave (Phase 8.1, iteration 12)

**Dispatch:** consolidated independent reviewer (all four scopes, live) + fix round.

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | LOW | _shared.ts rawDsnHasAmbiguousAuthority | Backup gate lacked the control-character channel: raw `\t`/`\n`/`\r` in authority/path spans — WHATWG strips them, libpq keeps literal bytes → manifest label ≠ dumped db (live-proven with a literal-tab db name) | **Fixed:** C0+DEL channel added to both spans + the query `\t\n\r` rule mirrored; unified `[env]` message. Live: raw-tab DSN refused |
| 2 | LOW | _shared.ts effectiveDatabaseName | Explicitly empty `?dbname=` fell back to the path label, but libpq completes empty dbname from the USER name (live-proven: dump header `postgres`, manifest said path db) | **Fixed:** empty/valueless `?dbname=` → under-specified → `[env]` exit 2 (family parity with restore side); non-empty query dbname still wins. Live: refusal |
| 3 | INFO doc | docs/ops/disaster-recovery.md + _shared comments | Source-DSN bullets didn't cover control chars / empty-dbname | Synced |

R11-delta regression sweep: authority-`?` gate clean on benign matrix (pathless queries, encoded userinfo, IPv6, empty query); db-less refusal compatible with integration env shapes and every runbook command. Full E2E contract walk per the runbook: PASS on all claims (backup artifact/manifest, restore VERDICT PASS 24/24+7/7, guard refusal, tamper refusal, exit codes).

## Verification after fix round

- Tests: **237 unit pass / 0 fail** (+5) + **4 integration pass / 0 fail**
- QL: 4/4 touched files exit 0; tsgo 0; biome clean; plan-artifact grep 0
- Live: control-char refusal / empty-dbname refusal / query-dbname allowed / plain allowed — all correct

**R12 result: 2 findings (2 LOW) → fixed → 0 remaining. Stop-condition: not yet (R13 must be zero).**
