# Phase 2 — T2.2 Unused-Files Deletion Outcome

**Plan:** `ai/plans/unused/clean_unused.md` (Phase 2)
**Branch:** `feat/clean-unused` @ `b08802e` (pinned via `pin-feat.sh`)
**Task:** T2.2 — execute the T2.1 decision table: delete the 32 proven-dead files, register the 3 path-invoked runners as knip entries, ignore the 3 generated IANA outputs, ship the VercelObservability paired changeset, ship the REQUIRED paired doc edits (D11/D12).
**Input:** `outcome/phase2-t21-files-proof-outcome.md` (38-row decision table, followed exactly).

---

## 1. Deletions executed (32 files — rows #1–#21, #25–#35)

| # | File | Notes |
|---|---|---|
| 1 | `.storybook/shims/node-process.ts` | git-proven de-wired (alias removed in `1723cfc`) |
| 2–6 | `backend/db/introspection/{catalog-queries,constraint-queries,table-queries,types,index}.ts` | whole dir removed (intra-cluster only) |
| 7 | `backend/graphql/pothos/billing/index.ts` | barrel; leaf `plan.pothos.ts` survives |
| 8 | `backend/graphql/pothos/parents/index.ts` | barrel; leaf `parent-link.pothos.ts` survives |
| 9 | `backend/lib/db/index.ts` | barrel; `with-transaction` + `escape-like-wildcards` survive |
| 10 | `backend/types/appearance.types.ts` | pair with #17 |
| 11 | `frontend/components/siteFooter/index.ts` | barrel; section leaves survive |
| 12 | `frontend/context/index.ts` | barrel; context leaves survive |
| 13 | `frontend/hooks/index.ts` | top barrel; sub-barrels survive |
| 14 | `frontend/lib/auth/index.ts` | barrel; guards + `roleDashboardRoute` survive |
| 15 | `frontend/lib/auth/requireRoleForPage.ts` | + REQUIRED D11 doc pruning (§4) |
| 16 | `frontend/lib/i18n/index.ts` | barrel; `format-date.ts` survives |
| 17 | `frontend/providers/theme/presets/index.ts` | pair with #10; dir removed |
| 18 | `frontend/providers/VercelObservability.tsx` | + REQUIRED D5 dep coupling (§3) |
| 19–21 | `frontend/views/{admin/index.ts, admin/users/index.ts, auth/index.ts` | barrels; sub-barrels + leaves survive |
| 25 | `shared/i18n/index.ts` | barrel; `routing.ts` survives |
| 26 | `shared/i18n/link.tsx` | next-intl legacy |
| 27 | `shared/i18n/navigation.ts` | next-intl legacy |
| 28 | `shared/lib/enum.ts` | + REQUIRED D12 AGENTS.md pointer edits (§4) |
| 29 | `shared/lib/locale-tag.ts` | module-private mirror documented in `format-date.ts` (comment, untouched — see §6) |
| 30 | `shared/lib/locale/excluded-ui-countries.ts` | self-only symbols |
| 31 | `shared/lib/localized-string.ts` | pair with #35 |
| 32 | `shared/lib/safe-url.ts` | + REQUIRED D12 AGENTS.md example edits (§4) |
| 33 | `shared/lib/timezone/index.ts` | barrel; `excluded-iana-timezones.ts` survives |
| 34 | `shared/types/index.ts` | whole dir removed |
| 35 | `shared/types/localized-string.ts` | pair with #31 |

- `git status --porcelain | grep -c "^ D"` → **32** ✅
- Empty dirs removed after the file rm (rmdir, only-if-empty): `.storybook/shims/`, `backend/db/introspection/`, `frontend/providers/theme/presets/`, `shared/types/`.
- **Restorations: 0.** tsgo ran clean on the first post-batch attempt — every T2.1 verdict held; no false positives.

## 2. knip.config.ts changes

1. **3 entries registered** (T2.1 §3.4, rows #36–#38) with the justification comment:
   `// Bun test runners invoked by path string only (run-locked-cmd wrapper args in package.json scripts + the AGENTS.md-documented AI runner) — knip cannot see nested wrapper commands.`
   - `test/scripts/build-test.ts` (package.json `build:test` wrapper arg)
   - `test/scripts/run-server-tests.ts` (test:graphql / test:graphql:coverage / test:ui:e2e / test:graphql:sqlite wrapper args)
   - `test/scripts/run-test.ts` (AGENTS.md-documented AI runner + test-runner-guard allowlist)
2. **IANA ignore glob** (T2.1 §3.2, rows #22–#24): single-file `"shared/constants/iana-timezone.enum.ts"` replaced by `"shared/constants/iana-timezone*.ts"` with the refreshed generated-artifact justification comment (deterministic outputs of `generate:iana-timezones`; consumed via Object.values() + the codegen `IanaTimezone` scalar mapping; never hand-edit, never delete). The glob keeps the previous 441 enumMember suppression intact (enumMembers count still 4, unchanged).
3. **Vercel ignoreDependencies entries removed** (D5): `@vercel/analytics` + `@vercel/speed-insights` entries and their 4-line justification comment block deleted from `ignoreDependencies`.

## 3. VercelObservability paired changeset (D5 — executed as one atomic batch)

- Deleted `frontend/providers/VercelObservability.tsx` (row #18).
- Removed `@vercel/analytics` + `@vercel/speed-insights` from `package.json` dependencies.
- Removed their 2 `ignoreDependencies` entries + comment block from `knip.config.ts`.
- Single `bun install` → "Saved lockfile / Removed: 2" (bun.lock synced; the one install this batch is allowed).
- Post-check: repo-wide grep for `VercelObservability|@vercel/analytics|@vercel/speed-insights` (live tree, ai/ + node_modules excluded) → **zero hits**.

## 4. Paired doc edits (REQUIRED rows only — D11 + D12, shipped in the same changeset)

**D11 — requireRoleForPage pruning:**
- `backend/lib/auth/server-auth.ts:11` — comment now lists `withPageAuth` (the dead helper dropped from the examples).
- `docs/auth/jwt-authentication-service.md` — 9 touch points: auth-flow diagram (§2.2 line 43), §2.6 caller list, §2.7 heading + helper block removed + cold-start rule reworded to `withPageAuth`, §3.4 SSR rules (2 bullets merged/updated, cold-start bullet deleted), §4 "What NOT to Do" boundary rule, §5.4 SSR-parity intro + table row removed ("All three" → "Both"), §6 shipped-surface summary (page-guards bullet + SSR-parity bullet).
- `docs/auth/REDIRECT_LOOP_FIX.md:211` — call-site table row for the deleted file removed (withPageAuth row kept — that file survives).

**D12 — enum.ts / safe-url AGENTS.md pointer edits:**
- `backend/db/schema/AGENTS.md:38` + `backend/db/seeds/AGENTS.md:63` — "Check `backend/db/schema/enums.ts` or `shared/lib/enum.ts`" → canonical source only (`backend/db/schema/enums.ts`).
- `shared/AGENTS.md` — positive example (was phantom `social-links.ts` + dead `isSafeUrl`) → real live import `frontend/views/auth/register/registerFormUtils.ts` + `import { isValidEmail } from "@/shared/lib/email"` (verified real: line 2 of that file); negative example symbol `isSafeUrl` → `isSafeRedirect` (the real export of `@/frontend/lib/safeRedirect` — the wrong-layer import it illustrates is unchanged); §"Extracting Code Into Shared" step 2 example → `isValidEmail` / `@/shared/lib/email`; file-org table `shared/lib/` row examples → all live (`email.ts`, `mask-full-name.ts`, `isolate-bidi.ts`, `locale/`, `timezone/`) — this also incidentally clears the D13 `shared/AGENTS.md:41` sub-item (documented in the D12 ledger note; D13 row itself left untouched per instructions).

**Deferred doc items NOT touched (per instructions — stay deferred):** D13 (`.env.example:421-436`, `shared/schemas/appearance.schema.json:5`, root `AGENTS.md:448-450`, `codegen.ts:4-7`), D14 (root `AGENTS.md:126-133` barrel mandate), `docs/DATABASE_MIGRATIONS.md:97` (historical narrative, optional per T2.1), `frontend/lib/i18n/format-date.ts:10` (self-describing "MIRROR" comment, no paired-edit requirement).

## 5. Verification results

| Gate | Before (end of T2.1) | After (this batch) | Status |
|---|---|---|---|
| tsgo (`run-locked-cmd.ts tsgo tsgo -b --noEmit`) | 0 errors | **exit 0, 0 errors** | ✅ |
| knip `Unused files` | 38 | **0 (section gone from report)** | ✅ |
| knip Unused exports | 89 | 89 (no shift — see §6) | ℹ️ Phase 3 owns |
| knip Unused exported types | 87 | 87 | ℹ️ Phase 3 owns |
| knip Unused enum members | 4 | 4 (iana 441 FPs still suppressed by the glob) | ℹ️ |
| knip Unused namespace members | 2 | 2 | ℹ️ Phase 3 owns |
| knip Unused deps / devDeps / unlisted / duplicates | 0/0/0/0 | 0/0/0/0 (no new dep findings; vercel entries gone cleanly) | ✅ |
| knip Configuration hints | 1 | 1 (informational .mdx/.css extension hint, pre-existing) | ℹ️ |
| knip exit code | 1 (expected) | 1 (expected — Phase 3 categories remain) | ✅ |
| Biome scoped (`knip.config.ts` + `package.json`) | — | **exit 0, no problems** | ✅ |
| Dev server `curl localhost:3000/` | 200 | **200** (normal dev.log traffic: /api/health, GET /, graphql 200s) | ✅ |
| Sub-loop `knip.config.ts --lifecycle duplicates` | — | tsgo ✅ / oxlint ✅ / biome ✅; the trailing in-process lint:type-aware submission did not return a verdict within the 240s sandbox window (pre-existing tooling latency, not caused by this edit — the scoped gates are green) | ⚠️ partial, pre-existing |

`git status` scope check — exactly: 32 ` D` deletions · M `knip.config.ts` · M `package.json` · M `bun.lock` · 6 paired doc files (docs/auth/jwt ×2, server-auth.ts, shared/AGENTS.md, backend/db/schema+seeds AGENTS.md) · paperwork (outcome file, worklog, tasks.md, deferred-items.md, pre-existing .tree-guard). Nothing else. No lint suppressions added, no code branches added (config entries + comments + doc text only), no cross-layer imports introduced.

## 6. Carry-forward for Phase 3 / 4

1. **Second-order findings: none appeared at the file level.** The instruction anticipated exports/types shifts from deleted-barrel callers, but the counts held (89/87): the dead barrels were themselves the only "consumers" knip credited for several exports, and those credits died with the files rather than migrating. The surviving-leaf export findings are the pre-existing Phase 3 backlog (e.g. `EXCLUDED_IANA_TIMEZONES` in `shared/lib/timezone/excluded-iana-timezones.ts` — its only importer is `scripts/iana-timezone-generator/cli.ts`, which imports deep; verify whether the export or the leaf wiring is the right fix in T3.x).
2. **Doc staleness newly created by this batch (fold into the D13/D8 docs wave, NOT edited here per scope rules):**
   - `shared/AGENTS.md:43` file-org table still documents `shared/types/` (example `billing-view.ts` — a pre-existing phantom) while the directory no longer exists at all after this batch.
   - `shared/schemas/appearance.schema.json:5` + `codegen.ts:4-7` + `.env.example:421-436` — already in D13, now concretely stale (deleted sources).
3. **D14 stands**: root `AGENTS.md:126-133` barrel mandate now contradicts 15 fewer reality points (those barrels are gone); the convention-doc refresh remains the D8 wave's job.
4. Phase 3 dispatch hint: with 3 new knip entries, `test/scripts/**` internals (runner-helpers imports) are now graph-reachable — some previously-flagged exports in `test/**` may have disappeared from the report already; re-baseline before splitting Phase 3 batches.

## 7. Ledger updates

- **D5** → ✅ Done (this outcome, §3).
- **D11** → ✅ Done (this outcome, §4).
- **D12** → ✅ Done (this outcome, §4; D13's `shared/AGENTS.md:41` sub-item incidentally cleared — noted in the D12 row).
- D13 / D14 / D6 / D7 / D8 / D1–D4 / D9 / D10 — untouched, as instructed.
