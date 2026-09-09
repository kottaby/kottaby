# Round 7 — Independent Review Outcome (ITER-7)

**Task ID:** ITER-7 · **Agent:** Independent Reviewer R7 · **Date:** 2026-09-07
**Scope:** `git diff ffce457 feat/dev1-015-student-confirmation-of-parent-link --name-only` (excluding `ai/plans/**`) — 22 files: 2 backend test files, 8 frontend files, 4 shared-locale files, 8 test files (≈3,275 added / 52 removed lines). Review performed blind to prior rounds; all judgments re-derived independently from the delta and the repo.

---

## 1. Verification Runs (each exactly once, this machine)

| Command | Result |
|---|---|
| `bun run tsgo` | **0 errors** (exit 0; only the process-lock + next-env restore notices) |
| `timeout 300 bun run test/scripts/run-test.ts backend/graphql/test/parent-link.wire.test.ts` | **25 tests, 474 expect() calls, 0 fail** [9.49s] |
| `timeout 420 bun run test/scripts/run-test.ts test/workflows/parents` | **39 tests across 3 files, 0 fail**, 614 expect() calls [3.66s] |
| `md5sum …/outcome/browser-evidence/*.png \| sort \| uniq -w32 -D` | **no duplicate hashes** (21 evidence PNGs, all distinct) |

---

## 2. Lens 1 — TYPES

- **Canonical types, no local forks.** The card consumes the codegen `MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests` row type directly; `ActionableIncomingSummary` is the delta's only new type and is repo-unique. No `any`, no `as unknown as`, no `@ts-ignore`/`@ts-expect-error` in the delta (grep-verified). `MeQuery_me & { __typename: "User" }` intersections in the UI suites follow the MockLink fixture convention and are not casts.
- **Enum value-vs-type imports are correct.** The route map key uses the **backend** `NotificationType.ParentLinkRequest` **value** (`"parent_link_request"` — verified in the enum source), which is exactly what the free-varchar `related_entity_type` column carries; the deep-link suite aliases the backend enum as `BackendNotificationType` to keep it visually distinct from the PascalCase codegen enum, with the rationale documented in-file. Frontend→`@/backend/enum` value imports have pre-delta precedent (`RoleDashboardPage.tsx` imports `UserRole` at ffce457).
- **i18n bijection holds.** `ParentLinkLabels` carries the six new dashboard-card slots typed in the canonical interface (compile-time parity); the runtime parity suite was extended in step: mandated inventory 33→39 keys, function-slot inventory 4→6, ar Arabic-script sweep covers the new keys, template pins for `dashboardCardCount`/`dashboardCardLatestRequester` in both locales. The ar count pins assert plural-class **word containment** (one/two/few/many kept mutually distinguishable, few⊃two disambiguated via the following noun) with an explicit "no digit-shape assertion" note pointing at the single repo-wide digit-shape pin — comment and pins now agree exactly. En/ar maps are structurally symmetric (both render null at zero; branch 4 is N ≥ 1).

## 3. Lens 2 — BACKEND / TESTS

- **Race determinism.** Wire `beforeAll` registrations were made **sequential** via `registerActorCast` with the PGlite single-connection/savepoint (`sp1`) collision documented at the helper — the correct fix for a real interleaving hazard; parallel deny-probes correctly stay parallel (pre-DB tiers only). The journey's true-concurrency race (Step 9b) is wholesale-gated behind `isPgliteProvider()` with the deterministic loser-collapse (Step 9a) running everywhere; the loser-shape oracle accepts typed conflicts **or** the `40P01` deadlock abort via a cycle-safe cause-chain walk. Step 10's boundary fixture reads **both** the injected instant and the grounding comparison from the **database** `now()` (epoch-millis cast for drizzle-mapping bypass), so app-host vs DB-host skew cannot flip the verdict.
- **Fixture isolation + FK-safe teardown.** The journey provisions the cast in ONE committing transaction with per-run `jrn_sconfirm_<uuid8>` identity prefixes, tracks every side-effect row, deletes in FK-safe reverse order (notifications → requests → role-children → users), and re-probes zero residue both by tracked id-set and by prefix sweep — including the race cast's user ids and the skip-gated case (`raceUserIds` empty on PGlite). The service test's committed double-respond student flows through `createStudentFixture`, which registers user+student in the tracked registries, so the unconditional `afterAll` sweep + zero-residue probes cover it. The new wire expired fixture correctly shares studentG's pair because the partial unique index forbids a second `pending` row for parentP→studentS — documented at the fixture.
- **Log hygiene.** No `console.*` added anywhere in the delta. `silenceDomainLog` (`spyOn(logger, "logDomainError")`) is used exactly where log assertions demand silence (idempotency replay, governance-ordering cells), with restores in `finally` and a comment pinning assert-before-restore order. Journey denial logs flow unfiltered — matching the sibling DEV1-014 journey convention (structured domain logger, not console).
- **Journey rules.** Services called for real on the real DB (no `runInRollback` where services own commits); fan-out spied only at the `options.transport` seam; translated-copy oracles from `getServerTranslations` (no hardcoded expectation strings); denials via `catchJourneyError` (no `rejects.toThrow`); id-first `REQUEST` key registry prevents order-position coupling.
- **Evidence.** md5 sweep clean — all 21 browser captures distinct.

## 4. Lens 3 — FRONTEND

- **Styling discipline.** `sx`-only throughout the new card; colors exclusively via `theme.palette.*` tokens (warning.main / text.secondary); `*Outlined` icons only (`PendingActionsOutlined`, `RefreshOutlined`); CTA and retry are `minHeight: 44` with `focusVisibleRingSx`; no physical directional properties in the delta (gap/spacing/wrap only), RTL rides the emotion stylis-rtl pipeline; `dir="auto"` + `isolateBidi`-assembled name before interpolation.
- **No hardcoded user-facing strings.** Card copy resolves via `useAppTranslation(ParentLink/Errors/Common)` property access; retry reuses `CommonLabels.retry` (no minted key); UI suites assert exclusively against preloaded namespace label objects (fixture names/instants/testids are the sanctioned exception). The raw wire message is asserted **by absence** in the error cells.
- **Apollo single-document.** The card issues exactly the same `myIncomingParentLinkRequestsQueryDocument` as the decision page (pre-existing shared doc — no new GraphQL doc in the delta); the traffic recorder pins `[QUERY_OPERATION_NAME]` on every branch and `[op, op]` after retry. Cache write-back cell proves normalized re-derivation → card unmount (REQ-016 convergence) without any bespoke invalidation bus.
- **SSR boundary.** `RoleDashboardPage` (server) composes the two client cards as JSX siblings inside a `Stack` whose `sx` is a **plain serializable object** (no theme-function form) — deliberately RSC-serializable; the hook lives inside each card, so no conditional-hook surface exists. The route constant + resolver live in a **directive-free leaf module** (`frontend/lib/notification-route-resolution.ts` — no `"use client"`, no Apollo, no logger), so nav/card/tests import them without dragging the drawer hook graph; grep confirms it is the constant's ONLY definition site (all consumers: drawer body, card CTA, nav entry + 4 suites) and the real route exists at `app/(dashboard)/student/link-requests/page.tsx` behind its own `withPageAuth` guard.
- **Dead code / purity.** None. `resolveParentLinkDenialCopy` retains real consumers (student container, outgoing states, send affordance) and now delegates to the new `…OrNull` variant with the `internalServerError` fold — behavior byte-identical for existing callers; `deriveActionableIncoming` is pure (no React/Apollo/clock; caller-owned `nowMs`; newest-by-`createdAt` champion, never array order) and is unit-pinned including the strict-`>` boundary instant.
- **Optional-prop extension of `CardShell`** (`busyLabel` → labelled `role="status"` busy frame) is backwards-compatible; the settled/error branches stay silent and the HandshakeCodeCard call sites are untouched.

## 5. Lens 4 — SECURITY

- **BOLA / no existence oracle.** Foreign ≡ nonexistent `requestId` byte-identical `PARENT_LINK_REQUEST_NOT_FOUND` on the wire (pinned correlation header makes the bodies byte-comparable), and the expired denial carries the same extensions key-set as the sibling not-found/already-resolved classes — no per-class disclosure. Governed ≡ role-mismatch constant `FORBIDDEN` with the pre-TX ordering proof: repo spies record ZERO invocations past the actor gate (no claim, no classifier oracle, no link write, no fold, no emit) and `UserRepository.findById` receives exactly the sanctioned `actorUserId`-derived reads in call order.
- **No id interpolation.** The drawer deep-link keys on entity **type** only; `relatedEntityId` is never read into any URL; unknown/absent pointers fail closed to `/notifications`; the card CTA and nav entry share the frozen route constant (pinned by literal-equality assertions in four suites). Zero-argument `myIncomingParentLinkRequests` answers identity server-side.
- **BOPLA.** Closed wire shapes pinned (`INCOMING_KEYS`/`OUTGOING_KEYS`); parent-side student identity stays `maskFullName`-masked forever (asserted non-equal AND non-containment); the card's parent full-name disclosure is the sanctioned incoming-direction identity (REQ-015), documented at the type level.
- **Zero side effects on every denial arm** — including the expired arm's fold-first materialization (respondedAt stays null, no emit) and the smuggled-arg/coercion tiers (notification-count deltas pinned pre/post).
- **No secrets**; fixture identities use `.test` domains with per-run prefixes.

---

## 6. Findings

**[INFO — non-blocking, pre-deferred] Drawer deep-link routes parent-recipient decision rows to the student-only route.** `NOTIFICATION_ROUTE_BY_ENTITY_TYPE` maps every `relatedEntityType === "parent_link_request"` row — including the acceptance/rejection rows emitted to the **parent** — to `/student/link-requests`, whose `withPageAuth` guard bounces a non-student to their own dashboard (previously all rows anchored to `/notifications`). No security impact: fail-closed, role-gated server-side, `relatedEntityId` never interpolated, no oracle. This is the consciously deferred recipient-aware-routing item, already owned in the plan's deferred-items ledger with a forward owner (post-DEV1-015 UX ticket) — recorded here for completeness, no action required in this delta.

No HIGH, MEDIUM, or LOW findings. Working-tree-only edits observed during review (uncommitted, outside the branch tip) were used as context only; the committed delta is what was judged, and no discrepancy between the two was found in the reviewed files.

## 7. Verdict

# FINDINGS: 1 (0 HIGH, 0 MEDIUM, 0 LOW, 1 INFO — non-blocking) — **PASS**

All four mandated verification commands green (tsgo clean; wire tier 25/25; parents workflows 39/39; evidence md5s distinct). Types/enum discipline, i18n bijection, race gating + DB-clock determinism, fixture FK-safety and zero-residue teardown, frontend sx/token/44px/i18n/Apollo/SSR discipline, and the BOLA/BOPLA/no-oracle posture all hold under independent re-derivation. The single INFO row is deliberate, documented, security-safe, and already carried by the deferred-items ledger.

---

## Worklog

**Task ID:** ITER-7 · **Agent:** Independent Reviewer R7 · **Date:** 2026-09-07

- Reviewed the full 22-file delta blind (no prior-round knowledge): read every changed file end-to-end (wire/service/journey suites, card + leaf module + drawer seam + RoleDashboardPage composition, locale maps/types/parity suite, all four UI suites).
- Ran the four mandated commands once each (results in §1); re-ran `tsgo` with full output to confirm the exit status rather than trusting tail truncation.
- Cross-checked claims by repo-wide grep: single definition site of `STUDENT_LINK_REQUESTS_ROUTE` (leaf module `frontend/lib/notification-route-resolution.ts:13`; consumers = drawer body, card CTA, nav entry, 4 test suites), route reality under `app/(dashboard)/student/link-requests/`, backend enum value `"parent_link_request"`, pre-delta precedent for frontend `@/backend/enum` imports, `createStudentFixture` auto-registration into tracked teardown registries, sibling-journey log-handling convention, `postDocument` headers parameter, absence of `console.*` / `.only` / stray skips / unsafe casts / physical CSS properties / secrets.
- Verified helper purity (`deriveActionableIncoming`), read-purity convention compliance (mount-frozen `nowMs`, documented), denial-helper refactor behavior-preservation, CardShell optional-prop compatibility, and RSC-serializable slot Stack sx.
- Filed 1 INFO (pre-deferred parent-recipient deep-link bounce); wrote this outcome file only. No source files touched; tasks.md untouched; NO git operations.
