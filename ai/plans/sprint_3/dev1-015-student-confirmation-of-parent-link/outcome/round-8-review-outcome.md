# Round 8 — Independent Review Outcome (final sweep)

- **Task ID:** ITER-8 · **Agent:** Independent Reviewer R8 (no knowledge of prior rounds; judgment formed fresh)
- **Scope:** `git diff ffce457 feat/dev1-015-student-confirmation-of-parent-link` excluding `ai/plans/**` — 21 non-plan files, +3254/−52 (wire test, parents service tests, parentLink locale namespace + types + parity suite, notification deep-link leaf module, drawer body/actions, student dashboard card + derivation helper + shell, RoleDashboardPage slot, nav items, 3 new UI suites, 1 journey suite).
- **Mode:** review-only. No code changes; `tasks.md` untouched; no git state operations.

## Verification (mandated commands, run once each)

| Command | Result |
|---|---|
| `bun run tsgo` | clean (no errors) |
| `bun run biome:check` | clean — 1426 files, no fixes needed |
| `run-test.ts backend/graphql/test/parent-link.wire.test.ts` | 25 tests, 474 expects, 0 fail |
| `run-test.ts backend/services/parents` | 111 tests / 4 files, 637 expects, 0 fail |
| `md5sum browser-evidence/*.png \| uniq -w32 -D` | zero duplicate captures (all evidence distinct) |

**Supplemental (reviewer discretion, once each, sanctioned runners):** the three new UI suites cannot execute through the generic single-path `run-test.ts` (they need the `test:ui:components` preload stack — happydom/translation/next-dynamic, documented in `bunfig.toml`); executed with those preloads: `PendingParentLinkRequestsCard` + `RoleDashboardPage.slot` + `notification-deep-link` → **36 pass / 0 fail** (160 expects). `parentLink-namespace.parity.test.ts` → 68 pass / 434 expects. `navItems.test.ts` → 32 pass. Journey `student-confirmation-of-link.journey.test.ts` → 12 tests, 257 expects, 0 fail (Step 9b true-race cell correctly skip-gated on the PGlite sandbox per `isPgliteProvider`).

## Lens 1 — TYPES: CLEAN

- Canonical types only: codegen wire types (`MyIncomingParentLinkRequestsQuery_…`, `MeQuery_me`, `MockLink.MockedResponse`) everywhere; no ad-hoc shapes.
- Enum-value discipline: the route-resolution map keys on the **backend `NotificationType` enum member** (never a bare `"parent_link_request"` literal) for the free-varchar `relatedEntityType`; tests alias the backend enum to keep it visually distinct from the codegen `NotificationType`. `LinkStatus` imported for the derivation gates.
- No unsafe casts: zero `as any` / `as unknown as` / `@ts-ignore` / `@ts-expect-error` in the delta; DB-clock epoch read guarded by `Number.isFinite`, not cast-driven.
- i18n bijection: 6 new `dashboardCard*` slots exist on **both** ar and en maps and in the type; parity suite inventory extended 33 → 39 slots, function slots 4 → 6, with en exact pins, ar Arabic-script + plural-class word containment pins (one/two/few/many distinguishable, dual probe includes the noun), and a documented, honest rationale for NOT pinning `toLocaleString("ar")` digit shape (ICU-robustness; digit form pinned once by the pre-existing summary-chip cell).

## Lens 2 — BACKEND/TESTS: CLEAN

- **Race determinism:** the concurrent path is layered honestly — 9a deterministic loser-collapse runs everywhere; 9b true `Promise.allSettled` race is wholesale-gated on `isPgliteProvider` exactly like the chaos tier; the loser shape accepts a typed conflict (`ALREADY_RESOLVED` / `TARGET_ALREADY_LINKED`) **or** a `40P01` deadlock abort found via a cycle-safe cause-chain walk — no flaky assertion surface. Step 10 boundary is grounded on the DB clock on BOTH sides (injected instant from `now()`, grounding from a fresh epoch read), eliminating host-skew flake.
- **Fixture isolation + FK-safe teardown:** journey uses per-run `jrn_sconfirm_<uuid8>` identity prefixes, ONE committing cast transaction, `TrackedFixtures` whose registration order ⇒ reverse deletion order (notifications registered last → deleted first → requests → role-children → users) and **mandatory zero-residue re-probes** including a prefix sweep. Service battery: new double-respond cell uses a dedicated committed student; `afterAll` deletes notifications → requests (tracked + membership sweep) → students → users with 5 residue probes. Wire test: the new expired seeded row deliberately rides the (parentP, studentG) pair whose sibling row is Rejected — documented avoidance of the pending-pair partial unique index — and is registered in the teardown id list.
- **Wire determinism:** `registerActorCast` replaces parallel registrations with a sequential reduce, with an accurate root-cause comment (PGlite single-connection SAVEPOINT `sp1` collision); parallelism is retained only for the deny probes that never touch the DB. Byte-identical BOLA bodies are made comparable via the pinned `x-request-id` header (proven by the passing run).
- **Log hygiene:** `silenceDomainLog()` with `mockRestore` in `finally`; exact bounded log-shape assertions (one log per denial, `entity`/`entityId` pinned); zero console noise introduced in the delta.
- **Journey rules:** real `requireActor` re-checks (no monkey-patching), transport spied only at the `options.transport` seam, committed fixtures only (no `runInRollback` around own-commit services), per-step zero-side-effect probes.
- **Evidence integrity:** all suites pass under their sanctioned runners; PNG evidence hashes unique.

## Lens 3 — FRONTEND: CLEAN

- **MUI discipline:** `sx`-only styling; colors exclusively via `theme.palette.*` in `sx` callbacks; `*Outlined` icons only; ≥44px touch targets on CTA and retry; responsive `width` breakpoint object; logical-property flow via the RTL stylis pipeline.
- **i18n handle-form:** `useAppTranslation(ParentLink/Errors/Common)` with direct property access throughout (zero `t('key')` string keys); retry copy from `Common`, mapped failure copy from `Errors`, card-local fallback `dashboardCardLoadError` for unmapped classes; raw wire messages asserted absent from the DOM.
- **Apollo patterns:** ONE zero-argument document from `sharedDocuments`; the normalized cache is the single truth (decision-page respond write-back re-derives the card to zero — pinned by a real `writeQuery` convergence cell); retry via `refetch` with the rejection swallowed only because the error state already surfaces; single-operation traffic recorder proves no extra requests.
- **SSR boundary:** card is a zero-prop `"use client"` leaf; the server page composes the slot with a **serializable plain-object `sx`** Stack; server guards remain the only authorization boundary.
- **Dead code / purity / layering:** `resolveParentLinkDenialCopy` retains its three real consumers (refactor to `…OrNull` wrapper is behavior-identical); `deriveActionableIncoming` is a pure single-pass helper (caller-owned `now`, max-by-`createdAt` champion, `NEGATIVE_INFINITY` sentinel, strict-`>` boundary — all unit-pinned); `notification-route-resolution.ts` is a directive-free leaf so nav/card/drawer/test consumers share ONE route constant without dragging the hook graph; views→lib dependency direction is correct throughout.
- **Accessibility:** labelled `role="status"` busy frame, `aria-busy`, `dir="auto"` + `isolateBidi` before interpolation.

## Lens 4 — SECURITY: CLEAN

- **BFLA/BOLA/BOPLA:** no new id-taking surface; the decision-leg denials are re-proven at the WIRE tier — foreign ≡ nonexistent requestId byte-identical `PARENT_LINK_REQUEST_NOT_FOUND` (no existence oracle), envelope key-set parity across expired/not-found/already-resolved (no per-class disclosure), input-coercion tier dies pre-resolver with zero side effects, governed pre-TX ordering proven by repo spies (zero post-gate collaborator invocations, exactly one bounded log per denial).
- **Client surface:** the deep-link href is a compile-time constant — `relatedEntityType` is only a map lookup and `relatedEntityId` is deliberately NOT interpolated, so no id oracle, no open-redirect surface, no user-controlled URL construction. The card renders only the caller's own rows via a session-scoped query; parent full name is the sanctioned REQ-015 disclosure and the student name stays masked on the parent side (journey step 8).
- **Secrets:** none; fixtures authenticate through the real register/login flow or committed rows.

## FINDINGS: 0

No new blocking, major, minor, or info defects attributable to this delta. Verdict: **PASS** (final sweep green; the branch is review-clean from where I stand).

### PRE-EXISTING (non-blocking, listed briefly per protocol)

1. **UI-tier runner split** — `test/ui/components/**` suites require the `package.json` `test:ui:components` preload stack and cannot run through the generic single-path `run-test.ts` (bunfig.toml documents the convention). Harness design, not a delta defect; documented here so future reviewers don't misread the resulting `document is not defined` noise as a suite failure.
2. **`run-test.ts` multi-path arg handling** — passing several paths silently exercises a single path (verified: two different summaries from two multi-path invocations). Pre-existing runner behavior; reviewers should invoke one path per run.
3. **Denial-copy table reuse on the card's list-error branch** — a mapped parent-link denial code on a list query renders the `errors`-namespace copy (e.g., `PARENT_LINK_REQUEST_NOT_FOUND` copy on a self-scoped list failure). Deliberate, documented, and tested contract (`resolveParentLinkDenialCopy` semantics predate this delta); semantically loose only for codes that cannot occur there.
4. **Sentinel nonexistent ids** (`999999999`) as absence probes — pre-established repo idiom, still safe.

## Sign-off

- Outcome file: `outcome/round-8-review-outcome.md` (this file). Worklog appended under Task ID ITER-8.
- No fixes applied; no git operations; `tasks.md` untouched.
