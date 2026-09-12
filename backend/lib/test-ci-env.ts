/**
 * Detect whether the current process is running in CI / test CI mode.
 */
export function isTestCi(): boolean {
  return process.env.TEST_CI === "true" || process.env.CI === "true";
}

/**
 * Paymob provider keys that test CI deliberately leaves UNSET.
 *
 * Absence is the harmless test-mode default: the env seam resolves every
 * unset/empty key to its inert value (`null` secrets and integration IDs,
 * documented base URLs, timeout, and sweep window), so CI runs against the
 * mock provider and the simulation callback channel with zero provider
 * credentials on disk. Suites that probe provider configuration set these
 * keys explicitly and restore them afterwards.
 *
 * The dev-only tunnel keys (`NGROK_AUTHTOKEN`, `NGROK_DOMAIN`, `NGROK_PORT`)
 * are intentionally NOT part of this list — they must stay absent in test CI
 * so the tunnel-based callback channel can never be selected there.
 */
export const TEST_CI_UNSET_PAYMOB_ENV_KEYS = Object.freeze([
  "PAYMOB_SECRET_KEY",
  "PAYMOB_PUBLIC_KEY",
  "PAYMOB_HMAC_SECRET",
  "PAYMOB_API_KEY",
  "PAYMOB_INTEGRATION_ID_CARD",
  "PAYMOB_INTEGRATION_ID_WALLET",
  "PAYMOB_API_BASE_URL",
  "PAYMOB_CHECKOUT_BASE_URL",
  "PAYMOB_HTTP_TIMEOUT_MS",
  "PAYMOB_RECONCILE_PENDING_MINUTES",
] as const);
