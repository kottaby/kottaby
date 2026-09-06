# R1 fixes — Fix pass for review iteration 1 findings (doc-truthfulness residue)

**Agent:** fix subagent (R1 findings cluster) · **Branch:** `feat/clean-unused` (pin verified) · **Inputs:** `round-R1-review-types-outcome.md`, `round-R1-review-backend-outcome.md`

**Scope:** 8 findings (2 MEDIUM / 6 LOW) + 1 INFO item — all doc/comment-truthfulness residue; zero code defects to fix. Each target was re-verified stale via grep before editing; none proved live (0 false positives).

## Per-finding fixes

1. **[MEDIUM] test/ui/AGENTS.md:175-176,179,262 — broken canonical example (deleted `Translation` registry + un-exported `TestWrapper`). FIXED.**
   - Verified: `shared/locale/namespaces/translation.ts` deleted (only this doc imported it); `test/ui/components/TestWrapper.tsx` now exports only `renderWithWrapper` (`TestWrapper` survives un-exported, in-file).
   - Rewrote the canonical example (L168-183) around the live label-resolution surface: `import { HandshakeCode as HandshakeCodeNs } from "@/shared/locale/namespaces/handshakeCode"` + `getTranslations` from `@/shared/locale/server` + `HandshakeCodeNs.getLabels(getTranslations(locale))` + `import { renderWithWrapper } from "@/test/ui/components/TestWrapper"` — mirrors `test/ui/components/students/HandshakeCodeCard.test.tsx:45-49,195` exactly.
   - Consequential same-file prose rewrites (the example's direct scaffolding — required for the example to be internally consistent, all anchored to verified-live symbols):
     - L135 "Component Test Conventions" bullet: `TestWrapper` → `renderWithWrapper` (+ MockedProvider wrap note).
     - L164-166 "Setup": preload description reworded to the live behavior (namespace-handle warming via `.getLabels(...)`, `next/navigation` mock — matches `test/ui/components/translation-preload.ts:75-99`); dropped the pre-existing phantom `readTranslation`/Suspense description (it directly framed the rewritten example; the review noted it as out-of-scope pre-existing, but the instruction to rewrite "around a live helper" necessarily retired it from the example cluster).
     - L185-193 "Define `locale` Once": locale threading sentence → live helper names.
     - L195-208: section retitled `renderWithWrapper` Must Receive the Same `locale`; provider stack described truthfully (`LocaleProvider` → emotion cache → `ThemeProvider`, per TestWrapper.tsx; dropped the nonexistent `TranslationProvider`); single `renderWithWrapper(<Component />, { locale })` example.
     - L210-228 "Two Test Patterns": both pattern examples rewritten to live symbols (`HandshakeCodeNs.getLabels(...)` + `renderWithWrapper(..., { locale })`, real keys `copyCode`/`codeCopied`).
     - L232 prohibited-list: "must come from `readTranslation(handle, locale)`" → namespace label resolution.
     - L260-271 "Namespace Handle Discovery": deleted-registry prose + 6-row `Translation.*` handle table (all keys from deleted meeting surfaces) replaced with the live per-namespace module layout (`@/shared/locale/namespaces/<name>` + `registry.ts` `namespaces` object) and a 4-row table of verified-live handles (`HandshakeCode`, `Errors`, `Dashboard`, `Notifications` — key names verified against `shared/locale/types/*`).
   - Untouched (out of scope, pre-existing): the E2E section's `getDefaultTranslations()` example (helper is live) and the "Apollo Mock Requirement" section's `{ mocks: [...] }` option (pre-existing divergence, not flagged).

2. **[MEDIUM] shared/schemas/appearance.schema.json — orphaned dead artifact. DELETED.**
   - Verified 0 references: `grep -rn "appearance.schema" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" .` → only the file's own `$id`, `worklog.md` history lines, and `ai/plans/**` plan artifacts. Also verified `AppearanceFields`/`appearance_settings`/`PerModeColors` appear in zero code files; `shared/schemas/` held only this file; claimed mirror source `backend/types/appearance.types.ts` deleted. (This also resolves the D13-tracked follow-up deletion and the review-backend INFO about its stale mirror-pointer line 5.)

3. **[LOW] docs/auth/REDIRECT_LOOP_FIX.md:139 — stale `frontend/hooks/useAuthToken.ts` row. FIXED (row removed).**
   - Verified: file deleted in the changeset; `useAuthToken` exists in zero TS/TSX (only ai/** records); `frontend/hooks/**` has no files. Adjacent rows left intact.

4. **[LOW] docs/DATABASE_MIGRATIONS.md:97 — stale `shared/lib/enum.ts` reference. FIXED (reworded).**
   - Verified: `shared/lib/` has no `.ts` files; `test.custom_alt` exists in zero code files. Historical narrative kept, present-tense stale claim converted to accurate history: "The value `test.custom_alt` was already emitted by the schema migration's `app_permission` enum (the `shared/lib/enum.ts` catalog that also carried it has since been removed with the rest of that permission surface)."

5. **[LOW] backend/graphql/AGENTS.md:111 — deleted `LocalizedString` rationale. FIXED (reworded).**
   - Verified: `LocalizedString` type exists in zero TS files (only `codegen.ts`'s inline scalar mapping, which writes the shape inline — not the type); `inputType(string-named)` pattern is live (wallet/plan/admin pothos modules). Rationale reworded to the general, still-true reason: `inputRef` couples the input's nullability to the backend type's exact shape.

6. **[LOW] backend/types/AGENTS.md:56 — phantom `shared/types/pagination.types.ts` row. FIXED (row removed).**
   - Verified: `shared/types/` directory deleted; `PaginationInput` exists in zero TS files. Adjacent L51 `docs/backend/shared-types-pattern.md` pointer left untouched (pre-existing phantom, explicitly out of the finding's scope).

7. **[LOW] docs/auth/user-registration.md:287 — stale `AuthService.getMe(ctx)` pointer. FIXED (reworded to live path).**
   - Verified: `AuthService` has no `getMe` (deleted, commit `affb113`); the `me` query's resolver (`backend/graphql/query/auth.query.ts:32-51`) returns `ctx.user` directly. Row now reads: "`query me` → `backend/graphql/query/auth.query.ts` (the resolver returns `ctx.user` directly — no service method)". Behavioral bullets kept (they match the resolver contract).

8. **[LOW] backend/db/pglite-pool.ts:7 — docblock advertised deleted `getClient`. FIXED.**
   - Verified current surface: the shim feeds `backend/db/index.ts`, whose live exports are `db`, `getDrizzleDbPool`, `queryDb`, `closePool` (no `getClient`, no exported `pool`-named symbol). Docblock API list updated to `db`/`getDrizzleDbPool`/`queryDb`/`closePool`. The shim's own pool-like surface list (`query`/`connect`/`end`/`on`, L141) is still accurate and untouched.

9. **INFO backend/db/index.ts:218 — "introspection dashboards" phrasing. FIXED (reworded).**
   - Verified: `backend/db/introspection/**` deleted; live `queryDb` consumers are repositories (students, billing/plan, platform-analytics, admin governance, session) + test/workflow helpers. Docblock now: "Preferred for read-only raw-SQL paths in repositories and scripts — typed rows without the Drizzle query builder."

## False positives kept

None — every flagged reference was verified stale before editing; nothing proved live.

## Verification (after all fixes)

| Gate | Command | Result |
|---|---|---|
| Types | `timeout 240 bun run tsgo` | **exit 0** — 0 errors |
| Unused code | `bun run check:unused` (knip) | **exit 0** — only the pre-documented informational `.mdx` config hint; **no new finding after the appearance.schema.json deletion** (JSON is knip-invisible; the file was verified orphaned by grep) |
| Lint | `bunx @biomejs/biome check .` | clean — 1417 files checked, no fixes applied (non-mutating) |
| Dev server | `curl http://localhost:3000/` | **200** |

## Files changed

- `test/ui/AGENTS.md` (edited — finding 1)
- `shared/schemas/appearance.schema.json` (**deleted** — finding 2; `shared/schemas/` now empty on disk, git-invisible)
- `docs/auth/REDIRECT_LOOP_FIX.md` (edited — finding 3)
- `docs/DATABASE_MIGRATIONS.md` (edited — finding 4)
- `backend/graphql/AGENTS.md` (edited — finding 5)
- `backend/types/AGENTS.md` (edited — finding 6)
- `docs/auth/user-registration.md` (edited — finding 7)
- `backend/db/pglite-pool.ts` (edited — finding 8, comment-only)
- `backend/db/index.ts` (edited — INFO item, comment-only)

No code files changed beyond comments; no exports/signatures touched; no plan-artifact references added to code comments; dev server and tests untouched (no test runs).
