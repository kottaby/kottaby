/**
 * Dialect-aware database client singleton for the Kottaby / Draft Academy backend.
 *
 * Two providers are supported:
 *
 * - `postgres` (default, production) — creates a `pg.Pool` from `DATABASE_URL`.
 *   Exposes `pool`, `db` (Drizzle ORM), `queryDb`, `closePool`.
 * - `pglite` (local-dev / sandbox / CI) — wraps `@electric-sql/pglite` (real
 *   PostgreSQL in-process via WASM, persisted to `PGLITE_DATA_DIR`). Same
 *   public API (Drizzle ORM, queryDb, closePool). Used when a real
 *   PostgreSQL install is not available.
 *
 * Connection is lazy: the exported `db` wraps a delegating pool that resolves
 * (and constructs) the real singleton on first use (first `db.select()` or
 * `queryDb` call) — importing this module performs no I/O and never reads
 * `DATABASE_URL`, so importing it in a non-DB context neither opens a
 * connection nor throws.
 *
 * @see docs/SQLITE_LOCAL_DEV.md for the legacy `sqlite` (libsql) dialect — not
 *      used in production; the PGlite path replaces it for sandbox dev.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { type CustomTypesConfig, Pool, type QueryResult, type QueryResultRow } from "pg";
import {
  closePglite,
  getPglitePool,
  type PglitePoolLike,
  type PgQueryConfig,
  type PoolClientLike,
  type QueryResultLike,
  type Row,
} from "@/backend/db/pglite-pool";
import { getEnv } from "@/backend/lib/env";
import { logger } from "@/backend/lib/logger";

/** The union of pool-shape we accept (pg.Pool or PGlite shim). */
type AnyPool = Pool | PglitePoolLike;

/** Returns true when the active `DB_PROVIDER` is `pglite` (sandbox/CI path). */
function isPgliteProvider(): boolean {
  return (getEnv("DB_PROVIDER") ?? "postgres").toLowerCase() === "pglite";
}

/** Detect whether the target DB requires SSL (Neon / cloud PG). */
function shouldUseSsl(connectionString: string): boolean {
  try {
    const parsed = new URL(connectionString);
    return parsed.searchParams.get("sslmode") === "require" || /\.neon\.tech$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Type guard: narrows `AnyPool` to `PglitePoolLike` when the active provider
 * is `pglite`. The singleton's kind is determined at construction time by
 * `DB_PROVIDER` (see `getPool()`), so re-checking the env IS the runtime
 * validation that the value is the PGlite shim vs. a real `pg.Pool`.
 *
 * This is the `no-unsafe-type-assertion`-compliant escape hatch — instead of
 * `pool as PglitePoolLike` (which narrows unsafely), we use a `value is Type`
 * predicate with real runtime validation (the env check).
 *
 * The `_pool` parameter is unused at runtime (the discriminator is the env
 * var, not the value's shape); the `_` prefix satisfies `no-unused-vars`.
 * The parameter IS required by TS so the predicate can attach to a value
 * of type `AnyPool` and narrow it.
 */
function isPglitePool(_pool: AnyPool): _pool is PglitePoolLike {
  return isPgliteProvider();
}

/**
 * Type guard: narrows `AnyPool` to `pg.Pool` when the active provider is
 * `postgres`/`neon` (the production path). Complement of `isPglitePool`.
 */
function isPgPool(_pool: AnyPool): _pool is Pool {
  return !isPgliteProvider();
}

/**
 * Runtime-validated assertion that the value is `pg.Pool`-shaped (has the
 * `query` / `connect` / `end` methods Drizzle's `NodePgSession` actually
 * invokes). Used to bridge the type-system/runtime gap: `PglitePoolLike` is
 * NOT structurally a `pg.Pool` (it omits `EventEmitter` surface,
 * `totalCount`/`idleCount`/etc.) so a real `value is Pool` type guard
 * cannot narrow the union. This assertion runs REAL structural validation
 * (object + three required methods) before treating the value as a `Pool`,
 * which is the documented `no-unsafe-type-assertion` escape hatch.
 */
function assertPoolLike(value: unknown): asserts value is Pool {
  if (typeof value !== "object" || value === null) {
    throw new Error("[db] pool must be an object");
  }
  // After `typeof` check, `value: object`. The `in` operator narrows to
  // `object & Record<"query", unknown>` (etc.) so property access type-checks
  // without an `as` cast.
  if (!("query" in value) || typeof value.query !== "function") {
    throw new Error("[db] pool must have a query() method");
  }
  if (!("connect" in value) || typeof value.connect !== "function") {
    throw new Error("[db] pool must have a connect() method");
  }
  if (!("end" in value) || typeof value.end !== "function") {
    throw new Error("[db] pool must have an end() method");
  }
}

let poolSingleton: AnyPool | null = null;

/** Returns the singleton pool (pg.Pool or PGlite shim). Constructs on first call. */
function getPool(): AnyPool {
  if (poolSingleton) {
    return poolSingleton;
  }
  if (isPgliteProvider()) {
    // PGlite construction is async (WASM init). Return a thenable that resolves
    // to the real pool — Drizzle + repos always `await` queries, so awaiting a
    // thenable that resolves to the PGlite pool works for query()/connect().
    // For direct `getPool()` callers, the wrapper is returned by a getter proxy.
    const pglitePoolPromise = getPglitePool();
    // Build the lazy thenable as an explicitly-typed `PglitePoolLike` so it
    // is directly assignable to `AnyPool` (the union includes `PglitePoolLike`)
    // — no `as` cast needed. Each method awaits the underlying promise and
    // forwards to the resolved real PGlite pool.
    const lazyThenable: PglitePoolLike = {
      async query<T extends Row = Row>(
        textOrConfig: string | PgQueryConfig,
        params?: ReadonlyArray<unknown>
      ): Promise<QueryResultLike<T>> {
        const p = await pglitePoolPromise;
        return p.query<T>(textOrConfig, params);
      },
      async connect(): Promise<PoolClientLike> {
        const p = await pglitePoolPromise;
        return p.connect();
      },
      async end(): Promise<void> {
        const p = await pglitePoolPromise;
        return p.end();
      },
      on(): PglitePoolLike {
        return lazyThenable;
      },
    };
    poolSingleton = lazyThenable;
    return poolSingleton;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.trim().length === 0) {
    throw new Error(
      `Required environment variable "DATABASE_URL" is not set. Add it to your .env file (see .env.example).`
    );
  }
  const requiresSsl = shouldUseSsl(connectionString);
  const realPool = new Pool({
    connectionString,
    max: 10,
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Every pooled session pins UTC via the startup packet: the naive
    // `timestamp without time zone` columns (session.created_at,
    // student_payments.created_at, …) store the SESSION wall clock through
    // `defaultNow()`, and the platform-analytics trend readers decode that
    // wall clock as UTC (`AT TIME ZONE 'UTC'` / strict-ISO `…Z` rehydration).
    // A non-UTC session would shift every written wall clock — and with it
    // every trend day bucket. PGlite pins the same setting in its init
    // (`pglite-pool.ts`), so both providers guarantee identical buckets.
    options: "-c timezone=UTC",
  });
  // `realPool: Pool` — `Pool` is already a member of the `AnyPool` union, so
  // no `as AnyPool` cast is needed (the previous `realPool as AnyPool` was
  // flagged by `no-unnecessary-type-assertion`).
  poolSingleton = realPool;
  return poolSingleton;
}

export const getDrizzleDbPool = getPool;

/**
 * Normalizes a pg `QueryResult` into the shared row shape used by both pool
 * backends: `fields` reduced to the two properties repos consume (`name`,
 * `dataTypeID`) and `rowCount` coalesced (pg reports `number | null`).
 */
function toQueryResultLike<T extends Row>(result: QueryResult<T>): QueryResultLike<T> {
  return {
    rows: result.rows,
    fields: result.fields.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rowCount: result.rowCount ?? 0,
    command: result.command,
    oid: result.oid,
  };
}

/** Config shape pg accepts at runtime for `query(config)`; locally typed because the installed pg `QueryConfig` type omits `rowMode`. */
interface PgForwardConfig {
  name?: string;
  text: string;
  values?: unknown[];
  rowMode?: string;
  types?: CustomTypesConfig;
}

/** Runtime-validated narrowing of drizzle's opaque `types` payload (same assertion-idiom as {@link assertPoolLike}). */
function assertCustomTypesConfig(value: unknown): asserts value is CustomTypesConfig {
  if (
    typeof value !== "object" ||
    value === null ||
    !("getTypeParser" in value) ||
    typeof value.getTypeParser !== "function"
  ) {
    throw new Error("[db] invalid pg type-parser config");
  }
}

/**
 * Forwards one normalized call to a pg-shaped runner (`Pool` or
 * `PoolClient`), preserving drizzle's per-query `name` / `rowMode` / `types`
 * config so the driver's custom type parsers keep working.
 */
async function pgForward<T extends Row = Row>(
  runner: Pick<Pool, "query">,
  textOrConfig: string | PgQueryConfig,
  params?: ReadonlyArray<unknown>
): Promise<QueryResultLike<T>> {
  const values = params ?? (typeof textOrConfig === "string" ? undefined : textOrConfig.values);
  const mutableValues = values ? [...values] : undefined;
  if (typeof textOrConfig === "string") {
    return toQueryResultLike(await runner.query<T>(textOrConfig, mutableValues));
  }
  const config: PgForwardConfig = { text: textOrConfig.text ?? "", values: mutableValues };
  if (textOrConfig.name !== undefined) {
    config.name = textOrConfig.name;
  }
  if (textOrConfig.rowMode !== undefined) {
    config.rowMode = textOrConfig.rowMode;
  }
  if (textOrConfig.types !== undefined) {
    assertCustomTypesConfig(textOrConfig.types);
    config.types = textOrConfig.types;
  }
  return toQueryResultLike(await runner.query<T>(config));
}

/** Lazy query hop — resolves the singleton on first use, never at import. */
async function lazyQuery<T extends Row = Row>(
  textOrConfig: string | PgQueryConfig,
  params?: ReadonlyArray<unknown>
): Promise<QueryResultLike<T>> {
  const pool = getPool();
  if (isPglitePool(pool)) {
    return pool.query<T>(textOrConfig, params);
  }
  return pgForward<T>(pool, textOrConfig, params);
}

/** Lazy connect hop — binds the caller to one dedicated backend client. */
async function lazyConnect(): Promise<PoolClientLike> {
  const pool = getPool();
  if (isPglitePool(pool)) {
    return pool.connect();
  }
  const client = await pool.connect();
  return {
    query: <T extends Row = Row>(textOrConfig: string | PgQueryConfig, params?: ReadonlyArray<unknown>) =>
      pgForward<T>(client, textOrConfig, params),
    release: () => {
      client.release();
    },
  };
}

/** Lazy end hop — delegates shutdown to the resolved singleton. */
async function lazyEnd(): Promise<void> {
  await getPool().end();
}

/**
 * Single-client-mode adapter for the PGlite provider: drizzle treats a
 * non-Pool client as one shared connection (embedded semantics), exactly
 * matching the pre-existing PGlite behavior.
 */
const lazyPgliteClientAdapter: PglitePoolLike = {
  query: lazyQuery,
  connect: lazyConnect,
  end: lazyEnd,
  on(): PglitePoolLike {
    return lazyPgliteClientAdapter;
  },
};

/**
 * Pool-mode adapter for the postgres provider: the class name contains
 * "Pool" so drizzle's node-postgres driver detects a pool and calls
 * `connect()` per transaction (dedicated connection + `release()`),
 * matching the semantics of a real `pg.Pool` while doing zero work at
 * import time.
 */
class LazyDrizzlePool {
  query = lazyQuery;
  connect = lazyConnect;
  end = lazyEnd;
  on(_event: string, _listener: (...args: unknown[]) => void): this {
    return this;
  }
}

assertPoolLike(lazyPgliteClientAdapter);
const lazyDrizzlePool = new LazyDrizzlePool();
assertPoolLike(lazyDrizzlePool);

/**
 * The Drizzle ORM client. Constructed at module scope around the lazily
 * delegating pool above — the real pool is resolved on the first query, not
 * at import time. Use for typed queries:
 * `db.select().from(users).where(eq(users.id, id))`.
 *
 * NOTE (drizzle-orm 1.0.0-rc.4): `DrizzlePgConfig` explicitly omits `schema` —
 * schema binding moved out of the client config in v1. Typed `db.select()` /
 * `db.insert()` / `db.update()` queries work via direct table imports
 * (`import { users } from "@/backend/db/schema"`). Relational query API
 * (`db.query.users.findMany()`) will require schema passed at the call site
 * when those land in a later ticket.
 */
export const db = isPgliteProvider()
  ? drizzle({ client: lazyPgliteClientAdapter })
  : drizzle({ client: lazyDrizzlePool });

/**
 * Runs a raw parameterized SQL query against the pool and returns typed rows.
 * Preferred for read-only raw-SQL paths in repositories and scripts — typed
 * rows without the Drizzle query builder.
 *
 * @example
 * const rows = await queryDb<{ table_name: string }>(
 *   "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
 *   ["public"],
 * );
 */
export async function queryDb<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<QueryResult<T>> {
  // Spread into a new mutable array — `pg`'s `query(values?: any[])` rejects
  // `ReadonlyArray<unknown>` directly (mutability mismatch), and an `as
  // unknown[]` cast would trip `no-unsafe-type-assertion`. Spreading avoids
  // both issues without changing the public signature.
  const mutableParams = params ? [...params] : undefined;
  const pool = getPool();
  if (isPgPool(pool)) {
    // pg.Pool — direct call, returns `Promise<QueryResult<T>>` (matches
    // the function's return type, no cast needed).
    return pool.query<T>(text, mutableParams);
  }
  // PGlite shim (narrowed via type guard to `PglitePoolLike`). The shim's
  // `query<T>` returns `QueryResultLike<T>` which is NOT structurally
  // `pg.QueryResult<T>`: (a) `fields` is `{name, dataTypeID}` only vs pg's
  // 7-property `FieldDef`, and (b) `rowCount: number` vs `number | null`.
  // Construct a real `QueryResult<T>` from the shim result — no `as` cast,
  // no narrowing. The missing FieldDef properties default to 0 / "text"
  // (repos don't read them; verified via grep across `backend/db/repo`).
  const shimResult = await pool.query<T>(text, mutableParams);
  const queryResult: QueryResult<T> = {
    rows: shimResult.rows,
    command: shimResult.command,
    rowCount: shimResult.rowCount,
    oid: shimResult.oid,
    fields: shimResult.fields.map(f => ({
      name: f.name,
      tableID: 0,
      columnID: 0,
      dataTypeID: f.dataTypeID,
      dataTypeSize: 0,
      dataTypeModifier: 0,
      format: "text",
    })),
  };
  return queryResult;
}

/**
 * Gracefully closes the singleton pool. Intended for CLI shutdown / tests only.
 * Calling this then accessing `db` / `queryDb` again re-creates a new pool.
 */
export async function closePool(): Promise<void> {
  if (poolSingleton) {
    if (isPglitePool(poolSingleton)) {
      await closePglite();
    } else {
      // Type-guard narrows to `Pool`; no `as Pool` cast needed.
      const pool: Pool = poolSingleton;
      if (typeof pool.end === "function") {
        await pool.end();
      }
    }
    poolSingleton = null;
    logger.warn("[db] pool closed");
  }
}
