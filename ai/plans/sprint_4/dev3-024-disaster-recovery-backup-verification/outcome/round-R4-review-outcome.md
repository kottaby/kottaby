# Review Round R4 — Post-Implementation Review Wave (Phase 8.1, iteration 4 of 10)

**Dispatch:** review-types+backend+frontend-scope (combined) + pentester (parallel, fresh/independent).

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | MEDIUM | restore-guard-url.ts assessRawUriAuthority | False positive: pathless-query URIs (`postgresql://localhost:5432?sslmode=disable`) — the raw span cut at first `/` misclassifies the legal query `?` as authority-ambiguous → refuse; contradicts the gate's rationale | **Fixed:** span ends at min(first `/`, first `?`, first `#`); ambiguous mid-span `?`/`#` still refused; pathless queries flow to the query-channel assessment. Live: `?host=prod…` pathless → exit 2; `?sslmode=disable` pathless → verify-class PASS |
| 2 | LOW | backup-artifacts.ts createStagingDir | Staging-name TOCTOU: predictable name + exists→mkdir window lets a same-uid attacker plant a symlink (bounded: 0600 artifact, same-host operator model) | **Fixed:** suffix-skip on any existing entry (incl. symlinks → `-2` fallback) + realpath containment before writes. Test: pre-planted symlink → run uses `-2`, never writes through link |
| 3 | LOW doc | docs/ops/disaster-recovery.md | Guard section stale vs R3 contract (service/hostaddr/authority-span/query channels unlisted) | **Fixed:** enumerated refusal contract refreshed + port-boundary line added |
| — | INFO | encoded `/` in password refuses (fail-closed, PGPASSWORD workaround); short-form IPv4 `127.1` refuses (fail-closed); IPv6 zone refuses; numeric-IP aliases pass by design (guard is a marker tripwire, not allowlist); port dimension unassessed-but-bounded (documented); max-lines comment pointer fixed | | Accepted as fail-closed/documented |

Pentest verdict: **"No remaining path where pg_restore reaches a host the guard didn't assess."** Probes: port/options/ssl/passfile channels — endpoint-cannot-redirect confirmed (options are server GUCs; ambient PG env cannot choose the host — hostless targets always refused); FIFO/symlink lock DoS safe; staging symlink race closed. Note recorded: pathless URL (no dbname) restores into the default maintenance DB (libpq semantics; operator-explicit; documented behavior).

## Verification after fix round

- Tests: **189 unit pass / 0 fail** (1259 expects) + **4 integration pass / 0 fail**
- QL: exit 0 all touched files (2 lint-shape fixes applied); tsgo 0; biome clean; plan-artifact grep 0
- Live: pathless-host-refused / pathless-benign-allowed / positive-control VERDICT: PASS

**R4 result: 3 findings (0 critical/high) → 3 fixed → 0 remaining. Stop-condition: not yet (need 2 consecutive zero-finding rounds).**
