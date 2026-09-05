# Task 2.M Outcome — Mid-Point Review Gate

## Mechanical gates (orchestrator-verified)

| Gate | Result | Baseline | Status |
|---|---|---|---|
| `bunx tsgo -b --noEmit` errors | 0 | 0 | ✅ parity |
| `bun run biome:check` diagnostics | 0 (exit 0) | 0 | ✅ parity |
| Journey suite (A–D) | 8 pass / 0 fail | RED by design pre-2.6 | ✅ GREEN (flip complete, zero assertion changes) |
| Repo suite | 30 pass / 0 fail | — | ✅ |
| Service suite | 16 pass / 0 fail | — | ✅ |
| `git diff -- backend/db/schema/ backend/db/migration/` | EMPTY | EMPTY | ✅ (read-only ticket honored) |
| `git diff -- backend/db/repo/admin/admin-user.repository.ts` + `user-management.service.ts` | EMPTY | EMPTY | ✅ (reuse-not-rebuild honored) |
| deferred-items ❌/⚠️ rows | 1 (DI-0.2-1 ⚠️ — resolves at Task 4.4) | — | ✅ no unlogged blockers |

## Independent review (backend + types scope) — round 1

Verdict: **no CRITICAL, no HIGH**. 4 MEDIUM + 2 LOW findings; all MEDIUMs fixed and re-verified:

1. [MEDIUM] raw-branch trend SQL TZ-dependence → fixed (`date_trunc(...) AT TIME ZONE 'UTC'`; probe-verified under TZ=America/New_York)
2. [MEDIUM] missing cross-branch parity pin → fixed (`expect(raw).toEqual(viaTx)` in `probeBothBranches`, all 10 Tier-1 sites)
3. [MEDIUM] repo sub-barrel registration missing → fixed (`backend/db/repo/admin/index.ts` gains the star export; tsgo clean)
4. [MEDIUM] plan-artifact references in journey comments (incl. one stale) → reworded behavior-only; grep now 0 matches
5. [LOW] helpers-file split deviation (max-lines) → accepted, documented in 2.5 outcome
6. [LOW] scratch probes → removed

## Post-fix verification (all green)

- sub-loop `--lifecycle duplicates` exit 0 on: query-helpers, repository, repo index, repo test, journey test (service + its test already 0)
- repo 30/30 · journeys 8/8 · service 16/16 · tsgo 0
- Plan-artifact grep across repo+helpers+journey: 0 matches

## Semantic self-review (Phases 1–2)

Layering clean (no cross-layer imports; repo never imports service) · read-only surface (zero writes anywhere in repo/service) · no mutable module state · SQL fully parameterized (statically pinned) · metric semantics match plan §4.1 with exact test pins · Rulings 1–4 honored (R2 gate-first literal first statement) · money strictly string end-to-end · aggregate types carry no `id` · honest-null/EMPTY preserved.

## Forward item logged

D-5 (📅 Forward, non-blocking): repo-suite fixtures are TZ-sensitive on non-UTC hosts (7 pre-existing fixture-path failures under TZ=America/New_York; trend parity holds; sanctioned test hosts run UTC). Follow-up: entity-setup timestamp normalization — deferred to test-hardening stream.

## Carry-forward

Phase 3 consumes: `PlatformAnalyticsService.getPlatformAnalytics(actorId, locale, outerTx?)`, `PlatformAnalyticsReturnType` (generatedAt + 8 sections + 2 trend arrays), eleven type names for Pothos/SDL, RULING 2 denial observables for the wire matrix.
