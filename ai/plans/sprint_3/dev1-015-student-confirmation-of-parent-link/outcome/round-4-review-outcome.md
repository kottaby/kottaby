# Round 4 — Independent Review Outcome (DEV1-015)

**Task ID:** ITER-4 · **Agent:** Independent Reviewer R4 · **Date:** 2026-09-07 · **Verdict: FINDINGS: 1** (0 MEDIUM/HIGH/CRITICAL, 1 LOW) — the shipped-code delta is clean across all four lenses; the single LOW is a tautological double predicate in a pure frontend helper (zero behavior risk).

---

## 1. Scope & method

Delta under review: `git diff ffce457 feat/dev1-015-student-confirmation-of-parent-link --name-only` (ai/plans/** excluded): 20 code/test files — 3 backend suites (wire 211±, service 219±, journey 1306 new), 10 frontend files (new `PendingParentLinkRequestsCard` + derivation helper + `CardShell` extension, drawer deep-link wiring, nav retarget, dashboard slot composition, denial-copy helper), 4 shared-locale files (+6 dashboard-card slots), and 4 test/ui suites. This reviewer formed every judgment independently from the delta and its context files.

Checks run (once each, this machine):

| Check | Result |
|---|---|
| `bun run tsgo` | clean (no errors) |
| `bun run biome:check` | 1425 files checked, no issues |
| `bun run test/scripts/run-test.ts backend/graphql/test/parent-link.wire.test.ts` | **25 pass / 0 fail**, 474 expect |
| `bun run test/scripts/run-test.ts backend/services/parents` | **111 pass / 0 fail**, 638 expect, 4 files |
| *Extra:* journey suite `test/workflows/parents/student-confirmation-of-link.journey.test.ts` | 12 tests / 0 fail (PGlite; race cell guard-gated) |
| *Extra:* 3 new UI suites under the mandated preload stack (`test:ui:components` preloads) | **36 pass / 0 fail** (23 card + 7 slot + 6 deep-link) |

Harness note (reviewer misuse, not a product defect): running the `test/ui/components` suites through `test/scripts/run-test.ts` fails with `document is not defined` — that runner does not attach the happy-dom/translation/next-dynamic preloads, which `package.json`'s `test:ui:components` supplies. Re-run with the mandated preloads, all 36 tests pass. `md5sum … | sort | uniq -w32 -D` over `outcome/browser-evidence/*.png`: **no duplicates** (the R3 MEDIUM evidence defect is verifiably fixed).

---

## 2. Findings

**[LOW] frontend/views/students/dashboard/pending-parent-link-requests.ts:49-51** — `deriveActionableIncoming` gates each row on `displayLinkRequestStatus(row.status, row.expiresAt, nowMs) === LinkStatus.Pending && isLinkRequestActionable(row.status, row.expiresAt, nowMs)`, but `displayLinkRequestStatus` is defined to return `Pending` **iff** `isLinkRequestActionable` holds (it calls the same predicate internally, `parent-link-request-status.ts:41-49`) — so the conjunction is one predicate evaluated twice, double-parsing `expiresAt` and double-looking-up the status map on every row, and the JSDoc ("displayed status is `Pending` … AND the shared strict-`>` liveness predicate holds") presents a tautology as two independent conditions. Zero behavior risk — the conjunction can never change a verdict, and all edge cells pass — but the redundancy invites a future reader to "simplify" the wrong side or to believe the two gates diverge. — Suggested fix: keep exactly ONE predicate (`isLinkRequestActionable(...)`) and let the comment carry the display-parity rationale, or pin the equivalence explicitly in the helper's existing unit cells; align the JSDoc wording with whichever survives.

**[INFO] backend/graphql/test/parent-link.wire.test.ts:1232 / test/workflows/parents/student-confirmation-of-link.journey.test.ts:641** — the parser-clean out-of-range id literal `999999999` is minted independently in both suites (each documented in place). Sharing a constant would couple two independent suites for no gain; no action required.

**[INFO] browser-evidence `bs-*` filenames** — viewport-named files remain full-page captures (e.g. `bs-dash-1440x900-en.png` is 1440×1130; `bs-dash-375x812-ar.png` is 375×1537). Same naming nit as R3's INFO; the evidence itself is valid. No action required.

---

## 3. Lens-by-lens review (independent)

### 3.1 TYPES — PASS
- **Local types where canonical required:** the derivation helper consumes the codegen `MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests` row (no parallel shape); `ActionableIncomingSummary` is a properly module-scoped local. The journey types the DB varchar through `NotificationRow["type"]` (`PARENT_LINK_NOTIFICATION_TYPE`) rather than forcing an enum onto the string-union column.
- **Alias/enum value-vs-type imports:** the two distinct `NotificationType` domains (backend enum value `"parent_link_request"` for the persisted `related_entity_type` varchar vs codegen `'ParentLinkRequest'` for the wire `type` field) are kept apart deliberately: `useNotificationDrawerActions.ts:32` keys the route map on the backend enum VALUE (the varchar's real domain), the deep-link test aliases it `BackendNotificationType` with the bare literal confined to the out-of-vocabulary fixture. `tsgo` clean confirms no leakage.
- **Unsafe casts:** none in the delta (no `as any`/`as unknown`/`@ts-ignore`; wire-body narrowing stays behind runtime guards; the journey's `hasPgCode` cause-chain walk uses guarded structural checks with a cycle set).
- **i18n bijection (types/en/ar):** `ParentLinkLabels` extended with the six dashboard-card slots; en/ar key sets agree (compile-typed on both `ParentLinkLabels` leaves + the 39-slot runtime parity belt with exhaustive inventory and Arabic-script sweep). ar `dashboardCardCount` implements the four Arabic plural classes (1 / dual / 3–10 / 11+) with Arabic-Indic digits; the en map's deliberate 0-branch absence matches the card's render-null contract and is documented on both maps.

### 3.2 BACKEND/TESTS — PASS
- **Race determinism:** no sleeps anywhere; no JS-clock/DB-clock mixing. The Step-10 expiry boundary is DB-clock grounded on BOTH sides — the fixture `expiresAt` is injected from the database's own `now()` and the grounding compares against a fresh DB epoch-millis read — so host-vs-host skew cannot flip the strict-`>` verdict. Step 9b is a true `Promise.allSettled` race behind the `isPgliteProvider()` wholesale-skip guard, accepts either loser shape (typed conflict codes or a 40P01 deadlock abort via cause-chain walk) and never depends on which contender wins; Step 9a pins deterministic loser-collapse everywhere.
- **Fixture isolation + FK-safe teardown:** the journey provisions the cast in ONE committing transaction with per-run `jrn_sconfirm_<uuid8>` identity prefixes; every service-created request row is tracked at creation; `afterAll` registers ALL inbox rows BEFORE teardown so reverse-registration order deletes notifications → requests → role-children → users (RESTRICT FKs), then re-probes zero residue by tracked ids AND prefix. The service suite's committed double-respond cell rides the tracked `createStudentFixture` path and correctly refuses `runInRollback` (the service owns both commit boundaries). The wire suite's new expired fixture is correctly reasoned around the partial unique `pending_pair_unique` index (shares studentG's pair, whose other row is Rejected — outside the pending-only predicate) and joins the teardown list.
- **Log hygiene:** expected denials are silenced via `silenceDomainLog()` with `mockRestore()` in `finally`; where logs ARE asserted (pre-TX ordering, replay denial) the assertions run before the restores and pin the bounded shape (`code`/`entity`/`entityId`/`locale`, exactly one per denial). Zero `console.*` in the delta.
- **Honest permission resolution:** every denial flows through the real `requireActor` re-check against committed rows — governance is a real committed suspension, the link fixture a real committed `parent_id`; no monkey-patching. The new pre-TX ordering cell proves the gate precedes ALL transactional collaborators via call-through repo spies (zero post-gate invocations; the gate's own `UserRepository.findById` records exactly its two sanctioned actor reads in order).
- **Journey rules:** no `runInRollback` on any own-commit path (it appears only in the pre-TX ordering cell, where nothing may commit); fanout is spied exclusively at the `options.transport` seam with distinct transports per raced call so loser silence is proven independently; publish oracles assert exactly-one/zero per boundary; direct repo writes for the silent race fixtures bypass the emit surface honestly.
- **Screenshot-evidence integrity:** `md5sum … | uniq -w32 -D` → no byte-identical duplicates among the 51 evidence PNGs; the R3-flagged triple-duplicate is gone (recaptured states carry distinct md5s per the R3 fix record).

### 3.3 FRONTEND — PASS
- **sx-only / theme tokens / \*Outlined / 44px / logical properties:** all styling is sx; colors exclusively through `theme.palette.*` callbacks; `PendingActionsOutlined`/`RefreshOutlined`; both card CTAs carry `minHeight: 44` (skeleton mirrors the settled 44px geometry — zero layout-shift target); no asymmetric physical-property styling introduced (the only pixel literal, `paddingTop: "7px"`, is pre-existing and direction-neutral).
- **i18n handle-form:** every user-facing string is a compile-time handle property (`t.dashboardCard*`, `tc.retry`, mapped `te.*` through the closed denial table, `t.dashboardCardLoadError` fallback); names are `isolateBidi`-assembled BEFORE interpolation with `dir="auto"` first-strong isolation; zero `t('key')`, zero hardcoded copy.
- **Apollo single-document / single-useQuery:** the card issues exactly ONE zero-argument query through the SAME shared document as the decision page (no count endpoint, no bespoke invalidation); the test's traffic recorder pins `[Q]` / `[Q, Q]`, and the post-decision cell proves the normalized cache alone re-renders the card to zero. `myIncomingParentLinkRequestsQueryDocument` is the single definition site (barrel-verified) with `id` selected first for normalization.
- **SSR client-boundary correctness:** `RoleDashboardPage` (server) composes zero-prop client components whose queries answer identity server-side; the slot `Stack` sx is a static serializable object (no function-sx crosses the server boundary — the R1 fix holds); function-sx lives only inside client components; the route constant and resolver are exported from a `"use client"` module consumed only by client components/tests.
- **Dead code:** none — `resolveParentLinkDenialCopy` delegates to the new `OrNull` variant and keeps three live consumers (behavior for legacy callers provably unchanged via `null ?? te.internalServerError`); `withoutPendingId`/`NO_PENDING_IDS` remain wired.
- **Helper purity:** `deriveActionableIncoming` is pure (no React/Apollo/clock reads; caller-owned `nowMs`; single pass; newest-so-far champion tracked by timestamp so wire order is never trusted; boundary `expiresAt === now` excluded per strict `>`). The card's `useState(() => Date.now())` mount clock is the documented read-purity convention; staleness is bounded (a stale click still meets the server-side EXPIRED denial).
- **Comment accuracy:** the only comment/behavior mismatch found is the tautology presentation in the derivation helper's JSDoc (the LOW above). All other audited comments match code, including the drawer list doc (fixed in R3), the wire savepoint note, the expired-fixture index reasoning, and the SSR-serializable slot rationale.

### 3.4 SECURITY — PASS
- **BFLA/BOLA/BOPLA:** the wire tier's new decision-leg cells pin foreign ≡ nonexistent requestId as BYTE-identical bodies (pinned correlation header makes the comparison genuinely byte-for-byte) and envelope key-set parity across expired / not-found / already-resolved (no per-class disclosure); the BAD_USER_INPUT coercion cell proves pre-resolver death with zero side effects; service/journey tiers re-pin governed ≡ role-mismatch constant copy and zero-write probes on every denial arm including `audit_logs`. The surface remains identity-free (zero-arg query, no smugglable student/parent ids) — the BOPLA smuggle tier still passes.
- **No existence oracles:** the card's error branch resolves through a CLOSED denial whitelist — unmapped codes (`RATE_LIMITED`, …) fold onto the localized generic line; the tests assert the raw wire message by ABSENCE in both locales; dashboard copy names the requesting parent only (the sanctioned incoming disclosure); no count/list asymmetry leaks resolved-vs-pending to non-parties.
- **Deep-link resolution:** `resolveNotificationRoute` maps entity TYPE → static route; `relatedEntityId` is never interpolated into any URL (the resolver's only input is the entity-type string; the card CTA and nav entry share the frozen `STUDENT_LINK_REQUESTS_ROUTE` constant, pinned by three suites); unknown/absent pointers fall through unchanged to `/notifications` — fail-closed, never throws. The route target exists at `app/(dashboard)/student/link-requests/page.tsx` behind its own `withPageAuth` guard, so a drawer link is still role-gated server-side (a mis-routed non-student cannot read anything there).
- **No hardcoded secrets/URLs:** none in the delta; all literals are app-internal route strings or translation keys.

---

## 4. Visual QA (browser-evidence)

Sub-agent context cannot render images (Read returns "images are not available in sub-agent context"), so 3 captures were analyzed programmatically (PIL/numpy: dimensions, luminance/edge statistics, blank-band mapping, cross-image diffs) plus the mandated md5 identity sweep:

1. **`bs-dash-1440x900-en.png` (1440×1130):** genuine content render — dark theme (mean gray ≈28.8), 248 gray levels, text-dense edge profile; background-only rows confined to the bottom 65px (footer whitespace). Layout integrity OK.
2. **`bs-dash-375x812-ar.png` (375×1537, RTL mobile):** portrait full-page geometry correct for a 375×812 viewport; ~50% background-only rows are distributed as inter-section gaps of ≤58px (verified contiguous-band mapping; structurally parallel to `bs-dash1-375-ar.png` down to the shared header bands) — no rendering voids, no collapsed/overlapping sections detectable. RTL integrity consistent with the stylis-plugin-rtl pipeline.
3. **`4.2-dashboard-student1-count1.png` vs `4.2-dashboard-post-decision-card-gone.png` (1280×577 each):** distinct captures (global mean |diff| ≈2.0 on a dark page) with the difference CONCENTRATED in the rows 457–561 band — the expected localized signature of the pending card's region disappearing and lower content shifting, not a stale duplicate or a whole-page artifact. `4.2-confirm-dialog.png` vs `4.2-after-confirm.png` differ substantially (mean ≈14.8) as dialog-present vs settled states should.

No layout/RTL/mobile integrity defect observed; the mandated md5 sweep found zero byte-identical duplicates.

---

## 5. Verdict

**FINDINGS: 1** — one LOW (tautological double predicate + JSDoc presented as two independent gates in `deriveActionableIncoming`; suggested single-predicate cleanup with no behavior change) plus two INFO no-action notes. Everything else is clean on every lens: canonical/type-safe imports, en/ar bijection, DB-clock race determinism, tracked FK-safe teardown with zero-residue probes, honest real-recheck permission resolution, journey/pglite/spy rules, sx/i18n/Apollo/SSR discipline, and the BOLA/no-oracle/deep-link posture. All four mandated verification commands green (tsgo clean; biome 1425 files clean; wire 25/0; parents services 111/0); supplementary runs (journey 12/0, new UI suites 36/0 under the mandated preloads) also green. No pre-existing (outside-delta) issues flagged.

### Worklog

- **Task ID:** ITER-4 · **Agent:** Independent Reviewer R4 · **Date:** 2026-09-07
- Reviewed the full DEV1-015 delta (20 files, ai/plans excluded) independently across the TYPES / BACKEND+TESTS / FRONTEND / SECURITY lenses; ran tsgo (clean), biome:check (1425 files clean), wire suite (25/0), parents services (111/0), plus journey (12/0) and the three new UI suites (36/0) under the mandated preload stack (documented the `run-test.ts` UI-preload harness gotcha encountered en route).
- Screenshot-evidence integrity: mandated `md5sum | uniq -w32 -D` sweep → zero duplicates (R3's MEDIUM verified fixed); programmatic visual QA over 3 captures (desktop en, mobile ar RTL, state pair) — no layout/RTL/mobile defects; direct image rendering unavailable in this sub-agent context.
- Findings: 1 LOW (`pending-parent-link-requests.ts:49-51` tautological double predicate + JSDoc), 2 INFO (duplicated out-of-range id literal across two suites; full-page captures under viewport-named files) — no action required on the INFOs.
- Files touched: ONLY this outcome file (`round-4-review-outcome.md`). No code, tests, tasks.md, or git operations (no checkout/reset/commit/stash/branch). Note: no separate `worklog.md` exists in the plan tree on any branch, so this Worklog section is the ITER-4 worklog record.

---

## Fix (FIX-R4)

**[LOW] `frontend/views/students/dashboard/pending-parent-link-requests.ts:49-51` — JSDoc/comment accuracy — FIXED (comment-only).** The double predicate itself stays exactly as shipped: the `displayLinkRequestStatus(...) === LinkStatus.Pending && isLinkRequestActionable(...)` conjunction is the mandated belt-and-braces contract (display-status gate + actionability gate reused verbatim; neither call removed). What changed is the documentation, which had presented the conjunction as two independent gates when the display helper's `Pending` outcome currently derives from that same actionability predicate:

- `deriveActionableIncoming` JSDoc first bullet rewritten: a row counts only when both gates hold — the display-mapping gate (status renders as `Pending`; a stored `pending` past its expiry shows `Expired` and drops out) and the actionability gate (shared strict-`>` liveness predicate; boundary `expiresAt === now` NOT actionable) — and the conjunction is documented as deliberate defense-in-depth: the two gates are evaluated independently so a future divergence between the display mapping and the actionability semantics cannot leak a non-actionable row into the dashboard count.
- Inline comment added at the conjunction site stating the same rationale concisely ("Deliberate defense-in-depth …"), so a future reader is not tempted to "simplify" either side.

No behavior change (zero logic edits; comment-only diff on the helper file).

Verification (each once, this machine):
- `bun run scripts/health/sub-loop.ts frontend/views/students/dashboard/pending-parent-link-requests.ts --lifecycle duplicates` → tsgo + oxlint + biome:check + lint:type-aware + check:duplicates all passed, **exit 0**.
- `PendingParentLinkRequestsCard.test.tsx` under the mandated preload stack (`test-env` / `happydom` / `translation` / `next-dynamic` preloads) → **23 pass / 0 fail**, 95 expect() calls.

Scope: 1 comment-only edit (`frontend/views/students/dashboard/pending-parent-link-requests.ts`) + this outcome file. No production logic, tests, or git operations (no checkout/reset/commit/stash/branch).

### Worklog (FIX-R4)

- **Task ID:** FIX-R4 · **Agent:** Micro Fix Subagent · **Date:** 2026-09-07
- Read the finding, the derivation helper, and `frontend/lib/parent-link-request-status.ts` to confirm the coupling: `displayLinkRequestStatus` returns `Pending` iff `isLinkRequestActionable` holds (its first branch calls the same predicate), so the old JSDoc's "two independent gates" framing was a tautology presentation.
- Confirmed the double predicate is the plan's mandated belt-and-braces contract (display-status gate + actionability gate reused verbatim); kept both calls untouched.
- Rewrote the helper's JSDoc bullet and added a concise inline comment at the conjunction, documenting the deliberate defense-in-depth rationale (independent evaluation of the display-mapping gate and the actionability gate protects the dashboard count against future divergence between the two semantics). No plan-artifact references; production-grade wording.
- Verified: sub-loop `duplicates` lifecycle exit 0; card/helper unit suite 23 pass / 0 fail under the mandated preloads.
- Files touched: `frontend/views/students/dashboard/pending-parent-link-requests.ts` (comment/JSDoc only), `round-4-review-outcome.md` (this Fix + Worklog record — no separate `worklog.md` exists in the plan tree, per the ITER-4 note). No code behavior changes, no git operations.
