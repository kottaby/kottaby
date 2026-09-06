# R1 review-types — Type-safety review of the cleanup changeset

**Agent:** review-types subagent (fresh iteration 1) · **Branch:** `feat/clean-unused` (pin verified) · **Baseline:** `1c134db`

## Scope

- `git diff 1c134db HEAD --shortstat`: **197 files changed, 3150 insertions(+), 6688 deletions(-)** across backend/frontend/shared/test/scripts (+ `app/` zero changes).
- 47 files deleted repo-wide (46 in the reviewed trees + `.storybook/shims/node-process.ts`); 274 `export` lines removed; 109 deleted/trimmed type-level names extracted and audited.

## Verification (re-run this round)

| Gate | Result |
|---|---|
| `bun run check:unused` (knip) | **exit 0** — 1 informational config hint (.mdx extension; ledger-documented in phase1a-t13 / phase6 outcomes) |
| `timeout 240 bun run tsgo` | **exit 0** — 0 errors |
| `bunx @biomejs/biome check` (scoped: 6 key changed files) | clean, no fixes |

## Findings

**[MEDIUM] test/ui/AGENTS.md:175-176, 179, 262 — canonical test-writing example imports two symbols broken by this changeset.**
- L175: `import { Translation } from "@/shared/locale/namespaces/translation";` — module **deleted** in this changeset (`shared/locale/namespaces/translation.ts` in deleted-files list).
- L176: `import { TestWrapper } from "@/test/ui/components/TestWrapper";` — `TestWrapper`'s `export` keyword **dropped in this changeset** (diff of `test/ui/components/TestWrapper.tsx`: `-export function TestWrapper` → `+function TestWrapper`); only `renderWithWrapper` is exported now, and all live test files import exactly that (`test/ui/components/students/HandshakeCodeCard.test.tsx:49`).
- L179 + L262 still document `Translation.Dashboard…` handle constants and "Namespace Handle Discovery" via the deleted `Translation` registry.
- Not covered by any deferred-ledger row (D2/D12/D13/D14 target other files); `test/ui/AGENTS.md` was not edited while 9 other AGENTS.md files were updated. Agents following this guidance hit module-not-found / no-export errors. (Note: the same example's `readTranslation` import at L174 was already phantom pre-baseline — pre-existing, out of scope.)

**[MEDIUM] shared/schemas/appearance.schema.json:6 — orphaned dead artifact left behind by the appearance-surface deletion.**
- Zero references repo-wide (`shared/schemas` + `AppearanceFields` grep: only the file itself); nothing validates or loads it.
- Describes a surface fully deleted by this changeset: `AppearanceFields` / per-mode brand colors — no `appearance_settings` / `AppearanceSettings` remains anywhere in backend; `backend/types/appearance.types.ts` (its claimed source) is deleted.
- Header still claims "Source of truth mirrored from `backend/types/appearance.types.ts`" — a dangling pointer. JSON files are invisible to knip/tsgo, which is why it survived. Deferred ledger D13 notes it "survives unreferenced (deletion outside text-only boundary — follow-up)" but **no ledger row tracks that follow-up deletion** — recommend registering it.

**[LOW] docs/auth/REDIRECT_LOOP_FIX.md:139 — missed paired-doc row for a file deleted in this changeset.**
- Row `| frontend/hooks/useAuthToken.ts | Hook for auth token in React state |` — file **deleted** (`git diff --name-status`: `D frontend/hooks/auth/useAuthToken.ts`). The doc WAS edited in this changeset (D11 removed the `requireRoleForPage.ts` row at ~L211) but this row was missed — incomplete paired cleanup.

**[LOW] docs/DATABASE_MIGRATIONS.md:97 — stale reference to deleted `shared/lib/enum.ts`.**
- "The value `test.custom_alt` is already defined in `shared/lib/enum.ts`" — file deleted in this changeset. D12 pruned the AGENTS.md references to `shared/lib/enum.ts` (schema/seeds/shared) but missed this one. Historical migration narrative; doc-only.

**[LOW] backend/graphql/AGENTS.md:111 — design note cites the deleted `LocalizedString` type.**
- "Use `inputType(string-named)` instead of `inputRef<BackendType>` to avoid LocalizedString null incompatibility" — `LocalizedString` was deleted in this changeset (`shared/types/localized-string.ts`, `shared/types/index.ts`); the symbol exists in zero TS files, and `schema.graphql` contains no LocalizedString. The rationale note now references a nonexistent type; file was not among the updated AGENTS.md set.

**[LOW] backend/types/AGENTS.md:56 — "Completed extractions" entry now points at a fully-deleted location (pre-existing phantom, newly fully-dead).**
- Cites `shared/types/pagination.types.ts` — phantom even at baseline (baseline `shared/types/` held only `index.ts` + `localized-string.ts`), but this changeset deleted the **entire `shared/types/` directory**, making the entry doubly dead. Adjacent L51 also cites absent `docs/backend/shared-types-pattern.md` (pre-existing phantom; D13 pruned it from root AGENTS.md but not here). `backend/types/AGENTS.md` was not edited in this changeset. Flagged for completeness; origin is pre-existing.

## Per-category results (all checked, 0 code-level findings)

- **Type deletions (109 names): 0 findings.** Every surviving use is a same-file re-inline (export dropped, symbol kept — 51 re-declarations audited). No zod `z.literal` string refs, no `satisfies` chains, no generic-inference breakage (`PoolClient`/`QueryResult*` consumers now import from `pg` directly; `RawGender`/`RawLinkStatus`/`RawUserRole` derive from live `*SelectType`s). GraphQL `frontend/graphql/generated/schema.graphql` is **byte-identical** to baseline — no type-name string was orphaned.
- **Export drops: 0 findings.** Sole dynamic-import site `test/workflows/parents/parent-link-request.journey.test.ts:379-382` (`const mod = await import(SERVICE_PATH)` → `mod.ParentLinkRequestService`) still resolves (`export namespace ParentLinkRequestService` at parent-link-request.service.ts:144). `RAW_ERROR_HOP` export-drop safe: declared `Symbol.for("dev3-002.graphqlBoundary.rawError")` module-locally, key preserved, no cross-module symbol access anywhere. All dropped Pothos object consts (`AdminUser*PothosObject`, `PlatformAnalytics*PothosObject`, `TeacherTransactionPothosObject`, `DateTimeScalar`) are consumed in-file only and keep their `gqlSchemaBuilder` registration chains; deleted Pothos barrels (`pothos/billing/index.ts`, `pothos/parents/index.ts`) were re-export-only — registration flows through `gqlSchema.definitions → query/mutation index → leaf .pothos modules` (verified: `query/index.ts:23-24`, `mutation/index.ts:28-29`). `TestWrapper`/`renderWithWrapper`, `resolveUserRole`/`userRoleField`, `truncateSafely`, `WALLET_LEDGER_PAGE_LIMIT`, `NOTIFICATION_INBOX_*`, `publishAfterCommit`, `generateHandshakeCode`, `EM_DASH_PLACEHOLDER`, `expectSnackbar`, `useLocaleContext`, `EXCLUDED_IANA_TIMEZONES` — all in-file-only, zero external refs. `getClient`/`getPool` (backend/lib/db barrel deleted): zero baseline callers outside their own module.
- **Import path consistency: 0 findings.** All new imports in the diff use `@/` aliases or same-dir relative (`./skip-when-pglite`, `./seed-plans` — allowed). No relative cross-layer imports in any changed file. No new cross-layer imports: frontend/shared source trees import neither `@/backend` nor `@/frontend` from shared (the `frontend/graphql/test/**` → `@/backend` imports are pre-existing test-layer wiring, unchanged by this diff).
- **Enum usage: 0 findings.** All `gqlSchemaBuilder.enumType(...)` registrations in `backend/graphql/pothos/shared/enum.pothos.ts` use **value imports** (L32-46). `isAdminUserGovernanceFilter` guard fully deleted with zero remaining references (backend/frontend/shared/test/scripts/app). `AdminUserGovernanceFilter` enum itself intact and registered (L187-188). knip enum ignores (`payment-status`, `register-public-role`, `surah-juz-ref`, `recitation-reading`) each carry the one-line justification mandated by the plan.
- **Duplicate type definitions: 0 findings.** No deleted type name is re-declared in more than one file post-cleanup. `RowActionKind` exists as teacher (`"start"|"complete"|"cancel"|"dispute"`) and student (`"cancel"|"dispute"|"confirm"`) variants — both declared at baseline; this changeset only dropped the student variant's `export` (in-file use only). Pre-existing, not new duplication.
- **Import-path orphans for deleted modules: 0 code findings.** Grep of every deleted file's path string (minus extension) across package.json scripts, configs, docs, workflows found no TS/config consumer: `backend/lib/db` barrel deleted but leaf imports (`escape-like-wildcards`, `with-transaction`) resolve; `shared/lib/timezone` barrel deleted but leaf `excluded-iana-timezones` still imported by `scripts/iana-timezone-generator/cli.ts:26`; `seedOrGetPlans` barrel line removed but the direct leaf import in `plan-seed.test.ts` is live. Residual stale references are the doc findings listed above.

## Informational (no action required)

- Empty `shared/i18n/` directory left on disk after all 4 files were deleted — git-invisible (empty dirs untracked), cosmetic only.
- knip `.mdx` config hint: informational, pre-documented in `phase1a-t13-config-hints-outcome.md` and `phase6-final-verification-outcome.md`.

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 2 (both docs/config-level: stale AGENTS.md import guidance; orphaned appearance.schema.json) |
| LOW | 4 (stale doc references to deleted files/types) |

**Zero code-level (runtime/type-safety) findings.** All 6 findings are documentation/config-level weak-signal residue: stale references in files that were either not edited or only partially edited during the paired-docs waves. No source changes requested (review is read-only).
