# Round 10 — Independent Review Outcome (FINAL SWEEP)

- **Task ID:** ITER-10 · **Agent:** Independent Reviewer R10 (fresh judgment; no reliance on prior rounds' conclusions)
- **Scope:** `git diff ffce457 feat/dev1-015-student-confirmation-of-parent-link --name-only` excluding `ai/plans/**` — 21 non-plan files (wire test, parents service battery, parentLink locale ar/en + types + parity suite, notification deep-link leaf module, drawer body + actions, student dashboard card + derivation helper + shell + barrel, RoleDashboardPage slot, nav items + nav test, 3 UI suites, 1 journey suite). Branch tip `0de59e8`; no code commits after the round-9 sweep; working tree touches plan docs only.
- **Mode:** review-only. No code changes; `tasks.md` untouched; NO git operations.

## Verification (mandated commands, run once each)

| Command | Result |
|---|---|
| `bun run tsgo` | clean — no diagnostics |
| `bun run biome:check` | clean — 1426 files checked, no fixes applied |
| `run-test.ts backend/graphql/test/parent-link.wire.test.ts` | 25 tests / 474 expects — pass |
| `run-test.ts backend/services/parents` | 111 tests across 4 files, 0 fail (636 expects) |
| `run-test.ts test/workflows/parents` | 39 tests across 3 files, 0 fail (614 expects) |

Supplemental (not mandated, run for the final sweep): the delta's own UI suites under the sanctioned preload stack — `PendingParentLinkRequestsCard.test.tsx` 23/23 in isolation; `notification-deep-link.test.tsx` and `RoleDashboardPage.slot.test.tsx` passed inside the full-directory run before the harness kill (see non-blocking note 1). Repo-wide pattern scan over the 21 delta files for `as any` / `as unknown` / `@ts-ignore` / `@ts-expect-error` / `console.*` / `.only` / `.skip` / `dangerouslySetInnerHTML` / eslint-disables: ZERO hits.

## Lens 1 — TYPES: CLEAN

- tsgo exit 0; biome clean. Codegen wire types only (`MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests`, `MockLink.MockedResponse`); zero unsafe casts/suppressions in the delta.
- Enum-value discipline: the route map keys on the backend `NotificationType` enum member for the free-varchar `relatedEntityType` with an explicit `string \| undefined` miss modeled and `??` fall-through; `LinkStatus` gates in `deriveActionableIncoming`; `LinkStatus.Expired` asserted in the wire fold cell.
- i18n bijection intact: 6 new `dashboardCard*` slots on ar + en + `ParentLinkLabels` (39-slot mandated inventory, exhaustive-set test updated), Arabic plural classes correct (1/dual/few/many; `count <= 10` arm unreachable at 0 by the card's null contract), digit-shape pins deliberately dropped in favor of word-containment pins (ICU-robustness, FIX-R5/R6).

## Lens 2 — BACKEND-TEST DISCIPLINE: CLEAN

- Wire test: fixture registration moved to the sequential `registerActorCast` reduce with a documented savepoint-collision rationale (pglite single-session `sp1` interleaving); parallel deny-probes correctly stay parallel (pre-DB tiers). The new expired seeded row rides the parentP → studentG pair with a sound partial-unique-index justification (pending-pair uniqueness) and joins the FK-safe teardown order.
- New cells are behavior-proofing, not implementation-mirroring: byte-identical foreign ≡ absent BOLA bodies under a pinned correlation header; expired fold-first with `respondedAt` null + zero emit; envelope key-set parity across all three decision-leg denial classes; input-coercion tier dies pre-resolver with a before/after notification-count side-effect probe.
- Service test: the sequential double-respond idempotency cell correctly uses the COMMITTED-fixture convention (the service owns the commit boundary on both decisions — `runInRollback` cannot host it), pins the constant `ALREADY_RESOLVED` conflict, EXACTLY ONE parent notification + one publish, the FIRST `respondedAt` stamp preserved, and the frozen bounded denial log shape; log spy restored in `finally`.

## Lens 3 — FRONTEND DISCIPLINE: CLEAN

- Composition: `RoleDashboardPage` student slot is a plain Stack of two zero-prop client cards inside the existing server surface (MUI `Stack` is a `"use client"` module — verified in node_modules — so the RSC import is sound); no conditional-hook surface.
- `PendingParentLinkRequestsCard`: read-purity honored (`nowMs` frozen at mount via lazy initializer), derivation reused verbatim from the shared status machinery (no fork), mount-frozen-staleness explicitly closed by server-side expiry materialization on refetch; raw wire messages never reach the DOM (`resolveParentLinkDenialCopyOrNull` + card-owned `dashboardCardLoadError` fold); 44px CTA/retry targets; `sx`-only styling with `theme.palette.*` tokens; `*Outlined` icons only; `useAppTranslation` handle property access everywhere; `isolateBidi` before interpolation + `dir="auto"` on the requester line; CardShell's new `busyLabel` is opt-in and pairs with `role="status"` only on the skeleton branch.
- Single definition site for the decision route holds: `STUDENT_LINK_REQUESTS_ROUTE` is consumed by nav entry, card CTA, and drawer deep-link resolution; unknown/absent `relatedEntityType` falls through UNCHANGED to `/notifications` (pinned by unit + component cells).

## Lens 4 — SECURITY: CLEAN

- No new client-side authorization surface: the card renders only session-scoped rows from a zero-argument query (identity server-side); parent full name remains the sanctioned REQ-015 incoming disclosure; no student identifiers enter the new copy (types doc pins this).
- The deep-link href is a compile-time constant resolved through a fixed `relatedEntityType` map; `relatedEntityId` is never interpolated — no id oracle, no open-redirect, no user-controlled URL. Error paths render only mapped/localized copy (no server-message reflection).
- The wire tier re-proves the no-oracle posture on the decision leg (foreign ≡ absent byte-identical; per-class envelope key parity) and adds a pre-resolver coercion denial with a zero-side-effect proof. No secrets, no logging of PII beyond the established bounded denial-log shape.

## FINDINGS: 0

No new blocking, major, minor, or info defects attributable to this delta. Verdict: **PASS** (review-clean; the plan's final sweep confirms the branch from base `ffce457` to tip `0de59e8`).

### Non-blocking notes (pre-existing / out-of-delta)

1. **Full-directory `test:ui:components` run is OOM-killed in this sandbox** — reproduced three times (wrapper exit 1; direct invocation exit 137/SIGKILL with 4 GB RAM), dying mid-run at pre-existing NON-delta files (`admin/DirectoryUserIdentityCell.test.tsx`, which passes 4/4 in isolation; an admin/common/landing-only batch with ZERO delta files dies at the same point). This is a sandbox resource limit of the batch runner, not a code defect: every delta-owned UI suite passes (card suite 23/23 isolated; deep-link + slot suites passed before the kill in the full run). Carries forward the round-8 harness note; suggest running UI suites in sub-batches or raising sandbox memory. Not counted as a finding.
2. Carried context, unchanged from prior rounds: parent-side outcome rows deep-link to the student-only route and are safely bounced by the page guard (round-5 INFO, deliberate single-route design); the denial-copy table reuse on the card's list-error branch is a documented, tested contract; sentinel `999999999` is the established absence-probe idiom. None re-counted.

## Sign-off

- Outcome file: `outcome/round-10-review-outcome.md` (this file). Worklog appended below under Task ID ITER-10.
- No fixes applied; no git operations; `tasks.md` untouched.

---

## Worklog

**Task ID:** ITER-10 · **Agent:** Independent Reviewer R10 · **Date:** 2026-09-07

- Reviewed the 21-file non-plan delta end-to-end with fresh judgment: backend wire + service suites (sequential-registration helper, expired-row seeding, BOLA/coercion/decision-leg cells, double-respond idempotency cell), frontend lib/card/shell/nav/RoleDashboardPage/drawer seam, locale ar/en/types/parity, and the four new test suites.
- Ran the five mandated commands once each (all green; results in §Verification); additionally ran the delta's UI suites under the sanctioned preload stack and diagnosed the full-directory OOM kill (exit 137, non-delta crash point, isolation passes) as a sandbox limitation — recorded as non-blocking note 1.
- Cross-checked by grep/node_modules inspection: single `STUDENT_LINK_REQUESTS_ROUTE` definition + consumers, MUI `Stack` `"use client"` banner for the RSC composition, zero unsafe-cast/console/.only/skip hits across the delta, FK-safe teardown inclusion of the new expired row, partial-unique-index rationale for the expired fixture pair.
- Verified the four lenses independently (types/enum/i18n bijection; backend fixture + denial + idempotency discipline; frontend sx/token/i18n/read-purity/disclosure rules; BOLA/no-oracle/no-message-reflection security posture).
- Filed 0 findings; wrote this outcome file only. No source files touched; `tasks.md` untouched; NO git operations.
