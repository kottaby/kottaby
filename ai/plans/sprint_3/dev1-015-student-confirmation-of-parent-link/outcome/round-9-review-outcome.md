# Round 9 — Independent Review Outcome

- **Task ID:** ITER-9 · **Agent:** Independent Reviewer R9 (fresh judgment; no reliance on prior rounds' conclusions)
- **Scope:** `git diff ffce457 feat/dev1-015-student-confirmation-of-parent-link --name-only` excluding `ai/plans/**` — 21 non-plan files, +3254/−52 (wire test, parents service battery, parentLink locale namespace + types + parity suite, notification deep-link leaf module, drawer body/actions, student dashboard card + derivation helper + shell, RoleDashboardPage slot, nav items, 3 new UI suites, 1 journey suite).
- **Delta state:** branch tip `0de59e8`; no code commits after the last fix wave; working-tree modifications touch plan docs only. The reviewed code is the exact state the previous sweep examined — the bar for reporting is a genuine NEW in-delta defect, judged independently.
- **Mode:** review-only. No code changes; `tasks.md` untouched; no git operations.

## Verification (mandated commands, run once each)

| Command | Result |
|---|---|
| `bun run tsgo` | clean — exit 0, no error output |
| `run-test.ts backend/graphql/test/parent-link.wire.test.ts` | 25 tests / 474 expects, completed successfully (exit 0) |
| `run-test.ts test/workflows/parents` | 39 tests across 3 files, **0 fail** (614 expects) |

## Lens 1 — TYPES: CLEAN

- tsgo exit 0. Codegen wire types only (`MyIncomingParentLinkRequestsQuery_…`, `MockLink.MockedResponse`, `NotificationRow["type"]` via the typed-string-constant idiom); zero `as any` / `as unknown` / `@ts-ignore` / `@ts-expect-error` in the delta (pattern scan empty).
- Enum-value discipline holds: the route map keys on the backend `NotificationType` enum member for the free-varchar `relatedEntityType`; tests alias the backend enum to stay visually distinct from the codegen `NotificationType`; `LinkStatus` typed gates in the derivation helper.
- i18n bijection intact: 6 new `dashboardCard*` slots present on ar + en + type (39-slot mandated inventory), correct Arabic plural classes (one/dual/few/many), zero branch deliberately absent (card renders null at 0 — documented in both maps).

## Lens 2 — BACKEND/TEST DISCIPLINE: CLEAN

- **Journey:** per-run `jrn_sconfirm_<uuid8>` prefixes, one committing cast transaction, `TrackedFixtures` reverse-order teardown with notifications registered LAST (deleted FIRST), mandatory zero-residue re-probes incl. a prefix sweep; steps select BY ID via the keyed registry, never list position.
- **Determinism:** Step 10 boundary grounded on the DB clock on BOTH sides (injected `now()` instant + fresh epoch-millis grounding with `Number.isFinite` guard); race design honest — 9a deterministic everywhere, 9b wholesale skip-gated on `isPgliteProvider`, loser shape accepts typed conflict OR `40P01` via a cycle-safe cause-chain walk.
- **Wire tier:** sequential `registerActorCast` with an accurate PGlite SAVEPOINT root-cause (parallel deny-probes stay parallel — they never touch the DB); expired seeded row rides the (parentP, studentG) pair whose sibling is Rejected (documented partial-unique-index avoidance) and is registered in teardown; byte-comparable BOLA bodies via pinned `x-request-id`.
- **Log hygiene:** `silenceDomainLog()` with `mockRestore` in `finally`; exact bounded log-shape pins (one log per denial, entity/entityId/locale pinned); spies restored after assertions with an accurate comment on bun's mock-state semantics.

## Lens 3 — FRONTEND DISCIPLINE: CLEAN

- MUI: `sx`-only, colors via `theme.palette.*` in callbacks, `*Outlined` icons, ≥44px CTA/retry targets, responsive `width` breakpoint object; SSR-safe serializable plain-object slot Stack in the server page factory.
- i18n handle-form throughout (`useAppTranslation(ParentLink/Errors/Common)`, direct property access, zero `t('key')`); raw wire messages asserted absent from the DOM; mapped/unmapped failure-copy split tested both ways.
- Apollo: ONE zero-argument document from `sharedDocuments`; traffic recorder proves single-op and refetch traffic; cache write-back convergence cell (card unmounts on decision write-back) is a real `writeQuery`, not a mock shortcut; client captured in an EFFECT (no render side effects).
- Purity/layering: `deriveActionableIncoming` is pure single-pass (caller-owned `now`, max-`createdAt` champion, `NEGATIVE_INFINITY` sentinel, strict-`>` boundary — all unit-pinned); `notification-route-resolution.ts` is a directive-free leaf shared by nav/card/drawer/tests; views→lib direction correct; no dead code.
- A11y: labelled `role="status"` busy frame + `aria-busy`, single `role="alert"` on failure, `dir="auto"` + `isolateBidi` before interpolation, DOM-order sibling composition pinned.

## Lens 4 — SECURITY: CLEAN

- **BOLA/BFLA:** foreign ≡ nonexistent byte-identical `PARENT_LINK_REQUEST_NOT_FOUND` re-proven at the WIRE tier; envelope key-set parity across expired / not-found / already-resolved (no per-class disclosure); input-coercion tier dies pre-resolver with a zero-side-effect probe; governed pre-TX ordering proven by repo spies — the gate's own `UserRepository.findById` records exactly its sanctioned actor reads in call order, every post-gate collaborator records ZERO.
- **Client surface:** the deep-link href is a compile-time constant resolved by a fixed map on `relatedEntityType`; `relatedEntityId` is deliberately never interpolated — no id oracle, no open-redirect, no user-controlled URL. The card renders only session-scoped rows; parent full name is the sanctioned REQ-015 incoming disclosure and the student name stays masked on the parent side (journey step 8).
- **Route integrity:** `/student/link-requests` remains the student-only `withPageAuth` boundary (verified at `app/(dashboard)/student/link-requests/page.tsx`); `redirectTo` is the login return path — anonymous deep-link arrivals bounce to login and return, non-students bounce to their own dashboard. No secrets; fixtures authenticate through real flows or committed rows.

## FINDINGS: 0

No new blocking, major, minor, or info defects attributable to this delta. Verdict: **PASS** (the branch remains review-clean from where I stand).

### Non-blocking notes (carried context, none new to this round)

1. **Parent-side outcome rows deep-link to the student-only route** — a parent tapping an acceptance/rejection drawer row lands on `/student/link-requests` and is safely bounced by the page guard to their own dashboard. First raised as [INFO] in round 5; deliberate single-route map design, zero disclosure, guard holds. Not re-counted as a finding.
2. Pre-existing harness notes from round 8 remain accurate and non-blocking: `test/ui/components/**` suites need the `test:ui:components` preload stack (cannot run through the generic `run-test.ts`); `run-test.ts` multi-path args exercise a single path (invoke one path per run); the denial-copy table is reused on the card's list-error branch (documented, tested contract); sentinel `999999999` ids are the established absence-probe idiom.

## Sign-off

- Outcome file: `outcome/round-9-review-outcome.md` (this file). Worklog appended under Task ID ITER-9.
- No fixes applied; no git operations; `tasks.md` untouched.
