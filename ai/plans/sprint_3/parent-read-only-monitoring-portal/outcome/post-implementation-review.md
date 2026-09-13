# Post-Implementation Review — Task 7.1

**Plan:** `ai/plans/sprint_3/parent-read-only-monitoring-portal/`
**Branch:** `feat/parent-read-only-monitoring-portal`
**Date:** 2026-09-13
**Scope:** `git diff --name-only origin/main...HEAD` (85 files — all plan-touched files)

## Review Wave Structure

Four parallel review subagents dispatched in a single response (per SKILL.md §Post-Implementation Review Wave):
1. **review-types** — type naming, duplicates, imports, enums, schema surface
2. **review-backend** — architecture, races, dead code, layers, authorization spine
3. **review-frontend** — UI components, styling, state, theme, fake-data audit
4. **security-review** — BOLA/IDOR, BOPLA, BFLA, denial oracle, injection, route guards

## Aggregated Findings (deduplicated, pre-existing filtered)

| # | Severity | File | Finding | Resolution |
|---|---|---|---|---|
| 1 | HIGH | 7 frontend containers/tabs | Error handling bypasses canonical `mapGraphQLErrorByCode` dispatcher — direct string comparison `errorCode === "FORBIDDEN" \|\| errorCode === "UNAUTHORIZED"` violates `frontend/AGENTS.md:65` | **FIXED** — replaced with canonical `mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback"` pattern in all 7 files |
| 2 | LOW | `parent-monitoring.helpers.ts:124,146` | `toSessionStatus`/`toSurahJuzRef` interpolate raw corrupt pgEnum value (`${raw}`) into Error message — inconsistency with sibling `toCanonicalLinkStatus` | **FIXED** — dropped `${raw}` interpolation |
| 3 | LOW | `parent-monitoring.service.ts:31` (JSDoc) | JSDoc says `undefined` for 4th arg but implementation passes `outerTx` | **FIXED** — JSDoc corrected |
| 4 | LOW | `ParentChildDetailContainer.tsx:97,143` | `ChildSwitcher` Select renders blank for foreign/unlinked `studentId` (UX noise, no data leak) | **ACCEPTED** — edge case on probe URLs; queries fail-closed via FORBIDDEN |
| 5 | LOW | `parentMonitoringDisplay.ts:34,48-51` | `SESSION_STATUS_LABEL_KEYS` value type overly permissive | **ACCEPTED** — runtime guard prevents crashes; tightening is nice-to-have |

## Grep-Lock Results (all PASS)

| Lock | Pattern | Expected | Result |
|---|---|---|---|
| INV-P2 (zero mutations) | `mutationField\|builder\.mutationField` in query module | 0 | ✅ 0 matches |
| INV-P2 (SDL) | portal names under `type Mutation` in schema.graphql | 0 | ✅ 0 matches |
| R-A (no parent_link_requests) | `parent_link_requests\|ParentLinkRequestRepository` in portal files | 0 | ✅ 0 matches |
| R-C/D2 (no evaluations) | `evaluations\|EvaluationRepository` in portal files | 0 | ✅ 0 matches |
| R-E (participant byte-unchanged) | `git diff` on session pothos/query files | empty | ✅ empty diff |
| BOLA (no client identity args) | `parentId\|parentActorId\|actorId` in query arg definitions | 0 | ✅ 0 matches |
| Injection (no sql.raw) | `sql\.raw` in new repo methods | 0 | ✅ 0 matches |

## Authorization Spine Verification

- **INV-P1** (every portal read through `requireLinkedChild`): ✅ VERIFIED — all 4 per-student methods call `requireLinkedChild` FIRST inside ONE `withTransaction` (D11 TOCTOU seal). `listLinkedChildren` is parent-scoped (no per-student gate needed).
- **INV-P2** (zero mutation fields): ✅ VERIFIED — all 5 GraphQL registrations are `queryField(...)`. Zero `mutationField` calls.
- **REQ-022** (denial oracle constant across 5 causes): ✅ VERIFIED — single `deny()` helper collapses malformed/nonexistent/foreign/never-linked/severed into ONE `ForbiddenError(t.forbidden)` with ONE bounded `logDomainError`. Context bag: `{ code: "FORBIDDEN", entity: "students", entityId: <studentId>, locale }` — zero child fields.
- **BFLA** (`$all` conjunction): ✅ VERIFIED — `authScopes: { $all: { authenticated: true, role: [UserRole.Parent] } }` on every field.
- **BOLA** (identity from context only): ✅ VERIFIED — identity from `ctx.user.id` only; no client-supplied identity args.
- **BOPLA** (output projection narrow): ✅ VERIFIED — projections expose ONLY plan §2.3 fields; zero billing/dispute/internal columns.

## Fix Phase

- 9 source files modified (7 frontend + 2 backend)
- 2 test files updated to match corrected behavior (helpers test regex + UI test UNAUTHORIZED assertion)
- All 318+ tests green after fixes
- tsgo 0 errors, biome 0 warnings, lint exit 0

## Test-Layer Coverage Gate

| Layer | Status | Count |
|---|---|---|
| Repository / DB logic | ✅ green | 93 pass (6.1) |
| Service unit | ✅ green | 126 pass (6.2) |
| Cross-actor journeys | ✅ green | 13 pass (6.5) |
| GraphQL integration (wire) | ✅ green | 27 pass (6.3) |
| UI components | ✅ green | 59 pass (6.4) |
| E2E | N/A (deferred D3 to DEV1-019) | — |

## Conclusion

**ZERO feature-specific findings remain.** The 1 HIGH finding (error dispatcher bypass) is fixed. The 2 LOW fixes (backend helpers + JSDoc) are applied. The 2 LOW accepted findings (ChildSwitcher blank, type permissiveness) are documented as acceptable edge cases with no correctness or security impact. All grep-locks pass. The authorization spine (INV-P1/INV-P2/REQ-022/BFLA/BOLA/BOPLA) is fully verified.

_Requirements: REQ-023, REQ-031, REQ-061_
