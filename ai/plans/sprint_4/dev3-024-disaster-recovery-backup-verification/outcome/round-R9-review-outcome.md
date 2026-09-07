# Review Round R9 — Post-Implementation Review Wave (Phase 8.1, iteration 9 of 10)

**Dispatch:** consolidated independent reviewer (all four scopes, live) + fix round.

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | LOW | _shared.ts + backup-database.ts | Backup family lacked the raw-`#`-path gate (R8 closed the restore-side twin): source DSN `…/pt9b#k` dumped literal db while manifest recorded the WHATWG-truncated `pt9b` — provenance contract violation (live-proven) | **Fixed:** `rawUriPathHasFragment` gate at backup bootstrap → exit 2 `[env]` "source DSN path contains a fragment character — percent-encode it", zero side effects; `%23`-encoded sources allowed with decoded literal manifest label (live: created literal db `pt9b#k`, manifest matches) |

R8-delta regression sweep: no false positives — userinfo `#` passwords fail-closed via authority gate (encoded twins flow end-to-end), query-value `%23` allowed, query-channel raw-`#` refusal is the documented R2 contract. Whole-diff sanity across the 5 most-changed files: comment-vs-behavior aligned, no dead branches, verdict aggregation fail-closed, exit-code/tag contracts accurate on all newest paths.

## Verification after fix round

- Tests: **222 unit pass / 0 fail** (1430 expects) + **4 integration pass / 0 fail**
- QL: 4/4 touched files exit 0; tsgo 0; biome clean; plan-artifact grep 0
- Live: raw-`#` source refusal (zero artifacts) / `%23` decoded manifest label / plain control — all correct

**R9 result: 1 finding (1 LOW) → 1 fixed → 0 remaining. Stop-condition: not yet (R10 must be zero).**
