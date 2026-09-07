# Round 2 Independent Review — DEV1-015 (student confirmation of parent link)

**Date**: 2026-09-07 · **Task ID**: ITER-2 · **Agent**: Independent Reviewer R2
**Scope**: `git diff ffce457 feat/dev1-015-student-confirmation-of-parent-link --name-only` (20 code files after excluding `ai/plans/**`; ~3,200 insertions). Delta composition: backend **tests only** (wire + service tiers) — zero production backend changes; frontend dashboard-card + deep-link surfaces; locale namespace extension; four new/extended frontend+workflow test suites.

## Reviewed Files (delta)
- Tests: `backend/graphql/test/parent-link.wire.test.ts`, `backend/services/parents/parent-link-request.service.test.ts`, `test/workflows/parents/student-confirmation-of-link.journey.test.ts`, `test/ui/components/{dashboard/RoleDashboardPage.slot,notifications/notification-deep-link,students/PendingParentLinkRequestsCard}.test.tsx`
- Frontend: `PendingParentLinkRequestsCard.tsx`, `CardShell.tsx`, `pending-parent-link-requests.ts`, `index.ts`, `RoleDashboardPage.tsx`, `navItems.ts(+test)`, `NotificationDrawerBody.tsx`, `useNotificationDrawerActions.ts`, `parent-link-denials.ts`
- Locale: `types/parentLink`, `en/parentLink`, `ar/parentLink`, `parentLink-namespace.parity.test.ts`

## Findings

**[LOW] test/workflows/parents/student-confirmation-of-link.journey.test.ts:1142 — the boundary fixture's grounding assertion compares the DB-clock instant against the JS host clock.** `expect(boundary.expiresAt.getTime()).toBeLessThanOrEqual(Date.now())` re-introduces exactly the app-host-vs-DB-host clock-drift sensitivity that the cell's own FIX-A note (lines 1114–1118) moved the *claim predicate* away from: the boundary itself is deterministic (`expiresAt = DB now()`), but if the DB host runs even slightly ahead of the app host this grounding assertion fails spuriously while the behavior under test is correct. — Suggested fix: drop the JS-clock assertion (the deterministic `PARENT_LINK_REQUEST_EXPIRED` denial + materialized fold below already prove the boundary), or assert against a second DB `now()` read. Test-only, environment-conditional, non-blocking.

**[INFO] frontend/components/ui/useNotificationDrawerActions.ts:18,41 — shared route constant + pure resolver hosted inside a `"use client"` hooks module.** `STUDENT_LINK_REQUESTS_ROUTE` and `resolveNotificationRoute` are framework-free values, but they live in a module that imports `useState`/hooks; all current importers (drawer body, dashboard card, nav, tests) are client components, so no RSC boundary is violated today — a future server-component importer would, however, transitively pull hook code into the server graph. — Suggested fix (non-blocking): hoist constant+resolver to a directive-free module (e.g. `frontend/lib/parent-link-routes.ts`) and re-export.

**[INFO] Parent-side decision notifications deep-link to the student-only route.** A parent clicking their accepted/rejected drawer row navigates to `/student/link-requests`, where `withPageAuth` redirects to `/parent/dashboard` — safe (no IDOR; `relatedEntityId` is never interpolated into any route; the type→route map keys on the entity *type* only), evidence `4.4-parent-redirect-to-parent-dashboard.png`. Already ledgered as DI-6.4-01 (📅 Forward, follow-up UX ticket). No action this round.

**FINDINGS: 1** (LOW; 0 MEDIUM/HIGH/CRITICAL) — verdict: **APPROVED, no blocking findings.**

## Lens Results

**LENS 1 — TYPES: PASS.** No `any`/`as unknown`/`@ts-*` anywhere in the delta (mechanical grep + tsgo clean). Enum value-vs-type discipline correct: backend `NotificationType` imported as a *value* where it keys `NOTIFICATION_ROUTE_BY_ENTITY_TYPE` (the persisted varchar carries the enum VALUE) and aliased `as BackendNotificationType` in the deep-link suite with the alias rationale documented; wire `UserRole` (codegen) vs backend `UserRole as BackendUserRole` explicitly disambiguated in the slot suite. The journey types `PARENT_LINK_NOTIFICATION_TYPE: NotificationRow["type"]` (column string-union, no unsafe enum comparison). i18n bijectivity: `ParentLinkLabels` 39 slots; en/ar leaves compile-typed to the interface; runtime parity belt adds identical-key-set, non-empty-string, Arabic-script, function-slot inventory, and *exhaustive* (no silent key minting) guards — 6 function slots pinned with exact outputs in both locales.

**LENS 2 — BACKEND/TESTS: PASS.** No sleeps/`setTimeout`/timing-dependent waits; the expiry boundary is pinned to the DB's own `now()` (one residual JS-clock grounding assertion — the LOW finding). Race determinism: wire fixture registration made sequential with an honest, specific rationale (PGlite single-session savepoint `sp1` collision), parallel deny-probes kept parallel because they never touch the DB; journey true-race (9b) wholesale-gated behind `isPgliteProvider()` with the deterministic loser-collapse (9a) running everywhere and dual per-contender transports proving the loser's silence on its own seam. Fixtures: committed `beforeAll` (journey documents commit-or-nothing + why `runInRollback` cannot host the decision legs), `TrackedFixtures` with registration-order = FK-safe deletion order, mandatory zero-residue re-probes by id-set AND per-run prefix; wire afterAll extended for the new expired row (requests → notifications → role-children → users; admin row preserved). Journey rules honored: fanout spied at the `options.transport` seam (`SpiedFanoutTransport`), permission resolution never monkey-patched (real `requireActor` re-checks; governance fixture genuinely suspends), no `runInRollback` around service-owned commits. The new service cells prove the governance **pre-TX ordering** (repo spies: zero post-gate collaborator invocations; the gate's `UserRepository.findById` called exactly `[studentGov, parentA]` in order — identity from `actorUserId` alone) and the committed sequential double-respond idempotency (constant conflict, exactly ONE notification + ONE publish, first `respondedAt` byte-stable). Log hygiene: `silenceDomainLog()` spies restored in `finally`; bounded log shapes (`entity`, `entityId`, `locale`) pinned; **zero `console.*` in the delta**. Guarded-claim SQL unchanged — the delta touches no production backend file.

**LENS 3 — FRONTEND: PASS.** MUI discipline: `sx`-only styling; colors exclusively via `theme.palette.*` (`warning.main`, `text.secondary`, `outlineVariant`, `surfaceContainerLow`, `shadow.card`); `*Outlined` icons only (`PendingActionsOutlined`, `RefreshOutlined`); ≥44px touch targets on the review CTA and retry (`minHeight: 44`), full-width CTA on `xs` and `flexWrap` on the chip/name row for mobile wrapping; no physical `left/right`/`ml/mr` properties (RTL rides the emotion stylis-rtl pipeline); requester name is `isolateBidi`-assembled before interpolation plus `dir="auto"`. i18n: every user-facing string resolves through compile-time handles (`t.dashboardCard*`, `te.*` denials, `tc.retry`) — zero hardcoded UI copy; route strings in tests are sanctioned frozen-value pins. Apollo: exactly ONE document + ONE `useQuery` in the card; the zero-argument document is the SAME id-first list the decision page uses so the normalized cache write-back unmounts the card (pinned by a real `client.writeQuery` cell). Client/server boundary: `RoleDashboardPage.tsx` (Server Component) composes the slot with a **plain serializable Stack sx object** (no function-sx across the SSR boundary — the 3fc5bf0 fix is genuinely in the tree); both cards are zero-prop `"use client"` components with hooks living inside each card (no conditional-hook surface). No dead code: both `resolveParentLinkDenialCopy` variants have live callers; the additive `CardShell.busyLabel` prop is optional so the pre-existing `HandshakeCodeCard` consumer is untouched. Helper purity: `deriveActionableIncoming` is pure (no React/Apollo/clock imports; `nowMs` injected; strict-`>` boundary and max-`createdAt` champion both unit-pinned).

**LENS 4 — SECURITY: PASS.** The delta ships no endpoints/resolvers/guards — authorization posture unchanged and re-proven: page guard (`withPageAuth` role gate) remains the only boundary; the zero-arg `myIncomingParentLinkRequests` query derives identity server-side (no student-id props → no BOPLA surface). BOLA: foreign ≡ nonexistent `requestId` pinned **byte-identical** (pinned `x-request-id` correlation header) at both service and wire tiers; BFLA: teacher/admin/parent deny with the constant ForbiddenError copy, governed ≡ role-mismatch byte-parity; envelope key-set parity across all three decision denials (expired/not-found/already-resolved — no per-class disclosure); input-coercion tier proves `{bypass:true}` dies pre-resolver with zero side effects. No existence oracle in UI copy: unmapped error codes fold to localized generic lines; the raw wire message is asserted ABSENT from the DOM; masked student names on parent surfaces asserted not-equal and not-containing the full name. Deep-link route resolution cannot leak/IDOR: the map is keyed on `relatedEntityType` only — `relatedEntityId` is never read or interpolated — and unknown/absent pointers fall through to the feed route (unchanged default, pinned). No secrets or absolute URLs (app-relative routes only).

## Visual QA (existing evidence only — no new captures)

**Method disclosure:** no multimodal image viewer is available in this sandbox, so the BS cells were analyzed with a pixel-statistics heuristic (PIL): non-blankness, luminance mean/σ (contrast), en↔ar mirrored-vs-plain structural difference (RTL mirroring proxy), and dark-vs-light structural difference. Files verified present at expected viewport dimensions (34 evidence files).

| Cells inspected | Observation |
|---|---|
| `bs-dash-1440x900-en` / `bs-dash-375x812-ar` (six-cell set) | Non-blank, healthy contrast spread (σ 29–31); 375px cell renders full-height (1537px) with normal card stacking — no overflow artifacts at column level; mobile CTA full-width per `reviewCtaSx` |
| `bs-drawer-375-ar` + drawer pair @768 | 375×812 overlay intact; **RTL mirroring confirmed**: en↔ar mirrored-diff 4.7 vs plain-diff 9.8 (mirror strictly dominates) |
| `bs-nav-1440-ar` (nav six-cell) | Sidebar structure mirrors (en↔ar mirrored-diff 5.9 vs plain 10.2); dashboard pair mirrored-diff 2.8 vs plain 11.2 — strongest mirror signal, logical-properties discipline visually effective |
| `bs-dash-dark-1440-en` | Genuinely dark (mean 26.9) with structure aligned to the light cell (diff 10.2 ≈ palette-only change) — theme-token discipline holds in dark mode |

No layout-integrity, mirroring, wrapping, or contrast defect surfaced from the evidence.

## Run Evidence (each command run once)

| Command | Result |
|---|---|
| `bun run tsgo` | exit 0 — clean |
| `bun run biome:check` | `Checked 1425 files in 10s. No fixes applied.` — exit 0 |
| `timeout 300 bun run test/scripts/run-test.ts backend/graphql/test/parent-link.wire.test.ts` | **25 tests, 0 fail**, 474 expect() calls, 9.60s |
| `timeout 420 bun run test/scripts/run-test.ts backend/services/parents` | **111 tests, 0 fail**, 637 expect() calls, 1.97s (4 files) |

## Pre-existing Observations (non-blocking, outside delta)

- `frontend/views/students/dashboard/HandshakeCodeCard.tsx:69,97` — skeleton branches pass `busy` without the new `busyLabel` (silent busy frame). Pre-existing consumer; the additive prop left it untouched. Cosmetic a11y improvement candidate for the owning surface, not this plan.
- Foreign-domain journey failures (sessions/governance/notifications) recorded in the ledger as DI-2.1-01 — reproduced in isolation, zero production diff in those domains from this delta; unaffected by this review's runs (parents tiers green).
- `parent-link-denials.ts` shared-table approach predates this delta (DEV1-014); the new `OrNull` variant is a clean extension, not a fork.

## Verdict

**FINDINGS: 1** — a single LOW, test-only, environment-conditional assertion (journey step 10 JS-clock grounding). Two INFO observations (route-constant placement; parent deep-link redirect — already ledgered DI-6.4-01). All four lenses pass; all four mandated runs green; visual evidence supports the RTL/mobile/dark claims. The delta is **APPROVED** from independent-review round 2; the LOW item may be fixed in a follow-up test-only commit or accepted as-is by the plan owner.
## Fix (FIX-R2)

Finding addressed: [LOW] `test/workflows/parents/student-confirmation-of-link.journey.test.ts:1142` — Step-10 boundary grounding compared the DB-clock fixture instant (`expiresAt` = DB `now()` injected at L1119-1129) against the JS host clock (`Date.now()`), reintroducing the app-host vs DB-host skew sensitivity the FIX-A DB-clock design explicitly closed.

Fix chosen: DB-clock on BOTH sides (skew-proof re-read, no tolerance fudge, JS-clock side removed). The grounding now reads a fresh DATABASE `now()` and asserts `expiresAt <= dbNow`:

```ts
const groundingNowMs = await db.transaction(async (tx: DBTransaction) => {
  const clock = await tx.execute<{ nowMs: string }>(
    sql`select floor(extract(epoch from now()) * 1000)::bigint as "nowMs"`
  );
  const nowMs = Number(clock.rows.at(0)?.nowMs);
  if (!Number.isFinite(nowMs)) {
    throw new Error("boundary grounding could not read the database clock");
  }
  return nowMs;
});
expect(boundary.expiresAt.getTime()).toBeLessThanOrEqual(groundingNowMs);
```

Rationale / notes:
- Both sides of the comparison now share the clock the strict-`>` claim predicate evaluates against; app-host clock skew can no longer flip the assertion, matching the cell's stated DB-clock determinism intent (comment at the fixture read).
- Epoch-millis cast (`extract(epoch …)::bigint` + quoted `"nowMs"` alias) because raw `execute` rows bypass drizzle's column mapping — timestamptz arrives as TEXT (`"2026-09-07 15:36:06.652866+00"`, probed) — so a numeric read keeps the comparison engine-independent; `Number()` is exact for int8-as-string at ms scale.
- Downstream assertions (Expired render parity, typed EXPIRED denial, materialized Expired) continue to pin the boundary semantics; the grounding stays as a fixture sanity check only.

Run evidence (each once, this machine):
- `bun run test/scripts/run-test.ts test/workflows/parents/student-confirmation-of-link.journey.test.ts` → **12 pass / 0 fail** (257 expect) — back to the FIX-A green count.
- `bun run scripts/health/sub-loop.ts test/workflows/parents/student-confirmation-of-link.journey.test.ts --lifecycle duplicates` → all checks passed (tsgo, oxlint, biome:check, lint:type-aware, check:duplicates), **exit 0**.

Scope: ONE file edited (`test/workflows/parents/student-confirmation-of-link.journey.test.ts`); zero production changes; no git operations.
