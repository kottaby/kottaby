## 2025-05-18 - Enforce Strict JWT Secret Isolation in Production

**Vulnerability:** JWT secret resolution silently fell back to key derivation from `DATABASE_ENCRYPTION_KEY` in production (`NODE_ENV=production`) if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` were omitted by operators.
**Learning:** `isUsingDevFallbackSecret()` checked `nodeEnv === "production"` to report fallback status, but secret resolution functions `getAccessSecret()` and `getRefreshSecret()` did not fail closed or enforce explicit secrets in production mode.
**Prevention:** Always validate critical secrets in both boot-time environment validation (`ensureEnvironmentValidated`) and secret retrieval helpers, throwing explicit errors when mandatory production secrets are absent.

## 2026-09-09 - Validate Host and X-Forwarded-Host Headers in Redirect Routes

**Vulnerability:** GET `/api/set-locale` constructed redirect origins using `x-forwarded-host` or `host` headers without validating against `ALLOWED_ORIGINS` or `request.nextUrl.origin`, enabling host header injection open-redirects.
**Learning:** Redirect endpoints that inspect proxy/forward headers (`X-Forwarded-Host`) to resolve server origins must validate candidate origins against strict allow-lists before passing them to `NextResponse.redirect`.
**Prevention:** Always validate candidate origins derived from request headers against `request.nextUrl.origin` and `ALLOWED_ORIGINS`, falling back safely to `request.nextUrl.origin`.
