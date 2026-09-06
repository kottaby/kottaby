# R4 Review — review-types + review-backend (combined, fresh iteration 4)

**Pin:** `feat/clean-unused` (confirmed via `bash /home/z/pin-feat.sh`)
**Diff scope:** 215 files, +3845/−6859 vs baseline `1c134db` (48 D / 139 M / 28 A)
**Mission:** confirmation round — hunt ONLY diff-introduced regressions across (1) export re-census, (2) import-graph health, (3) docs-vs-code truthfulness, (4) package.json/knip.config final state, (5) gate re-verification.

## 1. Export re-census (backend/ + shared/, diff-touched files)

Method: extracted every remaining named export from the 95 diff-touched backend/shared files (144 symbols). Ran a random 30-symbol sample **plus** a deterministic full sweep of all 144. Consumer check = repo-wide word-boundary grep excluding the defining file, followed by manual verification of every zero-hit.

**Result: 0 regressions.** Full-sweep zero-direct-consumer exports: exactly 3, all exported *types* used inside their own file in the public signature of an externally-consumed export (knip-accepted; not orphans):

- [INFO] shared/locale/localeContext.tsx:6 — `LocaleContextValue` has zero direct importers at HEAD (the diff removed its last direct consumer, the `frontend/providers/localeContext.ts` barrel re-export, while un-exporting sibling `useLocaleContext`). It remains referenced in-file as the type of `LocaleContext` (5 external consumers), so knip (exit 0) counts it as used. Cosmetic only — dropping the `export` keyword would be a style choice, not a correctness fix. No action required.
- [INFO] backend/lib/auth/server-auth.ts:45 — `ServerUserContext` zero external consumers, but zero baseline consumers too (verified via `git grep 1c134db`); it is the return type of the widely-used `getServerUserContext`. Baseline-identical → out of scope.
- [INFO] backend/lib/env.ts:196 — `EnvironmentConfig` zero external consumers at HEAD **and** at baseline; return type of `getEnvironmentConfig`/`ensureEnvironmentValidated` (consumed by `app/api/graphql/route.ts`, `scripts/dbActions/envFile.ts`, etc.). Baseline-identical → out of scope.

All other 141 exports in touched files have ≥1 verified external consumer (spot-verified individually, e.g. `gqlSchemaBuilder` 68 files, `logger` 126 files, `defineNamespace` 16 files, `StudentSelectType` 13 files; single-consumer cases like `ApiErrorEnvelopeReturnType` → `api-response.ts`, `WALLET_CREDIT_TRANSACTION_STATUS` → `contracts.conformance.test-d.ts`, `seedOrGetPlans` → `backend/db/seeds/index.ts` all resolve to real usages).

## 2. Import-graph health

- [PASS] All 5 import specifiers added by the diff in code files resolve: `./seed-plans`, `./skip-when-pglite` (→ `test/helpers/index.ts` re-export; target exists), `@/scripts/lib/restore-next-env-dts` (file exists), `@/shared/locale` (barrel exists), `pg` (installed dep). The remaining grep hits are markdown examples inside AGENTS.md/outcome docs, not code.
- [PASS] String-dynamic imports hunted: **zero** template-literal `import(\`` in code; **one** variable-path `await import(SERVICE_PATH)` at test/workflows/parents/parent-link-request.journey.test.ts:379 → resolves to `backend/services/parents/parent-link-request.service.ts` which exists and exports `namespace ParentLinkRequestService` (line 144) matching the `mod.ParentLinkRequestService` access. No `require("...")` in TS code; no `vi.mock`/`jest.mock` string paths.
- [PASS] Deleted-module references: zero imports of the deleted `backend/lib/db` barrel (submodules `with-transaction.ts`/`escape-like-wildcards.ts` remain and are deep-imported — correct); zero references to `db/introspection` anywhere in code.
- [PASS] `tsgo` exit 0 independently proves the static graph resolves.

**Category findings: 0.**

## 3. Docs-vs-code truthfulness (15+ doc files sampled — actually all 53 docs/**.md + 16 AGENTS.md + README.md + shared/Messages_README.md)

Built the ground-truth deleted-symbol list: 166 export-keyword removals in the diff → filtered to **87 symbols truly absent from current code** (the other 79 were de-exported but still exist, e.g. `generateHandshakeCode`, `TeacherMatchingLanguagesInput`, `EscrowReleaseReason`, `SessionEventNotificationEntityRef` — still live declarations).

Grep of all docs (docs/ at 3 nesting levels), all AGENTS.md files (root, app/, backend/*, frontend/*, shared/*, test/*), README.md, shared/Messages_README.md against the 87 truly-deleted symbols:

**Category findings: 0.** No stale references to any deleted symbol. Verified hits like `redirect`, `next-intl`, `safeRedirect`, `apiSuccessResponse` in docs are prose or live symbols, not deleted exports.

## 4. package.json + knip.config.ts final state

- [PASS] Every path-referenced script target exists (checked 30 script file targets incl. run-locked-cmd wrapper chain, `check:unused` → `node_modules/knip/bin/knip-bun.js`, preloads, e2e dir, `.dependency-cruiser.js`, `drizzle.config.sqlite.ts`, `codegen.ts`).
- [INFO] package.json:62 — `"cron:worker": "bun run scripts/cron-worker.ts"` targets a **non-existent** file. **Pre-existing**: `git ls-tree 1c134db` shows no `scripts/cron-worker.ts` at baseline either, and the `cron:worker` line is untouched by this diff → baseline-identical, out of scope for R4. Flagged for a future wave only.
- [PASS] Removed scripts (`prebuild`, `test:live-fx`, `test:live-comm`) have zero remaining references in CI workflows, configs, docs, or code.
- [PASS] Dependencies: all 3 added deps (`csstype`, `@graphql-codegen/typed-document-node`, `eslint-plugin-react-hooks`) are installed (node_modules + bun.lock) and used. Sampled ~27 removed deps for lingering references — all apparent hits (`date-fns`, `jest`, `validator`, `glob`) are comments/prose only; zero import-form references (tsgo exit 0 corroborates).
- [PASS] knip.config.ts: every `entry`, `ignore`, and `ignoreDependencies` entry has a justification comment; all 15 checked entry/ignore target files exist; all entry globs match real files (knip emits no no-match hints).

**Category findings: 0** (1 out-of-scope INFO note re `cron:worker`).

## 5. tsgo + knip re-verification

- `timeout 240 bun run tsgo` → **exit 0** (process-lock released cleanly). ✓
- `bun run check:unused` → **exit 0** with exactly 1 configuration hint: `.mdx — Compiled extension excluded by project (imports not followed)` — informational only, matching the expected final state. ✓

## Verdict

**0 diff-introduced regressions across all five categories.** 3 INFO observations (all knip-accepted exported types in signatures of used exports; 2 of 3 baseline-identical/out-of-scope, 1 cosmetic kept-while-sibling-un-exported) and 1 out-of-scope pre-existing package.json note. Gates green. The cleanup branch is confirmed clean from the types+backend review lens.
