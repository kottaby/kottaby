# Round R7 Review Outcome — DEV1-013 Student Handshake Code Generation

**Reviewer:** Fresh-context iteration R7 (all four lenses + runtime-resilience emphasis)
**Scope:** `git diff origin/main HEAD --name-only` — 22 production files (backend service/repo/resolvers/types, shared constants/mask/locale, parent discovery page + components, student card, nav, Apollo cache, barrels), the full test surface, and plan/outcome artifacts.
**Type gate:** `bun run tsgo` — **PASS, 0 errors**.
**Discipline:** Read-only git (no state commands); prior outcome files NOT read (fresh-context mandate).

---

## Findings

### LOW

1. `[LOW][NEW] backend/services/students/student-handshake.helpers.ts:44-49` — Fail-closed doctrine covers *missing* governance window data but not *invalid* data. A `suspended` row with `suspendedPeriodDays <= 0` (column is a plain nullable integer — `backend/db/schema/users/users.ts:27`, no CHECK constraint) computes `endsAt <= suspendedAt <= now` → classified "lapsed" → student stays **discoverable**, widening visibility on corrupt data — contradicting the module's own contract ("missing data must never widen discovery visibility"). Theoretical only: no writer in this feature produces governance values (admin flows own them), so it cannot manifest from this diff's code paths alone. Suggested follow-up (report-only, not fixed): treat non-positive durations as actively governed (or add a DB CHECK in the owning surface).

2. `[LOW][NEW — test gap] test/ui/components/students/HandshakeCodeCard.test.tsx:263` — The copy-failure test pins a *rejecting* `writeText` double, but not the non-secure-context case (`navigator.clipboard === undefined`). The **code is correct** (verified below), so this is coverage hygiene: an explicit undefined-clipboard double would pin the non-secure-context fallback contract against future refactors of `handleCopy`.

### INFO

3. `[INFO][NEW] frontend/views/parent/handshake/HandshakeCodeSearchForm.tsx:70-85` — No `maxLength` on the code `TextField`; arbitrarily long input is accepted by the field and rejected only on submit. Harmless by construction (client gate → zero network; server gate → pre-DB rejection; helperText teaches the format), purely a typing-experience note.

4. `[INFO][NEW] frontend/views/students/dashboard/HandshakeCodeCard.tsx:87-100` — Generic-error branch (branch 4) offers no retry affordance; recovery requires a page refresh. No analogous "refetch gap" exists here (no interactive submit; the discovery page's forced-refetch retry has no counterpart need), so this is UX parity commentary only.

### Pre-existing / deferred (filtered out — NOT counted as findings)

- **Rate limiting / brute-force on discovery** — explicitly deferred D2 → DEV2-002 in `deferred-items.md`; not introduced by this diff.
- **`frontend/lib/graphql-error-utils.ts` internals** — pre-existing module (not in this diff); only its *usage* is in scope and is correct.
- **Registration-path hardcoded `KSB-` prefix + stale doc prose** — deferred D5 (DEV1-002 surface, verify-only for DEV1-013).

**Blocking findings: ZERO.**

---

## R7 Emphasis — Runtime Resilience & Edge Cases (rotating deep-dive)

### (a) Error paths — VERIFIED GRACEFUL

- **DB connection failure mid-lookup:** `queryDb`/Drizzle throw propagates unswallowed — service and resolver catch nothing by contract (verified: zero try/catch in `student-handshake.service.ts` / `handshake-code.query.ts`); the GraphQL masking boundary owns masking + the single correlated log. Client: discovery shows the localized generic Alert with the form still retryable (pinned by test "generic transport failure → localized generic alert, form stays retryable"); the student card renders its branch-4 Alert.
- **Apollo network error:** same channel — `extractErrorCode` returns null → generic-error Alert on both surfaces; denial class (`UNAUTHORIZED`/`FORBIDDEN`) → `PermissionDeniedFallback` (never bare `null`).
- **Malformed server response:** `myHandshakeCode` guarded by `typeof handshakeCode !== "string"` → skeleton (never bare null); discovery payload is closed by the schema (`maskedName: String!`, `linkable: Boolean!`) with a null-guard (`lookup == null` → not-found). No crash path found.

### (b) Boundary values — VERIFIED SAFE

- **varchar(50) vs 12-char pattern:** normalize→validate rejects any input ≠ `KSB-[0-9A-F]{8}` **before any DB read** (spy-locked: "malformed inputs reject with VALIDATION BEFORE any DB read (repo spy: zero calls)"). Tier-3 repo test fires 100-char, injection, unicode, emoji, and RTL-override payloads concurrently through the parameterized path — all null, none throw. No truncation/overflow surface exists.
- **Locale fallback for unsupported locales:** `resolveLocale` falls back to `defaultLocale` (`ar`) — verified on BOTH the server path (`getServerTranslations` → `getTranslations`) and the client path (`useAppTranslation` → the same `getTranslations`). No unknown-locale crash or missing-key path.
- **Raw-SQL-branch timestamp typing:** the production discovery read (no tx) goes through `queryDb` → `pg.Pool` with default type parsers (`timestamptz` → `Date`), so `suspendedAt.getTime()` in the governance predicate is safe — empirically pinned by the lapsed-suspension service test, which runs the no-tx branch and *requires* the Date arithmetic to conclude "visible".

### (c) Copy-to-clipboard fallback — VERIFIED: the try/catch DOES catch the undefined case

`navigator.clipboard` is `undefined` in non-secure contexts → `navigator.clipboard.writeText(...)` throws a **synchronous TypeError** *inside the try block of the async handler* — synchronous throws inside an async function body are caught by the function's own try/catch (standard JS semantics), so `setCopyOutcome("failed")` fires. Rejecting-permission paths converge on the same catch. The failure surface is well designed: sticky localized manual-copy notice + `userSelect: "all"` on the code chip (one tap selects the whole code). Only gap: no explicit test double for the *undefined* clipboard (finding #2).

### (d) Concurrent searches — VERIFIED SOUND

- **Edit during flight:** every keystroke resets `validatedCode` → `skipToken` (zero network; late results unobserved). `deriveResultState` ranks idle above everything, so no stale result/error can flash beside fresh input.
- **Resubmit of the UNCHANGED code (retry after error):** forced `refetch` — pinned by test "generic failure then resubmit of the UNCHANGED code" (exactly 2 wire ops, same normalized variable, stale error replaced by the result).
- **Rapid double-submit:** both refetches carry identical variables; last-write-wins on the observable — no ordering hazard. A *different* code is unreachable without editing, which re-arms the skip gate first.
- **`void refetch(...)` floating promise — verified SAFE, not a finding:** Apollo Client 4.2.12 `_reobserve` wraps the returned promise in `preventUnhandledRejection` (`ObservableQuery.js` ~line 1031), so the voided rejection cannot become an unhandled rejection; errors still surface through the observable into `error` state.

---

## Lens Summaries

- **Types:** Canonical `Pick`-composed `HandshakeDiscoveryRowType`, closed two-key `HandshakeCodeLookupReturnType`, Pothos objectRef backed exclusively by the canonical type, clean side-effect/`export *` barrels, no enum drift. Clean.
- **Backend:** Validation-before-read (spy-locked), governance collapse byte-identical to nonexistent (deep-equal pinned), tx propagation when owned (in-rollback-visibility test), error taxonomy via DomainError hierarchy with locale-propagated messages, log hygiene (two enumerated rejections only; submitted code never logged; hostile-probe list tested), no dead code (the unreachable `ctx.user` guard is documented TS-narrowing, honoring the no-non-null-assertion rule), read-only zero races, layer purity (repo faithful, service decides, resolver thin). Clean.
- **Frontend:** `sx`-only styling throughout, `*Outlined` icons only, colors exclusively via `theme.palette.*` callbacks, compile-time namespace handles (property access, never `t('key')`), `skipToken` gate with zero `useLazyQuery`, RTL/LTR via the HTML `dir` attribute + `unicodeBidi: isolate` (cssjanus-proof; input field correctly LTR-isolated while labels keep ambient direction), `extensions.code` branching verified on both surfaces. Clean.
- **Pentester:** BOLA — `myHandshakeCode` is zero-argument with server-derived identity (BOLA probes die as validation failures); BFLA — explicit `$all` conjunctions, student-only/parent-only, no admin override (surface-tested); BOPLA — closed two-field payload, no `id` (behavioral no-id proof + `keyFields: false`), masked-name-only disclosure; injection — parameterized equality only, no LIKE, hostile-payload tests; oracle hygiene — null channel collapses nonexistent/governed/deleted/blocked identically, format error leaks nothing beyond the client-side gate. Clean (rate limiting deferred per D2).

**Permission matrix verified:** anonymous → UNAUTHORIZED on both queries; wrong role (incl. sibling role, teacher, admin) → FORBIDDEN; surface tests cover the 401/403 split and the closed public-operation registry.

---

## Verdict

**APPROVE.** Zero blocking findings. 2 LOW (one theoretical data-integrity edge in the governance predicate for non-positive suspension durations; one non-secure-context clipboard test gap) + 2 INFO UX notes — all non-blocking, all in this diff's touched lines. `tsgo` 0 errors. The R7 emphasis areas (error paths, boundary values, clipboard fallback, concurrent searches) all verified resilient, with the clipboard-undefined catch and the Apollo-4 `preventUnhandledRejection` behavior explicitly confirmed against the installed `@apollo/client` 4.2.12 source.
