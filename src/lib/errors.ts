/**
 * DEV1-004 — Domain error hierarchy (adapted from the original kottaby spec).
 *
 * DomainError carries a `code` (extensions.code) for structured error handling.
 * ConflictError maps to `CONFLICT` (HTTP 409) — used by REQ-013 (trial
 * already granted). Plain `new Error(...)` is prohibited in the provisioning path.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * REQ-013 — thrown when the guarded grant matches zero rows (trial already
 * granted for this student record).
 */
export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
  readonly httpStatus = 409;
}

/**
 * ValidationError — thrown on invalid input (malformed email, missing fields).
 */
export class ValidationError extends DomainError {
  readonly code = "BAD_REQUEST";
  readonly httpStatus = 400;
}

/**
 * NotFoundError — thrown when a referenced entity doesn't exist.
 */
export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  readonly httpStatus = 404;
}

/**
 * ServerError — unexpected internal failure (DB error, etc.).
 */
export class ServerError extends DomainError {
  readonly code = "INTERNAL";
  readonly httpStatus = 500;
}

/**
 * A minimal structured logger that writes domain errors to stderr.
 * (Adaptation of the original `logger.logDomainError` from the kottaby spec.)
 * Never uses `console.log`; only `console.error` for error-level domain events.
 */
export const logger = {
  logDomainError(
    message: string,
    context: {
      code: string;
      entity: string;
      entityId: string | number;
      attempt?: string;
    },
  ): void {
    console.error(
      JSON.stringify({
        level: "error",
        message,
        ...context,
        timestamp: new Date().toISOString(),
      }),
    );
  },
  error(message: string, meta?: unknown): void {
    console.error(
      JSON.stringify({
        level: "error",
        message,
        meta: meta instanceof Error ? { name: meta.name, message: meta.message } : meta,
        timestamp: new Date().toISOString(),
      }),
    );
  },
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(
      JSON.stringify({
        level: "info",
        message,
        ...meta,
        timestamp: new Date().toISOString(),
      }),
    );
  },
};
