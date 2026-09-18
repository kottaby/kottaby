# Research — i18n, test patterns & standards

Purpose: pin the i18n namespace mechanics, error-key placement, and the test-suite conventions (journey / service / repository / GraphQL integration) the new history & lifecycle surfaces must follow.

Date: 2026-09-18

## Verified findings

### i18n namespace mechanics

- i18n namespace: handle `AdminBroadcasts` via `defineNamespace<AdminBroadcastsLabels>("adminBroadcasts.adminBroadcasts", t => t.adminBroadcastsTranslations)` at `shared/locale/namespaces/adminBroadcasts/adminBroadcasts.namespace.ts`.
- There is NO `Translation` enum in this repo — localization uses namespace handles + property access (`shared/locale/namespaces/define-namespace.ts`).
- `AdminBroadcastsLabels` type at `shared/locale/types/adminBroadcasts/index.ts` — ~27 compose keys, all documented in the type file.
- Namespace parity test: `shared/locale/adminBroadcasts-namespace.parity.test.ts`:
  - `MANDATED_KEYS` at :54 (the 27-slot inventory);
  - the exhaustive-inventory test (no silent key minting beyond the 27 slots) at :137-138;
  - `FUNCTION_KEYS` at :88 (`["successToast"]`);
  - en/ar parity tests plus an Arabic-script sweep.
- New keys added to the namespace must be added to the parity test's mandated lists.

### Broadcast error keys (flat, in the errors namespace)

- Broadcast error keys live FLAT in the errors namespace, not in AdminBroadcasts:
  - type declarations at `shared/locale/types/errors/labels.ts:164-170` — `broadcastTitleInvalid`, `broadcastAudienceInvalid`, `broadcastAudienceEmpty`, `broadcastAudienceTooLarge`, each documented with its error code;
  - en implementation at `shared/locale/en/errors/index.ts:78-81`;
  - ar implementation at `shared/locale/ar/errors/index.ts:77-80`.
- Corrected path note: implementations are split per-locale under `shared/locale/en/errors/index.ts` and `shared/locale/ar/errors/index.ts` — there is no single `shared/locale/errors/index.ts`.
- New error keys `broadcastNotFound`, `broadcastAlreadyStopped` go into that same errors namespace (type + en + ar).

### Cross-actor journey test pattern

- Precedent: `test/workflows/notifications/admin-broadcast.journey.test.ts` (file doc at :50-:59):
  - committed fixtures in `beforeAll` inside a single tx;
  - `TrackedFixtures` + `afterAll` hard-delete under `withAuditDeleteTriggersSuspended` (import at :91, teardown order comment at :381, with post-teardown existence checks);
  - `expectJourneyError` try/catch helper at :209;
  - run-unique prefixes; `db.$count` oracles;
  - actor helpers at `test/workflows/helpers/actor-context.ts`;
  - `SpiedFanoutTransport` at `test/workflows/helpers/spied-transport.ts:49` for fan-out assertions;
  - NEVER `runInRollback` in journeys.
- Journeys run via `bun test test/workflows` — there is no dedicated generic `test:workflows` npm script (only the paymob journey has a script wrapper, `package.json:32`).

### Service / repository / GraphQL test layers

- Service tests colocated: `backend/services/notifications/admin-broadcast.service.test.ts` pattern — `runInRollback` + `expectRepoError` helper.
- Repository tests at `backend/db/test/logic/notifications/` (existing: `broadcast-audience.repository.test.ts`, `notification.repository.test.ts`).
- GraphQL integration tests in `backend/graphql/test/` (dev server, `testClient`) — broadcast precedent: `backend/graphql/test/admin-broadcast.integration.test.ts`.

### Canonical doc

- `docs/notifications/broadcast-notifications.md`:
  - §1 "What it is" at :5; §2 cohort taxonomy :20; §3 authorization double wall :35; §4 idempotency :42; §5 atomicity/publish post-commit :54; §6 recipient cap :58; §7 audit contract :62; §8 verbatim copy :70;
  - §9 "What NOT to do" at :74 — single writer of notifications (:76), publish strictly post-commit (:77), no claim-cache/idempotency fork (:78), audience taxonomy TS-only (:79), governance predicate invariant (:80), no pre-send audience-size count preview (:81);
  - §10 "Test map (evidence)" at :83.

## Carry-over notes for plan phases

- Any new history/detail/stop copy keys go in the `AdminBroadcasts` namespace type + en + ar, and into the parity test's `MANDATED_KEYS` (bumping the 27-slot count).
- `broadcastNotFound` / `broadcastAlreadyStopped` error keys land flat in the errors namespace (labels.ts + en + ar), mirroring the existing broadcast validation keys.
- The stop/retract lifecycle deserves a cross-actor journey test (admin stop, non-admin BFLA denial, second-admin audit append) following the committed-fixture `TrackedFixtures` pattern — never `runInRollback`.
- New repository tests for any broadcast-history repo go under `backend/db/test/logic/notifications/`; new service tests colocate with the service file.
- New/changed GraphQL ops need an integration test in `backend/graphql/test/` using `testClient` against the dev server.
- Doc §9 prohibitions constrain the design: retraction via the engine only, publish post-commit, no claim-cache fork.
