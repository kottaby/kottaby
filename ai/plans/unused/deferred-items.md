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
| D1 | Broken scripts `test:live-fx` / `test:live-comm` (package.json) — `--preload` files that were never committed and target test dirs that never existed | T1.3 | D2 cleanup wave | ✅ Done | Phase 5 wave | Both scripts removed from package.json (no CI workflow references; broken since initial commit — preloads and target dirs never existed in git history) |
| D2 | Stale AGENTS.md references to non-existent `test/integration/{preload,fx,communication}` surfaces: root `AGENTS.md:47-48`, `test/integration/AGENTS.md:35-36,51,94-95`, `backend/services/AGENTS.md:58-59` | T1.3 | T6.1 / orchestrator | ✅ Done | Phase 5 docs wave | Root AGENTS.md:47-48 + test/integration/AGENTS.md (commands, preload bullet, category rows, gating example → live `describe.skipIf` @live-redis pattern, directory layout, verification path) + backend/services/AGENTS.md:58-59 cleaned; scripts absent from package.json, dirs absent from git history (verified via `git ls-files test/` + `ls test/integration/` = AGENTS.md + redis/ only). Evidence: outcome/phase5-docs-truthfulness-outcome.md |
| D3 | `bun run tsgo` full chain hangs: `restore-next-env-dts.ts` never exits — PGlite singleton via the `@/scripts/lib` barrel side-effect keeps the event loop alive | T1.3 | T6.2 / tooling | ✅ Done | Phase 5 wave | Fixed: direct module import (no barrel) + explicit `process.exit(0)`; verified `bun run tsgo` completes exit 0 | Repro: `timeout 45 bun run scripts/restore-next-env-dts.ts` → exit 124 after "PGlite initialized successfully". Workaround (verified exit 0): `bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit`. Fix: explicit `process.exit(0)` or break barrel side-effect import. CI unaffected (runs raw `bun tsgo`) |
| D4 | Dead `biome.json` override for `app/**/error.tsx` (matches no file) | T1.3 | Phase 5 / lint convergence | ✅ Done | Phase 5 wave | Override block removed from biome.json (JSON validated) |
| D5 | VercelObservability.tsx is a knip-flagged unused file; deleting it orphans `@vercel/analytics` + `@vercel/speed-insights` (currently kept + ignoreDependencies) | T1.2 | Phase 2 (unused files) | ✅ Done | phase2-t22-files-deletion-outcome.md | Executed as one paired changeset in T2.2: file deleted + both deps removed from package.json + both ignoreDependencies entries (with comment block) dropped from knip.config.ts + single `bun install` synced bun.lock ("Removed: 2"); repo-wide vercel references now zero |
| D6 | `lint-staged` + `@cspell/eslint-plugin` zero-live-reference packages | T1.2 | Phase 4 (second-order) | ✅ Done | Phase 5 wave | Removed from package.json + ignoreDependencies + the commented-out eslint import line; knip still exit 0 |
| D7 | `@types/jest` remains while `jest`/`ts-jest`/`ts-node` were removed | T1.2 | Phase 4 (second-order) | ✅ Done | Phase 5 wave | Removed from package.json (zero references verified); lockfile synced |
| D8 | Stale docs/comments after dep removals: `backend/graphql/pothos/builder.ts:15-17` (lists 6 removed pothos plugins as installed), `README.md` (BullMQ/pg-boss), `backend/AGENTS.md` + `backend/services/AGENTS.md` (queue-adapter.factory.ts + resend/twilio/FCM adapters that don't exist in code), `.env.example:158` cron-parser comment | T1.2 | Docs refresh wave | ✅ Done | Phase 5 docs wave | builder.ts:15-17 trimmed to the only-installed @pothos/plugin-dataloader (bun pm ls); README BullMQ/pg-boss/cron-workers → secret-gated cron endpoints (live: app/api/cron/sweep-sessions); backend/AGENTS.md + backend/services/AGENTS.md cron/queue-adapter/resend-twilio-FCM sections removed (grep: 0 code refs, no git history); .env.example:158 cron-parser comment removed. Evidence: outcome/phase5-docs-truthfulness-outcome.md |
| D9 | `prebuild` script references missing `scripts/build/generate-vercel-config.ts` | T1.2 | Phase 6 (build verification) | ✅ Done | Phase 5 wave | Script file never existed in git history; no CI/workflow references — prebuild removed from package.json so `bun run build` proceeds |
| D10 | `@vercel/functions` removed as unused; realtime-engine docs option (b) would require re-adding it | T1.2 | Deferred decision | ✅ Done | Orchestrator disposition | Decision: stays removed; re-add (with a note in the docs) only if the WebSocket upgrade deployment path is chosen |
| D11 | Paired docs pruning for `frontend/lib/auth/requireRoleForPage.ts` deletion (T2.1 verdict: DELETE): `docs/auth/jwt-authentication-service.md` (§2.7, §226-230, §388-394 — helper documented as shipped SSR guard), `docs/auth/REDIRECT_LOOP_FIX.md:211` table row, `backend/lib/auth/server-auth.ts:11` comment ("e.g. withPageAuth, requireRoleForPage") | T2.1 | T2.2 / D8 docs wave | ✅ Done | phase2-t22-files-deletion-outcome.md | All doc prunings shipped in the same changeset as the deletion: jwt-authentication-service.md (auth flow §2.2, §2.6, §2.7 helper block, §3.4 SSR rules, §4 boundary rule, §5.4 parity table, §6 shipped-surface summary), REDIRECT_LOOP_FIX.md call-site table row removed, server-auth.ts:11 comment now lists `withPageAuth` only |
| D12 | Paired AGENTS.md pointer/example edits for `shared/lib/enum.ts` + `shared/lib/safe-url.ts` deletions (T2.1 verdict: DELETE): `backend/db/schema/AGENTS.md:38` + `backend/db/seeds/AGENTS.md:63` ("Check backend/db/schema/enums.ts or shared/lib/enum.ts" — drop the dead alternative), `shared/AGENTS.md:17/26/74` (isSafeUrl import examples — swap to a live file, e.g. `@/shared/lib/email`), `shared/AGENTS.md:41` file-org table (lists non-existent `social-links.ts`, `phone/`, `logger/`) | T2.1 | T2.2 / D8 docs wave | ✅ Done | phase2-t22-files-deletion-outcome.md | All shipped in the same changeset as the deletions: schema+seeds AGENTS.md enum-verification rules now point at `backend/db/schema/enums.ts` only; shared/AGENTS.md positive/negative/extracting examples swapped to live symbols (`isValidEmail` from `@/shared/lib/email`, `isSafeRedirect` from `@/frontend/lib/safeRedirect`); file-org table `shared/lib/` row examples now all live files (`email.ts`, `mask-full-name.ts`, `isolate-bidi.ts`, `locale/`, `timezone/`) — this also incidentally clears the D13 `shared/AGENTS.md:41` sub-item |
| D13 | Phantom references surfaced by the T2.1 proof: `.env.example:421-436` appearance block (references non-existent `backend/services/appearance/appearance-settings.service.ts` + `DEFAULT_APPEARANCE_FIELDS`), `shared/schemas/appearance.schema.json:5` ("mirrored from backend/types/appearance.types.ts" — stale after deletion), root `AGENTS.md:448-450` (docs/backend/types-consolidation.md + docs/architecture/import-export-conventions.md absent), `codegen.ts:4-7` (references non-existent `@/frontend/types/localized-string.types`), `shared/AGENTS.md:41` (non-existent shared/lib entries) | T2.1 | D8 docs refresh wave | ✅ Done | Phase 5 docs wave | .env.example appearance block removed (0 APPEARANCE/APP_BRANDING consumers); root AGENTS.md dead doc refs removed (types-consolidation, pothos-field-factories, import-export-conventions + paired cron-service.md/shared-types-pattern.md); codegen.ts phantom type pointers → live @/shared/locale/AppLocale; shared/AGENTS.md file-org table + shared/types prose aligned to reality; eslint.config.mjs oxlint-categorize entry + opencode.json instructions key removed. shared/schemas/appearance.schema.json survives unreferenced (deletion outside text-only boundary — follow-up). Evidence: outcome/phase5-docs-truthfulness-outcome.md |
| D14 | Root `AGENTS.md:126-133` barrel mandate ("every nested subdirectory that has exportable modules MUST have its own index.ts" + "always import from the highest available barrel", initial commit 486547d) contradicts the shipped deep-import practice (commit 1723cfc: "explicit paths instead of barrel imports"; shared/AGENTS.md:34 "prefer deep imports"). 15 of the 38 knip-flagged files are dead barrels existing only for the old convention | T2.1 | D8 docs wave / orchestrator decision | ✅ Done | Phase 5 docs wave | Root AGENTS.md:123-127 barrel MANDATE replaced with "Import & Barrel Conventions": deep imports default (per shared/AGENTS.md), barrels only while knip-proven-consumed — cites live examples (@/backend/types ~184 import sites, @/backend/db/repo ~62, @/shared/locale ~123, @/backend/services ~20, @/shared/constants ~13, GraphQL side-effect barrels as knip entries); barrel mechanics + no-re-export-shims retained; dead collisions-registry/import-export-conventions pointers dropped. Evidence: outcome/phase5-docs-truthfulness-outcome.md |
---

## Status Values

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- 🔄 **In Progress** — Currently being worked on

---

---

## Status Values

- ✅ Done — completed and verified
- 🔄 In Progress — currently being worked
- Blocked (see table) — not resolved, plan cannot complete until addressed

---

## Enforcement

Final gate: the blocked/partial status markers in the ledger table (search for the blocked-status and warning-status emoji) must count 0 before plan completion.
