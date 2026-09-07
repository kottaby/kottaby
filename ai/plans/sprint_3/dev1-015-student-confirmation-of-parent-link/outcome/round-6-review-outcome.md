# Round 6 — Independent Review Outcome (ITER-6)

**Task ID:** ITER-6 · **Agent:** Independent Reviewer R6 · **Date:** 2026-09-07
**Scope:** `git diff ffce457 feat/dev1-015-student-confirmation-of-parent-link --name-only` (excluding `ai/plans/**`) — 22 files: 2 backend test files, 8 frontend files, 4 shared-locale files, 8 test files. Review performed blind to prior rounds; all judgments independent.

---

## 1. Verification Runs (each exactly once, this machine)

| Command | Result |
|---|---|
| `bun run tsgo` | 0 errors |
| `bun run test/scripts/run-test.ts backend/graphql/test/parent-link.wire.test.ts` | 25 tests / **0 fail** (474 expect calls; `[DOMAIN] … re-check` lines are the bounded structured denial logs the tests themselves assert on — expected, not hygiene violations) |
| `bun run test/scripts/run-test.ts backend/services/parents` | 111 tests / **0 fail** (637 expect calls) |
| `md5sum outcome/browser-evidence/*.png \| sort \| uniq -w32 -D` | **No duplicates** (all evidence captures distinct) |

Supplementary (run once each, to cover the delta's own suites):
- `test/workflows/parents/student-confirmation-of-link.journey.test.ts` → 12 pass / 0 fail.
- `shared/locale/parentLink-namespace.parity.test.ts` + `frontend/views/dashboard/nav/navItems.test.ts` → 32 pass / 0 fail.
- The three new UI suites via the sanctioned harness (`bun test … --preload test-env/happydom-preload/translation-preload/next-dynamic-mock`, env `.env.test.ci`): `RoleDashboardPage.slot.test.tsx` + `PendingParentLinkRequestsCard.test.tsx` + `notification-deep-link.test.tsx` → **36 pass / 0 fail**. (Note: running UI-tier files through `run-test.ts` fails with `document is not defined` — a harness mismatch, not a defect; the pre-existing sibling `profile-view.test.tsx` behaves identically under that misuse.)

---

## 2. Findings by Lens

### TYPES
- **Local types where canonical required** — clean. Card/derivation/slot-test consume the codegen `MyIncomingParentLinkRequestsQuery_*` and `LinkStatus` types; no ad-hoc local duplicates. The mocked `getServerUserContext` double's `ServerContextState` is a sanctioned test-double shape, not a domain-type fork.
- **Enum value-vs-type imports** — clean and exemplary: the deep-link route map keys on the backend `NotificationType` enum VALUE (the persisted `related_entity_type` varchar carries the snake_case value), and the deep-link test aliases it `BackendNotificationType` to keep it visually distinct from the codegen PascalCase `NotificationType`. Codegen `relatedEntityType: string | null` exactly matches `resolveNotificationRoute`'s parameter type.
- **Unsafe casts** — none found in the delta (no `as any`, no `as unknown as`, no ts-ignore; the only `as` are a locale-literal narrowing and icon aliasing).
- **i18n bijection** — 39-key mandated inventory enforced on BOTH maps; six function-valued slots inventoried on both; ar Arabic-script sweeps cover all new copy; en/ar plural classes are locale-appropriate (en 1/other; ar 1/2/3–10/11+ with grammatically correct nouns). → one LOW note below.

### BACKEND / TESTS
- **Race determinism** — clean: `registerActorCast` sequentializes the only savepoint-carrying fixture step (rationale documented; parallel deny-probes stay parallel); Step 9a is the deterministic loser-collapse cell everywhere; Step 9b true concurrency is wholesale-gated on real PostgreSQL via `isPgliteProvider` (the sanctioned chaos-tier pattern); expiry boundary is grounded on the DB clock on BOTH sides (no app/DB skew flakiness).
- **Fixture isolation + FK-safe teardown** — clean on all three suites: wire `afterAll` deletes requests (incl. the new `expiredRequestId`) → notifications → role-child rows → users with the seeded admin never deleted; service tests use module-scope tracked registries + belt-and-braces membership sweep + five zero-residue probes; journey teardown registers side-effect inbox rows last, deletes in reverse FK-safe order, and probes residue by id AND per-run `jrn_sconfirm_` prefix. The expired seeded row's pair choice is correct per the pending-only partial unique index (documented in-file).
- **Log hygiene** — clean: `silenceDomainLog` with `finally` restore around every denial assertion; bounded per-denial log shape pinned (`code/entity/entityId/locale`, exactly-once); zero `console.*` in the delta.
- **Journey rules** — real services on the real DB, shared helpers reused verbatim (no helper forks), transport spied only at the `options.transport` seam, permission resolution never monkey-patched (all denials through the real `requireActor` re-check).
- **Evidence integrity** — md5 dedup clean.
- No `.only`/stray `.skip` (the two `describe.skip` hits are the sanctioned provider-gated tiers).

### FRONTEND
- **sx-only / theme tokens / \*Outlined / 44px / logical properties** — clean: all styling via `sx`; colors exclusively through `theme.palette.*`; `PendingActionsOutlined` + `RefreshOutlined`; both CTAs `minHeight: 44`; no physical left/right properties anywhere in the delta; slot Stack `sx` is a plain serializable object (SSR boundary safe).
- **No hardcoded user-facing strings** — clean: card copy flows through `ParentLink`/`Errors`/`Common` handles; tests assert via preloaded label objects (only route constants, testids, and fixture DATA pinned).
- **Apollo discipline** — single document (`myIncomingParentLinkRequestsQueryDocument`), single `useQuery`; post-decision disappearance relies on the normalized cache write-back and is pinned by a dedicated test cell.
- **SSR boundary** — clean: server page composes zero-prop client cards; no server-only imports in client modules; no conditional-hook surface (hooks live inside each card).
- **Dead code** — none: `resolveParentLinkDenialCopy` (old non-null variant) still has three live consumers; the new `…OrNull` variant is the card's mapped-copy seam.
- **Helper purity** — `deriveActionableIncoming` is pure (no clock reads; `nowMs` injected; single pass; newest-by-`createdAt` max tracked by timestamp champion; boundary `expiresAt === now` correctly non-actionable).
- **Module layering** — verified: `frontend/lib/notification-route-resolution.ts` is directive-free/framework-free and is the constant's ONLY definition site (repo-wide grep: 7 consumers + leaf; `useNotificationDrawerActions.ts` no longer references it); the shared route targets the real `app/(dashboard)/student/link-requests/page.tsx`, not the ComingSoon catch-all; nav/card/drawer cannot drift.

### SECURITY
- **BOLA / no existence oracle** — clean: foreign ≡ nonexistent answered BYTE-IDENTICAL `PARENT_LINK_REQUEST_NOT_FOUND` bodies under a pinned correlation header; envelope key-set parity pinned across not-found / already-resolved / expired classes (no per-class disclosure).
- **BFLA / BOPLA** — clean: zero new resolvers in the delta; governance pre-TX ordering proven with call-through repo spies (zero post-gate invocations, gate's own `findById` reads called in exact order from the `actorUserId` argument alone); smuggled-identity-arg and input-coercion tiers pin pre-resolver death with zero-side-effect probes.
- **No id interpolation in routes** — clean: deep links resolve through a fixed entity-type→route map; `relatedEntityId` never enters an href.
- **No secrets** — clean: credential constants in the wire test are pre-existing at `ffce457`; nothing secret added in the delta.

---

## 3. Findings

**[LOW] shared/locale/parentLink-namespace.parity.test.ts:240–251 — comment overclaims ICU-robustness while two pins remain digit-shape-dependent — fix: drop the two digit containments (the pinned plural-class words already discriminate 1/2/few/many) or reword the comment to state that Arabic-Indic digit-shape pins intentionally mirror the pre-existing `summaryCountChip` invariant.**
The rationale comment says the ar count pins "probe CONTAINMENT … a bun/ICU upgrade must not fail this gate" because `toLocaleString("ar")` shaping is ICU/toolchain-dependent — yet `toContain("٣")` (line 248) and `toContain("١٢")` (line 250) DO pin the digit shape, so a non-Arabic-Indic rendering would fail exactly those two probes. Test-only, doc-accuracy issue with negligible runtime risk: the pre-existing `summaryCountChip` cell (line 288–289) already pins Arabic-Indic digits repo-wide, so full-ICU is a settled project invariant and this gate adds no new fragility beyond it. Non-blocking.

*(Pre-existing-filter note: nothing in the delta was excluded as pre-existing — the only candidates checked and cleared were the harness-mismatch UI run and the pre-existing `summaryCountChip` digit pin.)*

---

## 4. Verdict

# FINDINGS: 1 (1 LOW, 0 MEDIUM, 0 HIGH)

**PASS.** The delta is type-safe, race-deterministic, FK-safe with zero-residue teardowns, i18n-bijective, sx/token-disciplined, layering-clean, and security-pinned (foreign ≡ absent, no oracle, no id-in-route, no secrets). All mandated verification gates green. The single LOW finding is a test-comment accuracy nit that does not block closure; recommend folding the one-line comment/pin adjustment into any subsequent touch of the parity suite (or leaving as-is — the behavior is protected by stronger pre-existing pins).

---

## 5. Edits Made

- Created `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/round-6-review-outcome.md` (this file). No other file touched; no git operations; `tasks.md` untouched.

## Worklog (ITER-6)

- **Task ID:** ITER-6 · **Agent:** Independent Reviewer R6 · **Date:** 2026-09-07
- Reviewed the full `ffce457 → feat/dev1-015…` delta blind to prior rounds: 22 files across 4 lenses (types / backend+tests / frontend / security), reading every changed file end-to-end including the 1306-line journey suite, the wire decision-leg cells, the slot/card/deep-link UI suites, and the locale delta.
- Ran each mandated gate once: `tsgo` (0 errors), wire tier (25/0), parents services (111/0), md5 dedup on browser-evidence (no duplicates); plus journey (12/0), parity+nav (32/0), and the three new UI suites under the sanctioned preloads (36/0). Confirmed the UI-tier `run-test.ts` "document is not defined" path is a harness mismatch, not a defect (pre-existing sibling suite behaves identically).
- Verified layering claims by repo-wide grep (single definition site of `STUDENT_LINK_REQUESTS_ROUTE`; leaf module directive-free; 7 consumers), route reality (`app/(dashboard)/student/link-requests/page.tsx` exists), helper purity, teardown FK-ordering and zero-residue probes, race gating, and DB-clock boundary grounding; scanned for unsafe casts, physical CSS properties, `console.*`, `.only`/stray skips, and secrets (none).
- Filed 1 LOW (parity-suite comment vs digit-shape pins); wrote this outcome file only. No git operations.

---

## Fix (FIX-R6)

**Task ID:** FIX-R6 · **Agent:** Micro Fix Subagent · **Date:** 2026-09-07

- Resolved the R6 LOW finding in `shared/locale/parentLink-namespace.parity.test.ts` (only file touched): chose the **removal** option — dropped the two residual digit-shape probes `toContain("٣")` (dashboardCardCount(3)) and `toContain("١٢")` (dashboardCardCount(12)), which contradicted the ICU-robustness comment; the pre-existing `summaryCountChip` Arabic-Indic digit pin (function-slot inventory cell) already guards digit shape repo-wide.
- Comment reworded to state exactly what is and isn't guaranteed: the ar `dashboardCardCount` pins now assert plural-class WORD containment only (واحد / طلبا ربط / طلبات ربط / طلب ربط — all kept intact, including the few⊃two substring-disambiguation note), with an explicit "NO digit-shape assertion is made here" pointer to the summary-chip pin; the header docblock's "digit-form + plural-class containment" claim corrected to match.
- Verified: `bun run test/scripts/run-test.ts shared/locale/parentLink-namespace.parity.test.ts` → **68 tests / 0 fail / 434 expect() calls** (test count unchanged at 68 — the removed probes were assertions inside an existing cell, not standalone tests; expect count −2); `bun run scripts/health/sub-loop.ts shared/locale/parentLink-namespace.parity.test.ts --lifecycle duplicates` → all checks passed (tsgo, oxlint, biome:check, lint:type-aware, check:duplicates), **exit 0**. NO git operations; tasks.md untouched.
