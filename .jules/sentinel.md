## 2026-09-17 - Rate Limiter Namespace Key Isolation
**Vulnerability:** In-memory sliding window rate limiter (`backend/lib/ratelimit.ts`) keyed entries solely on client IP (`identifier`), causing cross-limiter state pollution between `graphqlRateLimiter`, `portalReadLimiter`, and `cronSweepRateLimiter`.
**Learning:** Shared storage maps for multiple rate limiters with different limits/windows corrupt rate limit counters and cause cross-endpoint Denial-of-Service when requests to one endpoint exhaust quotas on unrelated endpoints for the same client.
**Prevention:** Always namespace storage keys in rate limiters by combining the rate limiter name with the client identifier (`${limiter.name}:${identifier}`).
