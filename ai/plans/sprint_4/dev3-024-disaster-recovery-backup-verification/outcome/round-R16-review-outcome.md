# Review Round R16 — Post-Implementation Review Wave (Phase 8.1, iteration 16)

**Dispatch:** consolidated independent reviewer (all four scopes, live) + fix round.

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | LOW | _shared.ts backupSourceDsnRefusal | No authority multi-host/charset gate: `postgresql://postgres@127.0.0.1,8.8.8.8:5432/db` completed a real backup via libpq failover (live-proven) while the manifest labeled only the authority — the R14 "ships the dump off-box" class via a different channel; restore refuses the identical shape | **Fixed:** `rawDsnHasMultiHostEndpoints` (comma raw/percent-decoded in the authority host span or query host/hostaddr values, shared span math) → `[env]` exit 2; `[::1]` bracketed IPv6 unaffected. Live a-c all correct |

R15-delta regression sweep: no false positives — 8/8 backslash label matrix exact (the fold is the precise inverse of libpq's scan); 22-shape endpoint-override matrix clean (`sslhost=`/`options=` etc. don't trip; encoded/case/valueless forms do); `hostssl`/`hostnossl` corners closed (libpq itself rejects — fail-closed externally).

## Verification after fix round

- Tests: **259 unit pass / 0 fail** (39+102+113+5; +8) + **4 integration pass / 0 fail**
- QL: touched files exit 0 (max-lines 292/300); tsgo 0; biome clean; plan-artifact grep 0
- Live: comma-authority refusal / bracketed-IPv6 allowed / plain allowed — all correct

**R16 result: 1 finding (1 LOW) → fixed → 0 remaining. Stop-condition: not yet (R17 and R18 must both be zero).**
