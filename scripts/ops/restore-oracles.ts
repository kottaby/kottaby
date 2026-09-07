/**
 * Read-only invariant oracle registry for the restore-verify tool.
 *
 * The registry below is PURE DATA: each entry is a static SQL predicate run
 * against the restored scratch target via `psql -Atc` that must hold after a
 * faithful restore. Adding a new oracle is a data append ONLY — the
 * execution loop in {@link runOracles} never changes.
 *
 * SQL safety: every statement is a static string constant. No user input,
 * connection string, or file content is ever interpolated into oracle SQL;
 * the DSN travels exclusively through psql's argv.
 *
 * Output convention (registry-driven, no per-oracle branching):
 *   - A query returning an INTEGER is a COUNT predicate — the number of
 *     offending rows; the oracle passes iff the count is 0.
 *   - A query returning any other value is a VALUE oracle — the returned
 *     value must equal the expected value supplied in the run context
 *     (used by OR-MIG to compare the trailing migrations hash).
 *   - A failing psql invocation is an ERROR (distinct from "0 offending
 *     rows") and fails the oracle with the {@link ORACLE_ERROR_OFFENDING_COUNT}
 *     sentinel.
 */

import { MIGRATIONS_ABSENT_HASH, type PsqlOutcome, type PsqlRunner } from "@/scripts/ops/restore-shared";

/** One invariant oracle definition. The array below is the registry. */
export interface OracleDefinition {
  id: string;
  description: string;
  /** Anchor of the invariant this oracle verifies (invariant-doc reference). */
  invariantAnchor: string;
  /** Static, read-only SQL evaluated with `psql -Atc`. */
  sql: string;
}

/** Result of one executed oracle (persisted in restore-report.json). */
export interface OracleResult {
  id: string;
  description: string;
  passed: boolean;
  /** Offending-row count; -1 when the oracle itself errored. */
  offendingCount: number;
}

/** Sentinel offendingCount marking an errored oracle (distinct from a clean 0). */
export const ORACLE_ERROR_OFFENDING_COUNT = -1;

/** Values the value-oracle comparison needs for the whole run. */
export interface OracleRunContext {
  /** journalHash recorded by the backup (trailing migrations hash, or "none"). */
  journalHash: string;
}

/**
 * THE REGISTRY. Pure data — append a new entry to add an oracle.
 *
 * Table/column names reflect the live schema (backend/db/schema/): `wallet`,
 * `teacher_transaction`, `session`, `audit_logs`, `session_request_idempotency`,
 * `users`, `__drizzle_migrations` (drizzle migrations table, either schema).
 */
export const ORACLES: OracleDefinition[] = [
  {
    id: "OR-W1",
    description: "no wallet row with a negative balance",
    invariantAnchor: "INV-W1",
    sql: "SELECT COUNT(*) FROM wallet WHERE balance < 0",
  },
  {
    id: "OR-W2",
    description: "every teacher_transaction row joins an existing wallet",
    invariantAnchor: "INV-W3",
    sql: "SELECT COUNT(*) FROM teacher_transaction t LEFT JOIN wallet w ON w.id = t.wallet_id WHERE w.id IS NULL",
  },
  {
    id: "OR-B1",
    description:
      "session holds are non-negative and carry valid balance-lane provenance (no negative hold, no held row without a lane, no lane outside the vocabulary)",
    invariantAnchor: "INV-B1/B8",
    sql: [
      "SELECT COUNT(*) FROM session WHERE",
      "(fee_held = TRUE AND fee < 0)",
      "OR (fee_held = TRUE AND held_balance_lane IS NULL)",
      "OR (held_balance_lane IS NOT NULL AND held_balance_lane NOT IN ('trial', 'hifz', 'tajweed'))",
    ].join(" "),
  },
  {
    id: "OR-U1",
    description: "no audit_logs row with a null or dangling actor reference",
    invariantAnchor: "A.5/INV-U1",
    sql: "SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.actor_id IS NULL OR u.id IS NULL",
  },
  {
    id: "OR-U2",
    description: "soft-deleted users retain their audit history rows",
    invariantAnchor: "INV-U4/U5",
    sql: [
      "SELECT COUNT(*) FROM users u WHERE u.is_deleted = TRUE",
      "AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_type = 'user' AND a.entity_id = u.id)",
    ].join(" "),
  },
  {
    id: "OR-REQ",
    description: "every session_request_idempotency row references an existing user",
    invariantAnchor: "workflow 02",
    sql: "SELECT COUNT(*) FROM session_request_idempotency r LEFT JOIN users u ON u.id = r.user_id WHERE u.id IS NULL",
  },
  {
    id: "OR-MIG",
    description: "restored __drizzle_migrations trailing hash matches the backup journal hash",
    invariantAnchor: "migration-journal",
    sql: [
      "SELECT COALESCE(",
      "(CASE",
      "WHEN to_regclass('drizzle.__drizzle_migrations') IS NOT NULL",
      "THEN (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)",
      "WHEN to_regclass('public.__drizzle_migrations') IS NOT NULL",
      "THEN (SELECT hash FROM public.__drizzle_migrations ORDER BY id DESC LIMIT 1)",
      "END),",
      `'${MIGRATIONS_ABSENT_HASH}')`,
    ].join(" "),
  },
];

const INTEGER_OUTPUT_PATTERN = /^-?\d+$/;

function parseIntegerOutput(value: string): number | null {
  if (!INTEGER_OUTPUT_PATTERN.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function toResult(oracle: OracleDefinition, passed: boolean, offendingCount: number): OracleResult {
  return { id: oracle.id, description: oracle.description, passed, offendingCount };
}

/**
 * Executes the registry against the restored target. Registry-driven: the
 * mapping below is identical for every oracle — adding an entry never touches
 * this control flow. Results preserve registry order.
 */
export async function runOracles(
  psql: PsqlRunner,
  context: OracleRunContext,
  registry: OracleDefinition[] = ORACLES
): Promise<OracleResult[]> {
  return Promise.all(registry.map(async oracle => evaluateOracle(psql, oracle, context)));
}

async function evaluateOracle(
  psql: PsqlRunner,
  oracle: OracleDefinition,
  context: OracleRunContext
): Promise<OracleResult> {
  let outcome: PsqlOutcome;
  try {
    outcome = await psql(oracle.sql);
  } catch {
    return toResult(oracle, false, ORACLE_ERROR_OFFENDING_COUNT);
  }

  if (!outcome.ok) {
    return toResult(oracle, false, ORACLE_ERROR_OFFENDING_COUNT);
  }

  const offendingCount = parseIntegerOutput(outcome.value);
  if (offendingCount !== null) {
    return toResult(oracle, offendingCount === 0, offendingCount);
  }

  const passed = outcome.value === context.journalHash;
  return toResult(oracle, passed, passed ? 0 : 1);
}
