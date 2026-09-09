# Deferred Items — DEV3-021 Admin Session Governance

> Working ledger. Updated during implementation; reviewed at final gate.

## ❌ Blocking debt (MUST be zero before completion)
- _(none at plan time)_

## ⚠️ Risks & watch items
- The residency of the canonical `DateTime` scalar registration: verify registry vs each new Pothos file's imports during 4.x tasks.
- No idempotency-claim decorator position verified for mutations at plan time — reuse the same mechanism the participant mutations use (chained inside `withTransaction` or outer claim wrapper; record finding in 4.3 outcome).

## Forward-owned items (tracked elsewhere)
- **D-03** Bespoke rate-limit for admin mutations — platform-wide hardening stream (not this ticket).
- **D-04** Real-time admin dashboards over governance surfaces — DEV3 analytics family.
- **D-05** Meeting-bridge integration for admin `join` (full join access vs observation) — depends on meeting services ticket (BLT-03).
- **D-01, D-02** reclassified: reused-enumeration & audit-shape decisions now live IN-PLAN (see plan §0/D-07); NOT deferred.
