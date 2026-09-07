# Outcome 1.1 — Plan Review Gate, Round R1 (DEV3-024)

- **Agent:** Plan-Review Gate Subagent (per `.agents/skills/plan-review/SKILL.md`)
- **Date:** 2026-09-07
- **Inputs read in full:** worklog.md · plan-review SKILL.md · spec-implementation SKILL.md §Plan Intake & Validation · specs.md · plan.md · tasks.md · deferred-items.md · outcome/phase0-baseline.md · outcome/0.2-toolchain-anchors-outcome.md · root AGENTS.md (476 lines) · `.agents/instructions/backend.instructions.md` · `.agents/instructions/tests.instructions.md`
- **Scope:** plan files ONLY (specs.md / plan.md / tasks.md). Zero source, script, `package.json`, or `.gitignore` changes.

---

## 1. Layer & file map (Step 1–3)

Plan touches: `scripts/ops/*.ts` + `*.test.ts` (+ optional `_shared.ts`), `package.json`, `.gitignore`, `docs/ops/disaster-recovery.md`, root `AGENTS.md` (1 line, Phase 7). **No `app/`, `frontend/`, `backend/graphql/`, `backend/db/` files** — verified in all four plan docs and re-confirmed as a hard design constraint (plan.md Design Goals: `git diff` on those trees MUST be empty).

Layer AGENTS.md mapping: `scripts/` has **no** layer AGENTS.md (not in the root table). Applicable: root AGENTS.md (always) + `backend.instructions.md` (closest-match, though its `applyTo` glob is `backend/**`) + `tests.instructions.md` (glob `**/*.test.ts` — applies to the new colocated tests). Both instruction files were read in full during this gate.

## 2. Findings (pre-fix)

| # | Severity | Location | Finding |
|---|---|---|---|
| F-1 | **HIGH** (spec↔reality mismatch) | specs.md REQ-017.2 (+REQ-018.1, plan.md §Component-3, tasks.md 5.1) | Critical-table list named 4 tables that do NOT exist in `backend/db/schema/`: `wallets`, `wallet_transactions`, `sessions`, `session_requests`. Live names differ (see §4 probe). All downstream consumers (oracle predicates, integration fixtures) inherited the wrong names. |
| F-2 | Medium (stale anchor) | tasks.md:36 (Layer-to-Instructions Mapping) | Cited absolute path `/home/ahmed/Projects/kottaby_kottaby/AGENTS.md` — a foreign-machine path that doesn't exist in this workspace (`/home/z/my-project`). |
| F-3 | Low (stale line ref) | tasks.md 4.1 | "lines ~66-67" for the `ops:*` block; Task 0.2 probe verified **63–64**. (0.2 outcome said "no plan correction required" because of the `~` hedge; gate mandate supersedes — fixed.) |
| F-4 | Low (internal inconsistency) | plan.md CLI Contract vs Error Handling table vs specs REQ-050.1 | CLI contract listed exit 2 = "usage/env/lock" but the Error Handling table had no lock row and REQ-050.1 named exit 2 as "usage/guard refusal" only. Lock-contention exit was under-specified across the three docs. |
| F-5 | Low (traceability) | tasks.md 2.2, 3.2, 6.2, 6.3, 7.2, 8.1, 8.2 | Missing `_Requirements:_` tags (spec-implementation SKILL intake step 3: every task carries traceability). |
| F-6 | Low (pipeline completeness) | tasks.md 6.x/7.1 | QL/TE/SEC/SR/IV steps omitted for doc-only/process tasks without recorded N/A → silent-skip risk for executing subagents. |
| F-7 | Cosmetic (probe drift) | specs.md G-09 row | Cited `test/workflows/AGENTS.md` "(144 lines)"; actual 147 (doc also grew a journey doc line-count citation was absent). |

## 3. Fixes applied (file:line → change)

**specs.md**
- L60 (G-06 row): probe cell now states `ops:*` pair is at **lines 63–64** per 0.2 re-probe (authoring probe cited 66–67) and notes the `console.*` convention is sanctioned by `eslint.config.mjs` (`no-console: off` for `scripts/**`).
- L63 (G-09 row): line counts corrected to 147 + 124 (F-7).
- L190 (REQ-017.2): table list corrected to live names — `users`, `wallet`, `teacher_transaction`, `session`, `session_request_idempotency`, `audit_logs`, `notifications`, `parent_link_requests` — with an inline R1-probe derivation note (F-1). Still exactly 8 tables; `students` balance lanes (INV-B1) are covered by the OR-B1 oracle, not this row-count list.
- L198 (REQ-018.1): oracle inventory aligned to real tables — "wallet-transaction referential integrity" → `teacher_transaction`→`wallet` RI; "session-request referential integrity (workflow 02)" → `session_request_idempotency` claim RI (joins `users`; claimed `session_id` joins `session`); INV-B* wording now names `students` lanes + `session` student/teacher joins (F-1).
- L261 (REQ-050.1): exit-2 class extended to "usage/env/guard/lock refusal" with live-PID lockfile definition (F-4).

**plan.md**
- L222–230 (§Component-3 oracle registry): OR-W1 → `wallet`; OR-W2 → `teacher_transaction` joins wallet (INV-W4/W6/W7); OR-B1 → negative `students` balance lanes (INV-B1) + `session` joins existing student/teacher (INV-S4); OR-REQ → `session_request_idempotency` RI + claimed `session_id` (A.10 note: no dedicated queue table exists) (F-1).
- L301 (Error Handling table): new row "Lock contention (live PID) | `[env]` | stale-reclaim handles dead PIDs only; a live lock refuses with an actionable message | 2" (F-4).

**tasks.md**
- L32: added *Pipeline scoping (documented negation)* note — doc-only/AGENTS.md tasks run QL/SR/IV with TE N/A-recorded; SEC runs where secrets could leak (6.1/6.2); process/outcome tasks exempt; test files don't echo captured streams via `console.*` (F-6).
- L36 (mapping table): stale absolute path → "root `AGENTS.md` (repo root — no layer AGENTS.md exists for `scripts/`)" + note that backend.instructions.md's `applyTo` glob is `backend/**` (F-2).
- L79 (2.2), L95 (3.2), L132 (6.2), L134 (6.3), L145 (7.2), L151 (8.1), L153 (8.2): added accurate `_Requirements:_` / process-gate tags (F-5).
- L99 (4.1): "(verified 0.2: lines 63–64 — insert immediately after the `ops:remind-link-requests` line, not at literal 66–67)" (F-3).
- L110 (5.1): integration fixtures re-specified against real tables (wallet + `teacher_transaction` earning row, `session` row with intent, `session_request_idempotency` claim, students-row balance-lane sanity fixture, audit/notification/parent-link-request rows) (F-1).
- L126 (new 6.1.SEC) + L131 (new 6.2.SEC): runbook/appendix credential-redaction checks (F-6).

**Post-fix consistency re-scan:** `rg "wallets|wallet_transactions|session_requests\b|ahmed/Projects|lines ~66-67|144 lines"` over the three plan files → only remaining hits are narrative prose (specs intro describes business domains colloquially) and the intentional R1-probe annotations. REQ-017 ↔ plan.md §Component-3 ↔ tasks.md 3.1/5.1 now agree; REQ-050 ↔ plan.md CLI table ↔ Error Handling table agree.

## 4. REQ-017 schema probe (live `backend/db/schema/`, gate mandate — probe-only, zero schema edits)

`rg "pgTable\(" backend/db/schema/` (+ first-string extraction) — actual SQL table names:

| REQ-017 (pre-fix) | Live schema table | Verdict | Evidence |
|---|---|---|---|
| `users` | `users` | ✅ match | `backend/db/schema/users/users.ts:12` |
| `wallets` | **`wallet`** | ❌→fixed | `backend/db/schema/billing/wallet.ts:17`; INV-W1–W3 all predicate on `wallet` |
| `wallet_transactions` | **`teacher_transaction`** (no `wallet_transactions` exists) | ❌→fixed | `backend/db/schema/billing/teacher-transaction.ts`; INV-W4/W6/W7/W8 name `teacher_transaction` (+ `student_payments`) as the financial ledger |
| `sessions` | **`session`** | ❌→fixed | `backend/db/schema/classes/session.ts:50`; INV-S1..S8 use `session` |
| `session_requests` | **no such table** → `session_request_idempotency` is the persisted booking-request state | ❌→fixed | `backend/db/schema/classes/session-request-idempotency.ts:24`; workflow 02 resolves A.10 by putting request intent on `session.intent`; repo-wide grep finds no `session_requests` table |
| `audit_logs` | `audit_logs` | ✅ match | `backend/db/schema/audit/audit-logs.ts:31` |
| `notifications` | `notifications` | ✅ match | `backend/db/schema/notifications/notifications.ts:28` |
| `parent_link_requests` | `parent_link_requests` | ✅ match | `backend/db/schema/parents/parent-link-requests.ts:40` |

**Result: 4 of 8 names were wrong and are now corrected in the plan** (all 8 corrected names exist verbatim in the live schema). Full table inventory also captured (`admin, applicants, audit_logs, evaluations, home_work, lessons, notifications, parent_link_requests, parents, plans, progress, recitation, reports, session, session_request_idempotency, student_payments, student_subscriptions, students, subscriptions, teacher, teacher_transaction, teacher_verification, teachers, users, wallet`) — REQ-017.1's runtime-derived structural check remains the drift-proof mechanism; the fixed list is only the individually-reported row-count set.

## 5. Cross-cutting rule checks (Step 4) — verified, no violations

- **i18n**: exemption properly documented, not silent — specs REQ-000.5.1 + REQ-052.3, plan.md Decision 5 + "Translation System Requirements" section + Error Handling "Logging strategy"; runbook must record it (REQ-052.3 → task 6.1). ✅
- **Logging (`console.*`)**: ops-script exemption is documented (same REQ-000.5/REQ-052) **and structurally sanctioned** — `eslint.config.mjs:243` sets `no-console: off` for `scripts/**/*.ts` (covers `scripts/ops/*.ts` and their colocated tests); `sonarjs/no-os-command-from-path: off` also applies to the pg_dump/pg_restore spawn surface. Verified `scripts/ops/{sweep,remind}-expiring-link-requests.ts` actually use `console.*` (7 + 5 hits) and baseline lint is green. App-layer `logger` rule untouched (no app code). ✅
- **Type imports**: script-local `BackupManifest`/`RestoreReport` interfaces are documented as script-scoped serialization contracts, explicitly NOT in `backend/types/` (plan.md §Data Models rationale); `scripts/` is not a mapped layer; tasks 8.1 types-reviewer enforces "no canonical-type pollution". No Pothos files exist. ✅
- **Service boundaries / MUI v9 / GraphQL documents**: N/A by documented design (zero app surface, BFLA-by-absence, specs §GraphQL & Frontend Contracts + UX negation table). ✅
- **Test conventions**: `runInRollback` N/A ruling is a documented, justified deviation (OS-level `pg_dump`/`pg_restore` cannot be wrapped; REQ-061.2 + tasks 5.1 + plan Testing Strategy; `beforeAll`/`afterAll` lifecycle mirrors the instructions' own RLS-exception shape). Runner path `bun run test/scripts/run-test.ts` **exists on disk** (root AGENTS.md form is correct; note: `tests.instructions.md` cites a stale `scripts/run-test/run-test.ts` path — instruction-file drift, NOT a plan defect; not fixable under plan-only mandate). ✅
- **Journey-test N/A ruling**: valid — documented negation with actor table, negative steps, and a reserved escalation row (deferred-items D-004) before any workflow test could be added; `test/workflows/AGENTS.md` (147 lines) and `docs/testing/workflow-journey-tests.md` (124 lines) exist (G-09). ✅
- **Exit-code / test-runner conventions vs root AGENTS.md**: 0/1/2 contract matches ops precedent (`cli-entry.ts`, sweep/remind headers); DB-touching tests via run-test script; no `expect().rejects.toThrow()` inside rollback (N/A). ✅
- **Checkboxes / pipeline / REQ traceability**: every task has a checkbox; no stale `[-]`; X.Y.QL/TE/SEC/SR/IV present for implementation tasks and now scope-annotated for doc/process tasks; every task now carries a `_Requirements:_` or process-gate tag. ✅
- **Component-1/2/3 ↔ tasks Phase 2/3 contract consistency**: re-verified post-fix — arg flags (`--env`/`--out-dir`/`--help`; `--from`/`--target`/`--yes-i-understand`), exit codes, oracle id set (OR-W1, OR-W2, OR-B1, OR-U1, OR-U2, OR-REQ, OR-MIG), structural-check derivation from `backend/db/schema/` exports, and the optional `scripts/ops/_shared.ts` redaction decision all agree. ✅

## 6. Verdict

**Plan passes all AGENTS.md rules for affected layers.** (Root AGENTS.md + backend.instructions.md closest-match + tests.instructions.md for colocated tests; 7 findings — 1 HIGH, 1 Medium, 4 Low, 1 Cosmetic — all fixed in plan files only; no residual findings.)

## 7. Carry-forward / orchestrator attention

1. **Commit pending:** tasks.md 1.1 requires "commit patched plan files before any implementation." Not committed by this subagent — per the Phase-0 ⚠ ENV ANOMALY (HEAD auto-flaps to `main` between shell calls), the orchestrator must `git checkout feat/dev3-024-disaster-recovery-backup-verification` + verify `git branch --show-current` immediately before committing.
2. **Stale instruction-file path (informational, not fixable here):** `tests.instructions.md` §Run-Test Script cites `scripts/run-test/run-test.ts`; the real path is `test/scripts/run-test.ts` (root AGENTS.md is correct). Worth a future instructions-file hygiene pass outside this plan's scope.
3. Task 4.1 implementers: insert below package.json **L64** (the 0.2 outcome's "no plan correction required" note re the `~66-67` hedge is superseded by this gate's fix).
