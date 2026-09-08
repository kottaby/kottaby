# Review Round R17 — Post-Implementation Review Wave (Phase 8.1, iteration 17)

**Dispatch:** consolidated independent reviewer (all four scopes, live) + fix round.

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | LOW | _shared.ts rawDsnQueryHasEndpointOverride | libpq `service=` (URI query) is a 6th endpoint-indirection channel passing all five backup gates; `HOME` forwarded to children → `~/.pg_service.conf` decides the endpoint (live-proven: psql hit port 5999 via service file while provenance labeled the authority; benign service entry completed a real backup) | **Fixed:** decoded case-insensitive `service` key refused → `[env]` exit 2 "service indirection is not supported — name the endpoint in the DSN authority". Live: refusal |
| 2 | LOW doc | _shared.ts rawDsnHasAmbiguousAuthority | Userinfo-decodes-into-@// sub-channel silently omitted from the claimed mirror | **Fixed:** parity-exception sentence (raw last-@ split identical; decoded role never rendered — `(redacted-user)`) |
| 3 | INFO doc | docs/ops/disaster-recovery.md | Gate precedence undocumented | Fixed (five-gate precedence sentence + `service=` in refusal bullet) |

Channel-by-channel parity table (16 restore-side channels audited): 12 mirrored or stronger on the backup side; 4 documented justifications (managed-marker analysis intentionally absent — backing up prod is the tool's purpose; conninfo-form source DSNs refused upstream; path/query dbname precedence documented; confirmation n/a for read-only backup).

R16-delta regression sweep: multi-host gate clean (bracketed IPv6+zone fails earlier at WHATWG parse — consistent both families; encoded commas in db names/passwords/query-dbname allowed with decoded labels; gate order deterministic and documented).

## Verification after fix round

- Tests: **261 unit pass / 0 fail** (40+103+113+5) + **4 integration pass / 0 fail**
- QL: touched files exit 0; tsgo 0; biome clean; plan-artifact grep 0
- Live: service refusal / benign-query allowed / plain allowed — all correct

**R17 result: 2 findings (1 LOW functional, 1 LOW doc) → fixed → 0 remaining. Stop-condition: not yet (R18 and R19 must both be zero).**
