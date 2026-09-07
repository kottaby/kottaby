# Trackable Tasks — clean_unused (Unused-Code Cleanup & Quality Gate)

**Plan:** `ai/plans/unused/clean_unused.md`
**Spec Type:** Quick-spec (single combined document)
**Branch:** `feat/clean-unused`
**Created:** 2026-09-06

> Derived from the plan's phase structure. Checkbox state transitions `[ ]` → `[-]` → `[x]` (complete only after the outcome file is written and verified).

---

## Phase 0 — Baseline & Discovery

- [x] T0.1 Capture SKILL.md §Phase 0 baseline: tsgo error count, biome warning count, lint output, git diff file set (write `outcome/phase0-baseline-outcome.md`)
- [x] T0.2 Run knip (`check:unused` — add the package.json script if missing) and capture structured findings inventory (JSON or categorized list)
- [x] T0.3 Map repo execution surfaces: package.json scripts, CI workflows, Dockerfile, devTools configs, ORM migration scripts, Bun `--preload` entries, Storybook globs, convention-based seeders/crons
- [x] T0.4 Read `tsconfig.json` include/exclude; note test/stories/scripts exclusion effects on knip and type-aware linters

## Phase 1 — Mechanical Categories

- [x] T1.1 Duplicate exports: same symbol exported twice (named+default or aliases) — pick canonical export by consumer usage, update consumers, delete duplicate
- [x] T1.2 Dependencies: verify unused packages via grep of configs/workflows/bin usage before removal; add unlisted-but-imported packages with lockfile-resolved versions; sync lockfile with one install at the end
- [x] T1.3 Config hints in knip output: resolve each (remove dead entry globs, fix no-match patterns); do NOT blanket-remove curated ignores without proving they suppress nothing

## Phase 2 — Unused Files

- [x] T2.1 For every knip-flagged file, prove absence of non-import references before deleting (search path-minus-extension and directory paths for barrels across scripts/CI/configs/ORM/Storybook/string dynamic imports)
- [x] T2.2 Delete verified-dead files; register path-invoked survivors as knip entry patterns (entry, not ignore); run type-checker after the batch

## Phase 3 — Unused Exports / Types / Members

- [x] T3.1 Verify each flagged symbol is genuinely unreferenced (static imports, re-exports, type imports, `X.member` access, destructured dynamic imports); drop `export` keyword for own-file-only use; delete truly-unreferenced declarations + JSDoc
- [x] T3.2 Protect known knip blind spots: class/namespace members via destructured dynamic imports, generic factory consumers, `satisfies`/narrowing-only types, DB/GraphQL-schema-backed enums (documented directory-level knip ignore, never deletion)

## Phase 4 — Cross-Cutting Fixes

- [x] T4.1 Delete orphaned shell files and same-dir `export *` barrel lines after export removal
- [x] T4.2 Re-run `check:unused` and fix second-order findings (newly-unused callers) until it exits 0

## Phase 5 — Lint/Quality Convergence

- [x] T5.1 If global type/lint check explodes with module-resolution errors for tests/stories: fix root cause via tsconfig include (enumerate root config files explicitly, never blind `*.ts` glob); never restrict linter configs as workaround; report OOM rather than shrinking scope

## Phase 6 — Final Verification

- [x] T6.1 `check:unused` exits 0 (remaining config hints documented with reasons)
- [x] T6.2 Full type-check clean (tsgo 0 new errors vs baseline)
- [x] T6.3 quality-gate script reports DONE
- [x] T6.4 Production build passes

## Final — Review & Knowledge

- [x] T7.1 Post-implementation review iterations (independent fresh subagents) until 0 new findings in 2 consecutive rounds
- [x] T7.2 Deferred-items enforcement: `grep -c "❌\|⚠️" deferred-items.md` == 0
- [x] T7.3 Knowledge propagation outcome file + final report (per-category counts, files deleted/modified, restorations, final gate status)

## Post-plan operations (user-directed PR hardening)

- [x] T8.1 `check:unused` fails on warnings (`--treat-config-hints-as-errors`/`--treat-tag-hints-as-errors`); resolve remaining `.mdx` config hint; wire into CI quality job + quality-gate BASIC_CHECKS
- [ ] T8.2 Stop dev server; production build passes
- [ ] T8.3 autofix skill run #1 on PR #73; apply validated CodeRabbit fixes; commit + push
- [ ] T8.4 quality-gate full pass (includes new knip gate); commit + push
- [ ] T8.5 Merge main into branch; resolve conflicts (drizzle migrations = main, regenerate GraphQL); rerun migrations; commit + push
- [ ] T8.6 db generate/migrate/seed + .env.test migrate; test:db / test:services / test:graphql green; commit + push
- [ ] T8.7 autofix skill run #2; resolve CodeRabbit threads via gh; commit + push
- [ ] T8.8 Archive plan: delete outcome/ + deferred-items + prototype artifacts; move plan dir to ai/finished_plans/; commit + push
- [ ] T8.9 Watch CI until PR #73 mergeable; fix failing checks; repeat until green
