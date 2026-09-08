# Task 5 Outcome — Canonical Doc Update (session-lifecycle.md)

**Plan:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
**Task:** 5 (canonical doc update) · **Date:** 2026-09-07 · **Agent:** Task 5 canonical-doc subagent
**Requirement:** REQ-7 (+ REQ-4 ruling documentation, REQ-0.5 n/a)

---

## Summary

`docs/sessions/session-lifecycle.md` was surgically updated to the implemented DEV3-012 contract: the dual-confirmation completion handshake and the two-leg expiry sweep are now documented as IMPLEMENTED, the `disputed` producer surface is confirmed (pre-completion only), the §2.2 guarded-transition table gained the `sweepExpiredCompletedOnce` row, and a notification side-effect table documents the two student-facing completion waves. All other sections, section numbering, tone, notation (`∧`, ONE-captured-`now`, ticket-ID annotation style), and the mermaid diagram format are preserved. The root `AGENTS.md` Important References line for the doc was extended minimally (see below).

## Files Modified

| File | Change |
|---|---|
| `docs/sessions/session-lifecycle.md` | §2.1: `completed` state row rewritten (student confirmation stamp + hold release + wallet credit; swept-to-cancelled after 24h; no longer terminal by itself); `disputed` state row rewritten (producer surface confirmed — `openSessionDispute`, either participant, `scheduled`/`started` only, hold frozen; dispute-from-`completed` rejected `SESSION_INVALID_TRANSITION`; admin `resolveSessionDispute` owns the hop out, DEV3-021 owns the arbitration surface); mermaid diagram gained the dispute edges, the confirm self-loop, the sweep edge, and the two admin-resolution edges; the terminal annotation `terminal (dual confirmation/wallet = DEV3-012/013)` resolved to `terminal (settled — hold consumed; ledger accounting depth = DEV3-013)` (012 part resolved, 013 escrow-accounting-depth annotation intentionally kept). §2.2: one new table row `sweepExpiredCompletedOnce` (system batch — no row identity/participant leg; strict `<` cutoff arithmetic; SET + `RETURNING *`; one-transaction two-leg composition with UNION refund walk; `confirmation_deadline` never touched per B.2; idempotent re-run) + one clarifying sentence (batch sweeps are the deliberate exception to the cold-probe ritual) + a new "Notification side effects (DEV3-012, implemented)" table (producer transition → wave kind · row type → recipient → idempotency key, with the publish-after-commit receipt contract in the lead sentence). §2.3 decision binding: the `B.18 — disputed exists in the enum with no producer here` clause corrected to the confirmed pre-completion producer (self-consistency with §2.1). §4: the two stale `DEV3-012/013` pending annotations resolved for the 012 part (dual confirmation now implemented; wallet-side release/credit landed with the handshake) while the DEV3-013 escrow-accounting-depth ownership stays. |
| `AGENTS.md` (root, line 461) | Important References line for `docs/sessions/session-lifecycle.md`: appended `; DEV3-012: dual-confirmation completion handshake — two-leg expiry sweep + completion notification waves` inside the existing parenthetical. The pre-existing string attributed the doc to DEV3-004 content only; with the handshake now canonical doc content, the description would have been materially incomplete. No other AGENTS.md content touched. |
| `ai/plans/.../outcome/5-canonical-doc-outcome.md` | This file (new). |
| `ai/plans/.../tasks.md` | Task 5 checkbox + `5.QL` → `[x]`. |

## Files NOT Modified (and why)

- `test/**`, `backend/**`, `shared/**`, `app/**`, `frontend/**` — Task 5 scope is documentation only; a parallel subagent owns test files. Zero code touched.
- `docs/sessions/session-lifecycle.md` header (line 4 Status) and §10/§11/§12 — untouched: the Status line truthfully records what DEV3-004 shipped (not a pending annotation); §10 consumer-guidance rows for DEV3-012/013 remain accurate as guidance (the sweeper does reuse the same-lane refund primitive; plan-linked pricing stays DEV3-013's).
- §2.3 INV-S3 cell ("ZERO `teacher_transaction`/`wallet` writes exist in the lifecycle") — **left untouched, recorded as pre-existing staleness** (see Semantic-review note 5). Not a DEV3-012/013 pending annotation and not in REQ-7's enumerated scope; correcting it honestly would require re-verifying the grep-gating/journey-oracle claims machinery, which is outside this task's boundary. Flagged for Task 6 / a future doc pass.
- `deferred-items.md` — no new row: no genuinely out-of-scope WORK was discovered (the INV-S3/§10 observations above are pre-existing doc staleness recorded here as carry-forward knowledge, not deferred plan work; rows D1–D3 unchanged).

## Doc-Accuracy Verification (every written claim cross-checked against the tree @ 374184d)

| Doc claim (new) | Verified against |
|---|---|
| `sweepExpiredCompletedOnce(now, tx?)` — guarded batch UPDATE, `status=completed ∧ confirmed_by_student_at IS NULL ∧ confirmed_by_teacher_at < cutoff`, cutoff = captured `now` − `SESSION_CONFIRMATION_WINDOW_MS` (24h), **strict `<`** | `backend/db/repo/classes/session.repository.ts:447-461`; `shared/constants/session-fees.constants.ts:40` (`86_400_000`) |
| SET `status=cancelled, fee_held=false, updated_at` from the ONE captured instant; `RETURNING *`; re-run matches zero rows (terminal) | same repo lines (`SessionStatus.Cancelled`, `updatedAt: now`, `.returning()`); idempotence pinned by Task 1 tests (62/62) |
| Two legs compose inside `sweepExpiredSessions` on ONE transaction; refund walk covers the UNION; NULL `held_balance_lane` = nothing to refund | `backend/services/classes/session-lifecycle.service.ts:679-711` (`sweepExpiredScheduledOnce` → `sweepExpiredCompletedOnce` → `refundSweptHolds([...expiredScheduled, ...expiredCompleted], tx)`) |
| `confirmation_deadline` never touched (B.2 — window is sweep-time arithmetic on the recorded teacher stamp) | repo sweep predicate contains no deadline reference; outcome 1 confirms deadline untouched |
| `completeSession` prompt fires only when the guarded UPDATE matches (never denied/idempotent repeat); emitted on the owning transaction; published strictly post-commit on the flow-owned path; caller-tx receipt surfaces via `completeSessionWithReceipt` | `session-lifecycle.service.ts:290-373` (`completeSession` → `completeSessionWithReceipt`; `publishReceipts` gated on `tx === undefined` after `withTransaction` returns) |
| Sweep auto-cancel notice per completed-leg row; scheduled-expiry leg notification-free; batched post-commit publish; counts-only return | `session-lifecycle.service.ts:136-152` (`collectAutoCancelReceipts`), `679-711` (publish gate `outerTx === undefined && receipts.length > 0`; returns `{cancelled, refunded}` only) |
| Wave kinds `completion_prompt` / `completion_auto_cancelled`; row type `session_completion`; keys `session-completion-prompt:{sessionId}` / `session-completion-autocancel:{sessionId}`; recipient = student; copy in recipient's persisted locale | `backend/types/classes/session-notification.types.ts:10-18`; `backend/enum/notifications/notification-type.enum.ts:7` (`SessionCompletion = "session_completion"`); `backend/services/classes/session-request-notification.service.ts:198-207,340-360` |
| `disputed` reachable only from `scheduled`/`started` by either participant; hold frozen; dispute-from-`completed` → `SESSION_INVALID_TRANSITION`; admin resolution → `cancelled`+same-lane refund or `completed`+hold consumed | `session.repository.ts:79-85` (`buildLiveParticipantTransitionPredicate`), `254-268` (`openDisputeOnce` — no `feeHeld` write), `286-339` (`resolveDisputeCancelOnce`/`resolveDisputeCompleteOnce`); `session-lifecycle.service.ts:463-486` (`openSessionDispute` → probe classification), `529-591` (`resolveSessionDispute`); `session-lifecycle.transitions.ts:81-85` (`ConflictError("SESSION_INVALID_TRANSITION")`) |
| Confirm = student stamp + `fee_held=false` + wallet credit exactly once (same tx), idempotent | `session.repository.ts:359-369+` (`confirmStudentCompletionOnce` docblock), `session-lifecycle.service.ts:593-644` (`confirmSessionCompletion`) |

## 5.QL — Sub-loop result (recorded verbatim in spirit)

`bun run scripts/health/sub-loop.ts docs/sessions/session-lifecycle.md --lifecycle duplicates` → **exit 1 at the oxlint stage** — this is the script structurally rejecting a `.md` file, not a content defect (the task brief pre-authorized running and recording this):

1. Rule files printed: root `AGENTS.md` ✓ (read — no markdown-specific rules beyond the Important References list itself); "No applicable instruction files found" for docs.
2. **tsgo: PASSED** (project-wide run filtered for the doc — zero errors attributable to the file).
3. **oxlint: exit 1** — `No files found to lint. Please check your paths and ignore patterns. Finished in 67ms on 0 files` — oxlint has no markdown parser; a zero-file run is a hard failure (`sub-loop-checks.ts:124-130` runs `bunx oxlint … <file>` and requires a pass exit).
4. Reproduced the remaining stages directly for the record: `bunx @biomejs/biome check --write --unsafe --error-on-warnings docs/sessions/session-lifecycle.md` → exit 1, `No files were processed in the specified paths` (biome.json ignores markdown — same tooling-scope rejection). `check:duplicates` would be SKIPPED for a non-`.ts/.tsx` file per `shouldSkipJscpd` (`sub-loop-checks.ts:187-192`) — i.e. pass-by-skip. `lint:type-aware` is not reachable for a lone `.md` (the lint-service CLI takes no positional file args — verified exit 2).
5. Compensating structural verification (python): every table row's pipe count is column-consistent across all contiguous tables; exactly one mermaid fence pair (balanced); backtick count even (no unbalanced inline code).

No `.md`-specific lint configuration exists in this repo (oxlint/biome/eslint/jscpd all exclude markdown), so exit 0 is unattainable for a docs file by construction; the reduced-checks record above is the honest equivalent.

## Semantic-Review verdicts (task-applicable items)

1. **Every claim matches implemented behavior** — PASS (table above; nothing written from the plan text alone — each sentence was checked against the cited source lines).
2. **No plan-artifact references introduced beyond the doc's own ticket-annotation style** — PASS: the update uses the doc's established ticket-ID annotation style (DEV3-012/013/021, B.2/B.18) exactly as the doc already did; no REQ-*/Task/path references added.
3. **Section numbering/structure preserved** — PASS: no headings added, renumbered, or removed; new content rides inside §2.1/§2.2 (table rows, diagram edges, one clarifying sentence, one new table under §2.2) and one-clause corrections in §2.3/§4.
4. **Scope boundary** — PASS: `git diff --name-only` = `AGENTS.md`, `docs/sessions/session-lifecycle.md`, `ai/plans/.../outcome/5-canonical-doc-outcome.md`, `ai/plans/.../tasks.md` (checkboxes). No test/backend/shared files touched; no `.env` touched; no commit/push.
5. **Pre-existing staleness observed, NOT silently "fixed"** (declared, not silent): (a) §2.3 INV-S3 cell still describes the lifecycle as wallet-write-free — true of the DEV3-004 slice it describes, stale since the confirmation credit slice (`session-lifecycle.confirmation.ts`) landed pre-plan; (b) §10 DEV3-011 row ("Zero `notifications` rows are written here (D1)") similarly describes the DEV3-004 slice — the engine-mediated completion waves now exist one §-block away. Both are outside REQ-7's enumerated scope; correcting them belongs to a dedicated doc pass (candidate for Task 6's knowledge-propagation review, one clause each). Recorded here rather than half-fixed.
6. **Deferred work** — none: no `deferred-items.md` row added (nothing genuinely out-of-scope was discovered that constitutes work; see item 5).
7. **Clean writing** — new prose matches the doc's voice (em-dash rulings, bolded load-bearing terms, `∧`/`∈` notation, backticked identifiers); no trivial restatements.

## AGENTS.md reference-line decision (Task 5 item 4)

The line was verified and judged **in need of the minimal extension** recorded above: it enumerated the doc's coverage as DEV3-004-only while the doc now canonically documents the DEV3-012 handshake — an index line that omits the doc's new central content would misroute readers grepping for the sweep/waves. Nothing else on the line changed; all prior descriptors remain true.

## Carry-Forward Knowledge (for Task 6)

1. **Sub-loop cannot go green on markdown** — oxlint + biome hard-fail on zero processed files; jscpd skips non-TS. If the final gate (Task 6) re-runs per-file sub-loops over docs, expect the same tooling-scope exit 1 and use the reduced-checks record (tsgo pass + structural check) as the evidence pattern.
2. **INV-S3 cell + §10 DEV3-011 row** (§2.3/§10 of the lifecycle doc) are the two pre-existing staleness candidates a doc pass could refresh in one clause each (see Semantic-review item 5).
3. **The doc's mermaid now carries 12 edges** — any future state (e.g. DEV3-021 arbitration UX changes) must keep the diagram and the §2.2 table in lockstep; the table is the normative form, the diagram the overview.
4. Sandbox quirk (unchanged): HEAD auto-reverts to `main` between external invocations; every Bash batch here re-checked out `feat/dev3-012-dual-confirmation-completion-handshake` first and re-verified with `git branch --show-current`. `AGENTS.md` and the doc are byte-identical across `main` and the feature branch, so working-tree modifications survive the flips; `tasks.md` differs across branches and was edited on the feature branch only.
5. No git commit / no git push (orchestrator commits), per rules.

## Status

- [x] 5. Canonical doc update implemented (§2.1 + §2.2 + side-effect table + annotation resolution + AGENTS.md line)
- [x] 5.QL (sub-loop run and recorded; .md tooling-scope rejection documented with compensating structural checks)
- No git commit / no git push (orchestrator commits).
