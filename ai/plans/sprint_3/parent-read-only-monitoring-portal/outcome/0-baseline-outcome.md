# Outcome 0 — Phase-0 Baseline Record

**Plan directory:** `ai/plans/sprint_3/parent-read-only-monitoring-portal`
**Date:** 2026-09-11
**Author:** Spec Plan Generator

## Purpose

Phase-0 capture: the measured quality baseline BEFORE any implementation begins, so implementation-phase findings can be separated from pre-existing issues (REQ-001 §1). Research backing: `outcome/research-00-planning-basis.md` (5 read-only research agents, 2026-09-11).

## Baseline measurements (measured 2026-09-11, artifacts in `/tmp/baseline-pp/`)

| Command | Artifact | Result |
|---|---|---|
| `bun tsgo` (error count captured) | `/tmp/baseline-pp/tsgo.txt` | **0 errors** |
| `bun biome:check` (warning count captured) | `/tmp/baseline-pp/biome.txt` | **0 warnings** |
| `bun run scripts/lint-service.ts --json --id baseline` (full-repo) | `/tmp/baseline-pp/lint.json` | `success: true`, `exitCode: 0` |

Interpretation: the tree is GREEN at baseline. Any tsgo/biome/lint failure appearing during implementation is attributable to this plan's changes and must be fixed before closeout (per-stage `sub-loop.ts` discipline in `tasks.md`).

## Artifacts created at Phase 0

- `ai/plans/sprint_3/parent-read-only-monitoring-portal/specs.md` — requirements (EARS, REQ-001..REQ-062) with Phase-0 ground-truth table verified against the live tree (every `path:line` re-probed by the spec author).
- `ai/plans/sprint_3/parent-read-only-monitoring-portal/deferred-items.md` — ledger pre-seeded D1..D4 (all 📅 Forward), zero ❌/⚠️ at authoring time.
- `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/0-baseline-outcome.md` — this record.

## Verification notes (research packet vs live tree)

The research packet was accurate in substance. Three line-citation corrections were made while authoring the specs (all packet-claims otherwise verified):

1. `students_parent_id_idx` is at `backend/db/schema/students/students.ts:41` (packet said "~:33").
2. Namespace registry object spans `shared/locale/namespaces/registry.ts:27-47` (packet said `:28-50`).
3. The `/parent/children` ComingSoon component body is at `app/(dashboard)/parent/children/page.tsx:16-22` (packet cited `:14-25`; same file, stub confirmed).

## Carry-overs to plan.md / tasks.md

- Follow rulings R-A .. R-J exactly as specified in `specs.md` §6.2 — they bind design deliberation (grant source, attendance derivation, evaluations source, progress source, untouched participant-only queries, denial codes, multi-child switcher, routes, deep-link contract, no schema change).
- New code surfaces are CREATE-only for types (`backend/types/`), one repo read family, the `requireLinkedChild` gate, the parent-scoped GraphQL queries, routes, namespace, and tests — the plan must keep the schema-change count at ZERO (ruling R-J) and verify schema-parity holds.
