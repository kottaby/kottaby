## 2025-05-18 - Enforce Strict JWT Secret Isolation in Production

**Vulnerability:** JWT secret resolution silently fell back to key derivation from `DATABASE_ENCRYPTION_KEY` in production (`NODE_ENV=production`) if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` were omitted by operators.
**Learning:** `isUsingDevFallbackSecret()` checked `nodeEnv === "production"` to report fallback status, but secret resolution functions `getAccessSecret()` and `getRefreshSecret()` did not fail closed or enforce explicit secrets in production mode.
**Prevention:** Always validate critical secrets in both boot-time environment validation (`ensureEnvironmentValidated`) and secret retrieval helpers, throwing explicit errors when mandatory production secrets are absent.

## 2025-05-19 - Strict Control Character and Origin Validation in Open Redirect Handlers

**Vulnerability:** Simple prefix/character checks on redirect paths (e.g., checking `!raw.startsWith("/")`) can be bypassed by whitespace or ASCII control characters (`\t`, `\n`, `\r`) that HTTP clients or WHATWG URL parsers normalize into protocol-relative or cross-origin URLs.
**Learning:** Checking string prefixes alone is insufficient for redirect URLs because browsers and WHATWG URL parsers normalize whitespace/control characters before navigating.
**Prevention:** Always combine character-level rejection (control characters, backslashes) with WHATWG `URL` parsing against a dummy same-origin base, verifying `parsed.origin === dummyBase` and `parsed.pathname.startsWith("/")`.
