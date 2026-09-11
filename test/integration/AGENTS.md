# Provider Integration Tests (`test/integration/`)

Live **provider smokes** only — one real API round-trip per external service to confirm the adapter is wired correctly. These tests are **not** service behaviour tests, full app flows, or database-layer integration tests.

## What belongs here

| Category | Path pattern | Example |
|----------|--------------|---------|
| Database providers | `db/*.integration.test.ts` | Neon HTTP |
| Cache / Redis providers | `redis/*.integration.test.ts` | Upstash, Redis Cloud, local Redis |
| Meeting adapters | `meeting/*.integration.test.ts` | Zoom, Google Meet, Microsoft Teams |

**Naming:** `*.integration.test.ts` only. One `describe` block per provider adapter, **one `test` per file** (single API call — avoids quota / rate limits).

## What does NOT belong here

| Test type | Correct location |
|-----------|------------------|
| Service unit tests (mocked deps) | `backend/services/**/*.test.ts` — run `bun run test:services` |
| PG repo / logic tests (`runInRollback`) | `backend/db/test/` — run `bun run test:db` |
| GraphQL API tests | `frontend/graphql/test/` |
| UI / E2E | `test/ui/` — see `test/ui/AGENTS.md` |

Never add `*.integration.test.ts` under `backend/services/` or `backend/db/test/` for external SaaS providers.

## Commands

All scripts load **`.env.test`** via `bun --env-file=.env.test`.

```bash
bun run test:integration              # All provider smokes (parallel runner)
bun run test:integration:sequential   # Same files, single bun process (debugging)
```

Subset by path:

```bash
bun --env-file=.env.test test test/integration/redis/ --timeout=120000
```

`test:integration` is **not** part of default CI — suites skip when required env keys are absent.

## Environment

- Secrets and provider URLs live in **`.env.test`** (gitignored). Document new keys in `.env.example` and `environment.d.ts`.
- Optional provider endpoints (e.g. `REDIS_CLOUD_TEST_REDIS_URL`, `UPSTASH_TEST_REDIS_REST_URL`/`UPSTASH_TEST_REDIS_REST_TOKEN` — see `.env.example`) are for manual full-path runs only; the default smoke targets the local `REDIS_URL` and skips cleanly when Redis is unreachable.

## Conventions

### Gating (`describe.skipIf`)

```typescript
// live example: test/integration/redis/redis-fanout-transport.integration.test.ts
const redisUrl = getRedisUrl();
const redisReachable = redisUrl !== undefined && (await probeRedisReachable(redisUrl));

describe.skipIf(!redisReachable)("RedisPubSubTransport + IoredisFanoutClient @live-redis", () => {
  test("publish → subscribe round-trips one envelope over the live channel", async () => {
    /* one round-trip */
  });
});
```

When the provider is unreachable — or no URL/keys are configured — the suite is skipped, not a failure.

### Scope of each smoke

- Instantiate the **adapter/transport directly** (e.g. `new IoredisFanoutClient(redisUrl)`, `new RedisPubSubTransport(client)`) — not the lazy singleton factory unless the factory is what you are integrating.
- Stub **DB side-effects** (`spyOn(NotificationRepository, …)`) when the adapter writes delivery rows; the smoke validates the **provider** path, not persistence.
- Assert the adapter reached the provider: a successful round-trip with the expected receipt **or** a structured provider rejection (e.g. an upstream 429/quota response) — not unhandled throws.
- Do **not** test business logic, fan-out, permissions, or multi-step service orchestration here.

### Logging

- **Never** use `console.log` / `console.error` — use `testLogger` from `@/shared/lib/logger/testlogger` when debug output is needed.

### Imports

- Use `@/` path aliases (`@/backend/...`, `@/backend/services/notifications/realtime/...`).
- No imports from `@/frontend/**` or `@/app/**`.

## Directory layout

```
test/integration/
  AGENTS.md
  db/                         # Neon HTTP, etc.
  redis/                      # Redis fan-out transport smoke (local REDIS_URL / Redis Cloud / Upstash)
  meeting/                    # Meeting provider smokes (Zoom, Google Meet, Microsoft Teams)
```

## Adding a new provider smoke

1. Create `test/integration/<domain>/<provider>.integration.test.ts`.
2. One `test`, one API round-trip, gate with `describe.skipIf`.
3. Add env vars to `.env.test`, `.env.example`, and `environment.d.ts`.
4. Run per-file verification: `bun run scripts/health/sub-loop.ts <file> --lifecycle lint`.
5. Run `bun run test:integration` locally with keys configured.

## Verification

```bash
bun run scripts/health/sub-loop.ts test/integration/redis/redis-fanout-transport.integration.test.ts --lifecycle lint
bun run test:integration
```

Instruction file for integration tests: `.agents/instructions/tests.instructions.md`.

## Linting Rules

- NEVER use `oxlint-disable` comments — fix the root cause.

