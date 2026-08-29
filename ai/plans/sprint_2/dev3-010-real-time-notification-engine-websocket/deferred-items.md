# Deferred Items Ledger

**Feature:** `dev3-010-real-time-notification-engine-websocket`  
**Plan Directory:** `ai/plans/dev3-010-real-time-notification-engine-websocket/`  
**Created:** `2026-08-28`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Emitter wiring per event type (engine emits; per-domain emitters NOT wired here) | 0.1 (DEV3-010 engine contract) | DEV3-011 / DEV1-016 / DEV1-017 / DEV2-016 / DEV3-012 / DEV3-013 / DEV3-022d | 🔄 Deferred | — | non-blocking, owning ticket recorded; forward item pre-seeded at baseline |
| D2 | Recipient-locale copy storage (localized notification copy) | 0.1 (DEV3-010 baseline) | future `users.locale` decision (users-schema owning ticket) | 🔄 Deferred | — | non-blocking, owning ticket recorded; requires future `users.locale` decision — NEVER patched inline |
| D3 | Production WS host provisioning (WebSocket host infra) | 0.1 (DEV3-010 baseline) | deployment workstream | 🔄 Deferred | — | non-blocking, owning ticket recorded; forward item pre-seeded at baseline |
| D4 | Multi-channel / unified-preferences integration | 0.1 (DEV3-010 baseline) | notification-preferences ticket | 🔄 Deferred | — | non-blocking, owning ticket recorded; forward item pre-seeded at baseline |
| D5 | GraphQL bearer-context governance window: `createGraphQLContext` verifies the JWT + loads the user row but does NOT re-check governance flags (unlike the fail-closed SSR boundary `getServerUserContext` and the session tier `login`/`refreshToken` → FORBIDDEN) — a governed caller (suspended/blocked/deleted) holding a pre-issued, unexpired access token retains its full SELF-SCOPED inbox surface (reads AND mark ops) until token expiry. Pinned deliberately by the 5.1 matrix suite; BOLA posture unchanged (foreign ids still answer NOTIFICATION_NOT_FOUND — pinned). Analogous to REQ-038's documented WS-socket JWT-only trade-off, but strictly wider (mark ops included). | 5.1 (GraphQL integration matrix — discovery pinned as the "documented governance window" test) | future governance-context gate ticket (cross-cutting auth surface; NOT notification-surface-specific per REQ-038 "no inbox-specific handling") | 🔄 Deferred | 5.1 matrix suite governed-caller tier (4 tests, ×2 deterministic runs) | non-blocking; when the governance context gate lands, the 5.1 matrix assertion flips deliberately (comment marks the flip point) |

| D6 | Coverage-target ruling: plan §5.4 mandates "100% statement/branch on ALL new modules" — NOT met as literally specified. (a) Branch% is unmeasurable with the bun 1.3.14 coverage toolchain (emits % Funcs/% Lines only; lcov carries no BRF/BRH). (b) Statement(line)% union-across-4-tier-runs: 12 modules at 100%, 10 below (81.48%–99.17%). Gap characterization: ~60% defensive/unreachable guards (repo returning-empty guard, idempotency corrupt-receipt null-guards, validation fail() on non-string body), ~20% non-executable attribution artifacts (jsdoc/class-decl lines v8 flags), and 4 REAL test seams: engine emitForUser own-commit idempotency store (L351-355), factory resolveFanoutSubscriptionSource (L58-60), ioredis client message-handler attach + subscribe/unsubscribe passthroughs (L32,50-56), realtime hook catch-up-refetch warn + non-string message guards. | 5.4 (coverage evidence run) | future test-hardening pass (closable seams enumerated above) | 🔄 Deferred | 5.4 coverage table (outcome/5.4-outcome.md §6) | non-blocking; raw evidence preserved (lcov snapshots /tmp/lcov-s1..s4, logs/2026-08-29T19-*); type-only modules (backend/types/notifications/**) are statement-coverage N/A by nature |
> **D1–D4 are pre-seeded non-blocking forward items with owning tickets; D5 was added at Task 5.1 (pinned discovery — see Notes); D6 was added at Task 5.4 (coverage ruling). Final gate `grep -c "❌\|⚠️"` excludes them (all 🔄).**

## Resolved Dispositions (plan-review rulings — administrative, non-blocking)

| ID | Finding (source) | Disposition | Ruled By | Date |
|---|---|---|---|---|
| B1 | `backend/db/repo/notifications/` namespace does NOT pre-exist (plan assumed "extend existing") | Task 2.4 re-scoped: **CREATE** the notification repository namespace fresh following sibling repo patterns (`backend/db/repo/parents/` etc. per `backend/db/repo/AGENTS.md`); all 7 plan methods are net-new; no existing code depends on the namespace | Orchestrator (Task 0.2 audit + 0.3 plan-review A2) | 2026-08-29 |
| A1 | No cache adapter code exists yet (`backend/services/redis/` README-only) | Engine (Task 2.6) defines + injects its own idempotency-claim cache port; mocked in tests — consistent with plan D4/D5 | Task 0.2 audit | 2026-08-29 |
| A2 | No `env-config-keys.ts` registry file; effective seam is `backend/lib/env.ts` (`resolveEnvConfig` + `resetEnvironmentCache`) | Task 1.5 registers new WS/fanout keys in the existing `backend/lib/env.ts` seam (dev3-003 precedent — registration not a separate registry file) | Task 0.2 audit | 2026-08-29 |
| A3 | `withPageAuth` does not exist; actual guard = client-side `DashboardLayout` `useAuth()` redirect | Task 4.3 server shell follows the ACTUAL `app/(dashboard)/` page conventions (server component + getTranslations delegating to client container guarded by the dashboard layout) | Task 0.2 audit + 0.3 review A4 | 2026-08-29 |
| A4 | No `Translation` enum in codebase; i18n convention = `defineNamespace("notifications", …)` handle | Task 1.4 registers namespace via `defineNamespace` handle; frontend consumes via that handle (NOT a `Translation` enum import) | 0.3 plan-review | 2026-08-29 |
| A5 | Canonical test runner path = `bun run test/scripts/run-test.ts` (plan refs to `scripts/run-test/run-test.ts` are stale) | All TE subtasks use `bun run test/scripts/run-test.ts <path>` | 0.3 plan-review | 2026-08-29 |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
