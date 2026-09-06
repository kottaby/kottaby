Run the project's unused-code cleanup and quality gate to full green. Commands: `check:unused` (knip), `tsgo` (or type-check), plus the project's quality-loop / quality-gate scripts. Do not ask me to pick approaches — investigate and decide.

## Non-negotiable ground rules

- Read the root AGENTS.md and any directory-level AGENTS.md before touching files in that tree.
- NEVER commit or mutate git beyond file edits. If something looks over-deleted, restore with `git checkout HEAD -- <file>` (do not stash across waves).
- Never silence linters: no `knip`/`oxlint`/`biome`/`eslint` rule relaxations, no `*-disable` comments, no ignore-listing to hide bugs. Config entries are LAST RESORT and only for genuinely knip-invisible constructs, each with a one-line justification comment.
- No new dependencies without asking. `bun install`/`npm install` only when package.json changed.

## Phase 0 — Discovery (before deleting anything)

1. Run `check:unused` and capture structured output (knip JSON reporter or the repo's categorize script if it exists).
2. Map the repo's execution surfaces: package.json scripts, CI workflows (.github/), Dockerfile, devTools configs, ORM migration scripts, Bun `--preload` entries, Storybook `.storybook/main.ts` stories globs, convention-based seeders/crons — note anything invoked by path string rather than import.
3. Read `tsconfig.json` include/exclude. If tests/stories/scripts are excluded from the project graph, knip and type-aware linters are partly blind; note it for later.

## Phase 1 — Mechanical categories (do yourself, no subagents)

1. **Duplicate exports**: same symbol exported twice (e.g. named + default, or aliases). Pick the canonical export by how consumers import it; update consumers; delete the duplicate. If the tiered/lazy-loading convention uses named exports via `createLazyView`-style `.then(m => ({ default: m.X }))`, keep named and drop default.
2. **Dependencies**: unused packages must be verified by grepping configs/workflows/bin usage before removal (CLI binaries, eslint plugin strings, config-string references, node_modules file access). Unlisted-but-imported packages get added with the version resolved from the lockfile. Sync the lockfile with one install at the end.
3. **Config hints** in knip output: resolve each (remove dead entry globs, fix no-match patterns). Do NOT blanket-remove curated ignores without proving they suppress nothing.

## Phase 2 — Unused files

For every knip-flagged file, prove absence of non-import references before deleting: search for the full path minus extension AND (for `index.ts` barrels) the directory path, at least across: package.json scripts, CI workflows, configs, ORM/seed registries, Storybook stories globs, and string dynamic imports. Files referenced only via shell invocation (`bun run path/to/script.ts`), `--preload` flags, or framework-convention globs must be retained and registered as knip **entry patterns** in knip config instead (entry, not ignore). Delete the rest; run the type-checker after the batch.

## Phase 3 — Unused exports / types / members (parallel subagents)

Dispatch one subagent per directory-cluster batch of files. Each subagent MUST:

1. Verify each flagged symbol is actually unreferenced: static imports, re-exports, type imports, `X.member` access (same-class receiver only — same-named methods on OTHER classes don't count), destructured dynamic imports (`const { Svc } = await import(...)`) — knip can't see most of these. A symbol whose only use is inside its own file → drop the `export` keyword, keep the symbol. Genuinely unreferenced → delete the declaration + its JSDoc.
2. Never touch files outside its assignment; never add suppressions.
3. Per-file verify with the project's file-scoped lint/typecheck loop (or eslint on the file); orchestrator runs the global type-check after each wave.

Watch for these known knip blind spots — restore instead of deleting: class/namespace members called via destructured dynamic import; members consumed through generic factory parameters (e.g. `buildX(Repository)` where the call site is `repo.listAll(...)`); types consumed only via `satisfies`/narrowing; and entries in **DB/GraphQL-schema-backed enums** (members referenced as string literals or via Pothos/enum registration) — those get a documented directory-level knip ignore, never a deletion.

## Phase 4 — Cross-cutting fixes

- Deleting an export can orphan a file (or its only-owning barrel line): delete the shell file and its same-dir `export *` barrel lines (allowed cross-file edit, same-dir only).
- After the main waves, re-run `check:unused` and fix the second-order findings (callers of deleted members become newly unused) until it exits 0.

## Phase 5 — Lint/quality convergence

If the global type/link check explodes with module-resolution or "not in project" errors for tests/stories, the root cause is tsconfig exclusion — add `test/**` to include and enumerate root config files explicitly in `include` (never a blind `*.ts` glob). Do NOT work around it by restricting linter configs. If type-aware lint OOMs, do NOT shrink scope silently — report it.

## Phase 6 — Final verification (all must pass, in this order)

1. `check:unused` exits 0 (config hints may remain only if documented).
2. Full type-check clean.
3. The project's quality-gate / quality-loop script until it reports DONE.
4. Production build passes; if there's a build-scoped type-check config, verify planted type errors are caught where expected and ignored where the build tsconfig excludes them.

## Report

End with: per-category counts (initial → fixed → config-excluded, each exclusion with its reason), files deleted/modified, any restorations you had to make, and the final gate status. Plain list, no narrative.
