# Review Round R8 — Post-Implementation Review Wave (Phase 8.1, iteration 8 of 10)

**Dispatch:** consolidated independent reviewer (all four scopes, live).

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | LOW | _shared.ts / restore-guard-url.ts / restore-shared.ts | Raw `#` in URI path diverges from libpq (reads through `#` — live-proven literal-db restore past a WHATWG-truncated label; mirror-direction fail-closed FP) | **Fixed:** `assessRawUriPath` gate — raw `#` in path → refuse `[guard]` exit 2; `%23` assessed/labelled by decoded value (live: literal db `pt8x#y` restored, report matches). Doc contracts updated |
| 2 | LOW doc | docs/ops/disaster-recovery.md | Guard rule list missing the R7 dot-segment refusal + path-`#` behavior | **Fixed:** one bullet added |

R7-delta regression sweep: no false positives — `a..b`, `a%2E%2Eb`, trailing dots, `a//b` all correctly ALLOWED; raw/encoded dot-segments refused. Cross-family consistency: same query-form DSN → manifest db === report db (live-proven with last-wins multi-param).

## Verification after fix round

- Tests: **220 unit pass / 0 fail** (1418 expects) + **4 integration pass / 0 fail**
- QL: 5/5 touched files exit 0; tsgo 0; biome clean; plan-artifact grep 0
- Live: raw-`#` refusal / `%23` decoded-label PASS / positive control PASS

**R8 result: 2 findings (2 LOW) → 2 fixed → 0 remaining. Stop-condition: not yet (R9 and R10 must both be zero).**
