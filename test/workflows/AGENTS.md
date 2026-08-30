# Workflow / Journey Test Layer Rules

This directory contains **cross-actor journey tests**: sequential, multi-actor workflows executed
through the real service layer against the real test database. Canonical reference:
`docs/testing/workflow-journey-tests.md`.

> **Status:** This directory currently contains only this rules file. The first journey
> implementation scaffolds `test/workflows/helpers/` (cast provisioning + cleanup, pure
> `export *` barrel) and the first `test/workflows/<domain>/` subdirectory.

## Hard rules

1. **NO `runInRollback` — ever.** Services use the global `db` and spawn their own top-level
   transactions; an outer rollback wrapper would deadlock or miss committed rows. This layer is
   the documented exception to the `backend/db/test/` rollback rule — valid only inside
   `test/workflows/`.
2. **Committed fixtures + tracked cleanup.** Create the full actor cast in `beforeAll` inside a
   committing `db.transaction(...)`. Track every created row id (including side-effect rows the
   services create: reports, dues, credit transactions, idempotency-keyed rows) and hard-delete
   all of them in `afterAll`, in FK-safe order, via the cast helper's cleanup function.
3. **Unique UUID prefixes.** Every suite derives a per-run prefix
   (`const prefix = \`jrn_<domain>_${randomUUID().slice(0, 8)}\``) used in names/notes so repeated
   or parallel runs never collide.
4. **Honest authorization only.** Actors are real users holding their real roles (`users.role` +
   role-child rows). Never monkey-patch role/permission resolution in a journey — negative steps
   must fail through the real authorization/ownership checks.
5. **External effects always intercepted.** Nothing may reach real email/SMS/push/FX providers.
   Spy the notification dispatch boundary (namespace import + `spyOn` from `bun:test`; if
   interception empirically fails, fall back to `mock.module` and restore in `afterAll`). Assert
   both that a dispatch happened and **which userIds it targeted**.
6. **Never `expect(...).rejects.toThrow()`.** Use a try/catch helper and assert translated
   substrings from `getServerTranslations("en").errorsTranslations` — no hardcoded English strings.
7. **Use `bun:test` for test-framework imports.** Do not use Jest or Vitest; no `console.*`, no `any` casts.
8. **`@/` import aliases** (e.g. `@/test/workflows/helpers`), never relative parent paths.
9. **Never use demo/seeded rows as fixtures.** Always create your own entities via
   `backend/db/test/entity-setup.ts` helpers (`createTestUser`, `createTestStudent`,
   `createTestParent`, `createTestApplicant`, `createTestAdmin`) — verify signatures first; they
   vary.
10. **Organization**: one journey file per cross-actor workflow, grouped by domain subdirectory
    (`test/workflows/<domain>/<workflow>.test.ts`). Shared scaffolding lives in
    `test/workflows/helpers/` with a pure `export *` barrel (`./` paths only, one `/` max per
    export path).

## Running

While iterating on one journey (log capture, AI-optimized output):

```bash
bun run test/scripts/run-test.ts test/workflows/<domain>/<workflow>.test.ts
```

The whole layer (via the approved runner):

```bash
bun run test/scripts/run-test.ts test/workflows
```

## Helpers (`test/workflows/helpers/`) — scaffolded by DEV3-004 task 2.1

The helpers directory exists and is the ONLY shared-scaffolding home for this layer
(rule 10). Import it via `@/test/workflows/helpers` (rule 8); its `index.ts` is a pure
`export *` barrel.

### `journey-fixtures.ts` — tracked-ID registry + FK-order-aware cleanup

- `createJourneyFixtureRegistry()` → `{ track, trackAll, ids, trackedCount, cleanup }`.
  Create ONE registry per suite. Every fixture row AND every row the services create
  during the journey (sessions, idempotency claims, …) must be registered via
  `track(<table>, id)` — the registry is the hard-delete worklist for `afterAll`.
- Trackable tables are exactly `JOURNEY_TRACKED_TABLE_DELETE_ORDER`
  (`session_request_idempotency`, `session`, `students`, `teacher`, `applicants`,
  `parents`, `admin`, `users`). `cleanup()` hard-deletes all tracked ids inside ONE
  committed transaction in that FK-safe order (children first, `users` last), then
  clears the registry. Repeated `cleanup()` calls are no-ops — safe under retries.
- Do NOT track `audit_logs` or `teacher_transaction`: both are trigger-immutable
  (DELETE-blocked) and restrict-delete into `users`/`wallet`. Journeys assert ZERO
  rows there instead (below); a leak there is meant to fail the suite loudly.
- Side-effect absence is asserted by row-count deltas scoped to fixture ids — use
  `countNotificationsForUser`, `countAuditLogsForActor`, `countWalletsForTeacher`,
  `countTeacherTransactionsForTeacher` (baseline before the step, unchanged after).
  Rule 5's dispatch spy still applies whenever a journey EXPECTS a dispatch.
- Idempotent-teardown proof (rule 2 + REQ-J6): run the suite twice consecutively —
  a second green run proves zero residual state (per-run `jrn_<domain>_<8hex>`
  prefixes + unique emails make collisions impossible; `cleanup` must leave nothing).

### `session-cast.ts` — cast builders over `entity-setup.ts`

- Builders take `(tx, registry, …)` — call them inside the committing
  `db.transaction(...)` of `beforeAll`; they register every row they create.
- Student builders: `buildStudentWithTrial` (trial units, default 1),
  `buildStudentWithPaidLane(lane, units)` (`hifz`/`tajweed`, zero trial),
  `buildStudentWithBoth` (trial + paid — trial-first ordering proof),
  `buildZeroBalanceStudent`, `buildSecondStudent` (flexible profile).
- Teacher builders: `buildCertifiedTeacher` / `buildSecondCertifiedTeacher` (real
  `teacher` row with `isApproved = true`), `buildTeacherApplicant` (real `applicants`
  row, deliberately NO `teacher` row — INV-TV1 by construction, never simulated).
- Other roles: `buildParent`, `buildAdmin`.
- Composite: `buildSessionJourneyCast(tx, registry, { prefix, primaryStudent?, secondStudent? })`
  returns the canonical cross-actor cast; `journeyPrefix(domain)` derives the rule-3
  prefix. All builders return the real entity rows — permission resolution in the
  journey flows through these committed rows only (rule 4: never monkey-patch).
