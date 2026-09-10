/**
 * Shared resolver guards for GraphQL root-field resolvers.
 *
 * Centralizes the argument validation that used to be duplicated across the
 * admin user query and mutation files. Guards throw `ValidationError`
 * (a `DomainError` subclass) BEFORE any service call so it propagates with
 * `extensions.code` and boundary masking per
 * `docs/graphql/domain-error-extensions-code.md`.
 */
import type { Context } from "@/backend/graphql/gqlContextFactory";
import { UnauthorizedError, ValidationError } from "@/backend/lib/errors";
import type { RegistrationReturnType } from "@/backend/types";

/**
 * Positive-safe-integer guard for ID arguments. Rejects `0`, negatives,
 * `NaN`, non-integers, and out-of-`Number.MAX_SAFE_INTEGER` values BEFORE
 * any DB round-trip.
 */
export function requirePositiveIntId(value: number | undefined | null, field: string): number {
  if (value === undefined || value === null) {
    throw new ValidationError(`${field} is required`);
  }
  if (!Number.isInteger(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new ValidationError(`${field} must be a positive safe integer`);
  }
  return value;
}

/**
 * Strict decimal-integer coercion for a wire `ID` session argument.
 *
 * GraphQL preserves `ID` as a string, and `Number()` lazily coerces
 * non-decimal syntax ("1e0", "0x1", " 1") into a valid integer — silently
 * addressing a DIFFERENT session than the one named on the wire. Only a
 * positive decimal-integer string coerces; anything else yields `NaN`,
 * which the recitation service's pre-DB shape guard rejects through its
 * documented channel (read: the oracle-safe `null` collapse; write: the
 * canonical localized VALIDATION denial). Deliberately NON-throwing: the
 * denial shape (and its log contract) belongs to the service boundary.
 */
export function coerceDecimalSessionId(value: string | number): number {
  return /^[1-9]\d*$/.test(String(value)) ? Number(value) : Number.NaN;
}

/**
 * TypeScript-narrowing guard for resolvers behind an `authenticated` auth
 * scope: the scope wall rejects anonymous callers pre-resolver, so the
 * null-user branch is unreachable in practice — it exists because the
 * repo-wide no-non-null-assertion rule forbids dereferencing the nullable
 * context. Its denial copy resolves through the request locale per the
 * resolver localization contract (`backend/graphql/AGENTS.md`).
 *
 * @returns The verified user row (the non-null narrowing of `ctx.user`).
 */
export async function requireVerifiedUser(ctx: Context): Promise<RegistrationReturnType> {
  if (!ctx.user) {
    throw new UnauthorizedError((await ctx.t("errorsTranslations")).unauthorized);
  }
  return ctx.user;
}
