# Plan Review R1 — DEV3-012 Dual-Confirmation Completion Handshake

**Plan:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
**Round:** R1 · **Date:** 2026-09-05 · **Reviewer:** plan-review skill workflow

## Affected Layers Identified

`backend/db/repo/classes/` (repo) · `backend/services/classes/` (services) · `backend/types/classes/` (types) · `shared/locale/**` (i18n) · `test/workflows/sessions/` (journey tests) · `docs/sessions/` (canonical doc). Layer AGENTS.md read: root, `backend/AGENTS.md`, `backend/db/repo/AGENTS.md`, `backend/services/AGENTS.md`, `backend/types/AGENTS.md`, `shared/AGENTS.md` conventions, `test/workflows/AGENTS.md`, `backend/db/test/AGENTS.md`.

## Rule-Dimension Checks

| Dimension | Verdict | Evidence |
|---|---|---|
| Types from `@/backend/types` only; no local Pothos types | ✅ pass | EXTEND of `backend/types/classes/session-notification.types.ts` (verified, 6-kind union at lines 5–11); no new Pothos types |
| Service boundaries (services in resolvers/direct) | ✅ pass | No resolver changes; one-caller model unchanged |
| GraphQL documents / Apollo hooks | ✅ pass | No new frontend docs or hooks; existing `useStudentSessionConfirm` cited as EXISTING |
| i18n compile-time system | ✅ pass | Locale edits target the three-file triplet (`types/notifications/index.ts`, `en/notifications/index.ts`, `ar/notifications/index.ts`); parity test cited and exists (`shared/locale/notifications-namespace.parity.test.ts`); services use `getServerTranslations`; anti-pattern sweep clean (no `Translation.` enum, no two-arg `getTranslations`, no `next-intl`) |
| Logging (`logger`, never `console.*`) | ✅ pass | Plan mandates existing `logger.logDomainError` patterns |
| DB test conventions (`runInRollback`, `tx`, no `.rejects.toThrow`) | ✅ pass | Tasks mandate them; journey layer explicitly exempt with real-DB contract per `test/workflows/AGENTS.md` (both cited docs verified present) |
| Guarded-transition single-writer rule (sessions) | ✅ pass | New `sweepExpiredCompletedOnce` is ONE guarded UPDATE; no second write path |
| Notification engine single-writer + publish-after-commit | ✅ pass | Receipt contract honored; verified `notification-engine.service.ts:117` export and service docblock (line 15) |
| Oracle ruling (sessions collapse) | ✅ pass | No new read surfaces; foreign-caller citences remain `SESSION_NOT_FOUND` |

## Citation Audit (grep/view-verified)

- `session.repository.ts:163` completeSessionOnce ✅ · `:240` openDisputeOnce ✅ · `:369` confirmStudentCompletionOnce ✅ · `:409` sweepExpiredScheduledOnce ✅ · `:117` findWaveContextById ✅
- `session-lifecycle.service.ts:241/:352/:418/:521/:554` ✅ · `confirmation.ts` credit slice ✅ · `transitions.ts:209` refund primitive ✅
- Schema `session.ts:60,65,68-70` ✅ · enums.ts:23 ✅ · `session-status.enum.ts` ✅ · `held-balance-lane.enum.ts` ✅
- `session-fees.constants.ts` `SESSION_CONFIRMATION_WINDOW_MS=86_400_000` ✅
- GraphQL field `confirmSessionCompletion` (`session-lifecycle.mutation.ts:293`; SDL test `schema-surface.test.ts:1349`) ✅
- `app/api/cron/sweep-sessions/route.ts` ✅ · `frontend/views/student/sessions/useStudentSessionConfirm.ts` ✅
- Lineup of locale keys (`en/notifications/index.ts:39-52`) ✅; `NotificationType.SessionCompletion` enum member ✅; contract union includes it ✅

## Findings & Fixes Applied in R1

1. **Sprint mislabeled** — ticket table reads `| **Sprint** | 2 |`; plan header initially said 3. Fixed in `specs.md` (self-caught during traceability pass).
2. **Ticket AC 4 divergence** (student disputes a *completed* session) vs canonical state machine — resolved by design ruling D-DEV3-012-2 and ledger row D1 (owned by DEV3-021 surface decision).
3. **Deadline-vs-teacher-stamp ambiguity** — ticket test note says confirmation_deadline = now+24h; canonical rule says never re-armed. Resolved by D-DEV3-012-1: post-completion timeout is a sweep-time predicate on `confirmed_by_teacher_at`, zero deadline rewrites.

## Structural Audit

- Truncation: all four artifacts end on complete sections (last lines checked). ✅
- Structure: plan.md contains Overview+decisions, Data/State model, API contracts & permission matrix, service/repo signatures, concurrency assessment, cross-actor journey design, UX/no-UI ruling, security/error handling. ✅
- Traceability: `for r in $(grep -oE 'REQ-[0-9]+(\.5)?' specs.md | sort -u); do grep -q "$r" tasks.md ...` → zero MISSING. ✅
- Anti-pattern sweep: no prohibited constructs in plan text (grep negative). ✅

## Verdict

**Plan passes all AGENTS.md rules for affected layers.** No remaining violations. Ready for implementation per `tasks.md`.
