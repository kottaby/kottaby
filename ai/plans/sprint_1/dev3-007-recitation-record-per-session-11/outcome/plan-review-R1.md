# Plan Review Gate — Round 1 (Phase 1.5)

**Scope reviewed:** `ai/plans/sprint_1/dev3-007-recitation-record-per-session-11/{specs.md, plan.md, tasks.md, deferred-items.md}` (planning artifacts only — implementation has not started).

**Layer AGENTS.md read:** `backend/types/`, `backend/db/repo/`, `backend/services/`, `backend/graphql/`, `frontend/graphql/`, `frontend/graphql/sharedDocuments/`, `shared/`, `test/workflows/` — plus root `AGENTS.md`.

## Findings & Fixes Applied

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | `plan.md` truncated mid-sentence in §3.3 (model max_tokens) — missing query resolver, permission matrix, service/repo signatures, concurrency assessment, journey design, UX/Nav spec, security section | HIGH | Plan completed with all mandatory sections (§3.3–§6) appended on top of existing content |
| 2 | `plan.md`/`specs.md` cited stale line refs (`session-lifecycle.guards.ts:27-34`, `governance.ts:8-22`) and invented type `LocaleType` | MEDIUM | Verified via grep; corrected to `guards.ts:111-135`, `governance.ts:39-62`, `locale: string` |
| 3 | `specs.md` §2.2 header advertised `REQ-010 … REQ-024` but the section ends at REQ-018 (traceability orphan) | LOW | Header corrected to `REQ-010 … REQ-018`; zero uncovered REQ IDs |
| 4 | `plan.md` §4.1/§4.2 used `export const` objects; layer convention is `export namespace X` (`session.repository.ts:67`, `session-lifecycle.service.ts:117`) | MEDIUM | Both code contracts rewritten as `export namespace` |

## Verified Compliant (spot-checked against rules + code)

- **Types**: additive extension of `backend/types/classes/recitation.types.ts`; no service-layer `.types.ts`; no local resolver types ✓
- **Repo layer**: `queryDb(tx)` Neon-HTTP cold path (no prepared statements), `tx` last-param, namespace-per-file, tests colocated in `repo/classes/__tests__/` (existing precedent) ✓
- **Services**: `getServerTranslations(locale)` single-arg (code-verified), no `NotificationEngine`/`AuditService` imports, single-writer discipline ✓
- **GraphQL**: `$all` conjunction scope documented in `backend/graphql/AGENTS.md` matches plan §3; `sessionById` collapse precedent cited correctly; new codes via DomainError subclasses ✓
- **Frontend documents**: `sharedDocuments/scheduling/` exists with domain barrels; camelCase `*QueryDocument`/`*MutationDocument` naming matches convention; apolloCache frozen ✓
- **Workflows**: `test/workflows/sessions/` + helpers/`AGENTS.md` exist; plan's committed-fixture/spy rules match the layer AGENTS.md ✓
- **Forbidden patterns**: no `Translation.` enum, no two-arg `getTranslations`, no `@/frontend/utils/logger`, no raw `bun test`, no bottom-nav, no invented file paths ✓

**Verdict: Plan passes all AGENTS.md rules for affected layers** (after the four fixes above).
