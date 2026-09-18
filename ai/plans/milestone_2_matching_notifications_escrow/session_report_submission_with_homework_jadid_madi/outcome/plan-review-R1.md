# Plan Review — Round 1 Record (Phase 1.5 Gate)

**Plan:** `ai/plans/milestone_2_matching_notifications_escrow/session_report_submission_with_homework_jadid_madi/`
**Reviewed:** 2026-09-17 · **Reviewer:** plan-review skill workflow (isolated audit subagent, 2 rounds, read-only)
**Inputs:** `specs.md` · `plan.md` · `tasks.md` · `deferred-items.md` (all four, fully read both rounds)

---

## Verdict

**R1 → findings → fixes → R2: "Plan passes all AGENTS.md rules for affected layers."**

Round 1 found 6 issues (1 HIGH operational defect, 1 HIGH rule violation, 2 MEDIUM, 2 LOW). All fixed before round 2; round 2 confirmed 6/6 RESOLVED with one NEW LOW cosmetic finding, which was fixed in this same pass. Round 2's closing verdict: **"Plan passes all AGENTS.md rules for affected layers."**

## Claim verification (R1, load-bearing citations spot-checked against the code)

All 10 load-bearing claims VERIFIED: `listForStudent`/`countForStudent` (`home-work.repository.ts:232,293`), `SessionTransitionProbeRowType` (`session.types.ts:72`), `requirePositiveIntId` (`resolver-guards.ts:19`), parent role-gate shape (`parent-monitoring.query.ts:102-106`), `withTransaction` repeatable-read support (`with-transaction.ts:39,50`), `SessionRowAction` id union (`sessionRowAction.ts:15`), `SessionsLabels` trio typing (all three files), codegen `SurahJuzRef` (`generated/gql/graphql.ts:350`), `assertPositiveSafeSessionId` (`session-lifecycle.guards.ts:123`), `studentId` on teacher session rows (`session-reads.documents.ts:117`). Plus ~15 secondary citations (repo probes, pothos precedents, journey seams, dialog idioms) — all real.

## Findings & resolutions

| # | Severity | Finding | Resolution |
|---|---|---|---|
| F1 | HIGH (operational) | `specs.md` on disk was truncated to its final section — the REQ-0..REQ-9 requirements core was missing (root cause: a chunked append landed without append-mode during generation, overwriting chunks 1-4; caught by the R1 audit's structure check, not visible from the writer's intent). | File fully rebuilt in 5 verified chunks; R2 confirmed 237 lines with Introduction/Scope/REQ-0..REQ-9 EARS/UX-Nav/Journey/NFR/Success/Glossary/Checklist and AC-number parity with every tasks.md citation. |
| F2 | HIGH (rule) | New id-less `StudentHomeworkPage` wrapper missing the mandatory `typePolicies` registration (`keyFields: false`) in `frontend/providers/apollo/apolloCache.ts` (frontend/graphql AGENTS.md "Embedded type normalization policy"; precedent `apolloCache.ts:114-115`). | Added in three places: specs REQ-4 AC 6, plan §8.I (new component section), tasks Task 2.6 + layer-mapping row + 2.QL file list. |
| F3 | MEDIUM | tasks.md layer-mapping row for the wire-test file omitted `backend/graphql/AGENTS.md`. | Wire-test file folded into the pothos/query row that already carries it. |
| F4 | MEDIUM | Task 4.3 mount-sequencing sentence was garbled ("commented-out-no") and could mislead an executor into shipping commented-out stubs. | Rewritten with an explicit sequencing rule: Task 4 = union + arms + slot + handlers; Task 5 = dialog component + its single mount line; no stubs, no commented-out code. |
| F5 | LOW | Task 0 baselines only in `/tmp` (scratch; invisible to Task 7's git-diff regression audit). | Durable-record instruction added: all three counts copied verbatim into `outcome/0-baseline-outcome.md` (specs REQ-0 AC 1 mirrors it). |
| F6 | LOW | plan §5 licensed free i18n key renaming, risking drift for keys consumed verbatim by Task 4. | `sessionReportAction`/`viewHomeworkAction` pinned by name; all other consolidation constrained to atomic trio + parity-registry renames within one task. |
| F7 | LOW (new in R2) | specs REQ-5 AC 5 cited `role={"teacher"}` at `TeacherSessionsBody.tsx:124`; actual code threads `role={role}` at line 123 from the container's `rowRole` (`TeacherSessionsContainer.tsx:214`). | Citation corrected to the real threading shape + lines. |

## R2 re-audit results

- Traceability grep audit run verbatim from the plan directory: **zero MISSING** (REQ-0, REQ-0.5, REQ-1…REQ-9 all in tasks.md; reverse direction holds).
- plan.md mandated sections all present: Overview+decisions (§1-3), Data Models (§9), API Contracts+SDL+permission matrix (§10), Services/Repo signatures + concurrency assessment (§6, §8) + Journey Design (§7), UX/Nav (§4), Security/Tenancy (§11). Ends complete.
- Anti-pattern sweep clean: no `Translation.` enum usage, no two-arg `getTranslations`, no `@/frontend/utils/logger`, no raw `bun test` on workflow suites (run-test wrapper only), no bottom-nav instructions (prohibitions only), no `next-intl`, no `console.*`, AGENTS.md referenced only as do-NOT-edit.
- All four files end complete — no mid-sentence truncation.

## Carry-over for executors

- The audit's structure check caught a generation-time truncation that the writer's own tail-check would have reported as complete (the surviving section ended cleanly). Executors MUST re-run the truncation + traceability audits after ANY plan-file edit.
- `bun run generate:gqlSchema && bun codegen` is mandatory after Task 2's schema/document changes before any frontend consumption.
- Task 2.6 (apolloCache typePolicy) is a hard gate for Task 5's dialog — shipping the dialog without it trips cache normalization warnings on every history read.
