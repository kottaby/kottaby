# Round 5 — Independent Review Outcome (ITER-5)

- **Plan:** DEV1-015 — Student confirmation of parent link
- **Scope reviewed:** `git diff ffce457 feat/dev1-015-student-confirmation-of-parent-link --name-only` (excluding `ai/plans/**`) — 20 files, +3241/−52
- **Reviewer:** Independent Reviewer R5 (no knowledge of prior rounds)
- **Note:** working tree (non-plan files) is byte-identical to the branch tip, so all executed commands reflect the reviewed delta exactly.

## Verification commands (all run once, all green)

| Command | Result |
|---|---|
| `bun run tsgo` | clean — no errors |
| `bun run test/scripts/run-test.ts backend/graphql/test/parent-link.wire.test.ts` | 25 pass (474 expect calls, ~9.5s, real PostgreSQL per `.env.test`) |
| `bun run test/scripts/run-test.ts test/workflows/parents` | 39 pass / 0 fail (614 expect calls, 3 files — the true concurrent race cell in Step 9b **executed**, not skipped, since `DB_PROVIDER=postgres`) |
| `md5sum …/outcome/browser-evidence/*.png \| sort \| uniq -w32 -D` | **zero duplicate evidence captures** |

## Lens 1 — TYPES

- Canonical types: card fixtures reuse codegen wire types (`MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests`); no local re-declarations. `ActionableIncomingSummary` is a legitimately new derived shape.
- Enum discipline: `NOTIFICATION_ROUTE_BY_ENTITY_TYPE` is keyed by the **backend** `NotificationType.ParentLinkRequest` enum VALUE (correct — `related_entity_type` is a free varchar carrying the enum's snake_case value); no bare `"parent_link_request"` literals in production code. The journey's `PARENT_LINK_NOTIFICATION_TYPE: NotificationRow["type"]` constant avoids unsafe enum-vs-string-union comparison per linting rules.
- No unsafe casts found. `hasPgCode`'s `cause` walk is `instanceof Error`-guarded.
- i18n bijection: 6 new keys added symmetrically to `types/`, `en/`, `ar/`; parity suite extended to 39 mandated slots with Arabic-script probes and exact template pins; Arabic plural classes (1 / 2 dual / 3–10 / 11+) are correct. `resolveParentLinkDenialCopyOrNull` refactor is behavior-preserving for the original function (null/unmapped → `internalServerError`).

## Lens 2 — BACKEND/TESTS

- Race determinism: journey Step 10 boundary fixture is grounded on the **DB clock** on both sides (injected `now()` instant + fresh epoch-millis grounding read); no `sleep`s anywhere in the delta; remaining `Date.now()` uses carry ≥60-minute margins (non-boundary). Step 9b true race runs on real Postgres with per-contender transports and a typed loser-shape pin (`ALREADY_RESOLVED`/`TARGET_ALREADY_LINKED` or driver `40P01` via a cause-chain walk).
- Wire fixture addition (expired pair parentP→studentG) correctly respects the partial unique index (its sibling row is Rejected), documented inline; sequential `registerActorCast` fixes the PGlite savepoint collision with rationale, and parallel deny-probes stay parallel (no DB touch).
- Fixture isolation + FK-safe teardown: both suites track every committed row (including the new `decideCast` via `createStudentFixture`, race cast via `TrackedFixtures`), delete notifications → requests (incl. membership sweep) → students → users, and enforce mandatory zero-residue probes (`students.id == users.id` verified — 1:1 shared key).
- Log hygiene: no `console.*`; domain logs asserted (exactly-once, frozen bounded shape) via `silenceDomainLog` spies; masked-class raw messages asserted absent from the DOM in UI tests.
- Evidence integrity: no md5-duplicated PNGs; captures are distinct per scenario/viewport/locale.

## Lens 3 — FRONTEND

- `sx`-only styling; colors exclusively via `theme.palette.*` (function-sx); `PendingActionsOutlined`/`RefreshOutlined`; both CTAs `minHeight: 44`; slot Stack uses a serializable object sx (SSR boundary honored — `RoleDashboardPage` is a server component composing client cards as plain JSX, no conditional hooks).
- Zero hardcoded user-facing strings: every label through compile-time handles (`t.dashboardCard*`, `tc.retry`, `te.*`); the only raw literals are testids and the frozen-value route pins in tests.
- Apollo: one document per surface — the card reuses the decision page's `myIncomingParentLinkRequestsQueryDocument` verbatim; single `useQuery`; convergence proven via normalized cache write-back (Confirmed → unmount). Deep-link rows remain real `next/link` anchors (no router calls).
- SSR boundary: slot test imports the page through the server-only barrel with `server-auth` mocked pre-import; client/server module graph checked — `navItems.ts` is `"use client"` and only client-imported, so the constant imported from the drawer-actions hook module resolves normally (see LOW-1 for the layering note).
- Dead code: none; helpers pure (`deriveActionableIncoming` — no clock reads, no Apollo/React imports); comments verified accurate against code (e.g., the defense-in-depth dual-gate description matches the implementation; CardShell `busyLabel` contract matches usage).

## Lens 4 — SECURITY

- BOLA/BFLA: foreign ≡ nonexistent byte-identical `NOT_FOUND` (wire, service, journey tiers) with pinned correlation header; governed pre-TX ordering proven by repo spies — zero post-gate collaborator invocations, exactly one bounded `entity: "users"` log per denial; cross-role denials carry identical constant copy (no branch disclosure).
- BOPLA: closed wire shapes re-pinned (`OUTGOING_KEYS`/`INCOMING_KEYS`); student name masked forever on the parent side; incoming full-name disclosure is the sanctioned requester only.
- Deep-link route is a **constant** — no id interpolation anywhere; the decision surface is guarded server-side by `withPageAuth({ roles: [Student] })` (anonymous → login, non-student → own role dashboard — verified in code and by 4.4 evidence). Unknown/absent entity types fall through to the feed page; the resolver never throws.
- No existence oracles added; no secrets in the delta.

## Findings

- **[MINOR] frontend/components/ui/useNotificationDrawerActions.ts:19** — The shared `STUDENT_LINK_REQUESTS_ROUTE` constant and pure `resolveNotificationRoute` resolver now live inside a `"use client"` hook module that also pulls `useNotificationMarkActions` (Apollo) and `logger`; `navItems.ts`, the dashboard card, and three suites import the constant from there, so a route definition site drags the hook module graph and the file mixes hook + shared-constant responsibilities. No runtime bug today (every importer is a client module/test) — maintainability only. — *Suggested fix:* move the constant + resolver to a leaf module (e.g., `frontend/lib/notification-routes.ts`) and re-export from the hook file for compatibility.
- **[MINOR] shared/locale/ar/parentLink/index.ts:31** — `count.toLocaleString("ar")` output (Arabic-Indic digits "٣"/"١٢") is exact-pinned in `parentLink-namespace.parity.test.ts`; the rendered digits are ICU/toolchain-dependent, so a bun/ICU upgrade could break the pin with no behavior change. — *Suggested fix:* either accept the pin knowingly or assert Arabic-script + count containment instead of exact strings for the digit-bearing branches.
- **[INFO] test/workflows/parents/student-confirmation-of-link.journey.test.ts:700** — `NONEXISTENT_ID = 999999999` (and the wire test's `"999999999"`) are sentinel "absent" ids; a hypothetical sequence collision would silently turn the absent arm into a foreign arm — harmless here because the byte-identical assertion still holds. — *Suggested fix:* none required; optionally derive from `max(id)+1` if ever flaky.
- **[INFO] frontend/components/ui/useNotificationDrawerActions.ts:37** — Parent-side outcome notifications also carry `relatedEntityType = "parent_link_request"` (journey Step 11 pins the symmetric contract), so a parent clicking such a drawer row anchors to the student-only decision route and relies on the `withPageAuth` bounce to their own dashboard — safe (no disclosure, graceful degradation, evidenced by `4.4-parent-redirect-to-parent-dashboard.png`), but the parent lands via a guard redirect rather than their outgoing list. — *Suggested fix:* out of scope for DEV1-015; a future recipient-aware route map could send parents to the outgoing-requests surface.

## Verdict

**FINDINGS: 4** (0 blocker/major, 2 minor, 2 info) — **PASS**. All four verification commands green on real PostgreSQL, including the true concurrent race cell; type/i18n parity, test determinism, fixture hygiene, frontend discipline, and the BOLA/BOPLA/no-oracle posture all hold under independent re-derivation. The two minor items are maintainability/toolchain-robustness notes and do not block the plan gate.

---

## Fix (FIX-R5)

Both MINOR findings addressed in one micro-fix round. The FIX-R5 constant extraction chose DIRECT import-site updates over a hook-module re-export (all seven import sites were enumerated; a one-line import swap per file is the cleaner diff — zero indirection, and the hook module retains no reference to the constant, so exactly ONE definition site survives). No behavior change anywhere.

**[MINOR] route constant/resolver hosted in a `"use client"` hook module — FIXED (extracted to a leaf):**

- New leaf module `frontend/lib/notification-route-resolution.ts` — directive-free, framework-free (NO `"use client"`, NO Apollo, NO logger): exports `STUDENT_LINK_REQUESTS_ROUTE` + `resolveNotificationRoute` with the original docblocks moved verbatim (plus a leaf-rationale note); private `NOTIFICATIONS_FEED_ROUTE` + `NOTIFICATION_ROUTE_BY_ENTITY_TYPE` (still keyed by the backend `NotificationType` enum VALUE — no bare literals introduced). This is the constant's ONLY definition site.
- `frontend/components/ui/useNotificationDrawerActions.ts` — the moved block removed; the hook module now contains ONLY hook code (imports: `useState`, generated types, `useNotificationMarkActions`, `logger`).
- Direct import-site updates (7 files, one import line each): `frontend/components/ui/NotificationDrawerBody.tsx` (resolver), `frontend/views/dashboard/nav/navItems.ts`, `frontend/views/students/dashboard/PendingParentLinkRequestsCard.tsx`, `frontend/views/dashboard/nav/navItems.test.ts`, `test/ui/components/students/PendingParentLinkRequestsCard.test.tsx`, `test/ui/components/dashboard/RoleDashboardPage.slot.test.tsx`, `test/ui/components/notifications/notification-deep-link.test.tsx` (constant + resolver; suite docblock retargeted to the leaf). All imports repositioned to the alphabetical slot (`@/frontend/lib/notification-route-resolution`); no re-export shim left behind.

**[MINOR] ar `dashboardCardCount` exact-string pins incl. Arabic-Indic digits — FIXED (ICU-robust containment probes):**

- `shared/locale/parentLink-namespace.parity.test.ts` — ONLY the ar count cell relaxed: `1`→`toContain("واحد")` (one-class word), `2`→`toContain("طلبا ربط")` (dual; includes the noun because few's "طلبات" otherwise contains "طلبا" as a substring — rationale in an inline comment), `3`→`toContain("٣")` + `toContain("طلبات ربط")` (few), `12`→`toContain("١٢")` + `toContain("طلب ربط")` (many). The rendered digits come from `toLocaleString("ar")`, so digit-exactness is now a containment probe; the one/two/few/many plural-class WORDS stay pinned and mutually distinguishable. En pins remain exact (`.toBe`). The 39-slot mandated-key bijection, the "no silent key minting" exhaustive-inventory pin, the Arabic-script sweeps, and the sibling `summaryCountChip`/`expiresLine`/dialog template pins are untouched (header docblock item 5 amended to note the ar count-cell exception).

Verification (each once, this machine, 2026-09-07):
- `rg -n "STUDENT_LINK_REQUESTS_ROUTE" frontend/ test/ app/ --files-with-matches` → 7 consumer files + the leaf; the ONLY `export const` is `frontend/lib/notification-route-resolution.ts:13` (hook module no longer mentions the constant).
- `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` → exit 0 for ALL 10 touched files (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates each).
- `bun run test/scripts/run-test.ts shared/locale/parentLink-namespace.parity.test.ts` → 68 pass / 0 fail (436 expect calls).
- Scoped UI suites (preloads pattern via the locked runner): `notification-deep-link.test.tsx` 6 pass / 0 fail · `PendingParentLinkRequestsCard.test.tsx` 23 pass / 0 fail · `RoleDashboardPage.slot.test.tsx` 7 pass / 0 fail · `navItems.test.ts` (run-test) 32 pass / 0 fail.
- `bun run tsgo` → 0 errors.

Scope: 1 new leaf module + 9 edited files (7 import swaps, 1 hook-module strip-down, 1 parity-test pin relaxation) + this outcome file. NO git operations (no checkout/reset/commit/stash/branch).

### Worklog (FIX-R5)

- **Task ID:** FIX-R5 · **Agent:** Layering Fix Subagent · **Date:** 2026-09-07
- Read both MINOR findings plus their round-2/3/4 INFO antecedents; mapped every `STUDENT_LINK_REQUESTS_ROUTE`/`resolveNotificationRoute` import site repo-wide (7 consumers incl. one the finding's list omitted — `RoleDashboardPage.slot.test.tsx`); compared re-export vs direct-import diff shapes and chose direct imports (cleaner layering, single definition site verifiable by grep).
- Created `frontend/lib/notification-route-resolution.ts` (pure leaf, backend-enum-keyed map moved verbatim); stripped the moved block from `useNotificationDrawerActions.ts`; swapped 7 import sites with alphabetical repositioning; relaxed ONLY the digit-exactness of the four ar `dashboardCardCount` pins to containment probes while keeping every plural-class word pinned (dual-vs-few substring hazard handled and documented); en pins and all bijection invariants untouched.
- Verified: single definition site by rg; sub-loop duplicates exit 0 ×10; parity suite 68/68; four scoped UI suites green (6+23+7+32 passes); `tsgo` 0 errors.
- Files touched: `frontend/lib/notification-route-resolution.ts` (new), `frontend/components/ui/useNotificationDrawerActions.ts`, `frontend/components/ui/NotificationDrawerBody.tsx`, `frontend/views/dashboard/nav/navItems.ts`, `frontend/views/dashboard/nav/navItems.test.ts`, `frontend/views/students/dashboard/PendingParentLinkRequestsCard.tsx`, `test/ui/components/students/PendingParentLinkRequestsCard.test.tsx`, `test/ui/components/dashboard/RoleDashboardPage.slot.test.tsx`, `test/ui/components/notifications/notification-deep-link.test.tsx`, `shared/locale/parentLink-namespace.parity.test.ts`, `round-5-review-outcome.md`. No git operations.
