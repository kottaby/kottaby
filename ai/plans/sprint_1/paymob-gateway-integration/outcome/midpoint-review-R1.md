# Mid-Point Backend Review Gate — Round 1 (Task 5.6)

**Date:** 2026-09-12 · **Scope:** all Phase 2–5 backend outputs (types, repo/schema/migrations, paymob service module, callback channels, routes, env/config) · **Reviewers:** 4 read-only subagents (types / paymob-module / routes+activation+repo / channels+env) · **Fixers:** 4 scoped subagents.

## Findings + dispositions

| Severity | Finding | Disposition |
|---|---|---|
| HIGH | Simulation channel health probe used POST against a GET-only `/api/health` (probe always failed against a real dev server) | FIXED — probe is now GET via a full `RequestInit` surface; test pin updated (`simulation-callback-channel.channel.ts` + suite, 19/19) |
| HIGH | Intention POST attached `notificationUrl`/`redirectionUrl` whenever `publicBaseUrl` non-null — the simulation channel's localhost base leaked internal topology to the vendor on the default dev path | FIXED — members omitted unless `channel.kind === "ngrok"`; 3-cell matrix pinned (`paymob.adapter.test.ts` 28/28) |
| MEDIUM | Factory lazy-singleton TOCTOU (concurrent first callers → double resolution, double ngrok spawn, double fallback log) | FIXED — in-flight Promise memoization; concurrency test pin added (`callback-channel.factory.test.ts` 20/20) |
| MEDIUM | Failed ngrok acquisition leaked the spawned agent child process | FIXED — `dispose()` seam on the channel, invoked in the factory's fallback catch; kill-count pin added |
| MEDIUM | `paymob.mapper.ts` price `ValidationError` messages hardcoded English on the user-facing `purchaseSubscription` error path | FIXED — localized via the established `getServerTranslations(...).errorsTranslations.subscriptionPurchase` precedent (`planPriceShapeInvalid`, `planPriceOutOfRange` added en+ar with parity/tests green; adapter via mapper still 28/28) |
| LOW | `NGROK_DOMAIN` values with protocol/trailing slash produced invalid tunnel URLs | FIXED — strip trailing slash, reject `://`-containing values into the named not-configured fallback |
| LOW | `deriveTransactionId` docblock overclaimed collision-freedom in a 9-digit FNV-1a space | FIXED — docblock softened, code unchanged |
| LOW (info) | `paymob.types.ts` callback vs inquiry shape overlap | ACCEPTED as-is — vendor verbatim mirror; divergent members justify separate shapes |
| LOW (info) | Transport/config error message family kept operator-facing English | ACCEPTED — matches repo precedent (`requireEnv`, cron routes); zero user-facing surface consumes them; documented in 9.2 deliverable |

## Adjudications of 🔄-pending ledger items

- **D-413** (413 vs masked 400 `PAYMENT_WEBHOOK_BODY_TOO_LARGE`): **ACCEPT landed 400** (two reviewers concurred) — shared transport gate cannot split status per provider; security substance (bounded read, no echo, 404-before-size-gate) intact; deviation remains 📅 Forward for 9.1 visibility.
- **D-514** (inert-member config fill in reconcile inquiry path): **ACCEPT** (types + paymob reviewers concurred) — wire-pinning tests prove only API key / token + reference reach the network; `Pick<>` narrowing remains a safe optional future refactor. Stays 📅 Forward.
- **D-515** (cron bare-404 gates absent from the exemptions inventory): **ACCEPT no doc change** — sweep-sessions precedent; route docblocks + inventory row pin the classification. One discoverability sentence to be added by 9.2 in the gateway doc (already in 9.2's scope as copy, not contract).
- **D-611** (stale `shared/AGENTS.md` namespace-registration prose): **ESCALATE into 9.2** — 9.2 must rewrite the Translation System registration steps to the live handle architecture as part of knowledge propagation.
- **5.5 deviations**: (1) `ngrok-channel-unavailable`→`ngrok-unreachable` rename: ACCEPT. (2) adapter URL source switched to the channel: ACCEPT direction + the HIGH fix above completed the required gating change.

## Cross-file dependency carried in from 7.2 (resolved at this gate)

`planCatalog` selection set lacked `balanceLane` → schema verified to expose it (`plan.pothos.ts:73`), document extended, schema regenerated (zero schema diff), codegen additive-only, lane feature line restored in `PlanPurchaseCard.tsx` with suite pins (23/23). The interim `plansViewLabels.ts` removal/re-add also resolved a type-aware lint dead-branch error (`Partial<Record<…>>` makes the fallback honestly live).

## Verification

- All fix files re-verified: `sub-loop.ts <file> --lifecycle duplicates` exit 0 (tsgo → oxlint → biome → lint:type-aware → duplicates).
- Suites green: callback-channel factory 20/20, simulation channel 19/19, adapter 28/28, mapper 29/29, errors parity 21/21, checkout parity 69/69, plans catalog 23/23.
- No reviewer-reported finding remains unfixed; zero backend-specific findings outstanding.

## Carry-forward

- 8.1's journey consumes the now-corrected channel semantics: simulation (dev default) delivers signed callbacks locally; intention creation carries no callback URLs on that path; ngrok path composes tunnel URLs and owns agent lifecycle (single resolution, disposal on failure).
- The factory suite carries three pre-existing ~10 s probe-budget tests (~30 s wall clock) — expected, not a regression.
- 9.2 inherits: D-611 rewrite (shared/AGENTS.md translation-section prose), one cron-404 discoverability sentence, and the operator-facing-error i18n posture note.
