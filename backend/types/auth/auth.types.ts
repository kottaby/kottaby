/**
 * Auth canonical types — the `logout` mutation payload contract for the
 * JWT authentication surface.
 *
 * The `login` / `refreshToken` payloads are served by the legacy service
 * types (`AuthSession`, `RefreshResult` — see the note below) via their
 * Pothos object refs; this file owns the logout payload only.
 *
 * NOTE: legacy service types (`AuthSession`, `RefreshResult`) live in
 * `@/backend/types/users/auth.types`. They pre-date this canonical location
 * and remain re-exported for backward compatibility.
 */

/**
 * `logout` mutation payload return contract.
 *
 * `logout` is public (callable with an expired token); the resolver always
 * clears the auth cookies via `clearAuthCookies` and returns `{ success: true }`.
 */
export interface LogoutPayloadReturnType {
  /** Whether the logout succeeded (always `true` — public mutation). */
  readonly success: boolean;
}
