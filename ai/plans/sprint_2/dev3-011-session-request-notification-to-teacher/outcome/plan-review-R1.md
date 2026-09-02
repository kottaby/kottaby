# Plan-Review R1 — DEV3-011 (Session Request Notification to Teacher)

- **Review date:** 2026-09-01
- **Reviewers:** 4-lane review swarm — (1) types/i18n lane, (2) backend service+repo lane, (3) test/journey lane, (4) rulings+cross-cutting lane — consolidated at this Phase-1.5 gate (task 0.3).
- **Artifacts reviewed:** `specs.md` (REQ-001..REQ-095), `plan.md` (D1–D10 + §4 choreography), `tasks.md` (full execution script).

## Verdict

**PASS (zero blocking violations after amendments A1–A13)** — implementation may begin, starting with Phase 1 after this gate.

## Ratifications (task-0.3 mandates)

1. **§0 scope reconciliation — RATIFIED.** This ticket ships the notification **wave only** (six emitters + one repository + one types file + 17 i18n keys). Zero schema / zero GraphQL / zero frontend surface. Forward consumption is dispositioned exclusively as ✅ resolved-pointer ledger entries to DEV3-004/005 (session intake + accept/decline), DEV2-011 (in-session detection), and DEV3-008 (alternatives computation).
2. **D2 signature reconciliation — RATIFIED.** The emitters' authoritative signature is the house convention `(sessionId: number, locale: string, tx?: DBTransaction, options?: NotificationEngineCallOptions)` per plan.md D2. The ratification was **conditional on the specs.md REQ-011 errata**, which is now fulfilled by amendment A10 (REQ-011 carries the errata line naming the exact signature and the row-derived recipient-locale rule per REQ-014).

## Findings → Amendments Mapping

| # | Severity | Finding | Amendment applied |
|---|----------|---------|-------------------|
| 1 | HIGH | Ledger gate grepped the whole file: the template's Status Values legend lines contain ❌/⚠️ bullets, so the naive `grep -c "❌\|⚠️"` never returns 0 → perpetual RED. | **A1** — row-scoped gate `grep -cE '^\s*\|.*(❌\|⚠️)'` = 0 with "(plan-review R1 amendment)" rationale: specs.md REQ-075; tasks.md protocol line 7 + task 5.2 + task 7.3; plan.md §5 step 7 + §6 gate note. |
| 2 | HIGH | REQ-012 kept a participant-missing `INTERNAL_SERVER_ERROR` branch that is structurally unreachable under the single INNER-JOIN read (FK-constrained NOT NULL participant columns) → untestable dead branch was the only thing between plan and 100% branch coverage. | **A2** — errata: branch structurally unreachable and dropped; null joined read uniformly means SESSION_NOT_FOUND: specs.md REQ-012 errata; plan.md D3 + §4.2 step 3. |
| 3 | HIGH | Test-first journey (2.1) imports a service module that doesn't exist yet → journey fails RED at tsgo/compile instead of at runtime assertions, and 2.1.QL (quality loop on the journey file) can never report a type-clean RED — test-first/tsgo contradiction. | **A3** — signature-accurate STUB scaffold: tasks.md 2.1 now instructs creating `backend/services/classes/session-request-notification.service.ts` with the six final-signature methods whose bodies `throw DomainError("INTERNAL_SERVER_ERROR", "<emitter> test-first stub — implemented in task 2.3")`, plus the `backend/services/classes/index.ts` barrel and `backend/services/index.ts` registration; journey fails RED at **runtime** on assertions. tasks.md 2.3 now explicitly REPLACES the 2.1 stub bodies (patched this gate — see Patches). |
| 4 | HIGH | Fixture mandate was impossible: no session/teacher factories exist in-tree (`provisionCertifiedTeacherActor` cannot set `requestPreference`), so "helpers only" journeys for S↔T/U/V/W session rows and B.16 preference variants were unprovisionable; plan D9 also mis-cited the sanction source. | **A4** — direct-insert fixture ruling: rows helpers can't provision are DIRECT committed Drizzle inserts inside the same committing `beforeAll`/`runInRollback` transaction, tracked in `TrackedFixtures`: tasks.md 2.1, 2.2.TE, 2.3.TE (2.3.TE patched this gate — see Patches); plan.md D9 citation corrected to "this plan's own fixture ruling, ratified at Phase 1.5 plan-review R1". |
| 5 | MEDIUM | `logger.logDomainError` was sketched context-first (no message argument) while `backend/lib/logger.ts:92` is `logDomainError(message: string, ctx?)` — would have produced type-errors and unpinnable journey/service log assertions. | **A5** — message-first shapes with pinned messages `"Session not found for notification wave"` / `"Session intent corrupt for notification wave"` cited to `backend/lib/logger.ts:92`: specs.md REQ-012; plan.md §4.2 steps 3–4 + logging contract note; tasks.md 2.3 steps 3–4 (patched this gate — see Patches). |
| 6 | MEDIUM | `isSessionIntent(null)` under a `string | null` intent column was underspecified — a null could slip past or crash the guard. | **A6** — null-first intent check `if (row.intent === null || !isSessionIntent(row.intent))` ⇒ SESSION_INTENT_CORRUPT; the `contract-guards.ts` guard file is NEVER edited: plan.md §4.2 step 4; tasks.md 2.3 step 4 (patched this gate — see Patches). |
| 7 | MEDIUM | The caller-tx branch wrapped `emitForUser`'s result behind a `"notifications" in result` guard with a wrap fallback — under caller-tx the engine ALWAYS returns the receipt, making the fallback dead code. | **A7** — caller-tx branch is `return result` verbatim (NEVER publish); the type guard belongs only on the no-tx path (replay ⇒ receipt; fresh bare row ⇒ wrapped): plan.md §4.2 step 9; tasks.md 2.3 step 9 (patched this gate — see Patches). |
| 8 | MEDIUM | The parity-suite extension instructions left five stale count/parity sites in `shared/locale/notifications-namespace.parity.test.ts` to break silently after the key extension, and the Arabic-pin guidance pointed at the wrong anchor block. | **A8** — tasks.md 1.2 names the five stale sites — `:49` "(26 slots)" comment, `:148` test title, `:180` "all four ar FUNCTION slots" title, `:240-249` callable pin (extend to ALL TEN function slots), `:276` describe title — and pins new Arabic function-slot assertions to mirror the `ARABIC_SCRIPT.test(...)` regex assertions at `:180-186`, NOT the exact-string pins at `:192-238`. |
| 9 | MEDIUM | REQ-094 clause (ii) (cache-absent fail-open warn) was implicitly journey-scoped, but a journey cannot observe the engine's degraded-warn path without contorting the harness. | **A9** — REQ-094 clause (ii) explicitly deferred to the SERVICE Tier-3 (task 2.3.TE): tasks.md 2.1.TE wording. |
| — | LOW | Stale `classes/` repo-layout row at `backend/db/repo/AGENTS.md:21` would invite a duplicate/new-row edit in Phase 7. | **A12/Phase-7.2** — tasks.md 7.2 now instructs EXTENDING the existing stale `classes/` row at `backend/db/repo/AGENTS.md:21` (never minting a new `classes/` row) plus an optional shared/AGENTS.md clarification line (patched this gate — see Patches). |
| — | LOW | Conflicting journey instruction hierarchies: whether `getServerTranslations` is permissible inside journeys pits `test/workflows/AGENTS.md` against `tests.instructions.md:29` / `backend/db/test/AGENTS.md:130`. | **Standing note (recorded here, executor-facing):** the more-specific layer wins — `test/workflows/AGENTS.md` governs journey files; `tests.instructions.md` and `backend/db/test/AGENTS.md` yield to it inside `test/workflows/`. This more-specific-wins ruling MUST be restated in the task-2.1 outcome. |

Amendments **A10** (specs.md REQ-011 signature errata — fulfills the D2 ratification condition), **A11** (tasks.md 2.2.TE co-located `__tests__` placement ruling vs. the stale `backend/db/test/AGENTS.md` rule), and **A13** (tasks.md 0.1/0.2 pre-task completions were already applied and flipped `[x]`) completed the set.

## Standing Conditions for Executors

1. **Task 1.2** MUST apply A8's two bullets verbatim — the five named stale parity-suite sites updated in the SAME changeset as the key extension, and the new Arabic function-slot pins mirroring the `:180-186` regex assertions.
2. **Task 2.3** MUST honor the exact A5/A6/A7 shapes now pinned in its steps 3/4/9 — message-first `logDomainError` with the two pinned messages, null-first intent check with the guard file untouched, caller-tx `return result` directly.
3. **Tasks 2.1/2.2/2.3** MUST honor the A4 fixture ruling — helpers where they exist, DIRECT inserts inside the same committing/`runInRollback` transaction for rows no helper can provision (sessions, teacher `requestPreference` variants, locale pinning), tracked in `TrackedFixtures`.
4. **Task 7.2** MUST handle the stale `classes/` layout row at `backend/db/repo/AGENTS.md:21` by extending it in place.
5. **Task 2.1's outcome** MUST record the journey instruction-conflict ruling (LOW finding above: `test/workflows/AGENTS.md` wins over `tests.instructions.md:29` / `backend/db/test/AGENTS.md:130` inside `test/workflows/`).

## Patches Applied at This Gate

Amendments A1, A2, A8, A9, A10, A11, A13 and the A4/A5/A6/A7 coverage in specs.md/plan.md/tasks.md 2.1–2.2.TE were verified fully applied by the preceding amendment pass. Five half-applied sites were patched here, all confined to `tasks.md`:

1. **A3 closure:** task 2.3 said "CREATE the service" and "CREATE the barrels" although 2.1 now scaffolds both — 2.3's header and first bullet now say it REPLACES the task-2.1 stub bodies, and the barrel bullet is conditioned on the 2.1 scaffold not having run.
2. **A5 in 2.3 steps 3–4:** replaced the context-only `logDomainError({ ... })` shapes with the message-first `"Session not found for notification wave"` / `"Session intent corrupt for notification wave"` forms citing `backend/lib/logger.ts:92`.
3. **A6 in 2.3 step 4:** added the null-first check `if (row.intent === null || !isSessionIntent(row.intent))` and the `contract-guards.ts` never-edited note.
4. **A7 in 2.3 step 9:** moved the `"notifications" in result` type guard off the caller-tx branch (now `return result` directly, dead-code note) and onto the no-tx branch where it distinguishes replay from fresh.
5. **A4 in 2.3.TE + A12 in 7.2:** added the direct-insert fixture ruling to the service-test task and the stale `classes/` row (backend/db/repo/AGENTS.md:21) extension instruction + optional shared/AGENTS.md clarification to task 7.2.

## Scope / Hygiene Check

- `git status --short` under the plan directory shows only `specs.md`, `plan.md`, `tasks.md`, `deferred-items.md` modified and `outcome/` created — nothing outside the plan directory was touched by this gate.
- Markdown structure verified: specs.md's single top-level ` ```markdown ` fence wraps the document (opens line 1, closes line 210); plan.md fence pairs balanced (14 fence lines); table rows intact after patches.
- Ledger gate spot-check: row-scoped grep on `deferred-items.md` = **0** (matches A1 expectation; naive grep = 2 from legend bullets, which is why the amendment exists).

**Gate closed. Checklist item 0.3 flipped in `tasks.md`.**
