/**
 * Safety gate for the restore-verify tool.
 *
 * The restore DESTROYS and recreates public objects in the target database
 * (`pg_restore --clean --if-exists`), so the exact connection string handed
 * to pg_restore must pass the repo's destructive-database guard, and the
 * operator must have confirmed the run with `--yes-i-understand`.
 *
 * TOCTOU note: the target DSN is parsed ONCE on the CLI, held in a single
 * variable, threaded through this assessment, and later passed UNCHANGED to
 * pg_restore — the assessed string and the executed string are the same
 * object; there is no re-parse between gate and spawn.
 */

import { assessDestructiveDbCommandSafety, formatDestructiveDbBlockMessage } from "@/scripts/lib/destructiveDbGuard";
import { RestoreUsageError } from "@/scripts/ops/restore-cli";

/** Assessment result for the restore target. */
export interface RestoreGuardAssessment {
  blocked: boolean;
  reasons: string[];
}

/** Confirmation flag required on every (non-interactive) restore run. */
export const CONFIRMATION_FLAG = "--yes-i-understand";

/**
 * Assesses the restore target through the existing destructive-database
 * guard.
 *
 * The guard reads `DATABASE_URL` from the process environment for its
 * host-pattern analysis. Rather than duplicating the guard's managed-host and
 * production-marker pattern sets, the target DSN is temporarily seated in
 * `DATABASE_URL` for the duration of the call (previous value restored in a
 * `finally`), so the guard evaluates THE connection string pg_restore will
 * receive — plus the ambient env signals (NODE_ENV, providers) loaded from
 * the operator's env file.
 */
export function assessRestoreTargetSafety(targetDsn: string): RestoreGuardAssessment {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = targetDsn;
  try {
    const assessment = assessDestructiveDbCommandSafety();
    return { blocked: assessment.blocked, reasons: assessment.reasons };
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
}

/** Formats a guard refusal for stderr (tagged, multi-line, no credentials). */
export function formatRestoreGuardBlockMessage(assessment: RestoreGuardAssessment): string {
  return `[guard] ${formatDestructiveDbBlockMessage(assessment.reasons)}`;
}

/**
 * Enforces the non-TTY confirmation gate: the restore is destructive and ops
 * tooling runs unattended, so a bare TTY prompt is not trusted — the flag
 * must be present on every invocation, even when the guard passes.
 */
export function assertRestoreConfirmation(confirmed: boolean): void {
  if (!confirmed) {
    throw new RestoreUsageError(
      `refusing to restore without explicit confirmation: pass ${CONFIRMATION_FLAG} to acknowledge ` +
        "that the target database objects will be dropped and recreated"
    );
  }
}
