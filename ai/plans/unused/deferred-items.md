# Deferred Items Ledger

**Feature:** `clean-unused`  
**Plan:** `ai/plans/unused/`  
**Created:** 2026-09-06

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Broken scripts `test:live-fx` / `test:live-comm` (package.json) — `--preload` files that were never committed and target test dirs (`test/integration/fx/`, `test/integration/communication/`) that never existed | T1.3 | T6.1 / orchestrator (needs AGENTS.md-capable task) | ❌ Blocked | — | Kept per T1.3 ambiguous-evidence rule: root + nested AGENTS.md files reference the scripts; removal must be paired with D2 doc cleanup. Static repro: `bun --preload ./test/integration/preload/live-fx-preload.ts -e "1"` → `preload not found` |
| D2 | Stale AGENTS.md references to non-existent `test/integration/{preload,fx,communication}` surfaces: root `AGENTS.md:47-48`, `test/integration/AGENTS.md:35-36,51,94-95`, `backend/services/AGENTS.md:58-59` | T1.3 | T6.1 / orchestrator | ❌ Blocked | — | Docs describe a test surface that never existed in git history; clean together with D1 |
| D3 | `bun run tsgo` full chain hangs in sandbox: `scripts/restore-next-env-dts.ts` completes its work but never exits — PGlite singleton (initialized via `@/scripts/lib` barrel → `@/backend/db` import side-effect under `DB_PROVIDER=pglite`) keeps the event loop alive | T1.3 | T6.2 / tooling | ❌ Blocked | — | Repro: `timeout 45 bun run scripts/restore-next-env-dts.ts` → exit 124 after "PGlite initialized successfully". Workaround (verified exit 0): `bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit`. Fix: explicit `process.exit(0)` or break barrel side-effect import. CI unaffected (runs raw `bun tsgo`) |
| D4 | Dead `biome.json` override for `app/**/error.tsx` (matches no file) — from Phase 0 §5.11 phantom-reference list | T1.3 | Phase 5 / lint convergence | ❌ Blocked | — | `app/**/error.tsx` never existed; biome.json was outside T1.3 edit scope |
| D5 | VercelObservability.tsx is a knip-flagged unused file; deleting it orphans `@vercel/analytics` + `@vercel/speed-insights` (currently kept + ignoreDependencies) | T1.2 | Phase 2 (unused files) | ✅ Done | phase2-t22-files-deletion-outcome.md | Executed as one paired changeset in T2.2: file deleted + both deps removed from package.json + both ignoreDependencies entries (with comment block) dropped from knip.config.ts + single `bun install` synced bun.lock ("Removed: 2"); repo-wide vercel references now zero |
| D6 | `lint-staged` (husky pre-commit is empty) and `@cspell/eslint-plugin` (only a commented-out import in eslint.config.mjs) have zero live references but pre-existing ignoreDependencies entries | T1.2 | Phase 4 (second-order) | 🔄 In Progress | — | Remove packages + their ignore entries in the convergence wave |
| D7 | `@types/jest` remains while `jest`/`ts-jest`/`ts-node` were removed (knip does not flag it) | T1.2 | Phase 4 (second-order) | 🔄 In Progress | — | Remove `@types/jest` with the next dependency pass |
| D8 | Stale docs/comments after dep removals: `backend/graphql/pothos/builder.ts:15-17` (lists 6 removed pothos plugins as installed), `README.md` (BullMQ/pg-boss), `backend/AGENTS.md` + `backend/services/AGENTS.md` (queue-adapter.factory.ts + resend/twilio/FCM adapters that don't exist in code), `.env.example:158` cron-parser comment | T1.2 | Docs refresh wave | 🔄 In Progress | — | Text-only edits; batch after code phases |
| D9 | `prebuild` script references missing `scripts/build/generate-vercel-config.ts` (pre-existing breakage) | T1.2 | Phase 6 (build verification) | ❌ Blocked | — | Fix script or restore the file before final build gate |
| D10 | `@vercel/functions` removed as unused; `docs/notifications/realtime-engine.md` deferred option (b) (WebSocket upgrade route) would require re-adding it | T1.2 | Deferred decision | 🔄 In Progress | — | Re-add only if that deployment path is chosen |
| D11 | Paired docs pruning for `frontend/lib/auth/requireRoleForPage.ts` deletion (T2.1 verdict: DELETE): `docs/auth/jwt-authentication-service.md` (§2.7, §226-230, §388-394 — helper documented as shipped SSR guard), `docs/auth/REDIRECT_LOOP_FIX.md:211` table row, `backend/lib/auth/server-auth.ts:11` comment ("e.g. withPageAuth, requireRoleForPage") | T2.1 | T2.2 / D8 docs wave | ✅ Done | phase2-t22-files-deletion-outcome.md | All doc prunings shipped in the same changeset as the deletion: jwt-authentication-service.md (auth flow §2.2, §2.6, §2.7 helper block, §3.4 SSR rules, §4 boundary rule, §5.4 parity table, §6 shipped-surface summary), REDIRECT_LOOP_FIX.md call-site table row removed, server-auth.ts:11 comment now lists `withPageAuth` only |
| D12 | Paired AGENTS.md pointer/example edits for `shared/lib/enum.ts` + `shared/lib/safe-url.ts` deletions (T2.1 verdict: DELETE): `backend/db/schema/AGENTS.md:38` + `backend/db/seeds/AGENTS.md:63` ("Check backend/db/schema/enums.ts or shared/lib/enum.ts" — drop the dead alternative), `shared/AGENTS.md:17/26/74` (isSafeUrl import examples — swap to a live file, e.g. `@/shared/lib/email`), `shared/AGENTS.md:41` file-org table (lists non-existent `social-links.ts`, `phone/`, `logger/`) | T2.1 | T2.2 / D8 docs wave | ✅ Done | phase2-t22-files-deletion-outcome.md | All shipped in the same changeset as the deletions: schema+seeds AGENTS.md enum-verification rules now point at `backend/db/schema/enums.ts` only; shared/AGENTS.md positive/negative/extracting examples swapped to live symbols (`isValidEmail` from `@/shared/lib/email`, `isSafeRedirect` from `@/frontend/lib/safeRedirect`); file-org table `shared/lib/` row examples now all live files (`email.ts`, `mask-full-name.ts`, `isolate-bidi.ts`, `locale/`, `timezone/`) — this also incidentally clears the D13 `shared/AGENTS.md:41` sub-item |
| D13 | Phantom references surfaced by the T2.1 proof: `.env.example:421-436` appearance block (references non-existent `backend/services/appearance/appearance-settings.service.ts` + `DEFAULT_APPEARANCE_FIELDS`), `shared/schemas/appearance.schema.json:5` ("mirrored from backend/types/appearance.types.ts" — stale after deletion), root `AGENTS.md:448-450` (docs/backend/types-consolidation.md + docs/architecture/import-export-conventions.md absent), `codegen.ts:4-7` (references non-existent `@/frontend/types/localized-string.types`), `shared/AGENTS.md:41` (non-existent shared/lib entries) | T2.1 | D8 docs refresh wave | 🔄 In Progress | — | All are doc/config strings with no compiler guard (ai/, .env, json, md are outside tsgo); batch with the existing stale-docs list |
| D14 | Root `AGENTS.md:126-133` barrel mandate ("every nested subdirectory that has exportable modules MUST have its own index.ts" + "always import from the highest available barrel", initial commit 486547d) contradicts the shipped deep-import practice (commit 1723cfc: "explicit paths instead of barrel imports"; shared/AGENTS.md:34 "prefer deep imports"). 15 of the 38 knip-flagged files are dead barrels existing only for the old convention | T2.1 | D8 docs wave / orchestrator decision | 🔄 In Progress | — | T2.1 verdict keeps the barrel deletions (type-safe; tsgo verifies), but the convention doc must be refreshed or the orchestrator must veto the barrel-class deletions before T2.2 runs |
---

## Status Values

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on

---

## Usage Guidelines

### When to Add a Deferred Item

Add a row to this table when:
1. A task discovers work that belongs to a different task/phase
2. A technical constraint requires splitting work across tasks
3. A dependency is discovered that blocks immediate completion
4. A TODO comment is added to code with "deferred to Task X"

**Format:**
```markdown
| D<next-id> | <Brief description> | <source-task-id> | <target-task-id> | ❌ Blocked | — | <Context/rationale> |
```

### When to Update Status

Update the status when:
- **To 🔄 In Progress:** Target task begins working on the item
- **To ⚠️ Partial:** Item partially resolved but needs follow-up
- **To ✅ Done:** Item fully resolved and verified
  - Add verification reference (outcome file, commit hash, review round)
  - Example: `R5 outcome` or `commit abc123f` or `Task 13.2 complete`

### When to Reference in Outcome Files

In task outcome files, reference this ledger when:
- Adding a deferred item: "Deferred X to Task Y (see deferred-items.md D3)"
- Completing a deferred item: "Resolved deferred item D3 (see deferred-items.md)"

---

## Enforcement

The **final quality gate task** (last task before Phase 7: Knowledge Propagation) MUST verify all deferred items are resolved:

```bash
# Count unresolved items
grep -c "❌\|⚠️" ai/plans/<feature-name>/deferred-items.md

# Expected: 0
# If >0: Task is blocked — resolve all ❌/⚠️ items before plan completion
```

**Exit criteria:** Plan cannot be marked complete if any ❌ or ⚠️ status remains.

---

## Common Deferred Item Patterns

### Env-Config Registration
```markdown
| DX | Env-config: `NEW_CONFIG_KEY` registration | <task> | 7 (schema) | ❌ Blocked | — | Key resolved via `resolveEnvConfig` but never added to `env-config-keys.ts` |
```

### Cache Invalidation Completeness
```markdown
| DX | `resetX()` function missing keys | <task> | <task> | ❌ Blocked | — | Function invalidates some but not all keys resolved via `resolveEnvConfig` |
```

### Bulk Write Operations
```markdown
| DX | `createManyX()` bulk write optimization | <task> | <task> | 🔄 In Progress | — | Single-row insert works; bulk optimization deferred for performance phase |
```

### Test Coverage Gaps
```markdown
| DX | Integration test for edge case Y | <task> | <task> | ⚠️ Partial | — | Happy path tested; error path deferred pending mock setup |
```

### Migration/Seed Data
```markdown
| DX | Seed data for new enum values | <task> | 10 (seeds) | ✅ Done | Task 10.3 | Added to `6b-permissions-data.sql` |
```

---

## Anti-Patterns (What NOT to Do)

❌ **Don't defer without logging:** "I'll handle this later" without adding to ledger  
❌ **Don't use vague descriptions:** "Fix the thing" → use specific item names  
❌ **Don't mark ✅ without verification:** Status changes must reference outcome file or commit  
❌ **Don't leave ⚠️ unresolved:** Partial items must have a plan for completion  
❌ **Don't defer critical bugs:** Security, data corruption, or blocking bugs must be fixed immediately

---

## Example: Complete Lifecycle

### Task 5: Implementation discovers missing env-config registration
**Outcome file excerpt:**
> "Added `WHATSAPP_ACCESS_TOKEN` resolution via `resolveEnvConfig` in adapter. Registration in `env-config-keys.ts` deferred to Task 7 schema setup (see deferred-items.md D2)."

**Ledger entry:**
```markdown
| D2 | Env-config: `WHATSAPP_ACCESS_TOKEN` | 5 | 7 | ❌ Blocked | — | Key used in adapter but not registered |
```

### Task 7: Schema task resolves the deferred item
**Outcome file excerpt:**
> "Registered `WHATSAPP_ACCESS_TOKEN` in `env-config-keys.ts` line 42. Resolves deferred item D2 from Task 5 (see deferred-items.md)."

**Ledger update:**
```markdown
| D2 | Env-config: `WHATSAPP_ACCESS_TOKEN` | 5 | 7 | ✅ Done | Task 7.2 outcome | Registered in env-config-keys.ts:42 |
```

### Final Quality Gate: Enforcement check passes
```bash
$ grep -c "❌\|⚠️" ai/plans/whatsapp/deferred-items.md
0
# ✅ All deferred items resolved — plan can proceed to Knowledge Propagation
```

---

## Related Documents

- Task template: `.agents/spec-process-guide/templates/tasks-template.md` — Phase 1 setup, Final quality gate
- Execution guide: `.agents/spec-process-guide/execution/implementation-guide.md` — Deferred item workflow
- SKILL.md: `.agents/skills/spec-driven-development/SKILL.md` — Deferred-items ledger enforcement
