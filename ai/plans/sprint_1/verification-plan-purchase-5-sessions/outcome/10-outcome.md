# Task 10 Outcome — Journey green + full layer suites

> Orchestrator-executed (after subagent timeout; the journey D7 edit itself was authored by the interrupted subagent and verified). Branch: `feat/verification-plan-purchase-5-sessions`.

## D7 reconciliation (journey-only edit, service untouched)

The journey's step 7 was re-aimed to the plan-conformant contract (plan.md §4.3
runs the applicant lifecycle gate BEFORE the claim classification):

- **Foreign APPLICANT** (the cooldown-expired re-applicant, honest role) replaying
  Applicant A's SPENT key → passes the gate, reaches the claim classification →
  `NotFoundError("PAYMENT")` `PAYMENT_NOT_FOUND` (oracle-safe: nothing about the
  key's owner leaks; zero writes; owner's decided pair byte-identical).
- **Student** (non-applicant) replaying the SAME SPENT key → denied EARLIER at
  the applicant-row gate with `APPLICANT_NOT_FOUND` — equally oracle-safe.
- Both probes assert zero side effects and byte-identical owner rows.

`deferred-items.md` D7 → ✅ Done (reconciliation note recorded). No backend file changed.

## Journey green — twice back-to-back (idempotent teardown proof)

- Run 1: `bun run test/scripts/run-test.ts test/workflows/teachers/verification-plan-purchase.journey.test.ts` → **7 pass / 0 fail** (971 ms).
- Run 2 (immediately after): **7 pass / 0 fail** (923 ms) — committed fixtures + tracked teardown leave zero residue.

## Test-Layer Coverage Gate (SKILL.md) — layer-by-layer evidence

| Layer | Command | Result |
|---|---|---|
| Repo / DB logic | `bun run test:db:sequential` | ✅ **730 pass / 0 fail** (40 files, 32.5 s) |
| Service unit | `bun run test:services:sequential` | ✅ **1213 pass / 0 fail** (56 files, 25.7 s) |
| Cross-actor journeys | the journey file above (run twice) | ✅ **7 pass / 0 fail × 2** |
| GraphQL integration | `bun run test:graphql` (live dev-server harness) | ✅ **188 pass / 0 fail** (12 files, 100%) |
| UI components | per-directory runs (see caveat) | ✅ **438 pass / 0 fail** total (below) |
| E2E | not mandated by the plan | N/A |

### UI components — per-directory evidence (sandbox-safe execution)

| Directory | Result |
|---|---|
| admin (batched per file) | 28+13+29+7+10+56+46 = **189 pass / 0 fail** |
| admin-session-governance | **60 pass / 0 fail** (green in the full-suite run + clean-tree run + earlier sweep) |
| common | 19/0 · dashboard 13/0 · landing 4/0 |
| notifications 88/0 · parent 58/0 · shared 4/0 |
| student 95/0 · students 66/0 |
| teachers | ApplicantStatusCard **18/0** · TeacherSessionsContainer **35/0** · TeacherWalletContainer **17/0** · VerificationPurchaseDialog **12/0** (6 RTL/ar + 6 LTR/en, split `-t` runs; the file's own full run passes all assertions then the WORKER is OOM-killed post-tests — D10) |

**UI total: 438 pass / 0 fail.**

### Environment caveat (pre-existing, tracked as D10)

`bun run test:ui:components` (full-directory) and the admin-directory one-shot run are OOM-killed at the PROCESS level in this 4 GB sandbox — reproduced identically on the CLEAN tree (`git stash -u`), so it is NOT caused by this plan. All functional assertions pass when run per-file/per-directory (the sanctioned `KOTTABY_TEST_RUNNER_OK=1` bypass). CI must confirm the full-suite runner.

## One legitimate inventory update (GraphQL contract lock)

`frontend/graphql/test/warnings/warning-surfacing.test.ts` — `KNOWN_LIVE_MUTATION_FIELDS`
pins the EXACT deployed Mutation root set; the new (plan-mandated) inputless
`purchaseVerificationPlan` field was appended (sorted position + narration line
documenting its canonical-payload/no-warning-wrapper classification). This is
the living-inventory contract working as designed, not a test weakening.

## Regressions fixed

- A stale `next-server` from an earlier subagent session held port 3066 (EADDRINUSE → "dev server failed to respond"); killed via direct pid + re-run → green.
- One environmental flake: `concurrency.chaos.test.ts` 50-request `_health` storm timed out once (120 s) while the sandbox was loaded; passed on the re-run. `_health` is untouched by this plan.

## Carry-forward

- The GraphQL suite needs port 3066 free; stale dev servers from interrupted runs must be killed (`bun run test:ui:kill` covers 3099 only — 3066 needs a manual pid kill).
- Sandbox workers leak RSS across heavy UI suites; batch per-file execution is the reliable pattern here (D10).
