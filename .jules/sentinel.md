## 2025-05-18 - Enforce Strict JWT Secret Isolation in Production

**Vulnerability:** JWT secret resolution silently fell back to key derivation from `DATABASE_ENCRYPTION_KEY` in production (`NODE_ENV=production`) if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` were omitted by operators.
**Learning:** `isUsingDevFallbackSecret()` checked `nodeEnv === "production"` to report fallback status, but secret resolution functions `getAccessSecret()` and `getRefreshSecret()` did not fail closed or enforce explicit secrets in production mode.
**Prevention:** Always validate critical secrets in both boot-time environment validation (`ensureEnvironmentValidated`) and secret retrieval helpers, throwing explicit errors when mandatory production secrets are absent.
