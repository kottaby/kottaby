# Task 9 — Frontend Outcome (Purchase documents + dialog + CTA wiring + copy)

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions`
**Note**: executed by a subagent that timed out mid-flight; completion (audit, quality loop, fixes, verification, outcome) finalized by the orchestrator with focused verification runs.

## Summary

The teacher dashboard now owns a complete verification-plan purchase surface:

- **Shared document**: `frontend/graphql/sharedDocuments/billing/verification-purchase.documents.ts` — `purchaseVerificationPlanMutationDocument` (TypedDocumentNode from codegen; field selections mirror the student purchase document; `id` on every object), exported through the `billing/index.ts` barrel and the root sharedDocuments barrel. Codegen re-run; `frontend/graphql/generated/gql/graphql.ts` now carries `PurchaseVerificationPlanDocument`, `PurchaseVerificationPlanMutation`, empty variables type, and the nested payload types.
- **Write path hook**: `useVerificationPurchase.ts` — `useMutation` wiring with the per-attempt idempotency key header (`x-idempotency-key`): key minted at dialog mount via `crypto.randomUUID()`, regenerated ONLY after a successful purchase (failed attempts keep the key so server-side replay dedupe stays effective). Denial branching via `extractErrorCode`: `APPLICANT_COOLDOWN_ACTIVE` → server-localized copy verbatim + profile refetch; `DUPLICATE_REQUEST` → info notice, no refetch; everything else → localized generic error, never a raw server message. Success → success notice + close + `myApplicantProfileQueryDocument` refetch.
- **Dialog**: `VerificationPurchaseDialog.tsx` — the plan line is REAL catalog data (`planCatalogQueryDocument`, skipped while closed, title-matched on `VERIFICATION_PLAN_TITLE` from `@/shared/constants`); missing active row disables confirm and renders the generic copy. MUI v9 `sx`-only with theme-palette callbacks, RTL-safe logical layout, `useAppTranslation` property access, hooks from `@/apollo/client/react`, no `useLazyQuery`, no navigation (mock gateway's null `checkoutUrl` never redirects).
- **CTA wiring**: `ApplicantStatusZones.tsx` — the previously intentional no-op re-apply CTA is replaced by `onPurchaseIntent`; `ApplicantStatusResolution.tsx` routes BOTH entry points (pending prompt CTA + eligible re-apply CTA) through it; `PendingPurchaseZone.tsx` carries the pending-branch CTA; `ApplicantStatusCard.tsx` hosts the dialog + `NoticeSnackbar` and owns the open/notice state. On success the Apollo refetch flips the card to in-evaluation.
- **i18n**: `purchase*` keys added to `shared/locale/types/applicant/index.ts`, `en`, `ar`, with inventory/order/function pins in `shared/locale/applicant-namespace.parity.test.ts` (placeholder order title → price → currency → sessions → days pinned byte-identical across locales).
- **Cache**: `frontend/providers/apollo/apolloCache.ts` registered the new payload type policies alongside the student purchase payload.

## Files

Created: `verification-purchase.documents.ts`, `VerificationPurchaseDialog.tsx`, `useVerificationPurchase.ts`, `PendingPurchaseZone.tsx`, `test/ui/components/teachers/VerificationPurchaseDialog.test.tsx`.
Modified: `sharedDocuments/billing/index.ts`, `generated/gql/graphql.ts` (codegen), `apolloCache.ts`, `ApplicantStatusCard.tsx`, `ApplicantStatusResolution.tsx`, `ApplicantStatusZones.tsx`, `shared/locale/{types,en,ar}/applicant/index.ts`, `shared/locale/applicant-namespace.parity.test.ts`.
NOT modified: backend/** (the mutation from Task 7 needed no further change), `app/` (no route change required — the dialog lives in the dashboard slot).

## Verification

- `bun tsgo` → **0 errors** (fixed: unused `_tc`/CommonNs import, `__typename` fixture typing via `PurchasePayloadFixture` intersections, `operationName ?? ""` for the capture link, `confirmButton` return widened to `HTMLElement`, nested codegen types imported).
- `bun biome:check` (whole repo) → **0 warnings**; `bun run check:duplicates` → **0 clones**.
- Component tests: `test/ui/components/teachers/VerificationPurchaseDialog.test.tsx` → **11 pass / 0 fail, run twice** (coverage: plan-line render EN+AR, success → refetch + snackbar + close, cooldown denial → server copy + refetch + stays open, duplicate → info + no refetch, generic denial + no raw-server-message leak, key STABLE across failures + ROTATES on success, cancel, catalog-in-flight, missing-plan, RTL). One flake hardened: the final refetch-settle gate's `waitFor` got a 3s window (cold-process race; assertion strength unchanged).
- Locale parity suite: **24 pass / 0 fail** (fixed: EN+AR `purchasePlanLine` copies re-ordered to the pinned placeholder order — AR now `${title}: ${price} ${currency} — ${sessions} جلسات على مدى ${days} يوماً`).
- Service regressions after the duplicate-block extraction (see below): `verification-purchase.service.test.ts` 18/0, `subscription-purchase.service.test.ts` 21/0.

## Carry-forward

- The jscpd clone between the two purchase services (`assertPlanUnchangedSinceCheckout`, 37 lines) was resolved by promoting the function into `backend/services/billing/purchase-guards.helpers.ts` with a `logMessage` parameter — each flow keeps its own domain-log attribution with a byte-identical denial contract. Both call sites updated; behavior preserved.
- Task 10 re-runs the journey + full suites; Task 11's frontend review lens should re-scan the dialog hook for the key-rotation policy and the verbatim-cooldown-copy rule (both now pinned by tests).

## Prototype fidelity

`purchase-dialog-desktop.png` + `purchase-dialog-mobile.png` (inspected sequentially) informed the dialog's information architecture (title row with close affordance, plan descriptor block, cancel/confirm actions). Intentional divergences: theme-palette tokens instead of prototype hex values, MUI dialog metrics over Tailwind spacing, real catalog data instead of the prototype's fake plan copy, and the notice rides the card's `NoticeSnackbar` (must survive the success close) rather than an in-dialog snackbar.
