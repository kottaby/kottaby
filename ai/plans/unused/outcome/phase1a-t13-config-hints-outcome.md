# Phase 1.3 — T1.3 Config Hints Outcome

**Task:** Resolve knip's 19 configuration hints (stale entry patterns + provably-empty ignore rules) + add `check:unused` script.
**Branch:** `feat/clean-unused` · **Date:** 2026-09-06 · **Agent:** general-purpose subagent (config hints)

---

## Result

Config hints **19 → 2**. The 2 remaining are informational extension hints (`.mdx`, `.css` — "Compiled extension excluded by project"): inherent to `project` globs being `*.{ts,tsx}` only; per Phase 0 §1.10 these are informational, not actionable removals. All 17 actionable hints resolved (7 entry patterns + 10 ignore-family rules). No knip finding counts changed (removal proven — see §4).

---

## 1. `check:unused` script added (Step 1)

- `package.json`: `"check:unused": "bun node_modules/knip/bin/knip-bun.js"` — placed directly after `check:deps`, next to `check:duplicates`.
- Uses the Bun-safe invocation (Phase 0 §5.12: node/bunx knip crashes with `RangeError` — oxc-parser raw transfer needs a ~6.4 GB ArrayBuffer, host has 4.1 GB / no swap).
- Verified: `bun run check:unused` → exit 1 with findings reproduced (expected pre-cleanup). NOT wrapped in `run-locked-cmd.ts` so it never waits on the quality-gate lock queue; knip is read-only and ran safely alongside the dev server on :3000 (untouched throughout).

## 2. 7 stale entry patterns removed (Step 2)

Removed from `knip.config.ts` `entry` (Phase 0 verified zero matching files; re-verified in baseline run — each was a "Refine entry pattern (no matches)" hint):

| Pattern | Reason |
|---|---|
| `app/**/loading.tsx` | no such file anywhere in `app/` |
| `app/**/error.tsx` | none (note: `biome.json` still carries a dead `app/**/error.tsx` override — out of T1.3 scope, see deferred items) |
| `app/**/template.tsx` | none |
| `app/**/actions.ts` | none (Server Actions not used) |
| `test/ui/e2e-preload.ts` | file deleted; stale entry |
| `test/integration/preload/live-comm-preload.ts` | file deleted; stale entry |
| `test/integration/preload/live-fx-preload.ts` | file deleted; stale entry |

**Documented tradeoff (per plan):** if Next.js convention files (`loading.tsx`/`error.tsx`/`template.tsx`) or Server Action files (`actions.ts`) are introduced under `app/` later, knip will flag them as unused until the pattern is re-added to `entry`. Acceptable — hints would surface it immediately.

The preload entry-block comment was updated to only name surviving consumers.

## 3. Broken scripts `test:live-fx` / `test:live-comm` — decision: KEEP (evidence below)

Evidence gathered:

- `git log --oneline --all -- test/integration/preload/` → **empty**: the preload files were never committed; no commit records a deliberate deletion.
- `git log --all --oneline -- "test/integration/fx/*" "test/integration/communication/*" "test/integration/preload/*"` → **empty**: the target test dirs never existed in git history either. Only `test/integration/AGENTS.md` + `test/integration/redis/` are tracked under `test/integration/`.
- Both scripts were added in the initial commit (`486547d`) and never touched — broken on arrival.
- Static reproduction: `bun --preload ./test/integration/preload/live-fx-preload.ts -e "1"` → `error: preload not found "./test/integration/preload/live-fx-preload.ts"`.
- Reference grep (`.github/`, `docs/`, `AGENTS.md`, nested AGENTS.md files): **zero CI or `docs/` references**, but **AGENTS.md docs DO reference the scripts**: root `AGENTS.md:47-48`, `test/integration/AGENTS.md:35-36,51,94-95` (describes the whole missing `preload/` surface), `backend/services/AGENTS.md:58-59`.

Decision rationale: the task's removal condition was "git history confirms deliberate deletion AND no CI/docs reference the scripts". Git history shows no deletion at all (files never committed), and AGENTS.md docs (inside the task's own grep scope) reference both scripts → evidence falls in the ambiguous branch → **scripts kept**, deferred rows added (`deferred-items.md` D1/D2) for a follow-up that removes the scripts together with the stale AGENTS.md references (AGENTS.md is outside T1.3's permitted edit set). Removing scripts while leaving the docs pointing at them would create dangling doc references pointing at nothing.

## 4. 10 ignore-family rules removed — WITH PROOF (Step 3)

Removed in one batch (9 `ignore` patterns + 1 `ignoreBinaries` entry, plus their justification comments; the comments documented historical false-positive classes that no longer occur):

`**/.*/**`, `storage/**`, `**/*.d.ts`, `backend/enum/shared/country.enum.ts`, `backend/enum/permissions/permission.enum.ts`, `shared/locale/namespaces/index.ts`, `backend/types/meeting/index.ts`, `backend/services/communication/channels/whatsapp/cloud-api/index.ts`, `frontend/lib/payment-method.ts`, `ignoreBinaries: ["copilot"]` (key removed entirely — sole entry).

**Proof (remove-and-re-run, per plan rule — never blanket-remove):**

| Category | Before | After | Δ |
|---|---|---|---|
| Unused files | 38 | 38 | 0 |
| Unused dependencies | 82 | 82 | 0 |
| Unused devDependencies | 35 | 35 | 0 |
| Unlisted dependencies | 3 | 3 | 0 |
| Unused exports | 89 | 89 | 0 |
| Unused exported types | 87 | 87 | 0 |
| Unused enum members | 4 | 4 | 0 |
| Unused namespace members | 2 | 2 | 0 |
| Configuration hints | 19 | 2 | −17 |

Beyond counts, a line-for-line diff of the entire findings section (lines 2–349, everything except the hints block) between `/tmp/knip-baseline-t13.txt` and `/tmp/knip-after-ignore-removal.txt` is **byte-identical** (whitespace-normalized): **zero new findings revealed**. Every removed rule demonstrably suppressed nothing → removal proven, **no restoration needed**, no newly-revealed carry-forward findings.

Note: the count delta vs Phase 0's baseline (exports 90→89, duplicates 2→0) comes from the parallel T1.1 duplicate-exports task (both files show as modified in the working tree), not from T1.3.

Surviving (proven-curated, untouched) ignores: `!.storybook/**`, `**/generated/**`, `frontend/stories/**` (with comment), `shared/constants/iana-timezone.enum.ts` (with comment), and `ignoreDependencies: [lint-staged, jscpd, @cspell/dict-ar, @cspell/eslint-plugin]`.

## 5. Gates

- **knip** `bun run check:unused` → exit 1 (expected — Phases 2/3 findings remain); config hints 2 (informational only).
- **tsgo** → **exit 0** via `bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit` (the Phase-0-verified direct invocation — see discovery below). 0 type errors.
- **biome** scoped (non-mutating) `bunx @biomejs/biome check knip.config.ts package.json` → exit 0, "Checked 2 files … No fixes applied".

### Discovery: `bun run tsgo` full chain hangs in this sandbox (pre-existing, NOT caused by T1.3 edits)

`bun run tsgo` = `restore-next-env-dts.ts && run-locked-cmd.ts tsgo …`. The restore script imports `@/scripts/lib` (barrel), whose chain (`resolve-notification-recipients.ts` → `@/backend/db`) initializes the PGlite singleton under `DB_PROVIDER=pglite`; after the script body completes (it prints nothing when content already matches), the PGlite handle keeps the event loop alive → process never exits. Reproduced standalone: `timeout 45 bun run scripts/restore-next-env-dts.ts` → prints "PGlite initialized successfully", then exit 124 (timeout). `run-locked-cmd.ts` is unaffected (it calls `process.exit`). Deferred as D3. My edits (package.json scripts / knip.config.ts) are not imported by either script, so they cannot be the cause; the inner command passing at exit 0 proves the type graph is clean.

## 6. Files modified

- `package.json` — added `check:unused` script (2 broken `test:live-*` scripts intentionally KEPT, see §3).
- `knip.config.ts` — removed 7 stale entry patterns, 9 empty ignore rules + `ignoreBinaries` block with their comments.
- `ai/plans/unused/outcome/phase1a-t13-config-hints-outcome.md` (this file), `worklog.md` (append), `ai/plans/unused/tasks.md` (T1.3 checkbox), `ai/plans/unused/deferred-items.md` (rows D1–D4, examples replaced with the live ledger).

(Working-tree diff also contains the parallel T1.1 task's edits to `backend/db/index.ts` + `scripts/lib/process-lock-helpers.ts` — not mine, untouched.)

## 7. Carry-forward / deferred (see `deferred-items.md`)

- **D1** — broken `test:live-fx`/`test:live-comm` scripts: remove together with AGENTS.md doc cleanup (needs an AGENTS.md-capable task).
- **D2** — stale AGENTS.md references to non-existent `test/integration/{preload,fx,communication}` surfaces (root `AGENTS.md:47-48`, `test/integration/AGENTS.md:35-36,51,94-95`, `backend/services/AGENTS.md:58-59`).
- **D3** — `bun run tsgo` chain hangs: `scripts/restore-next-env-dts.ts` lacks an explicit exit; PGlite singleton (import side-effect) keeps the event loop alive. Workaround documented (direct inner command). Fix: `process.exit(0)` after main, or break the barrel import side-effect.
- **D4** — dead `biome.json` override for `app/**/error.tsx` (matches nothing; Phase 0 §5.11 phantom-reference list) — biome.json outside T1.3 edit scope.
- Documented tradeoff (not a ledger row): future `app/**/{loading,error,template}.tsx` / `app/**/actions.ts` files will be knip-flagged until re-added as entries.

## 8. Evidence artifacts

`/tmp/knip-baseline-t13.txt` (19 hints), `/tmp/knip-after-ignore-removal.txt` (2 hints, findings byte-identical), `/tmp/tsgo-t13.txt` + `/tmp/tsgo-t13-direct.txt` (hang repro + passing direct run exit 0).
