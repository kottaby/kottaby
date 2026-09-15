# Round R2 — Independent Fix-Verification & Fresh-Scan Outcome

**Task ID:** R2 (independent re-reviewer)
**Date:** 2026-09-15
**Inputs:** `worklog.md` entries R1-content / R1-security / R1-fix; `outcome/plan-review-R1.md`; all outcome files 0.1–4.x; `docs/billing/escrow-and-wallet-crediting.md`; `deferred-items.md`; `tasks.md`; live source under `backend/ shared/ app/ test/`.

## 1. Scope Confirmation (markdown-only — PASS)

- `git status --porcelain` → 3 tracked modifications (`deferred-items.md`, `outcome/0.1-baseline-outcome.md`, `tasks.md`) + 6 untracked plan files (5 outcome `.md` + `docs/billing/escrow-and-wallet-crediting.md`).
- `git status --porcelain -- backend shared app frontend test scripts` → **zero entries**. Tracked diff (`git diff --name-only`) = the 3 plan-dir files only. **No CRITICAL.** Deliverable is markdown-only, confirmed.

## 2. Method

1. Read the three R1 worklog entries + plan-review-R1 to reconstruct the finding set (1 MEDIUM + 7 LOW from R1-content; 1 MEDIUM + 6 LOW from R1-security → consolidated into fixes F1–F12).
2. Verified every fix against BOTH the deliverable text AND the live source it cites (grep/sed on the exact lines — not on the fix log's claims).
3. Fresh-eyes citation sweep of the canonical doc: 50+ path:line anchors re-verified at source (fix-affected ones + an independent sample across §2–§9: booking ladder :127–159/:156/:182–185/:271, student.repository :415/:433–441, session.repository :217–231/:248–262/:259/:280–290/:433–455/:447–452/:448/:473/:503–517, wallet.repository :59–64/:70–74/:92–96/:103–110, wallet.ts :36–38, teacher-transaction.ts :38/:42/:50, guards.ts :83–85, fees constants :27–33, locale en:90/ar:88/labels:186, mutation.ts :87/:98–103/:127–131/:135–139/:255/:270–275/:306–308, wallet.query :46–57/:64, wallet.mutation :46–50/:62–67/:75, pothos session :170/:174–175 + wallet :91/:126/:146–147, confirmation.ts :48–59/:66–76/:86/:112–139/:129/:135–138, transitions.ts :76–87/:161–174/:222–237, queries.ts :41–58, service.ts :622–624/:633–640/:732, transport-guard :49/:108–113, ratelimit.ts :75–87, rate-limit.ts :16, route.ts :26/:49, session.ts :15–20/:32–39/:63–65,70, contracts :34/:46/:73+:38/:55/:79, db-cleanup :229, triggers :87–113, schema-surface :644–688/:747/:1883–1898, sdl-static :354–356/:359–361, TICKETS.md :1704/:1753/:1799/:2143/:2985, and 20+ test anchors (svc :394/:470/:477/:1109/:1363/:1793/:2315(REQ-043d)/:2347(REQ-043e)/:2398/:2441/:2471; mutations :395/:404/:573; repo :1256/:1430/:1552/:1582/:1617; wallet svc :102/:132/:208/:224/:237/:251; journeys DC :451/:492/:561/:620/:686–688, LC :369/:402/:492, DEN :236/:319).
4. Secrets scan on the doc (password/secret/token/api-key/bearer/private-key/connection-string/sk- patterns): **zero hits**. Plan-meta scan on the doc (`REQ-`, `Task N`, "this plan", `specs.md`, `tasks.md`, `plan.md`, `outcome/`, `sprint`): **zero hits** (F1 clean: `ai/plans` and `.ai/plans` both grep-empty).
5. Suite-count consistency re-check: 72/9/69 + journeys 11/10/6 + wire 36 identical across doc §9, 4.x §1, and the outcome files (carried over from R1; spot-re-read 4.x §1 — consistent).
6. Tasks.md checkbox audit (below).

## 3. Per-Fix Verification (F1–F12)

| Fix | Verdict | Independent evidence |
|---|---|---|
| F1 — plan-path leak removed | ✓ | `grep -n "ai/plans"` and `grep -n ".ai/plans"` on the doc → both empty. doc:121 now binds D1–D4 to `docs/planning/TICKETS.md` (durable), no plan-workspace path anywhere in the doc. |
| F2 — rate-limit honesty (stub) | ✓ | doc §7:116 "fail-open stub that always allows … **not** effectively rate-limited today" — code verified: `backend/lib/ratelimit.ts:75-87` (docblock "ALWAYS returns `success: true` in this stub" + "// Fail-open stub — always allow"), `app/api/graphql/rate-limit.ts:16`, `route.ts:26`/:49. All four mirrors consistent: deferred-items D4:16 (honesty note), 3.2 §7:106 ("NOT effectively rate-limited today"), 4.x:39 (orchestrator-amended row: "fail-open always-allow rate-limit stub"). |
| F3 — settle predicate :448 | ✓ | doc:50 + doc:123 cite `session.repository.ts:448`; `sed -n 444,455p` confirms `eq(session.feeHeld, true)` is EXACTLY :448 (:449 = teacher-stamp leg). Mirrors fixed: 3.3 Ruling 4 (:448), 4.x §1 row 2 (:448) + 4.x SR list (:448). |
| F4 — contract indices | ✓ | doc:123 "declarations at :34, :46, :73 with the key at :38, :55, :79" — verified in `session-completion-escrow.contract.types.ts`: interfaces at :34/:46/:73, `idempotencyKey` at :38/:55/:79. (3.3's range form ":34-38,46-55,63-80" is consistent with the corrected indices.) |
| F5 — assertWithinBodyLimit :108-113 | ✓ | doc:116 cites :108-113; verified `backend/lib/gateway/transport-guard.ts`: signature :108, close brace :113 (:49 = `MAX_GRAPHQL_BODY_BYTES = 2_000_000`). |
| F6 — wire rule scoped + ADMIN exception | ✓ | doc:97 now scopes the rule to the teacher self-service surface and names `adjustTeacherWallet` as the ADMIN-governed exception; verified `admin-finance.pothos.ts:170-177` input = exactly `{teacherId, amount, direction, reason}` at :172-175. |
| F7 — per-arm oracle-safety attribution | ✓ | doc:114: confirm arm `rejectUnknownCaller` verified at `confirmation.ts:66-76` (throws `NotFoundError("SESSION", t.sessionNotFound)` both arms), classifier routing at :133-135 (cited :135-138 — the reject call + settled-arm; construct in range); cancel/dispute arms `rejectTransitionMiss` → `rejectSessionNotFound` verified at `transitions.ts:76-87` + null-row/foreign arms :161-174; read arm `getSessionById` verified at `session-lifecycle.queries.ts:41-58` (null-folds invalid-id, missing, AND foreign → identical `null`). Filename `session-lifecycle.queries.ts` exists as cited. |
| F8 — gate expectation = reality | ✓ | `grep -c "❌\|⚠️" deferred-items.md` = **7**; `grep -n` per-line: :13(D1) :14(D2) :15(D3) :16(D4) :17(D5) :21(Status Legend) :25(Gate Rule self-match) — exactly the Gate Rule's accounting; in-plan ❌/⚠️ targets = **0** → gate substance PASS. |
| F9 — 4.x §3 line accounting + footnote | ✓ | Table rows now cite Status Legend :20 and Gate Rule paragraph :24 (matching the pre-D5 file state the 6-match table documents); post-table R1-fix footnote records the post-D5 recount (7 = D1–D5 at :13-:17, Legend :21, Gate Rule :25; in-plan targets still 0). |
| F10 — 0.1 attribution wording | ✓ | 0.1:40 reads "environment/seed drift, pre-existing frozen-pin staleness from PRs merged after authoring, or genuine regression" — matches what actually materialized. |
| F11 — governance citation :622-624 | ✓ | 3.2 §7 ADMIN row and 3.3 Ruling 3 both cite `session-lifecycle.service.ts:622-624`; verified comment :622-623 + `assertAdminGovernanceClean` call at :624. |
| F12 — D5 ledger row | ✓ | deferred-items.md:17 = D5 (stale docblock `session.ts:33-34`, external owner Financial Safety Verification / doc-hygiene, ❌ Blocked, exempt per Note rule); Gate Rule updated to "Rows D1–D5". Stale docblock verified live ("held at request, decremented at completion" inside the :31-39 docblock). |

**12/12 fixes verified as landed correctly.**

## 4. Tasks.md Check

All task checkboxes 0–4 are `[x]` (0 / 0.1–0.3, 1 / 1.1–1.3 + 1.QL/SEC/SR/IV, 2 / 2.1–2.3 + gate subtasks, 3 / 3.1–3.3 + gate subtasks, 4 / 4.1–4.3 + gate subtasks). The only literal `[ ]` strings are the protocol instruction at tasks.md:15 ("flip `[ ]` → `[x]`"), not task boxes. **PASS.**

## 5. NEW / REMAINING Findings

None at CRITICAL / HIGH / MEDIUM. Four LOW:

- **[LOW] outcome/3.3-reconciliation-outcome.md:71 — REMAINING residue of the R1-security rate-limit honesty gap.** The depth-limiter summary still lists bare "rate limit" among "the current posture" compensations without the fail-open/always-allow qualifier. This file was not in F2's mirror list. Mitigated: the same sentence cites "(3.2 §7, row 4)", which fully discloses the stub and "NOT effectively rate-limited today". Suggested one-clause edit ("rate-limit hook — currently a fail-open stub") if the plan is touched again; no doc impact (doc §7:116 is honest).
- **[LOW] outcome/4.x-knowledge-propagation-outcome.md:81 — REMAINING mirror drift in the Task-4-era SR spot-check list.** Retains two pre-fix anchors: "transport :49/:107-112" (function is :108-113) and "contracts :34/:55/:73" (actual declarations :34/:46/:73). The canonical doc was corrected by F4/F5; this historical verification log was not in either fix's scope. Zero doc impact.
- **[LOW] tasks.md:66 (Task 4.3) — REMAINING stale gate expectation.** Still says "expected raw output is **3**" vs the actual recorded 7. The undercount is explicitly documented (4.x §3 deviation record; Gate Rule recount provenance "5→6 … 6→7"; plan-review-R1 finding #6), and R1-fix was instructed not to touch tasks.md — but the task line itself is now stale vs its own outcome. Cosmetic; the gate substance (in-plan targets = 0) is unaffected.
- **[LOW] plan.md:3-4 / tasks.md:3-4 / deferred-items.md:4 — NEW (cosmetic, pre-authoring): plan-internal self-citations use the display name** `ai/plans/sprint_2/Fee Escrow & Teacher Wallet Crediting-crediting/`, while the only directory in `ai/plans/sprint_2/` is `fee_escrow_and_teacher_wallet_crediting-crediting/`. Non-resolving path, consistently used across the plan's own files (same authoring convention), zero citations of it in the canonical doc (F1 clean). Flagged under the same path-accuracy lesson plan-review-R1 recorded (finding #1); safe to ignore or normalize at archive time.

Observations (not counted as findings): (a) the orchestrator's 4.x:39 amendment is present and consistent but has no worklog entry of its own (artifact verified correct); (b) doc:114's classifier cite ":135-138" starts at the reject call while the probe read is :133-135 — construct in range, same tolerance R1 accepted; (c) D5's ":33-34" anchor inherits R1-security's own citation — the literal stale phrase sits at :32-33, both lines inside the same stale docblock sentence.

## 6. Findings Count

| Category | Count |
|---|---|
| Fixed & verified (F1–F12) | **12** |
| Remaining (R1-era, LOW) | **3** |
| New (R2, LOW) | **1** |
| CRITICAL / HIGH / MEDIUM | **0** |

## 7. Verdict

**PASS.** The canonical deliverable `docs/billing/escrow-and-wallet-crediting.md` is internally consistent, plan-meta-free, secret-free, markdown-only, and every fix-affected citation now resolves exactly at its cited line against live source. The 4 LOW findings are residue/mirror-drift items in plan-workspace files (two historical outcome logs, one stale task-line estimate, one cosmetic path convention) — none touch the deliverable doc, none affect the deferred-items gate substance (in-plan targets = 0), and all have documented mitigations or are one-clause cosmetic edits. No re-fix round is required; the plan is fit to close.
