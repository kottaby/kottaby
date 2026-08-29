# Round R8 Review Outcome — DEV1-013 Student Handshake Code Generation

- **Reviewer iteration:** R8 (independent fresh-context; prior review findings NOT consulted)
- **Scope:** `git diff origin/main HEAD --name-only` → 138 files (62 source/test files outside `ai/`), 16 commits, head `6fd59c0`
- **Rotating emphasis:** plan-binding-contract consistency — 10-REQ spot-check (specs.md text read directly, verified against shipped code/tests)
- **Mode:** Report only — no fixes applied

## Gates

| Gate | Result |
|---|---|
| `bun run tsgo` | ✅ PASS — 0 errors (clean exit, lock acquired/released) |
| Targeted test runs (sanctioned runner `bun run test/scripts/run-test.ts`) | ✅ constants 59/59 · service 22/22 · generation-locks 8/8 (14.6s) |
| `useLazyQuery` grep across diff | ✅ 0 code occurrences (comments only) |
| `console.*` grep across diff (backend/shared/frontend views) | ✅ 0 code occurrences (comments only) |

## Findings

**Zero NEW findings.** Zero pre-existing issues re-flagged in this diff's touched lines.

Every element inspected across the four lenses conforms:

- **Types lens** — canonical `HandshakeCodeLookupReturnType` (2 readonly keys) backs the Pothos object (no local types); `HandshakeDiscoveryRowType` is `Pick<>`-composed from canonical select types; single-sourcing via `@/backend/types` barrels; `UserRole` enum (no string literals); side-effect barrels wired (`query/students/index.ts` → `query/index.ts`, `services/students/index.ts`, `sharedDocuments/students/index.ts`).
- **Backend lens** — validation strictly before read (`normalizeHandshakeCode` → `isHandshakeCode` → throw `ValidationError` → only then repo call); governance collapse to byte-identical `null`; fail-closed suspension predicate (missing/non-positive duration → excluded); `tx` optional-last and propagated verbatim; error taxonomy via `NotFoundError`/`ValidationError` with localized messages (`handshakeCodeInvalid`, `studentHandshakeNotFound` present in en+ar); log hygiene (`logger.logDomainError` on the two enumerated expected rejections, submitted code NEVER logged — not even post-validation); no dead code; read-only (no races); layer purity (repo returns rows faithfully, service decides).
- **Frontend lens** — `sx`-only styling throughout; `*Outlined` icons; theme palette via callbacks; all copy through compile-time namespace handles; skip-gate = `skipToken` + `validatedCode` state (zero-network malformed-input proof) with `network-only` + same-code `refetch` retry path; no `useLazyQuery`; LTR pin via HTML `dir="ltr"` attribute + `unicodeBidi: "isolate"` (cssjanus-proof) on the code chip and search input; `extensions.code` branching (`UNAUTHORIZED`/`FORBIDDEN` → `PermissionDeniedFallback`, `VALIDATION` → inline field helper, `STUDENT_NOT_FOUND` → localized alert, generic → internal-server alert).
- **Pentester lens** — BOLA: `myHandshakeCode` is zero-argument, identity exclusively `ctx.user.id`; BFLA: `$all { authenticated, role }` conjunction on both fields, no admin override (test-pinned); BOPLA: single scalar arg, closed payload, no `{ ...input }` spreads; injection: single parameterized equality (`WHERE handshake_code = $1`), no LIKE/sql-template/concatenation; oracle hygiene: governance/miss/governed all one `null` channel, `parentId` never leaves the service, `linkable` is the only linkage signal.

### Informational observations (not findings — no action required)

1. **[INFO] backend/db/test/logic/students/handshake-code-generation-locks.test.ts:~format-lock test** — NEW — the 50-registration format-lock test runs ~5.1s and exceeds Bun's default 5s per-test timeout under a DIRECT multi-file `bun test` invocation (my combined-coverage run), while passing 8/8 (14.6s) under the sanctioned `run-test.ts` runner. Timing-margin note only; direct invocation is blocked by the test-runner guard anyway.
2. **[INFO] backend/db/repo/students/student.repository.ts:69** — PRE-EXISTING — the defensive `if (!row) throw` in `createForRegistration` is the single uncovered line in the modified repo file (combined coverage 100% stmts / 98.46% lines). Verified present verbatim on `origin/main`; REQ-070's 100% bar applies to NEW modules (all at 100/100), and the ticket's NEW repo methods are fully covered on both tx/non-tx branches.

## Rotating Emphasis — 10-REQ Contract Spot-Check

| REQ | Spec (summary) | Code/test evidence | Verdict |
|---|---|---|---|
| REQ-016 null-not-error | valid-format miss → `null`, never error | `student-handshake.service.ts:140-142` returns null; container `not-found` state; journey steps 4/6a-c assert byte-identical null | ✅ SATISFIED |
| REQ-019 no-id payload | no ids/contact/governance in payload | `student.types.ts:12-15` exactly `{maskedName, linkable}`; Pothos object no `id` field; `apolloCache.ts:45-47` `keyFields:false`; `frontend/graphql/AGENTS.md:100` embedded list; journey step 3 minimal two-key payload | ✅ SATISFIED |
| REQ-020 normalize-then-validate | trim→uppercase→pattern, fail pre-DB with VALIDATION | `student-handshake.service.ts:125-134`; shared `normalizeHandshakeCode`/`isHandshakeCode`; service test spies zero repo calls on malformed input | ✅ SATISFIED |
| REQ-021 governance collapse | deleted/blocked/active-suspension ≡ nonexistent | `student-handshake.helpers.ts:39-59` (fail-closed) + service `:144-147`; service tests + journey 6a/6b/6c collapse to same null | ✅ SATISFIED |
| REQ-031 role matrix | exact authScopes; 401 anon / 403 wrong-role incl. sibling | `handshake-code.query.ts:57-97` `$all` conjunction; surface test asserts UNAUTHORIZED anon, FORBIDDEN for sibling/teacher/admin + scope snapshot equality. `supervisor` does not exist in `UserRole` (4 roles only) — spec mention vacuously satisfied | ✅ SATISFIED |
| REQ-041 collision absorption | constraint is arbiter; loser → translated 23505; retry absorbs | `handshake-code-generation-locks.test.ts:372-470` — "two forced-colliding inserts" + "absorption lock" + savepoint diagnostic; 8/8 pass under sanctioned runner | ✅ SATISFIED |
| REQ-052 log elision | logDomainError bounded; raw code never logged | service `:128-133`, `:79-84` — context bag carries code=`VALIDATION`/`STUDENT_NOT_FOUND` label, never the submitted string; test tier 4 asserts happy/miss/governance emit NOTHING | ✅ SATISFIED |
| REQ-063 no useLazyQuery | stateful useQuery + skip/variables gate | `HandshakeDiscoveryContainer.tsx:55-67` `skipToken` gate + `network-only`; student card plain `useQuery`; documents use `TypedDocumentNode` from `@apollo/client` (not `/core`); grep = 0 | ✅ SATISFIED |
| REQ-067 not-found styling | null → neutral inline state distinct from error styling | `HandshakeDiscoveryContainer.tsx:261-286` `NotFoundState` — palette-neutral Card, no `Alert`/error color; distinct from generic-error `Alert severity="error"`; linkable-driven copy in result card; clipboard try/catch fallback | ✅ SATISFIED |
| REQ-070 coverage | 100% stmt+branch on new modules | Measured: service 100/100, helpers 100/100, constants 100/100, mask-full-name 100/100, locale leaves 100/100; repo new methods 100% both branches (only pre-existing defensive line uncovered — see INFO 2) | ✅ SATISFIED |

**All 10 spot-checked binding requirements are fully satisfied by the shipped code and test evidence. No requirement gaps found.**

## Verdict

**APPROVE / SHIP.** Zero new findings across types, backend, frontend, and pentester lenses; `tsgo` clean; all ten high-risk binding contracts verified against implementation and passing test evidence; the only observations are informational (test-duration margin under unsanctioned direct invocation; one pre-existing uncovered defensive line).

## Evidence commands

```
git diff origin/main HEAD --name-only          # 138 files
bun run tsgo                                    # 0 errors
bun run test/scripts/run-test.ts shared/constants/handshake-code.constants.test.ts      # 59/59
bun run test/scripts/run-test.ts backend/services/students/student-handshake.service.test.ts  # 22/22
bun run test/scripts/run-test.ts backend/db/test/logic/students/handshake-code-generation-locks.test.ts  # 8/8
```
