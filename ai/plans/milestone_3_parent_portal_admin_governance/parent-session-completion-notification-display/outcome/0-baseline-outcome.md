# Task 0 Outcome — Pre-Implementation Baseline

**Plan directory:** `ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display`
**Task:** 0.1 Record baseline + create deferred-items ledger
**Executed:** 2026-09-18 (clock) against branch tip `c4971c6` — see the branch note below
**Scope:** read-only + metrics; the ONLY source-tree artifact of this task is this outcome file plus the checkbox flips in `tasks.md`. No source file was modified.

---

## 1. Baseline metrics (recorded verbatim)

| Gate | Command | Result | Artifact |
|---|---|---|---|
| tsgo | `bun tsgo` (raw log kept at `/tmp/tsgo-raw.txt`; `tsgo` exit 0) | **0** `error TS` lines | `/tmp/baseline-tsgo.txt` |
| biome | `bun biome:check` (raw log kept at `/tmp/biome-raw.txt`; exit 0; "Checked 2036 files in 15s. No fixes applied.") | **0** lines matching `warn` | `/tmp/baseline-biome.txt` |
| lint service | `bun run scripts/lint-service.ts --json --id baseline` | **exit 0** — JSON `{ "success": true, "output": "", "exitCode": 0, "metrics": { id: "baseline", scope: "full-repo", durationMs: 116893, ... } }` | `/tmp/baseline-lint.json` |
| git stash | `git stash list` | **empty** (no stashes) | `/tmp/baseline-stash.txt` |
| git diff | `git diff --name-only` | **1 file** (see §2) | `/tmp/baseline-files.txt` |

Verbatim `git diff --name-only` at baseline:

```
ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display/tasks.md
```

The single modified file is `tasks.md` itself: line `- [ ] 0.1 …` → `- [-] 0.1 …` (the orchestrator's in-progress marker, made before this task started). This is the ONLY working-tree delta and it is fully attributable to Task 0 tracking — no env files, no lockfile, no source drift.

**Lint JSON parsing note:** `/tmp/baseline-lint.json` contains process-lock banner lines (`[process-lock] …`) before the JSON object (the run-locked wrapper prints to stdout). The JSON parses cleanly after stripping the banner; the metrics block above is the whole content.

**Tooling note (important for future tasks):** the task script prescribed `~/.bun/bin/bun`, but that path does not exist in this sandbox (`/home/z/.bun/bin` is on `PATH` yet absent; the real binary is `/usr/local/bin/bun`, v1.3.14). The first capture attempt therefore silently wrote false zeros (exit 127 pipelines). This was detected and the full suite was RE-RUN with the working binary with raw output retained (`/tmp/tsgo-raw.txt`, `/tmp/biome-raw.txt`) — the counts above are the genuine re-run values. Future tasks in this sandbox should invoke plain `bun` / `/usr/local/bin/bun`.

## 2. Git baseline state

- `git diff --name-only` → exactly the one plan-tracking file listed in §1 (verbatim above).
- `git stash list` → empty (file `/tmp/baseline-stash.txt` is zero bytes).
- Untracked files: none reported by `git status --porcelain` (only the ` M` tasks.md row).
- **Branch note:** HEAD is checked out on `main` at `c4971c6`; the local branch `feat/parent-session-completion-notification-display` EXISTS and points at the SAME commit `c4971c6` (merge-base identical, zero commits of divergence). Content-wise the baseline is unaffected. Flagged to the orchestrator: implementation tasks should confirm the intended check-out before writing code.

## 3. `.env` / database verification

- `.env:1` — `DB_PROVIDER=postgres` ✅
- `.env:2` — `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/app_db` ✅ (host `127.0.0.1:5432`, db `app_db`, user `postgres`)
- Live probe (read-only SELECT via a throwaway script; script deleted after use):
  - Server: **PostgreSQL 17.11** — matches the provisioned Postgres 17 on port 5432.
  - Schema pushed: **25 public tables**, exactly the Drizzle set (`users`, `session`, `notifications`, `students`, `parents`, `reports`, `home_work`, `evaluations`, `parent_link_requests`, `progress`, `recitation`, `lessons`, `teacher`, `admin`, `wallet`, `plans`, `subscriptions`, `student_payments`, `student_subscriptions`, `applicants`, `audit_logs`, `teacher_transaction`, `teacher_verification`, `session_request_idempotency`, `subscription_purchase_idempotency`).
  - Seed state: `users` = 4, `parents` = 1, `notifications` = 0, `session` = 0 — base seed present; notification and session tables empty (consistent with the repo rule that journeys create fixtures, never seed rows).

## 4. Resolver-suite CURRENT status (live verification, 2026-09-18)

History per `tasks.md` Task 0.1 / research-00 §2 / ledger D1: at planning-time verification (2026-09-17) `frontend/lib/notification-route-resolution.test.ts` was RED — **5 pass / 2 fail** (2 cases pinned a stale type-first argument order, the pre-matrix two-stage contract). It was RECONCILED OUT-OF-BAND the same day, pre-implementation (a standalone fix outside this plan): rewritten to the resolver's current 3-param contract `resolveNotificationRoute(relatedEntityType, notificationType?, role?)` (resolver module byte-unchanged), with new session-matrix + role-less-type-stage coverage using codegen `UserRole` enum role assertions.

Live re-verification THIS task (approved runner only — raw `bun test` NOT used as a task runner):

```
bun run test/scripts/run-test.ts frontend/lib/notification-route-resolution.test.ts
→ exit 0

 (pass) STUDENT_LINK_REQUESTS_ROUTE constant > exports canonical route string for student link requests
 (pass) resolveNotificationRoute — staged resolution > null related entity pointer falls back to notifications feed route
 (pass) resolveNotificationRoute — staged resolution > parent-link entity map routes the parent_link_request pointer ahead of every type stage
 (pass) resolveNotificationRoute — staged resolution > session matrix routes by notification type and viewer role
 (pass) resolveNotificationRoute — staged resolution > role-less type stage routes session completion to the student sessions list
 (pass) resolveNotificationRoute — staged resolution > unmapped NotificationType enum values fall through to notifications feed route
 (pass) resolveNotificationRoute — staged resolution > parent-targeted refinement entity pointers intentionally fall through to feed route
 (pass) resolveNotificationRoute — staged resolution > unknown, empty, or hostile string entity pointers safely fall through to feed route

 8 pass
 0 fail
 25 expect() calls
```

**Current baseline: 8 pass / 0 fail / 25 expect() calls — GREEN, matching the expected reconciled state.** Task 6's Parent-cell additions are therefore provably regression-free against a green 8/0 starting point; the RED (5/2) → green (8/0) history above is the honesty record required by REQ-000.1.

## 5. Deferred-items ledger state (verified intact — NOT modified)

Ledger exists at `deferred-items.md` (plan directory), 102 lines, seeded D1–D7 with statuses:

| ID | Item (gist) | Status | Target |
|---|---|---|---|
| D1 | Resolver-suite stale-arg reconciliation | ✅ Done (out-of-band 2026-09-17; 8/0 green) | 6 (verification only) |
| D2 | `schema-surface.test.ts` SDL pin for `parentSessionTarget` | ❌ Blocked (pending — expected) | 4 |
| D3 | `parentMonitoring` parity-test extension for `sessionTargetUnavailableNotice` | ❌ Blocked (pending — expected) | 2 |
| D4 | `ParentHomeworkEntryReturnType.sessionId` verification (conditional projection change) | ❌ Blocked (pending — expected) | 8 |
| D5 | Mid-point backend review wave | ❌ Blocked (pending — expected) | 4.5 |
| D6 | `docs/parents/monitoring-portal.md` DEV1-017 display-contract section | ❌ Blocked (pending — expected) | 10 |
| D7 | Out-of-scope records (explicit non-goals) | ✅ Done | — |

D1/D7 ✅ and D2–D6 ❌ is the ledger's correct pre-implementation state: the ❌ rows are scheduled deferrals whose target tasks (4 / 2 / 8 / 4.5 / 10) flip them to ✅ with verification references (per the ledger's Enforcement section). Zero ⚠️ rows exist. The ledger was NOT modified by this task. Ledger `deferred-items.md` already existed (created by the planning wave) — not recreated.

## 6. Pre-existing issues to IGNORE during post-implementation review (baseline-attributable)

1. `tasks.md` working-tree modification (`- [-] 0.1` in-progress marker) — Task 0 tracking, not a code delta; Task 9's baseline comparison should treat the final `[x]` flips in `tasks.md` the same way (plan-tracking files are exempt from the code baseline).
2. Resolver suite is at 8/0 with NO Parent-cell coverage and NO 4th `relatedEntityId?` parameter — that absence is the baseline, not a defect; Task 6 adds both (R-F).
3. No `Parent` cell in `SESSION_ROUTES_BY_TYPE_AND_ROLE` (`frontend/lib/notification-route-resolution.ts:117`), no by-session read in `ParentMonitoringService`, no `parentSessionTarget` SDL, no `sessionTargetUnavailableNotice` key — all are the planned gaps this feature implements, not pre-existing bugs.
4. Tooling quirk: `~/.bun/bin/bun` is absent in this sandbox (use `bun` / `/usr/local/bin/bun`). Not a repo issue; recorded so future baseline comparisons (`/tmp/baseline-*.txt`) are produced with the same working binary.
5. Nothing else: tsgo 0, biome 0 warns, full-repo lint exit 0 — the toolchain is green on the baseline tree apart from the items above, matching REQ-060's assumption.

## 7. Protocol confirmations (REQ-000.3/4/5/6, Task 0.1.SR/.IV)

- **Outcome read (P1):** ALL files under `outcome/` were read in full before this outcome was written: `plan-review-R1.md`, `research-00-planning-basis.md`, `research-01-emission-backend.md`, `research-02-notification-ui.md`, `research-03-parent-portal.md`, `research-04-i18n-tests-precedents.md` (plus `specs.md`, `plan.md`, `tasks.md`, `deferred-items.md` in full).
- **0.1.SR — semantic review:** baseline deltas attributable (§2: the single diff is the plan-tracking `[-]` flip, made by the orchestrator before task start; the re-run capture artifacts are all under `/tmp`); ledger rows intact with the exact seeded statuses (§5). Note on the task text "zero `❌`/`⚠️`": the seeded D2–D6 ❌ rows are the ledger's declared PENDING state per its own Enforcement section (each has an assigned target task; none is orphaned) — they are the items Task 9's gate enforces to zero. No ⚠️ rows; no unlogged deferrals.
- **0.1.IV — instruction verification:** root `/home/z/my-project/AGENTS.md` read IN FULL (419 lines) — including the Next.js-16 docs mandate, logger paths (`@/frontend/lib/logger` is real; the AGENTS.md `@/frontend/utils/logger` mention is the known-stale path — research-04 §2), MUI v9 `sx` rules, run-test runner discipline, per-file sub-loop protocol, AGENTS.md/instruction discovery matrix, Fix-Or-Report rule, no-summary-markdown rule. No code was edited, so no per-layer AGENTS.md was required for this task.
- **0.1.QL / 0.1.TE / 0.1.SEC:** N/A per the task text (no runtime code changed — ledger + outcome are `.md`; this is a process task and the baseline counts themselves are the recorded artifacts; no code surface exists to audit). Marked `[x]` in `tasks.md` as the task declares them N/A with the stated reasons.

## 8. Carry-forward knowledge for future tasks

1. **Approved runners only.** Every suite run in later tasks uses `bun run test/scripts/run-test.ts <path>` (journeys/service/resolver/frontend) or `bun run test:graphql` (wire). Never raw `bun test` as a task runner.
2. **Binary path:** plain `bun` works; `~/.bun/bin/bun` does not exist in this environment.
3. **Baseline comparison contract (Task 9):** tsgo `error TS` = 0, biome `warn` lines = 0, lint-service exit 0 — new errors MUST be zero or fully attributed to this plan's files. Raw logs retained at `/tmp/tsgo-raw.txt`, `/tmp/biome-raw.txt`, `/tmp/baseline-lint.json`.
4. **Frozen surfaces already green** — nothing in `backend/db/schema/`, the emitter, the WS envelope, or `shared/locale/*notifications*` shows any working-tree drift at baseline; the R-A/R-K diff-proof obligations in Tasks 4.5/9 start from a clean zero-diff state (except the plan-tracking file).
5. **Branch state:** `feat/parent-session-completion-notification-display` exists at the same commit as `main` (`c4971c6`); orchestrator should confirm the intended check-out before Task 1.
6. **DB posture for journeys:** Postgres 17.11 live with the pushed schema and base seed only (notifications/session tables empty) — journey fixtures must be created via `backend/db/test/entity-setup.ts` helpers with the `jrn_parents_<uuid8>` prefix convention, never seed rows.
