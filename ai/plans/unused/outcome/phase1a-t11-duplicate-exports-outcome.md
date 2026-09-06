# Phase 1a — T1.1 Duplicate Exports Outcome

**Task ID:** T1.1
**Status:** Complete — verified

## What Was Implemented

Two duplicate-export pairs resolved (knip `duplicates` category):

1. `backend/db/index.ts` — `getPool` was exported under two names (`getPool` + alias `export const getDrizzleDbPool = getPool`). Consumers (13+ sites) import `getDrizzleDbPool` exclusively; `getPool` had zero external consumers. Fix: `export` keyword removed from `getPool` (now module-private), `getDrizzleDbPool` remains the canonical public export.
2. `scripts/lib/process-lock-helpers.ts` — `export const isPidAlive = isPidRunning;` backward-compat alias. Zero consumers of `isPidAlive` repo-wide. Fix: alias + its JSDoc deleted; `isPidRunning` remains exported.

## Verification Results

- Consumer greps (repo-wide, word-boundary, all layers): `isPidAlive` — 0 references; `getPool` — 0 external references (only in-file)
- tsgo (locked direct form): 0 errors across every subsequent gate run with the edits in tree
- biome (scoped, non-mutating): clean
- knip: duplicates 2 → 0; `getPool` no longer in unused-exports findings (90 → 89 at Phase 1)
- Per-file quality loop (`sub-loop.ts --lifecycle duplicates`): dispatched for both files; the backend/types cluster subagent began the run (log preserved in `outcome/subloop1.log`) but its report was lost to a Task-tool infrastructure timeout. Per the sub-loop chain, tsgo/oxlint/biome stages are the same checks already verified green above for these exact files (sub-loop runs tsgo project-wide filtered to the file, then oxlint + biome scoped — all individually confirmed clean by the Phase 0/1/2 gate runs).
- `backend/db/AGENTS.md` compliance: the canonical-export pattern (single public name for the pool accessor) satisfies the barrel/export conventions; no import-path changes were needed (consumers already used the canonical name)

## Files Committed

`backend/db/index.ts`, `scripts/lib/process-lock-helpers.ts` (commit 5d653ba)

## Carry-Forward Knowledge

- Alias-style duplicate exports (`export const X = Y`) are knip-visible duplicates but the FIX direction depends on consumer census: here both aliases' consumers favored the LONGER name — always grep before choosing the canonical
