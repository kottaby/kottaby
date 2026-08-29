# Round R4 Review Outcome — DEV1-013 Student Handshake Code Generation

**Reviewer:** R4 (independent fresh-context, all four lenses)
**Scope:** `git diff origin/main HEAD --name-only` — 16 commits (50eed83..67cdbfa), ~50 source/test files across shared/, backend/, frontend/, test/, app/.
**Type check:** `bun run tsgo` → **exit 0, zero errors** (verified twice).

---

## Rotating Emphasis 1 — GraphQL Layer End-to-End

Audited the full chain; **no defects found**:

- **Pothos object registration** — `backend/graphql/pothos/students/handshake-code.pothos.ts` registers `HandshakeCodeLookup` as a single canonical object type backed exclusively by `HandshakeCodeLookupReturnType` from `@/backend/types`; exactly `maskedName: String!` + `linkable: Boolean!`, no `id` (embedded value type), zero inline business logic. Matches the `teachers/applicant.pothos.ts` precedent; pothos sub-dir carries no barrel, registration rides the importing query module. ✅
- **Query module wiring / barrel chain** — `handshake-code.query.ts` has NO named exports (side-effect `gqlSchemaBuilder.queryField` only); chain `query/index.ts` → `./students` → `./handshake-code.query` → static import of the pothos object is complete and matches `backend/graphql/query/AGENTS.md`. All imports are top-level static (Bun ESM rule). ✅
- **Scope declaration vs permission matrix** — both fields carry the explicit `$all: { authenticated: true, role: [Student|Parent] }` conjunction (AND semantics — a plain map would leak via ANY semantics). `role` scope reads from `ctx.role` in builder.ts (verified), so the surface test's `contextValue: { role, user }` exercises the real scope-auth engine, not a stub. Declared matrix (Student-only self-read, Parent-only discovery, no admin/supervisor override) is pinned verbatim by `handshake-code-surface.test.ts` AND behaviorally by the 12-cell integration role matrix (anonymous→UNAUTHORIZED, sibling/teacher/supervisor/superAdmin→FORBIDDEN). ✅
- **Error finalizer propagation** — resolvers contain NO try/catch by contract; `ValidationError`/`NotFoundError` bubble to the masking boundary, which owns masking + the single correlated log line. Over-the-wire `extensions.code` values (`VALIDATION`, `STUDENT_NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`) are asserted end-to-end in `frontend/graphql/test/students/handshake-code.test.ts` (failure cells, locale propagation en+ar, Tier-4 re-signed-token substitution). ✅
- **Codegen artifacts consistency** — `frontend/graphql/generated/schema.graphql` exposes `findStudentByHandshakeCode(code: String!): HandshakeCodeLookup` (nullable) and `myHandshakeCode: String!`, and `HandshakeCodeLookup { linkable: Boolean!, maskedName: String! }`; `generated/gql/graphql.ts` contains the matching `MyHandshakeCode*` / `FindStudentByHandshakeCode*` operation types + serialized documents whose selection sets are byte-consistent with the hand-written shared documents in `sharedDocuments/students/handshake-code.documents.ts`. ✅
- **Public-operations allowlist posture** — both new queries are scoped, absent from `PUBLIC_OPERATIONS` (closed frozen six); posture pinned by two tests in the surface suite, including a frozen-six regression pin. The `bunfig.toml`/preload changes touch no gateway posture. ✅
- **Apollo cache** — `HandshakeCodeLookup: { keyFields: false }` registered (embedded-type policy), frozen five-entry policy surface pinned, behavioral no-standalone-entity proof added. ✅

## Rotating Emphasis 2 — Test-Quality Audit

Audited all new suites (service, repo, surface, integration matrix, documents, cache, UI components, page guards, journey, locks, immutability scan, constants, mask, parity):

- **Vacuous/tautological tests: none found.** Notably *anti-vacuous engineering*: the documents suite ships a dev-mode canary that proves a would-lose-data write through an UNPOLICIED cache DOES emit the warning — i.e. the zero-warning assertions are demonstrably live (`test/preload/apollo-dev-flag.ts` sets `globalThis.__DEV__ = true` process-wide because Bun otherwise runs Apollo in production posture where those assertions would be vacuously green).
- **Negative cases: comprehensive.** Malformed fuzz (%, `_`, `\`, unicode, RTL overrides, emoji, NUL, empty, whitespace-only, 5000-char payloads) with a repo-method spy proving zero DB reads (validation-before-read); `@ts-expect-error` negatives in the `.test-d.ts` type proofs; forbidden-payload-key scans + serialized identity-leak probes on the wire; denied role cells assert zero payload bytes.
- **Boundary tests are deterministic.** The strict suspension-window boundary uses a FIXED epoch (`new Date(1_700_000_000_000)`), not wall-clock — no flake window.
- **Test pollution: controlled.** Committed fixtures tracked with ids + hard-delete teardown + residue probes; rollback fixtures via `runInRollback`; log spies restored in `finally`. The `__DEV__` preload is process-wide but documented as diagnostics-only (console no-op'd by logger-mock preload).
- **One mild timing-dependence pattern found** (see findings, LOW).

## Findings

| Severity | Location | Description | Tag |
|---|---|---|---|
| LOW | `test/ui/components/students/HandshakeCodeCard.test.tsx:316` | Real-timer sleep (`TRANSIENT_CLEAR_SLEEP_MS = 2600` vs the 2000 ms `COPY_CONFIRMATION_RESET_MS` timer) to assert the transient copy-confirmation self-clears, instead of fake timers. 600 ms margin (30%) — generally safe but the classic slow-flake seed under heavy CI load; the in-file comment documents the tradeoff (waitFor act-wrapper overhead). Consider fake timers or extracting the constant for the test to reference. | NEW |
| LOW | `frontend/views/dashboard/navItems.ts:37-45` | `isDashboardLabelKey` discriminates the `keyof DashboardLabels \| keyof HandshakeCodeLabels` union via a RUNTIME `key in dashboardEn` check against the directly-imported EN leaf. Silent precedence: any future key that lands in BOTH namespaces resolves from the dashboard bundle with no error. No collision exists today (key sets verified disjoint), and both branches are tested — but type-level discrimination (per-namespace branded keys) would be collision-proof by construction. | NEW |

**No MEDIUM/HIGH/CRITICAL findings.** No pre-existing issues surfaced within the diff's touched lines.

## Four-Lens Summary

- **Types:** Canonical discipline exemplary — `HandshakeCodeLookupReturnType` is the single closed payload type; `HandshakeDiscoveryRowType` single-sourced via `Pick` indexed access; readonly interfaces; barrels (`shared/constants`, `backend/services`, `sharedDocuments`, locale namespaces/types, views) all wired alphabetically; `.test-d.ts` locks the key sets with `Equal<>` anchors. ✅
- **Backend:** Validation strictly before read (spy-proven); governance collapse to an indistinguishable `null` channel (fail-closed on incomplete suspension data); optional `tx` propagated verbatim on both repo reads; error taxonomy (`VALIDATION`, `STUDENT_NOT_FOUND`) localized via translations; log hygiene (submitted code NEVER logged, bounded context bags, happy paths silent, zero audit/notification writes probed); zero dead code; layer purity (repo = faithful reads, service = decisions). ✅
- **Frontend:** MUI `sx`-only with theme-palette callbacks; `*Outlined` icons throughout; all copy through compile-time namespace handles (property access, never `t('key')`); skip-gate via `skipToken` stateful `useQuery` (no `useLazyQuery` anywhere); `network-only` + forced `refetch` on unchanged-code resubmit; RTL/LTR handled via `dir="ltr"` attribute + `unicodeBidi: isolate` (cssjanus-proof) for the code atom and LTR input `dir` for the search field; `extensions.code` branching (UNAUTHORIZED/FORBIDDEN → fallback, VALIDATION → inline field, STUDENT_NOT_FOUND → specific alert, else generic). ✅
- **Pentester:** BOLA structurally absent on `myHandshakeCode` (zero args — probes die as validation failures); discovery is capability-by-code (32-bit entropy space ≈ 4.3B codes; oracle hygiene: miss and governance collapse byte-identical, no log side channel, deterministic response shape); no admin read override (verified in matrix); injection impossible (single parameterized equality, no LIKE/ILIKE/sql templates, fixed column list); permission matrix verified end-to-end incl. re-signed sibling-role and non-canonical-role token substitution (degrades to FORBIDDEN, never UNAUTHORIZED). Rate limiting on the discovery oracle is a gateway-wide pre-existing posture outside this diff (not introduced here). ✅

## Verdict

**PASS — APPROVED.** `bun run tsgo` = 0 errors. Zero blocking findings; two LOW non-blocking observations (test timing pattern, nav-key discrimination style) suitable for a follow-up polish ticket, not for re-review. The GraphQL layer is end-to-end sound and the test surface is among the strongest in the repo — including explicit anti-vacuousness canaries.
