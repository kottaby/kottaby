# Round R3 — Independent Fresh-Confirmation Review (first of two close-out rounds)

**Task ID:** R3 (independent reviewer, fresh eyes — prior findings re-derived, not anchored on)
**Date:** 2026-09-15
**Inputs:** `worklog.md` entries 0-env→R2 (read in full); all plan deliverables re-read: `docs/billing/escrow-and-wallet-crediting.md`, `deferred-items.md`, `tasks.md`, all `outcome/*.md` (0.1, plan-review-R1, 1.x, 2.x, 3.2, 3.3, 4.x, round-R2); live source under `backend/ shared/ app/ test/`; `docs/planning/TICKETS.md`; cross-plan ruling sources under `ai/finished_plans/`.

## 1. Scope Confirmation

- `git status --porcelain` → 3 tracked plan-dir modifications (`deferred-items.md`, `outcome/0.1-baseline-outcome.md`, `tasks.md`) + 7 untracked plan/outcome files (6 outcome `.md` incl. round-R2 + `docs/billing/escrow-and-wallet-crediting.md`). HEAD = `e9357c8` (unchanged from baseline).
- `git status --porcelain -- backend shared app frontend test scripts` → **0 entries**. Production trees ZERO — **markdown-only deliverable, no CRITICAL**.

## 2. Verification of the Two Latest Micro-Fixes (R2 substantives) — 2/2 ✓

| Fix | Verdict | Independent evidence |
|---|---|---|
| 3.3:71 rate-limit stub qualifier | ✓ | `outcome/3.3-reconciliation-outcome.md:71` now reads "…a **fail-open always-allow rate-limit stub**, prod-introspection-off, and flat-type REQ-069 pins are the current posture". Consistent with deferred-items D4:16 honesty note, 3.2 §7:106, doc §7:116, and live source (`backend/lib/ratelimit.ts:75-87`: docblock "ALWAYS returns `success: true` in this stub" + "// Fail-open stub — always allow"; `app/api/graphql/rate-limit.ts:16` fail-open disclosure; `route.ts:26` import). |
| 4.x:81 stale anchors | ✓ | `outcome/4.x-knowledge-propagation-outcome.md:81` now cites "transport **:49/:108-113**, route **:26/:49** … contracts **:34/:46/:73**". All six anchors re-verified against live source: `transport-guard.ts:49` = `MAX_GRAPHQL_BODY_BYTES = 2_000_000`, `assertWithinBodyLimit` spans :108-113; `route.ts:26` withRateLimit import, `:49` `introspection: !isProduction`; contract file declarations at :34/:46/:73 with `idempotencyKey` at :38/:55/:79. |

## 3. Fresh Scan (re-derived, not anchored)

### 3a. Citation sampling — 40+ path:line anchors re-verified at source, **all resolve**

Coverage across every deliverable (each checked by `sed -n` at the exact cited line/range):

- **Money path (doc §2–§5, 3.3, 3.2 §4/§5):** booking ladder `booking.ts:127`/trial :133/throw :156/hold insert :182-185/`SUBSCRIPTION_EXPIRED` :140-149/claim insert :271; `student.repository.ts:404-419` (guard :415) + `incrementLane` :433-441; `session.repository.ts:433-455` with settle predicate :447-452 (`eq(session.feeHeld, true)` EXACTLY :448), `cancelSessionOnce` :217, `openDisputeOnce` :248 (+ :259 live-participant predicate), `resolveDisputeCancelOnce` :280, sweep twins :473/:503-517; `confirmation.ts:48/:66/:86/:112/:129/:135-138`; `transitions.ts:222/:227-229/:230-235`; `wallet.repository.ts:48-55/:59-64/:70-74/:78/:88-98 (amount :94, type :95, status :96)/:103-110`.
- **Schemas & constants (doc §4):** `wallet.ts:27-28` (columns) + :36-38 (unique + both CHECKs); `teacher-transaction.ts:38` (FK set-null) / :42 (default pending) / :50 (`amount > 0`) / :51-52 (indexes); `session.ts:15-20` (state machine incl. disputed-reachable-from-live-only) + :32-39 (provenance docblock — and the D5 stale sentence inside it) + :63-65/:70; `enums.ts:23` (sessionStatus) / :31/:33 (txn enums); fees `session-fees.constants.ts:27-33`; locale en:90 / ar:88 / labels:186; `session.types.ts:39-42`.
- **GraphQL surface (doc §5.7/§7, 3.2 §7):** `session-lifecycle.mutation.ts:87/:98-103/:127-131/:135-139/:255/:270-275/:293/:306-308`; `wallet.query.ts:46/:52/:64`; `wallet.mutation.ts:46/:53/:62-67/:75`; pothos session :170/:174-175; pothos wallet :91/:126/:145-148; `admin-finance.pothos.ts:170-177` (input exactly `{teacherId, amount, direction, reason}`); `rate-limit.ts:16`; `route.ts:26/:49`; `apollo-server.ts:55`.
- **Test anchors (doc §3/§4, 3.2 §4/§5, 1.x/2.x tables):** svc :394/:470/:477/:1109/:1363/:1726/:1766/:1793/:2315/:2347/:2398/:2441/:2471/:2524/:2574 (sed in file order — every one is the cited test's `test(`/`testOnRealPostgres(` opener); wallet svc :102/:132/:208/:224/:237/:251/:295; repo :490/:1256/:1430/:1552/:1582/:1617; journeys DC :348/:363/:451/:492/:561/:620/:686-688 (zero-ledger/wallet-static/lane+1 partition asserts), LC :369/:402/:492/:611/:645, DEN :200/:236/:319; wire :395/:404/:416/:557/:573; surface pins :644/:747/:1883/:1898; sdl-static :354-356/:359-361; `db-cleanup.ts:229`; immutability triggers `3-immutability-triggers.sql:87-113`.
- **Tickets & cross-plan sources:** `TICKETS.md` :1704/:1716/:1747/:1753/:1765/:1793/:1799/:1845/:2143/:2985/:3026 (all are the claimed ticket headers/AC boundaries); `ai/finished_plans/sprint_1/session-creation-lifecycle-scheduled-sta/specs.md:8` (Escrow timing ruling), `ai/finished_plans/sprint_1/segregated_session_balance-crediting/plan.md:54-56` (D1 ratify hold-as-debit), `ai/finished_plans/sprint_2/dual-confirmation-completion-handshake/plan.md:23` (D-2 dispute predicate).
- **Failure-attribution SHAs:** `e9357c8` (= HEAD, PR #161), `ea15ed7`/`569d943` (PR #161 components), `bde0e02` (PR #141) — all resolve via `git log` with the claimed subjects.
- **Related-doc paths (doc §10):** all 9 cited docs + `frontend/graphql/generated/schema.graphql` exist on disk.

### 3b. Plan-meta grep on the canonical doc

`grep -n "ai/plans\|\.ai/plans" docs/billing/escrow-and-wallet-crediting.md` → **empty** (exit 1). Extended sweep (`REQ-`, `tasks.md`, `specs.md`, `this plan`, `outcome/`) → **empty**. F1 remains clean.

### 3c. Secrets scan (doc + all outcome files + deferred-items)

Password/secret/token/api-key/bearer/private-key/connection-string/sk-/key-block patterns → **nothing real** (only benign prose: the English word "token" in plan-review-R1 §traceability, and R2/4.x self-referential scan descriptions). Base64(40+)/hex(32+) blob patterns → only false positives (long markdown table cells, psql paths, test identifiers). **No credentials, no env values.**

### 3d. Internal consistency — all consistent

- Suite counts: service 72/0 + wallet 9/0 + repo 69/0 = **150** (doc §9 = 1.x §1 = 4.x §1 = worklog Tasks 1/4); journeys **11+10+6 = 27** (doc §9 = 2.x §1 = 4.x §1); GraphQL **36/0 + 57/1 + 37/2** (3.2 §1) with the 3 pre-existing frozen-inventory failures analyzed (3.2 §2), disclosed in doc §7 as a known-dirty corner, and ledgered as D3 — presented nowhere as escrow evidence; doc §9 counts only the green wire pins (36).
- Deferred gate: `grep -c "❌\|⚠️" deferred-items.md` = **7**, per-line :13(D1)–:17(D5) + :21(Status Legend) + :25(Gate Rule self-match) — exactly the Gate Rule paragraph's own accounting; **in-plan ❌/⚠️ targets = 0 → gate substance PASS**; 4.x §3 (6-table + post-D5 footnote) and worklog R1-fix/R2 agree.
- `tasks.md` checkbox audit: every task/subtask box 0–4 is `[x]`; the only literal `[ ]` is the protocol instruction at tasks.md:15. **PASS.**
- Doc §9 tier-table parenthetical "(+ the wallet repository CHECK-probe suite)" — verified accurate: `backend/db/test/repo/billing/wallet.repository.test.ts` exists and its :476 test probes the named wallet/ledger CHECK constraints.

### 3e. New-eyes sweep for anything embarrassing

Prior-fix mirrors re-checked (F2 honesty posture consistent across all four disclosure sites; F3/F4/F5/F11/F12 anchors exact at source). Cross-file arithmetic (150/27/36, gate 7, AC mapping 15/15 zero-unmapped per 3.2 §6) re-derived independently. One new cosmetic item found (below); nothing else.

## 4. Findings & Classification

**CRITICAL: 0 · HIGH: 0 · MEDIUM: 0.**

| # | Finding | Class | Disposition |
|---|---|---|---|
| 1 | **[LOW] tasks.md:21 (NEW)** — the pre-execution "X.Y.TE" instruction cites service-suite anchor ":2439" (authoring-time line); the construct now sits at :2441 (T1-documented +2 drift). | NON-BLOCKING with reason | Same class the orchestrator already adjudicated for tasks.md:66: tasks.md is pre-execution plan-authoring text whose citations were valid at authoring time; the drift is documented in 1.x §2.1/§8, and every execution-time artifact (1.x/3.2/doc) cites current lines. Rewriting historical task instructions to chase drift would falsify the authoring snapshot. |
| 2 | **[LOW] tasks.md:66 (REMAINING)** — Task 4.3 still says "expected raw output is **3**" vs actual recorded 7. | NON-BLOCKING with reason | Orchestrator ruling stands: plan-authoring text; the undercount (incl. the Gate-Rule self-match discovered post-authoring) is explicitly recorded in 4.x §3 + the Gate Rule's own recount provenance ("5→6 … 6→7"); R1-fix was instructed not to touch tasks.md. Gate substance (in-plan targets = 0) unaffected. |
| 3 | **[LOW] display-name self-citations (REMAINING)** — plan.md:3-4, tasks.md:3-4, deferred-items.md:4 (and outcome-file headers) use `Fee Escrow & Teacher Wallet Crediting-crediting/` while the on-disk dir is `fee_escrow_and_teacher_wallet_crediting-crediting/`. | NON-BLOCKING with reason | Archive-time cosmetic: the dir is the only one in `ai/plans/sprint_2/`, the convention is consistent plan-internally, and the canonical doc cites zero plan-workspace paths (3b clean). Normalize when the plan is archived to `ai/finished_plans/`. |

Observations (not findings): (a) deferred-items D1 cites the contract region as `:14-80` — verified :14 is the first contract-file export (`WALLET_CREDIT_TRANSACTION_TYPE`), a fair region bound alongside doc:123/3.3:53's interface-level indices; (b) doc:114's classifier cite ":135-138" spans the probe-read through the reject call — construct in range; (c) D5's ":33-34" anchor sits inside the same stale docblock sentence verified live at :32-39.

## 5. Findings Count

| Category | Count |
|---|---|
| Latest micro-fixes verified (R2 substantives) | **2/2** ✓ |
| REMAINING (prior rounds, verified still present) | **2** (both LOW, both NON-BLOCKING with recorded reasons) |
| NEW (R3) | **1** (LOW, NON-BLOCKING with reason) |
| CRITICAL / HIGH / MEDIUM | **0** |
| Open blocking findings | **0** |

## 6. Verdict

**PASS — zero blocking findings.** Scope is markdown-only (production trees zero); both R2 substantive fixes verified landed and mirrored; 40+ fresh-citation sample resolves at exact lines; canonical doc is plan-meta-free and secret-free; suite counts (150 / 27 / GraphQL 36/0+57/1+37/2), gate count (7, in-plan targets 0), and tasks.md checkboxes are internally consistent everywhere. The three open LOWs are non-blocking residue in plan-authoring text or archive-time cosmetics, each with a recorded reason. This round qualifies as the first zero-blocking confirmation round toward the two-round close-out; the only new item (#1) is the same adjudicated non-blocking class, so the orchestrator may treat this as a clean round or re-run once more per its discretion.
