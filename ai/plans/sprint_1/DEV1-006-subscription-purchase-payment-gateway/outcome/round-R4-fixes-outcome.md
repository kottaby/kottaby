# Round-R4 Fixes — Verification Outcome (Task R4-fixes)

**Date:** 2026-09-08 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

Both R4 items (F1, F2) fixed with full verification. House style checked first: the codebase standard for keyed lookups is the `Object.hasOwn(TABLE, key)` guard (see `backend/lib/errors/error-code-taxonomy.ts:102`, `isErrorCode` over `CODE_NORMALIZATION_TABLE`), so F1 uses that idiom rather than a null-prototype registry — smallest diff, no typing changes to the `Readonly<Record<…>>` shape, zero behavior change for known providers.

## 1. Fix Detail

| Change | File |
|---|---|
| **F1 (HIGH) — prototype-poisoned adapter registry:** `getPaymentGateway()` now resolves the provider through an own-property guard — `const createAdapter = Object.hasOwn(GATEWAY_ADAPTERS, provider) ? GATEWAY_ADAPTERS[provider] : undefined;` — so inherited `Object.prototype` members (`constructor`, `toString`, `valueOf`, …) fall through to the existing fail-closed `PAYMENT_GATEWAY_UNSUPPORTED` `ValidationError` branch instead of resolving truthy and being cached as the "gateway" (pre-fix, `PAYMENT_GATEWAY_PROVIDER=constructor` cached `Object()` as the `PaymentGatewayPort`). Registry docblock now states the guard is load-bearing (with a MUST + why), the factory header's fail-closed bullet mentions the inherited-name case, and an inline comment at the guard cross-references the error-code taxonomy's identical discipline | `backend/services/billing/payment-gateway/payment-gateway.factory.ts` |
| **F1 test:** new suite case "inherited Object.prototype provider names fail closed — never resolve a registry member" loops `PAYMENT_GATEWAY_PROVIDER=constructor` and `=toString`, and for each asserts after `resetPaymentGateway()`: the caught value is a `DomainError` AND a `ValidationError`, the domain rejection code is exactly `PAYMENT_GATEWAY_UNSUPPORTED`, and the message is the localized (en) generic validation copy — i.e. the typed denial, never a `TypeError` or a cached stray object. Suite header's fail-closed bullet extended with the inherited-name pin | `backend/services/billing/payment-gateway/payment-gateway.factory.test.ts` |
| **F2 (cosmetic) — duplicated directive:** removed the second `"use client"` directive (was repeated below the docblock at line 13); the file keeps exactly one directive at line 1. No other change | `frontend/views/admin/plans/hooks/usePlanFormDialog.ts` |

## 2. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ EXIT 0 / 0 errors (run after all edits) |
| `bun run test/scripts/run-test.ts backend/services/billing/payment-gateway/payment-gateway.factory.test.ts` | ✅ **20 pass / 0 fail** (19 baseline + 1 new, 104 expect calls) |
| UI scoped suite, 10.2 mechanism (`run-locked-cmd.ts` + `TEST_SERVER_MODE=production` + `.env.test.ci` + the four preloads) on `test/ui/components/admin/PlanCatalogContainer.test.tsx` | ✅ **7 pass / 0 fail** (60 expect calls — 12.1 pinned 61, within the documented 60–61 waitFor-poll variance; covers the F2 file, which the container imports) |
| `sub-loop <file> --lifecycle duplicates` (tsgo → oxlint → biome → lint:type-aware → check:duplicates) | ✅ 3/3 exit 0 — `payment-gateway.factory.ts`, `usePlanFormDialog.ts`, plus the touched `payment-gateway.factory.test.ts` (jscpd stage sanctioned-skipped there: outside scan scope) |
| Artifact grep over touched files (`DEV1-[0-9]{3}`, `REQ-[0-9]+`, `Task x.y`) | ✅ zero matches (exit 1 = clean) |
| `git status` | ✅ exactly the 3 intended files + this outcome + worklog; NO COMMITS |

## 3. Notes for the Orchestrator

- The `Object.hasOwn` guard was chosen over `Object.assign(Object.create(null), {…})`: it matches the repo's established registry idiom (error-code taxonomy), keeps the declared `Readonly<Record<string, () => PaymentGatewayPort>>` type without a null-prototype type dance, and is the smaller diff. The registry docblock pins the guard as a MUST so a future refactor doesn't drop it.
- The singleton caveat is unchanged by this fix: once a valid adapter is cached it keeps serving until `resetPaymentGateway()` (already pinned by the existing suite); the new test resets before each loop leg precisely so the poisoned provider is re-resolved fresh.
- No locale, schema, or consumer-code changes; webhook route / purchase service paths are untouched (they resolve through the same guarded seam).
