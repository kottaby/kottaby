# Round R2 Review Outcome — DEV1-013 Student Handshake Code Generation

**Reviewer:** Review Iteration R2 (independent fresh context; no prior review outcome files 6.1–6.4 or worklog review sections were read)
**Date:** 2026-08-29
**Scope:** `git diff origin/main HEAD --name-only` — 131 files (impl + tests + plan artifacts + screenshots)

---

## 1. Mechanical gate

| Check | Command | Result |
|---|---|---|
| Type safety | `bun run tsgo` | **exit 0 — 0 errors** (clean output, no diagnostics) |

## 2. Scope reviewed (impl files, all read or diffed)

Shared: `handshake-code.constants.ts`, `mask-full-name.ts`, locale namespace/types/en/ar leaves, `errors` additions, `message.ts`.
Backend: `student.repository.ts`, `student-handshake.service.ts`, `student-handshake.helpers.ts`, `handshake-code.query.ts`, `handshake-code.pothos.ts`, all barrels (`query/index.ts`, `query/students/index.ts`, `services/index.ts`, `services/students/index.ts`), `student.types.ts`.
Frontend: `apolloCache.ts`, `handshake-code.documents.ts`, `HandshakeCodeCard.tsx`, `HandshakeDiscoveryContainer.tsx`, `HandshakeCodeSearchForm.tsx`, `HandshakeCodeResultCard.tsx`, `page.tsx` (parent/handshake), `navItems.ts`, `DashboardSidebar.tsx`, `RoleDashboardPage.tsx`, generated `schema.graphql`/`graphql.ts` sync.
Tests (sampled at header/assertion level): locks, immutability-scan, repo, service, GraphQL surface, documents, UI container/card, journey workflow, journey-fixtures smoke, `apolloCache.test.ts`, `bunfig.toml` preload (`apollo-dev-flag.ts`).

## 3. Rotating emphasis R2 — deep dives

### 3.1 Apollo cache/dedup interaction (embedded typePolicy + skip-gate + refetch)

- **Embedded typePolicy**: `HandshakeCodeLookup: { keyFields: false }` in `apolloCache.ts:45-47`; policy surface frozen to five entries (test-locked). Behavioral tests prove inline storage (no `HandshakeCodeLookup:<key>` entity in `cache.extract()`) and loss-free same-field rewrite. The `apollo-dev-flag.ts` preload makes "zero cache-data-loss warnings" assertions non-vacuous under Bun — good rigor.
- **Skip-gate**: `useQuery(doc, validatedCode === null ? skipToken : { variables })` — zero-network proof for malformed input locked by UI test ("idle — … ZERO network operations").
- **Refetch path** (unchanged-code retry after generic error): `refetch({ code })` forced when `normalized === validatedCode` — correct; test at `HandshakeDiscoveryContainer.test.tsx:414` proves the stale error is replaced and exactly two operations occur.
- **Dedup**: no hazard — the gated query exists at most once; `refetch` bypasses dedup by design.
- ⚠️ One freshness gap found (Finding F2 below): the *edit → re-enter same code → submit* path un-skips the query and Apollo's default **cache-first** policy replays the cached result for the identical variables without a network round-trip, so `maskedName`/`linkable` can be stale. LOW — display freshness only; the sole `linkable` consumer (link-request CTA) is deferred.

### 3.2 D4 savepoint retry restructure (student.repository.ts)

- **Mechanism verified at driver level**: `node_modules/drizzle-orm/node-postgres/session.js:70` — `NodePgTransaction.transaction()` names savepoints `sp${nestedIndex + 1}` (depth-based). Sequential retry attempts at the same depth REUSE the same name; PostgreSQL explicitly allows same-named savepoints (new shadows old; `RELEASE`/`ROLLBACK TO` act on the most recent). The retry loop (`registration.service.ts:352-386`, byte-unchanged) is strictly sequential, so the known CONCURRENT-sibling collision hazard never applies.
- **Transaction semantics**: success → `RELEASE` (transparent to outer tx); failure → `ROLLBACK TO SAVEPOINT` then rethrow — leaves the caller's transaction usable, which is exactly what the absorption lock (`handshake-code-generation-locks.test.ts:434-469`) proves green with zero test changes (25P02 eliminated).
- **Error propagation fidelity**: the original error is rethrown unchanged (`throw err` after rollback); `isUniqueViolation` cause-chain traversal still classifies 23505 (test-asserted); non-collision errors still surface immediately; `users.email` 23505 path unaffected (service-level savepoint from `withTransaction`).
- **Layer purity**: bracket placement inside the repo is data-access mechanics, empirically forced by the unmodifiable absorption lock (documented in D4 outcome); no `sql` templates, no business rules added. Residual cost: +2 round trips per student registration — negligible on a registration-rate write path.
- **Verdict: D4 restructure is CORRECT.** No findings.

## 4. Per-lens findings

### 4.1 Types lens — ZERO new findings

- `HandshakeCodeLookupReturnType` is `readonly` two-key interface; `HandshakeDiscoveryRowType` composed exclusively via `Pick<StudentSelectType,…> & Pick<UserSelectType,…>` (single-sourced, no re-derived shapes) — `student.types.ts:12-24`.
- Pothos object backed exclusively by the canonical return type (`objectRef<HandshakeCodeLookupReturnType>`); no local types in resolver/type modules.
- Barrels: side-effect-only for query registration (`query/students/index.ts`), value re-export barrels for services/documents/views consistent with existing precedent.
- Enum: `UserRole` correctly value-imported (used as a value in `authScopes` and `withPageAuth`), including in the client `page.tsx`.
- `student.types.test-d.ts` type-level locks present. tsgo 0 errors.

### 4.2 Backend lens — ZERO new findings

- **Validation-before-read**: normalize→validate strictly before the discovery read; test-locked with a repo spy asserting ZERO calls on malformed input (`service.test.ts:478`).
- **Governance collapse**: deleted/blocked/active-suspension each collapse to `null` deep-equal to a nonexistent code (byte-identical oracle hygiene); fail-closed on incomplete suspension data; lapsed windows strictly visible (boundary test at exact instant).
- **Tx propagation**: optional `tx` propagated verbatim to repo reads; both branches of `findDiscoveryByHandshakeCode` return identical column shapes (aliases match Drizzle field names).
- **Error taxonomy**: `ValidationError` (VALIDATION) / `NotFoundError` (STUDENT_NOT_FOUND); unexpected errors bubble unswallowed to the masking boundary; no try/catch in resolvers.
- **Log hygiene**: submitted code never logged (test-locked); happy paths/misses/collapses emit nothing; bounded context bags only.
- **Layer purity**: repo has zero business rules/i18n/logs; service owns all decisions via a single pure predicate helper (`isGovernanceExcludedFromDiscovery` — no clock reads).
- **Injection surface**: only parameterized equality `$1` / Drizzle `eq`; anchored linear-time regex (no ReDoS); no LIKE/ILIKE/inArray/sql templates on the read paths.
- **Dead code / race conditions**: none introduced; discovery is a lock-free pure read; generation race arbitrated by the DB unique constraint (lock suite).

### 4.3 Frontend lens — 2 LOW new findings (F1, F2 below)

Clean on: MUI `sx`-only styling (no direct style props), `*Outlined` icons throughout, colors exclusively via `theme.palette.*` callbacks, translations fully namespace-resolved with en/ar key parity (+ runtime parity test), skip-gate with no `useLazyQuery` anywhere, RTL handling (`dir="ltr"` attribute + `unicodeBidi: isolate` for the code chip and the search input — immune to the stylis-rtl flip; masked names render in ambient direction), `extensions.code` branching via the pre-existing `extractErrorCode`, neutral (non-error) not-found state, `PermissionDeniedFallback` for denial class, `no-cache`-warning posture locked under dev-mode Apollo.

### 4.4 Pentester lens — ZERO new findings

- **BOLA**: `myHandshakeCode` has ZERO arguments (identity exclusively from verified ctx — foreign-id probes die at GraphQL validation); discovery treats the code as an out-of-band capability with a 16⁻⁸ (~4.3B) space — enumeration infeasible; payload carries no ids at all (behavioral proof that selecting `id` fails validation).
- **BFLA**: both fields pinned to `{ $all: { authenticated: true, role: [Student|Parent] } }` — conjunction (not ANY-semantics map); sibling role, teacher, AND admin provably absent from each role set (no admin/supervisor read override); surface tests execute anonymous (UNAUTHORIZED) and wrong-role (FORBIDDEN) cells through the real schema pre-resolver, plus token-substitution Tier-4 tests (re-signed sibling-role claim, non-canonical claim degradation).
- **BOPLA**: payload closed to `maskedName: String!` + `linkable: Boolean!`; masked name discloses only the first grapheme per name part with no length-of-remainder signal; no parent identity in `linkable:false` responses (journey Step 5).
- **Oracle hygiene**: miss vs governance-excluded resolve byte-identically to `null` (deep-equal tested); VALIDATION rejection is shape-only (no existence signal); allowlist posture — both queries absent from the frozen-six public registry.

## 5. Findings register

| ID | Severity | Location | Tag | Description |
|---|---|---|---|---|
| F1 | LOW | `shared/locale/en/handshakeCode/index.ts:19` (+ `ar/index.ts:19`) | NEW | `alreadyLinkedDescription` reads "This student is already linked to **your account**" (ar: "مرتبط بحسابك"), but the backend signal is `linkable = parentId === null` — i.e. linked to **some** parent, not necessarily the caller. A second parent discovering the child sees copy that falsely claims linkage to their own account. Copy-accuracy only; no identity disclosure (payload has none). Suggested fix: neutral copy "already linked to a parent" in both locales. |
| F2 | LOW | `frontend/views/parent/handshake/HandshakeDiscoveryContainer.tsx:93-97` | NEW | Edit → re-enter → resubmit the SAME previously-resolved code: `setValidatedCode` un-skips the query and Apollo's default **cache-first** policy replays the cached result for identical variables with NO network round-trip, so `maskedName`/`linkable` can be stale (e.g. child linked in between). The documented forced-refetch only covers the no-edit retry path (`normalized === validatedCode`); no test covers success→edit→resubmit-same-code (which would assert 2 operations, not 1). Display freshness only — the sole `linkable` consumer is the deferred link-request feature. Suggested fix: `fetchPolicy: "network-only"` on this search query, or track last-searched code and force `refetch` on re-submit. |

**Pre-existing (filtered, not counted):** `extractErrorCode` / `PermissionDeniedFallback` utilities are untouched by this diff (verified absent from `git diff origin/main HEAD --name-only`) and were only consumed, not modified. No pre-existing issues in untouched lines were chased further per the Phase-0 baseline discipline.

## 6. Verdict

**PASS — ship-ready.** 2 new findings, both LOW (one localization copy-accuracy nit, one cache-freshness edge on a deferred-feature input). No MEDIUM/HIGH/CRITICAL findings across any lens. The rotating-emphasis areas (Apollo cache/dedup/skip-gate/refetch interaction; D4 savepoint transaction semantics, sequential spN reuse, error-propagation fidelity) were deep-dived and found CORRECT. tsgo: 0 errors. Both LOW findings are non-blocking follow-up candidates; neither warrants holding the merge.
