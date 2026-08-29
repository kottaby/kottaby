# Round R9 Review Outcome — DEV1-013 Student Handshake Code Generation

**Reviewer:** Independent fresh-context R9 (no prior-review knowledge; outcome files 6.x / round-R*.md / worklog review sections NOT read)
**Scope:** `git diff origin/main HEAD --name-only` → 63 code files (backend service/repo/GraphQL, frontend views/nav/cache, shared constants/i18n, test infra + 15 new suites)
**Gates run:** `bun run tsgo` → **0 errors** (clean exit, process-lock log only)

---

## 1. Findings by severity

### NEW findings (verified in this diff's touched lines)

**No BLOCKING / HIGH / MEDIUM findings.** Three LOW/INFO observations:

- **[LOW — observation, deliberate & documented]** `test/preload/apollo-dev-flag.ts:39` + `bunfig.toml:14` — the preload forces `globalThis.__DEV__ = true` for **every** `bun test` run (bunfig `[test]` preload applies to all invocations, not just Apollo suites). Verified blast radius: a full `node_modules` scan shows **only `@apollo/client`** reads `globalThis.__DEV__` (react/graphql/graphql-tag/relay-style globals all define `__DEV__` per-bundle at build time). Behavioral deltas are Apollo dev-only diagnostics + dev-mode `maybeDeepFreeze` on cache reads/writes. Empirically verified side-effect-free for existing suites: ran the three most Apollo-involved existing suites under the new preload chain — `frontend/graphql/test/warnings/warning-surfacing.test.ts`, `frontend/providers/apollo/apolloCache.test.ts`, `frontend/providers/apollo/error-link.map.test.ts` → **48/48 pass**. Residual (future, not current): any future suite that *mutates objects read back from the Apollo cache* will now throw (dev-mode freeze); no current suite does. NEW.
- **[LOW — fragility note]** `test/ui/page-guards/parent-handshake-page.test.ts:61-96` — the process-global `mock.module("next/navigation")` / `next/headers` / `server-auth` doubles are safe **because the suite runs isolated via `run-test.ts`** (header comment documents this). If page-guard files are ever batched into one process and two files import the *same* page module, the first file's mock binding wins for the shared instance (each file's `mock.module` only affects later imports). Currently one file → no defect. NEW.
- **[INFO]** `backend/db/repo/students/student.repository.ts:139-176` — `findDiscoveryByHandshakeCode` maintains two parallel implementations (Drizzle select-in-tx + raw parameterized SQL via `queryDb`) of the same read; column-alias drift between branches is structurally possible. Mitigated: shared `readSql` comment pins the alias contract AND `backend/db/test/repo/students/student.repository.test.ts` explicitly exercises **both** executor tiers (tx-provided and default-executor). Acceptable per repo AGENTS.md Neon-fast-path convention. NEW.

### PRE-EXISTING (not introduced by this diff — excluded)

- `test/ui/components/locale-switcher.test.tsx:83` leaves `testNavigationState.locale = "en"` after its final test (mutable global in `translation-preload.ts:45`). This diff did not add the mutation pattern and the new suites never depend on the default (all pass an explicit `locale` prop through `TestWrapper`), so no cross-suite flake is introduced. PRE-EXISTING pattern; this diff's touch of `translation-preload.ts` (HandshakeCode warm) is purely additive.
- No other pre-existing issues surfaced in the touched lines.

## 2. Four-lens verdicts

**Types — PASS.** `HandshakeCodeLookupReturnType` / `HandshakeDiscoveryRowType` canonical in `backend/types/students/student.types.ts` (single-sourced via `Pick`/indexed access on canonical select types, `readonly` throughout); Pothos object backed exclusively by the canonical return type (no local types). Barrels purely additive (`backend/services/index.ts`, `shared/constants/index.ts`, `sharedDocuments/index.ts`, locale namespaces) with ordering preserved. `NavLabelKey` in `navItems.ts` is a genuine compile-time cross-namespace collision guard (`Exclude` of `CollidingNavLabelKeys`) with a runtime mirror in `navItems.test.ts`. No unsafe type assertions observed (page-guards test narrows via `in`-guards; preload uses `Reflect.set` precisely to avoid one).

**Backend — PASS.** Validation strictly before read (`normalizeHandshakeCode` → `isHandshakeCode` → `ValidationError` before `findDiscoveryByHandshakeCode`); governance collapse (`isGovernanceExcludedFromDiscovery`) is fail-closed on corrupt windows (missing start / null / non-positive duration) and byte-identical to a miss; tx propagation via optional last-param `tx` honored on both repo reads; error taxonomy clean (`STUDENT_NOT_FOUND` NotFoundError, `VALIDATION` ValidationError, uncaught propagation to masking boundary — no try/catch in resolvers); log hygiene exemplary (submitted code never logged, bounded context bags, happy paths silent); no dead code; layer purity intact (resolver delegates, repo has zero business rules); D4 savepoint fix (`tx.transaction` wrapper in `createForRegistration`) correctly scoped and locked by tests.

**Frontend — PASS.** All four new components are `sx`-only, `*Outlined` icons only, theme-palette callback colors only (grep-verified: zero `style=`, hardcoded hex, `useLazyQuery` in the whole `frontend/views` tree); translations exclusively via namespace-handle property access; skip-gate via `skipToken` on the discovery query (zero-network proof for malformed input), refetch-based retry for the unchanged-code path; RTL/LTR handled by the load-bearing `dir="ltr"` **attribute** + `unicodeBidi: isolate` (stylis-plugin-rtl-proof) on both the code chip and the discovery input; `extensions.code` branching matrix complete on both cards (UNAUTHORIZED/FORBIDDEN → PermissionDeniedFallback; STUDENT_NOT_FOUND distinct from generic; VALIDATION re-judgment inline at the field); `HandshakeCodeLookup` registered `keyFields: false` with a FROZEN five-entry policy surface + behavioral no-standalone-entity proof; nav label ownership discrimination total and compile-guarded.

**Pentester — PASS.** BOLA: `myHandshakeCode` is zero-argument with identity exclusively from `ctx.user.id` (foreign-id probes die as GraphQL validation failures); BFLA: both fields use the explicit `$all` conjunction scope (no ANY-semantics leak, no admin/supervisor override — verified rationale in `handshake-code.query.ts:30-41`); BOPLA: payload closed by construction (`maskedName` + `linkable`, no id/contact/governance fields; `linkable` computed server-side, raw `parentId` never leaves the service); injection: only parameterized equality SQL (`$1`, no LIKE/sql-templates/inArray); oracle hygiene: governance-excluded and nonexistent codes collapse to one indistinguishable `null` channel, miss is never an error; brute-force rate limiting is the pre-seeded deferred item **D2 (DEV2-002)** in the deferred-items ledger — tracked, not a new gap.

## 3. R9 rotating emphasis — test-infrastructure impact audit

**(a) apollo-dev-flag global preload → side effects on existing suites: NONE FOUND.**
- Blast radius scan: only `@apollo/client` (`utilities/environment`) reads `globalThis.__DEV__`; graphql's `devAssert` does not consult the global; React defines its own bundle-level `__DEV__`. Confined to Apollo by construction.
- Dev-mode deltas = dev-only invariant warnings (suppressed from output by the bunfig `logger-mock` console no-op, observable only via spies — which is exactly what the new documents suite relies on) + dev-mode deep-freeze/clone in cache read/write paths.
- Empirical: ran the three most Apollo-coupled existing suites under the new preload chain → **48 pass / 0 fail**. New suites `navItems.test.ts` + `handshake-code.documents.test.ts` → **20 pass / 0 fail**, including the "dev-mode canary" test proving the zero-warning assertions are non-vacuous (an unpolicied write DOES emit invariant 118).
- Preload ordering in `bunfig.toml` is sound (guard → logger-mock → ensure-env → graphql-interop → apollo-dev-flag; the flag must precede the first `@apollo/client` module evaluation, which preloads guarantee for any file order). CLI `--preload` flags in `test:ui:components` merge with (run after) bunfig preloads — idempotent re-registration, no conflict.

**(b) translation-preload registration impact: ADDITIVE ONLY.** The diff to `test/ui/components/translation-preload.ts` adds the `HandshakeCode` namespace import + eager `getLabels` warm for both locales — no change to the `mock.module("next/navigation")` registration, no new mutable state. The warm surfaces missing-key drift at preload time (earliest failure point). Verified no other file under `test/ui/components` registers a competing `next/navigation` mock (grep: only the preload itself), so there is no double-registration ordering hazard in the component-suite process.

**(c) test isolation / global-state pollution of the new suites: CLEAN.**
- `HandshakeCodeCard.test.tsx`: `cleanup()` in `afterEach`; clipboard doubles restored via captured own-property descriptor (`originalOwnClipboard`) or `Reflect.deleteProperty` — user-event's persistent clipboard stub cannot leak across suites; no fake timers (documented rationale), deadline-poll instead of fixed sleep (flake seed removed); every Apollo `MockedProvider` is per-render (isolated cache instance).
- `HandshakeDiscoveryContainer.test.tsx`: `cleanup()` in `afterEach`; no `mock.module`, no fetch mocks, no timers, no direct `globalThis` writes; all state through React Testing Library.
- `handshake-code.documents.test.ts`: `spyOn` handles tracked in `activeSpies` and `mockRestore()`d in `afterEach`.
- DB-tier suites (`handshake-discovery.test.ts`, journey fixtures): tracked fixture ids hard-deleted in FK-safe order in `afterAll` (runs even on test failure); no shared-row mutation of pre-existing data observed.
- `__DEV__` write is idempotent and process-scoped (test runner processes only — never the dev server).

**(d) navItems.test.ts + page-guards mocking fragility: LOW.**
- `navItems.test.ts` performs **no app-router mocking at all** — it is a pure data/translation contract suite (`getNavItemsForRole`/`resolveNavItemLabel` over static namespace handles). Zero `next/navigation` dependency → zero router-mock fragility.
- `parent-handshake-page.test.ts` registers its module doubles **before** dynamically importing the page (correct ordering; the page's import graph binds to the doubles), and asserts container identity through the **same barrel path** the page uses (`@/frontend/views/parent/handshake`) so the `toBe` identity check cannot trip over a dual module instance. It runs isolated via `run-test.ts` by design. Residual fragility is the LOW note above (only materializes if page-guard files are ever batched into a shared process with overlapping page imports).

## 4. Gate evidence

| Gate | Result |
|---|---|
| `bun run tsgo` | **0 errors** (clean exit) |
| Existing Apollo-adjacent suites under new preloads (warning-surfacing, apolloCache, error-link.map) | 48/48 pass (run in this review) |
| New suites spot-run (navItems, handshake-code.documents incl. dev-mode canary) | 20/20 pass (run in this review) |
| `globalThis.__DEV__` consumers in node_modules | `@apollo/client` only |

## 5. Verdict

**APPROVE — no blocking findings.** The implementation is clean across all four lenses; the R9 emphasis audit (global test preloads) found the Apollo dev-flag to be Apollo-scoped, empirically non-regressive for existing suites, and self-proving via the canary test. The three LOW/INFO observations are documented design tradeoffs or future-proofing notes, none requiring action in this ticket.

**Next actions (optional, non-blocking):**
1. If a future suite needs to mutate Apollo cache-read objects, the dev-mode freeze interaction must be documented at that suite (preload doc already warns).
2. If more page-guard suites are added, keep one-file-per-process via `run-test.ts` (or extend the header comment's isolation contract) to preserve the mock-binding guarantee.
