# Deferred Items Ledger

**Feature:** `dev3-006-session-report-homework-infrastructure`  
**Plan Directory:** `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure`  
**Created:** `2026-09-05`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | `SurahJuzRef` enum completeness (expand 5 surah examples → all 114 surahs) | specs §Traceability | curriculum/content stream | 📅 Forward (DEFERRED) | — | Owner: curriculum/content stream. Only 35 members (5 surah + 30 juz) ship in this ticket. |
| D2 | Parent report read surface (parent `sessionReport`/`sessionHomework` visibility via `students.parent_id`) | specs §Traceability | DEV1-016 (parent portal) | 📅 Forward (DEFERRED) | — | Parent reads stay `null` by design in this ticket. |
| D3 | Teacher report submission/browsing UX (submit form, report views) | specs §Traceability | DEV2-014 | 📅 Forward (DEFERRED) | — | This ticket ships typed GraphQL documents only. |
| D4 | Aggregating `teacher.average_rating` from `reports.student_rating_by_teacher` | specs §Traceability | DEV2-017 | 📅 Forward (DEFERRED) | — | Owner: DEV2-017 rating aggregation. |
| D5 | Edit/amend/void semantics for submitted reports (compensating-artifact flow; append-only by design here) | specs §Traceability | future ticket | 📅 Forward (DEFERRED) | — | Submission is append-only truth (D10 of plan.md). |
| Wire-Suite-CI | GraphQL wire-suite EXECUTION (suite authored + structurally verified; runner skips all GraphQL suites under DB_PROVIDER=pglite by design — runs in CI with real postgres) | 5.1 | CI environment | 📅 Forward (environmental) | orchestrator | Non-blocking: in-sandbox compensating controls listed in outcome/5.1-outcome.md |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
