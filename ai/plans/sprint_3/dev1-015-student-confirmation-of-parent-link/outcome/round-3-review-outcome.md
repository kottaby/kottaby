# Round 3 — Independent Review Outcome (DEV1-015)

**Task ID:** ITER-3 · **Agent:** Independent Reviewer R3 · **Date:** 2026-09-07 · **Verdict: FINDINGS: 2** (1 MEDIUM, 1 LOW) — shipped-code delta clean across all four lenses; the MEDIUM is an evidence-integrity defect in browser-evidence, not in code.

---

## 1. Scope & method

Delta under review: `git diff ffce457 feat/dev1-015-student-confirmation-of-parent-link --name-only` (ai/plans/** excluded). 20 code/test files: 3 backend suites (wire, service, journey), 10 frontend files, 4 shared-locale files, 4 test/ui + 1 journey suite. Reviewer had no knowledge of prior rounds; every judgment below is independently derived from the delta and its context files.

Checks run (once each, this machine):

| Check | Result |
|---|---|
| `bun run tsgo` | clean (no errors) |
| `bun run biome:check` | 1425 files checked, no issues |
| `bun run test/scripts/run-test.ts backend/graphql/test/parent-link.wire.test.ts` | **25 pass / 0 fail**, 474 expect |
| `bun run test/scripts/run-test.ts test/workflows/parents` | **39 pass / 0 fail**, 614 expect, 3 files |

---

## 2. Findings

**[MEDIUM] ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link/outcome/browser-evidence/{4.2n-dashboard-student2-count2.png, 4.2err-recovered-dashboard.png, 4.3-both-cards-student.png}** — Three evidence files cited as THREE DISTINCT browser states are byte-identical (all md5 `80c371486bc45dfe44242309f3be7132`): outcome/4.2-outcome.md cites the first as "Loop B (N=2 … '2 pending requests')" and the second as "Loop C … retry via refetch recovers", and outcome/4.3-outcome.md cites the third as "BOTH status-slot cards as siblings". At least two of the three claims therefore have no genuine capture behind them (and any one of them that predates the post-SSR-patch composition per 6.3's own note is additionally stale as evidence). Functional risk is low — every one of these states is pinned by green automated suites (`PendingParentLinkRequestsCard.test.tsx`, `RoleDashboardPage.slot.test.tsx`) — but the browser-evidence chain for 4.2 Loop B/C and 4.3 is not trustworthy as filed. — Suggested fix: recapture the two missing states (or amend 4.2/4.3 outcome docs to withdraw the duplicate pointers and cite the automated suites as the evidence of record for those states).

**[LOW] frontend/components/ui/NotificationDrawerBody.tsx:96** — Stale doc comment on `NotificationDrawerList`: "Each row IS a real anchor to `/notifications` (Link)". This delta made the href dynamic (`resolveNotificationRoute(item.relatedEntityType)`), so parent-link-request rows anchor to the student decision route, not the feed page; only unknown/absent entity types fall through to `/notifications`. Comment-only, zero behavior impact, but it contradicts the behavior the same delta introduced one line below. — Suggested fix: update the comment to "…a real anchor whose href resolves through `resolveNotificationRoute` (parent-link rows deep-link to the student decision route; unknown/absent types fall through to the feed page)".

**[INFO] browser-evidence/bs-dash-1440x900-{en,ar}.png** — Filenames claim 1440×900 but the captures are 1440×1130 (full-page height at a 900px viewport). Naming nit only; the evidence itself is valid. No action required.

**[INFO] frontend/components/ui/useNotificationDrawerActions.ts:18** — `STUDENT_LINK_REQUESTS_ROUTE` lives in a hooks module ("use client") rather than a route-constants module; it is imported by nav, the dashboard card, and three test suites. The single-definition-site rationale is documented in-file and the constant is pinned by frozen-value assertions in three suites, so this is a style observation, not a defect. No action required.

---

## 3. Lens-by-lens review (independent)

### 3.1 TYPES — PASS
- **Local types where canonical required:** `pending-parent-link-requests.ts` builds its summary from the codegen `MyIncomingParentLinkRequestsQuery_myIncomingParentLinkRequests` row type with no parallel shape; `ActionableIncomingSummary` is a local pure-helper type, appropriately module-scoped. The journey test types the DB varchar through `NotificationRow["type"]` (`PARENT_LINK_NOTIFICATION_TYPE`) instead of forcing the backend enum onto the string-union column — the sanctioned no-unsafe-enum-comparison idiom.
- **Enum value-vs-type imports:** the two distinct `NotificationType` enums (backend `"parent_link_request"` vs codegen `'ParentLinkRequest'`) are disambiguated correctly everywhere they meet: `useNotificationDrawerActions.ts` imports the backend enum VALUE as the route-map key (the persisted varchar's actual domain); `notification-deep-link.test.tsx` and `PendingParentLinkRequestsCard.test.tsx` alias it (`BackendNotificationType`) while the codegen enum governs the `type` field — no shadowing, no bare literals at key sites (the single bare `"unknown_entity_type"` is the sanctioned out-of-vocabulary fixture).
- **Unsafe casts:** none found. All wire-body narrowing in the wire test goes through runtime guards (`recordOf`, `soleErrorItemOf`); the journey's `hasPgCode` cause-chain walk uses guarded structural checks with a seen-set.
- **i18n bijection:** parity test extended 33→39 keys with the six new dashboard-card slots in both `MANDATED_KEYS` and `FUNCTION_KEYS`; en/ar key sets agree (compile-typed + runtime belt); ar `dashboardCardCount` implements the four Arabic plural classes (1 / dual / 3–10 / 11+) with `toLocaleString("ar")` digits while en uses plain digits; the en map's deliberate absence of a 0 branch matches the card's render-null contract (documented in both maps). No English fallthrough risk (script sweep retained).

### 3.2 BACKEND/TESTS — PASS
- **Race determinism:** no sleeps anywhere in the delta suites; no JS-clock/DB-clock mixing. The Step-10 expiry boundary is grounded on the DB clock on BOTH sides (fixture `expiresAt` injected from `select now()`, grounding compared against a fresh DB `now()` in epoch-millis) — even zero clock movement between the two reads lands on the deterministic outcome because the claim predicate is strict `>`. Step 9b is a true `Promise.allSettled` race gated by `isPgliteProvider()` (the pglite single-connection race guard), accepts either loser shape (typed conflict codes or a 40P01 deadlock abort) and never depends on which contender wins; Step 9a pins the deterministic loser-collapse semantics everywhere.
- **Fixture isolation + FK-safe teardown:** the journey provisions the cast in ONE committing transaction with per-run `jrn_sconfirm_<uuid8>` identity prefixes, tracks every service-created request row at creation, registers all inbox rows in `afterAll` BEFORE teardown so reverse-registration order deletes notifications → requests → role-children → users (RESTRICT FKs), then re-probes zero residue by tracked id set AND prefix. The service test's new `decideCast` student rides the tracked `createStudentFixture` path; the double-respond idempotency cell correctly refuses `runInRollback` (the service owns both commit boundaries) and instead hard-tracks + deletes. The wire test's new expired fixture shares studentG's pair — correctly reasoned around the partial unique `pending_pair_unique` index — and joins the tracked teardown list.
- **Log hygiene:** expected denials silence `logDomainError` via `silenceDomainLog()` with `mockRestore()` in `finally`; where logs are asserted (pre-TX ordering, double-respond replay) the assertions run BEFORE the restores. Zero `console.*` in the delta.
- **Honest permission resolution:** every denial flows through the real `requireActor` re-check against committed rows — no monkey-patching of governance or role resolution; the pre-TX ordering cell proves the gate runs before ANY transactional collaborator via call-through repo spies with zero post-gate invocations and exactly-one bounded log per denial.
- **Journey rules:** no `runInRollback` on own-commit paths; fanout spied exclusively at the `options.transport` seam (`SpiedFanoutTransport`, distinct transports per raced call so loser silence is proven independently); publish oracles assert exactly-one/zero per boundary; PGlite is skipped only where true concurrency is required.

### 3.3 FRONTEND — PASS
- **sx-only/theme tokens/*Outlined/44px/logical properties:** all styling is sx; colors exclusively `theme.palette.*`; `PendingActionsOutlined`/`RefreshOutlined`; both CTAs carry `minHeight: 44`; no physical-property styling introduced.
- **i18n handle-form:** every user-facing string is a compile-time handle property (`t.dashboardCardTitle`, `t.dashboardCardCount(count)`, `tc.retry`, mapped `te.*` via the closed denial table, `t.dashboardCardLoadError` fallback) — zero `t('key')`, zero hardcoded copy in components; tests reference preloaded label objects with fixture-data exceptions only.
- **Apollo single-document/single-useQuery:** the card issues exactly one zero-argument query through the SAME shared document as the decision page (no duplicate/count endpoint); the test's traffic recorder pins `[Q]` / `[Q, Q]` per cell, and the post-decision cell proves the normalized cache (not a bespoke bus) re-renders the card to zero.
- **SSR client-boundary correctness:** `RoleDashboardPage` (server) composes zero-prop client components; the slot `Stack` sx is a static, serializable object (no function-sx crosses the boundary); all function-sx usages live inside client components (`CardShell`, card internals). No dead code: the refactored `resolveParentLinkDenialCopy` delegates to the new OrNull variant and retains three live consumers; behavior for legacy callers is provably unchanged (`null ?? te.internalServerError`).
- **Helper purity:** `deriveActionableIncoming` is pure (no React/Apollo/clock reads; caller-owned `nowMs`; single pass; max-`createdAt` champion tracked by timestamp so array order is never trusted); the card's `useState(() => Date.now())` mount-captured clock is the documented read-purity convention, and staleness is bounded (a stale-pending click is still denied server-side EXPIRED).

### 3.4 SECURITY — PASS
- **BFLA/BOLA/BOPLA:** wire tier adds the decision-leg cells — foreign ≡ nonexistent requestId pinned BYTE-identical (correlation-header trick makes the bodies comparable byte-for-byte), envelope key-set parity across expired/not-found/already-resolved (no per-class disclosure), BAD_USER_INPUT pre-resolver coercion cell with zero side effects; service/journey tiers re-pin the governed ≡ role-mismatch constant copy and zero-write probes on every denial arm including audit_logs. Admin deliberately has NO override on the handshake; the read-path governed relaxation is the shipped, documented contract.
- **No existence oracles in UI copy:** the card's error branch resolves through a CLOSED denial-code whitelist, so extracted non-parent-link codes (`RATE_LIMITED`, `UNAUTHORIZED`, …) fold onto the generic `dashboardCardLoadError`; the tests assert the masked wire message by absence in both locales. Drawer rows deep-link by ENTITY TYPE only.
- **Deep-link route resolution:** `resolveNotificationRoute` returns static routes; `relatedEntityId` is never interpolated into any URL (verified: the resolver's only input is `relatedEntityType`, and the card CTA/nav use the shared constant). Unknown/absent pointers fall through unchanged to `/notifications` — fail-closed, never throws.
- **No hardcoded secrets/URLs:** none in the delta (route strings are app-internal constants; `/student/link-requests` verified to exist under `app/(dashboard)/student/link-requests/page.tsx`).

---

## 4. Visual QA (browser-evidence)

Sub-agent context cannot render images, so 4 screenshots were analyzed programmatically (PIL: dimensions, luminance statistics, cross-image diffs, md5 identity) in two passes:

1. **Pass A — dashboard pair (en/ar) + dark variant:** `bs-dash-1440x900-en/ar` are genuine content renders (mean gray ≈28–29, sd ≈20–22 — not blank), dark-navy theme consistent with the app's default scheme; EN-vs-AR differ on 25.5% of pixels (RTL mirror + script change as expected).
2. **Pass B — state pair + drawer:** `4.2-dashboard-student1-count1.png` vs `4.2-dashboard-post-decision-card-gone.png` differ 3.3% (card-sized region disappearing is consistent); teacher dashboard differs from the student one by 15.7% (student cards absent); `bs-drawer-1440-en.png` is a genuine 1440×900 render. This pass also surfaced the **[MEDIUM]** finding: three "distinct-state" files are byte-identical duplicates (md5-verified), so the evidence chain for 4.2 Loop B/C and 4.3 is incomplete as filed (see §2).

---

## 5. Verdict

**FINDINGS: 2** — 1 MEDIUM (duplicate browser-evidence files cited as three distinct states — evidence integrity, recapture or amend the outcome docs), 1 LOW (stale drawer comment contradicting the new dynamic href). Shipped code across backend, frontend, shared locale, and all five suites is clean on every lens: types, race determinism, fixture hygiene, permission honesty, journey rules, MUI/i18n/SSR discipline, and the BOLA/no-oracle/deep-link security posture. All four mandated verification commands green. No pre-existing (outside-delta) issues were flagged.

### Worklog

- **Task ID:** ITER-3 · **Agent:** Independent Reviewer R3 · **Date:** 2026-09-07
- Reviewed the full DEV1-015 delta (20 files) independently across TYPES / BACKEND+TESTS / FRONTEND / SECURITY lenses; ran tsgo (clean), biome:check (1425 files clean), wire suite (25/0), parents workflows (39/0); performed programmatic visual QA over 4 evidence screenshots (image rendering unavailable in this context) incl. md5 identity analysis that surfaced the duplicate-evidence finding.
- Files touched: ONLY this outcome file (`round-3-review-outcome.md`). No code, tests, tasks.md, or git operations.

---

## Fix (FIX-R3)

Both findings addressed in one micro-fix round; no production code changes.

**[MEDIUM] duplicate browser-evidence — RECAPTURED (real agent-browser captures, all three states live):**

- **Seed (psql, transaction):** `BF Student Two` (`bf-student2-r3@test.local`, bcrypt hash of `BfPassword123!`) + `BF Parent Alpha` (created 10 days ago) + `BF Parent Beta` (created 1 day ago — most recent) with matching `parents` role-child rows, and TWO `parent_link_requests` rows → student2 (`pending`, `expiresAt` = now + 7 days; Alpha older, Beta newest — column shapes copied from `backend/db/schema/parents/`).
- **Loop B → `4.2n-dashboard-student2-count2.png`:** login as student2 → `/student/dashboard` → card settled with count chip **"2 pending requests"** + **"Latest request from BF Parent Beta"** + REVIEW REQUESTS CTA (accessibility-snapshot-verified before capture). md5 `44c5b57dfef4fac8c9db049a3d3dc471` (1440×900).
- **Loop C → `4.2err-recovered-dashboard.png`:** same session — `agent-browser network route **/api/graphql --abort` → reload → card error branch ("Server connection lost" + RETRY; temp capture taken) → `network unroute` → reload/refetch → card RECOVERED (count=2, latest requester, no retry affordance). md5 `348b275fe88e6947f6ca99546ca85ebb` (1440×900; pixel-diff vs Loop B confined to the CTA hover region — a live, interactive recovery).
- **4.3 → `4.3-both-cards-student.png`:** CURRENT committed student dashboard (post-SSR-fix slot Stack `sx={{display:"flex",flexDirection:"column",gap:2}}` at `RoleDashboardPage.tsx:56`) — BOTH cards (`Your Handshake Code` + `Pending link requests`) composed as siblings, count=2 so distinct from the count=1 capture by content AND geometry. Full-page capture md5 `a05b75f49ec4578e22e82bf4f8b31219` (1440×1130).
- Old triple-duplicate md5 `80c371486bc45dfe44242309f3be7132` eliminated; the four files (`4.2-dashboard-student1-count1` = `a42e960838743743b6435af6984e81c1`) now carry four DISTINCT md5s.

**[LOW] stale comment — FIXED:** `frontend/components/ui/NotificationDrawerBody.tsx` (~L96) doc comment on `NotificationDrawerList` no longer claims rows anchor to `/notifications`; it now describes the `resolveNotificationRoute(relatedEntityType)` entity-type-keyed resolution (parent-link rows deep-link to the student decision route; unknown/absent types fall through to the feed page). Comment-only.

**Cleanup (FK-safe hard delete, verified):** requests deleted BEFORE users (both FKs RESTRICT) → `DELETE 2` requests, `DELETE 3` users (role-children cascaded) → residue probes ALL 0 (users / students / parents / parent_link_requests / notifications keyed on the seeded identities); `users` table back to its pre-seed 10 rows.

Verification (each once, this machine):
- `bun run scripts/health/sub-loop.ts frontend/components/ui/NotificationDrawerBody.tsx --lifecycle duplicates` → tsgo + oxlint + biome:check + lint:type-aware + check:duplicates all passed, **exit 0**.
- `md5sum` of the three recaptured files → `44c5b57d…`, `348b275f…`, `a05b75f4…` — all DISTINCT (and distinct from `4.2-dashboard-student1-count1.png`).

Scope: 3 evidence PNGs overwritten + 1 comment-only edit + this outcome file + worklog; NO git operations (no checkout/reset/commit/stash/branch).

### Worklog (FIX-R3)

- **Task ID:** FIX-R3 · **Agent:** Evidence Fix Subagent · **Date:** 2026-09-07
- Confirmed the triple-duplicate (md5 `80c37148…` ×3) and the count-1 reference capture; read `parents` schema (RESTRICT FKs), card/resolver contracts (`deriveActionableIncoming` semantics), and agent-browser capabilities (`network route --abort` supported — no offline-emulation fallback needed).
- Seeded student2 + Alpha/Beta + 2 pending requests via psql in one transaction; live-captured the three labeled states with real agent-browser screenshots (count=2 / abort-Alert→unblock-recovery / both-cards full-page); overwrote the three duplicate files.
- FK-safe teardown verified 0 residue; fixed the stale drawer comment (comment-only); sub-loop duplicates lifecycle exit 0.
- Files touched: 3 PNGs, `frontend/components/ui/NotificationDrawerBody.tsx` (comment only), `round-3-review-outcome.md`, `worklog.md`. No code behavior changes, no git operations.
