# Phase 2 — T2.1 Unused-Files Proof Outcome

**Plan:** `ai/plans/unused/clean_unused.md` (Phase 2)
**Branch:** `feat/clean-unused` @ `b08802e` (pinned via `pin-feat.sh`)
**Task:** T2.1 — prove absence of non-import references for every knip-flagged file BEFORE any deletion (deletions are T2.2's job).
**READ-ONLY task:** no source/config/knip edits were made; only this outcome file, the worklog, the tasks checkbox, and deferred ledger rows.

---

## 0. Method

Live knip run (`bun run check:unused`, exit 1 as expected): **Unused files (38)** — identical list to the Phase 0 baseline (§1.1). Per file, the following reference forms were searched across the WHOLE repo (ripgrep, hidden dirs included, `node_modules`/`.next` excluded):

1. **Path-minus-extension** (catches `@/x/y` import specifiers, `x/y.ts` path strings, wrapper args, doc mentions)
2. **Directory-path form with quote terminator** for barrels — e.g. `frontend/hooks["']`, `views/admin/users["']` (catches barrel imports in ALL module-specifier quote styles; repo-wide scan proved **zero** `from "."` / `from "./index"` self-barrel imports exist)
3. **Basename/symbol forms** — exported symbol names (`CANONICAL_ENUMS`, `isSafeUrl`, `requireRoleForPage`, `APPEARANCE_PRESETS`, `getLatnLocaleTag`, `IANA_TIMEZONE_IDS`, `resolveLocalizedString`, `getDbStats`, …) to catch string-form registries, dynamic imports, docstring surfaces
4. **Dynamic-import sweep** — `import(\`` template-literal dynamic imports: **zero exist** in the repo (only in docs/comments); literal `import("...")` forms are knip-visible and covered by the quote-terminated greps
5. **Surface files** verified individually: `package.json` (all scripts + nested `run-locked-cmd.ts <label> <cmd> <file>` wrapper args), `.github/workflows/*`, `next.config.ts`, `newrelic.cjs`, `codegen.ts`, `graphql.config.yml`, `apollo.config.json`, `.storybook/{main.ts,preview.tsx,manager.ts,StoryWrapper,msw-handlers}`, `eslint.config.mjs` (+ `scripts/eslint-rules/**`), `oxlint.config.mts`, `biome.json`, `cspell.config.yaml`, `bunfig.toml`, `.dependency-cruiser.js`, `.jscpd.json`, `.husky/*` (pre-commit is a comment only), `drizzle.config*.ts`, `tsconfig.json`, `Caddyfile`, `.env.example`, `scripts/**` (incl. iana generator `paths.ts`), `docs/**`, all `AGENTS.md` files, git history (`git log -S`) for the shim + provider intent.

Triage rule: matches INSIDE the flagged set itself (intra-cluster imports) don't count — knip already proves import-graph unreachability; only references from **live** surfaces (configs, scripts, docs, AGENTS.md, wrapper args) or knip-invisible string forms can save a file.

---

## 1. Decision table (38 rows)

| # | File | Verdict | Evidence (grep-clean unless stated) | Recommended knip action |
|---|---|---|---|---|
| 1 | `.storybook/shims/node-process.ts` | **DELETE** | No refs in `.storybook/main.ts` or any config. **Git-proven de-wiring**: commit `b3b9aac` created shim + vite alias `"node:process": …shims/node-process.ts`; commit `1723cfc` ("clean up Storybook configuration: **remove outdated node:process alias**") deleted the alias. `frontend/lib/logger.ts:20-23` no longer imports `node:process` (uses the polyfilled `process` global) — the shim's premise is gone. | none (file exits the project) |
| 2 | `backend/db/introspection/catalog-queries.ts` | **DELETE** | Only intra-cluster refs (`types.ts`). Exported fns (`getDbStats`, `listEnums`, `listTriggers`…) appear nowhere else. Docstring's claimed consumer `app/_components/db-explorer-client.tsx` **does not exist** (app dir has no `_components/`); `app/page.tsx` imports `LandingPage` — the DB explorer was replaced. | none |
| 3 | `backend/db/introspection/constraint-queries.ts` | **DELETE** | Same cluster proof as #2 (imports `types.ts` only). | none |
| 4 | `backend/db/introspection/index.ts` | **DELETE** | Barrel; zero `@/backend/db/introspection` imports outside the cluster; stale docstring (DB-explorer consumer gone, see #2). | none |
| 5 | `backend/db/introspection/table-queries.ts` | **DELETE** | Same cluster proof (`getTableColumns` etc. self-only). | none |
| 6 | `backend/db/introspection/types.ts` | **DELETE** | Imported only by the 3 dead query files. | none |
| 7 | `backend/graphql/pothos/billing/index.ts` | **DELETE** | Barrel re-exports only `./plan.pothos`. Zero `pothos/billing"` importers; resolvers/mutations import the LEAF modules directly (`wallet.pothos`, `plan.pothos` — `mutation/billing/wallet.mutation.ts:35`, `query/billing/wallet.query.ts:40`, `mutation/plan-catalog.mutation.ts:12`, `query/plan-catalog.query.ts:13`). Type registration survives via the leaf imports; no Pothos registration is lost. | none |
| 8 | `backend/graphql/pothos/parents/index.ts` | **DELETE** | Zero `pothos/parents"` importers. Resolvers import the leaf (`mutation/parents/parent-link.mutation.ts:71`, `query/parents/parent-link.query.ts:50`). `backend/services/parents/parent-link.static-locks.test.ts:157` references the **directory** as a janitorial scan-tree (root-drift guard) — the tree keeps ≥1 source via the surviving leaf; no assertion names `index.ts`. Other pothos domains (users/teachers/classes/students/auth) have NO index.ts at all — barrel-per-domain is not a uniform repo convention. | none |
| 9 | `backend/lib/db/index.ts` | **DELETE** | All consumers import deep: `@/backend/lib/db/with-transaction` (13 files) and `@/backend/lib/db/escape-like-wildcards` (2 files). Zero `@/backend/lib/db"` barrel imports (`admin-user.repository.ts:23` comment mentions the path but the actual imports are deep). | none |
| 10 | `backend/types/appearance.types.ts` | **DELETE** | Imported ONLY by dead `presets/index.ts` (#17). Symbols (`PerModeColors`, `AppearanceFields`) appear only in that cluster + a description string in `shared/schemas/appearance.schema.json`. `.env.example:421-436` and that schema reference `backend/services/appearance/appearance-settings.service.ts` — **phantom** (dir doesn't exist); see deferred D13. | none |
| 11 | `frontend/components/siteFooter/index.ts` | **DELETE** | Barrel; `frontend/components/SiteFooter.tsx` imports the section components via deep paths (`@/frontend/components/siteFooter/FooterBrandSection` etc.); zero `siteFooter"` barrel imports (incl. `frontend/stories/**`). | none |
| 12 | `frontend/context/index.ts` | **DELETE** | Barrel re-exports 3 context files (not even `AuthContext`); every consumer imports specific files (`@/frontend/context/AuthContext` ×15, `ViewportContext`, `ThemeContext`, `NetworkConnectivityContext`). Zero `@/frontend/context"` barrel imports. | none |
| 13 | `frontend/hooks/index.ts` | **DELETE** | Barrel; consumers import SUB-barrels (`@/frontend/hooks/auth`, `/connectivity`, `/notifications`, `/theme`, `/locale` — all live). Zero `@/frontend/hooks"` top-barrel imports. | none |
| 14 | `frontend/lib/auth/index.ts` | **DELETE** | Barrel; all pages import deep (`@/frontend/lib/auth/withPageAuth` ×13, `roleDashboardRoute`). Zero barrel imports. | none |
| 15 | `frontend/lib/auth/requireRoleForPage.ts` | **DELETE** (+ REQUIRED paired docs edit) | Zero code imports — its only importer is the dead barrel #14 (line 2). BUT documented as a shipped SSR guard in `docs/auth/jwt-authentication-service.md` (§2.7, §226-230, §388-394), `docs/auth/REDIRECT_LOOP_FIX.md:211`, and a comment in `backend/lib/auth/server-auth.ts:11`. Docs-only references → deletion must ship with the doc pruning (deferred D11); historical `ai/finished_plans/**` mentions are immutable records, not live surfaces. | none |
| 16 | `frontend/lib/i18n/index.ts` | **DELETE** | Barrel re-exports only `./format-date`; all consumers import `@/frontend/lib/i18n/format-date` deep (tests + containers). Zero barrel imports. | none |
| 17 | `frontend/providers/theme/presets/index.ts` | **DELETE** | Zero `presets` importers; `APPEARANCE_PRESETS` / `findAppearancePreset` / `AppearancePresetId` appear nowhere outside the file. Git: created at initial commit, never consumed. Its only import (`@/backend/types/appearance.types`) is #10 (deleted together). | none |
| 18 | `frontend/providers/VercelObservability.tsx` | **DELETE** (+ REQUIRED dep coupling) | Not mounted: `app/layout.tsx` renders `AppClientProviders` (Apollo+Auth+Theme+Locale only — no Vercel component); no `vercel.json` exists; no analytics/speed-insights config refs anywhere; symbol `VercelObservability` referenced only by knip.config comments + plan docs. Git: `git log -S` shows it was **never imported** since the initial commit. **Coupling (D5):** T2.2 must, in the same change set, remove `@vercel/analytics` + `@vercel/speed-insights` from `package.json`/`bun.lock` AND delete their 2 `ignoreDependencies` entries + comment block in `knip.config.ts`. | remove 2 ignoreDependencies entries |
| 19 | `frontend/views/admin/index.ts` | **DELETE** | Pages import deep: `@/frontend/views/admin/plans` (sub-barrel, live), `@/frontend/views/admin/users/directory`, `@/frontend/views/admin/analytics/PlatformAnalyticsContainer`, `@/frontend/views/admin/broadcasts/BroadcastComposeContainer`. Zero `views/admin"` barrel imports. | none |
| 20 | `frontend/views/admin/users/index.ts` | **DELETE** | Pages import SUB-dir barrels: `@/frontend/views/admin/users/directory` + `/detail` (each has its own live `index.ts`). Zero `views/admin/users"` imports. | none |
| 21 | `frontend/views/auth/index.ts` | **DELETE** | Pages import SUB-dir barrels: `@/frontend/views/auth/login`, `/layout`, `/register` (app/(auth)/login/page.tsx:2, layout.tsx:7, register/page.tsx:2). Zero `views/auth"` imports. | none |
| 22 | `shared/constants/iana-timezones.ts` | **KEEP+DOCUMENT** (generated artifact) | Generator OUTPUT: `scripts/iana-timezone-generator/paths.ts:4` hardcodes the path (`SHARED_IDS_OUTPUT`). Type-imported only by the 2 sibling generated files (labels/territories import `IanaTimezoneId`). No runtime consumers — the app-facing surface is the sibling `iana-timezone.enum.ts` (knip-ignored; consumed via `codegen.ts:29` string mapping `@/shared/constants/iana-timezone.enum#IanaTimezone`). knip is RIGHT that it's import-dead; retention reason = generated-artifact provenance + `generate:iana-timezones` idempotency. Also referenced by `oxlint.config.mts:101` files[] globs (generated-code lint rules). | knip `ignore` (NOT entry) with justification — see §3 |
| 23 | `shared/constants/iana-timezone-labels.ts` | **KEEP+DOCUMENT** (generated) | Same proof: `paths.ts:5` (`SHARED_LABELS_OUTPUT`); zero importers; `IANA_TIMEZONE_LABELS` self-only; covered by `oxlint.config.mts:101` glob. | same ignore |
| 24 | `shared/constants/iana-timezone-territories.ts` | **KEEP+DOCUMENT** (generated) | Same proof: `paths.ts:6` (`SHARED_TERRITORIES_OUTPUT`); zero importers; `IANA_TIMEZONE_TERRITORY_CODES` self-only; covered by the oxlint glob. | same ignore |
| 25 | `shared/i18n/index.ts` | **DELETE** | Barrel re-exports `./link` + `./routing`; zero `@/shared/i18n"` imports. `routing.ts` SURVIVES (imported deep by `frontend/hooks/locale/useLanguageSwitch.ts:5`). next-intl era legacy — shared/AGENTS.md "Migration Status: Complete… next-intl fully removed". | none |
| 26 | `shared/i18n/link.tsx` | **DELETE** | Zero path refs; `<Link prefetch={false}>` wrapper superseded by direct `next/link` usage. | none |
| 27 | `shared/i18n/navigation.ts` | **DELETE** | Zero path refs; `usePathname`/`useRouter` wrappers superseded by `next/navigation` direct imports. | none |
| 28 | `shared/lib/enum.ts` | **DELETE** (+ REQUIRED paired AGENTS.md edits) | `CANONICAL_ENUMS` appears only in its own file — the "canonical source" claim is stale (real sources: `backend/enum/**` + `backend/db/schema/enums.ts`). Live doc refs to prune with the deletion: `backend/db/schema/AGENTS.md:38` + `backend/db/seeds/AGENTS.md:63` ("Check `backend/db/schema/enums.ts` or `shared/lib/enum.ts`") and `docs/DATABASE_MIGRATIONS.md:97` (historical narrative — optional). See deferred D12. | none |
| 29 | `shared/lib/locale-tag.ts` | **DELETE** | `getLatnLocaleTag` zero external refs; `frontend/lib/i18n/format-date.ts:10` documents its own module-private mirror ("MIRROR the module-private" copy). | none |
| 30 | `shared/lib/locale/excluded-ui-countries.ts` | **DELETE** | `EXCLUDED_UI_COUNTRY_CODES` / `isExcludedUiCountryCode` / `resolveUiCountryCode` appear only in the file. | none |
| 31 | `shared/lib/localized-string.ts` | **DELETE** | Helper symbols (`resolveLocalizedString`, `setLocalizedString`, `omitEmptyLocalizedString`, `localeJsonKey`) self-only. Docstring's claimed re-exporter `frontend/lib/localized-string.ts` does not exist. Imports the also-dead #35. | none |
| 32 | `shared/lib/safe-url.ts` | **DELETE** (+ REQUIRED paired shared/AGENTS.md edits) | `isSafeUrl` zero code imports. Referenced ONLY as an illustrative import example in `shared/AGENTS.md:17,26,74` + file-org table `:41` (which also lists non-existent `social-links.ts`, `phone/`, `logger/` — already stale). Deletion must swap the examples to live files (e.g. `@/shared/lib/email` / `mask-full-name`). See deferred D12. | none |
| 33 | `shared/lib/timezone/index.ts` | **DELETE** | Barrel re-exports `./excluded-iana-timezones`; the only real consumer (`scripts/iana-timezone-generator/cli.ts:26`) imports the LEAF deep. Zero barrel imports. | none |
| 34 | `shared/types/index.ts` | **DELETE** | Barrel re-exports only the dead #35; zero `@/shared/types"` imports. (shared/types/ then contains nothing live — the whole dir goes.) | none |
| 35 | `shared/types/localized-string.ts` | **DELETE** | Imported only by #31 (also deleted). `LocalizedString` type used nowhere else — `codegen.ts:4-7` writes the shape INLINE (comment says so) and its "re-exported from `@/frontend/types/localized-string.types`" pointer is a phantom (file absent). | none |
| 36 | `test/scripts/build-test.ts` | **REGISTER-AS-ENTRY** | `package.json:40` — `build:test`: `bun run scripts/lib/run-locked-cmd.ts build:test bun run test/scripts/build-test.ts` — **wrapper arg, knip-invisible** (nested command inside run-locked-cmd). | add entry `test/scripts/build-test.ts` |
| 37 | `test/scripts/run-server-tests.ts` | **REGISTER-AS-ENTRY** | `package.json:30,31,35,64` — `test:graphql`, `test:graphql:coverage`, `test:ui:e2e`, `test:graphql:sqlite` all pass `bun run test/scripts/run-server-tests.ts` as run-locked-cmd wrapper args (knip-invisible). Also AGENTS.md:51,53. Imports live helpers (`@/test/scripts/runner-helpers`, `@/test/helpers/port-helpers`) — a real entry root. | add entry `test/scripts/run-server-tests.ts` |
| 38 | `test/scripts/run-test.ts` | **REGISTER-AS-ENTRY** | AGENTS.md-documented AI runner: root `AGENTS.md:58-60,281-283` (3 command forms); `test/scripts/test-runner-guard.ts:6,34,40` (approved-runner allowlist + user-facing message); `bunfig.toml:6` comment; `docs/testing/workflow-journey-tests.md`; **100+ test-file docstrings** across shared/backend/frontend/app reference it as the runner command. Zero static imports (path-invoked only). | add entry `test/scripts/run-test.ts` |

---

## 2. Summary counts

| Verdict | Count | Files |
|---|---:|---|
| **DELETE** (proven dead) | **32** | #1–#21, #25–#35 (of which 4 carry REQUIRED paired edits/coupling: #15 docs, #18 deps, #28 AGENTS.md, #32 AGENTS.md) |
| **REGISTER-AS-ENTRY** (path-invoked survivors) | **3** | #36–#38 (test/scripts trio) |
| **KEEP+DOCUMENT** (generated artifacts) | **3** | #22–#24 (iana data files) |
| Total | **38** | matches live knip run |

Phase 0 predicted 3 path-invoked FPs + 3 generated — both confirmed; the remaining 32 are proven dead (import-graph + all grep surfaces clean, doc-only references inventoried per file).

---

## 3. Special-case notes

### 3.1 VercelObservability.tsx (D5 coupling — execute together or not at all)
Delete the file **and** in the same change set: remove `@vercel/analytics` + `@vercel/speed-insights` from `package.json` dependencies, remove the 2 `ignoreDependencies` entries + their comment block from `knip.config.ts` (lines ~77-81), run one `bun install` to sync `bun.lock`. Leaving the deps would flip them into fresh "Unused dependencies" findings (the reason they were registered); deleting deps without the file would break the build. This resolves the DECISION half of deferred D5; T2.2 executes both halves.

### 3.2 iana ×3 (KEEP+DOCUMENT — knip ignore, NOT entry)
knip is factually right (zero import-graph consumers — verified: the app-facing surface is the sibling enum file via the codegen string; the only "imports" of `iana-timezones.ts` are type-imports *inside* the generated siblings, and `file-builders.ts`'s apparent imports are **template-literal text**, not real imports). Retention rationale: deterministic outputs of `scripts/iana-timezone-generator/cli.ts` (paths.ts hardcodes all 3), deletion is churn (regeneration recreates them byte-identically), and `oxlint.config.mts:101` targets them with generated-code lint rules. Recommended T2.2 knip action (config edit — NOT done here): replace the existing single-file ignore
```
"shared/constants/iana-timezone.enum.ts",
```
with one glob covering the whole generated family + refreshed justification comment, e.g.
```
// Auto-generated IANA timezone catalog (ids/labels/territories/enum) — outputs of
// `generate:iana-timezones` (scripts/iana-timezone-generator/paths.ts). Consumed via
// Object.values() + the codegen IanaTimezone scalar mapping; members are never
// referenced by name. Regenerated deterministically — never hand-edit, never delete.
"shared/constants/iana-timezone*.ts",
```
(the glob also keeps the existing enum-file suppression — 441 enumMember FPs — intact).

### 3.3 storybook shim (git-proven deliberate death)
`.storybook/shims/node-process.ts` is the rare case with a paper trail: created WITH a vite alias (`b3b9aac`), alias deliberately removed by `1723cfc` ("remove outdated node:process alias" — the frontend logger had stopped importing `node:process`). Leftover file, zero references. DELETE with confidence; if a future story breaks on `node:process` again, the fix is re-adding the alias, not this file.

### 3.4 test-runner trio (REGISTER-AS-ENTRY — never ignore)
All three are shell-invoked (package.json wrapper args / AGENTS.md-documented commands) — per plan Phase 2 they become knip **entry** patterns (`entry`, not `ignore`): they are import-graph ROOTS (run-server-tests.ts imports live helpers). Suggested entry additions:
```
// Bun test runners invoked by path string only (run-locked-cmd wrapper args in
// package.json scripts + AGENTS.md-documented AI runner) — knip cannot see
// nested wrapper commands.
"test/scripts/build-test.ts",
"test/scripts/run-server-tests.ts",
"test/scripts/run-test.ts",
```

### 3.5 Barrel-convention conflict (orchestrator awareness — does not block deletion)
Root `AGENTS.md:126-127` (from the initial commit) still mandates "Every nested subdirectory that has exportable modules MUST have its own `index.ts`" + "always import from the highest available barrel". Practice has moved to deep imports (commit `1723cfc`: "use explicit paths instead of barrel imports for improved tree shaking"; `shared/AGENTS.md:34`: "Prefer deep imports over barrel files"). 15 of the 38 flagged files are barrels that exist only to satisfy the old convention. Deleting them is type-safe (tsgo verifies) but leaves AGENTS.md:127 stale for those trees. Recommendation: bless the deletions and fold an AGENTS.md:126-133 refresh into the D8 docs wave (deferred D14).

---

## 4. Carry-forward for T2.2 (deletion batch)

1. **Delete the 32 files** (rows #1–#21, #25–#35). Cluster notes:
   - Whole-dir deletions: `backend/db/introspection/` (5 files), `shared/types/` (2 files).
   - Pairs/clusters to delete together (intra-cluster imports): `presets/index.ts` + `appearance.types.ts`; `shared/lib/localized-string.ts` + `shared/types/localized-string.ts`.
   - Survivors in the same dirs (do NOT touch): `shared/i18n/routing.ts`, `frontend/lib/auth/{withPageAuth,roleDashboardRoute,refreshMemoryToken}.ts`, `shared/lib/timezone/excluded-iana-timezones.ts`, all `frontend/context/*.ts` leaves, all `frontend/hooks/*/` sub-barrels, `frontend/views/{auth,admin}/**` sub-barrels + leaves, `frontend/components/siteFooter/*` leaves, `backend/lib/db/{with-transaction,escape-like-wildcards}.ts`, `pothos/{billing,parents}/*.pothos.ts` leaves.
2. **Register entries**: add the 3 `test/scripts/*.ts` entries (§3.4) to `knip.config.ts`.
3. **ianas**: apply the ignore-glob change (§3.2).
4. **VercelObservability coupling**: file + package.json deps + knip ignoreDependencies + single `bun install` (§3.1, resolves D5 on execution).
5. **Paired docs/AGENTS.md edits** (same changeset or the D8 docs wave — D11/D12): docs/auth/* (requireRoleForPage), shared/AGENTS.md (safe-url examples + stale file-org table), backend/db/schema+seeds AGENTS.md (enum.ts pointers), backend/lib/auth/server-auth.ts:11 comment, shared/schemas/appearance.schema.json:5 description, codegen.ts:4-7 comment.
6. **Verify**: `bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit` (D3-safe form) after the batch + `bun run check:unused` — expected Unused files 38→3 (the 3 registered+ignored survivors exit the report: 3 via entry, 3 via ignore ⇒ **38→0 reported**).
7. If tsgo explodes: restore with `git checkout HEAD -- <file>` and re-check that file's row above (every row lists the exact quote-terminated greps to re-run).

---

## 5. Deferred items added (see deferred-items.md)

- **D11** — paired docs pruning for `requireRoleForPage.ts` deletion (docs/auth/jwt-authentication-service.md, REDIRECT_LOOP_FIX.md, server-auth.ts comment).
- **D12** — paired AGENTS.md example/pointer edits for `shared/lib/enum.ts` + `shared/lib/safe-url.ts` deletions (+ stale shared/AGENTS.md file-org table entries).
- **D13** — phantom references discovered during proof: `.env.example:421-436` appearance block (non-existent `backend/services/appearance/*` + `DEFAULT_APPEARANCE_FIELDS`), `shared/schemas/appearance.schema.json:5` (will be stale post-deletion), root `AGENTS.md:448-450` (non-existent `docs/backend/types-consolidation.md`, `docs/architecture/import-export-conventions.md`), `codegen.ts:4-7` (non-existent `@/frontend/types/localized-string.types`), `shared/AGENTS.md:41` (non-existent `social-links.ts`, `phone/`, `logger/`).
- **D14** — root `AGENTS.md:126-133` barrel mandate vs deep-import practice (initial-commit convention vs `1723cfc` refactor + shared/AGENTS.md guidance); refresh the convention doc in the D8 docs wave so barrel deletions don't leave contradictory guidance.
