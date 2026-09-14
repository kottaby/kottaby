# Task 2.6 — Mid-Point Review Gate (Round 1) Outcome

**Date:** 2026-09-12 (review) / 2026-09-13 (fix waves)
**Executor:** review subagent (agent-14, read-only) + two fix subagents (agent-15 frontend, agent-16 backend)

## Verdict

**PASS-WITH-FIXES** — 0 P0 · 4 P1 · 15 P2. Backend axes (race safety, trigger freeze, single-tx
atomicity, BOPLA, repo conventions, audit vocabulary vs D-4, type soundness) all CLEAN on review.
All findings fixed in a dedicated wave; verdict after fixes: **PASS**.

## Findings → Fixes

| # | Severity | Finding | Disposition |
|---|----------|---------|-------------|
| 1 | P1 | `routeMutationError` lumped all VALIDATION codes into the reason lane | Fixed — routed by error code; invalid-amount reaches its dedicated message |
| 2 | P1 | No pagination controls in any panel | Fixed — shared `AdminFinancePaginationBar` consumed by all three panels |
| 3 | P1 | Raw wire enums rendered as chip copy | Fixed — localized labels (`paymentStatusLabel`, `paymentGatewayLabel`, `withdrawalStatusLabel`, `ledgerTypeLabel`/`ledgerStatusLabel`) + 26 new `adminFinance` keys (en+ar, parity green) |
| 4 | P1 | Success snackbars showed `te.validation` (an error string) | Fixed — dedicated `settlementSuccessMessage`/`adjustSuccessMessage` keys |
| 5 | P2 | Service doc overstated snapshot guarantee | Fixed — comment now states the real guarantee |
| 6 | P2 | Enum narrowing silently collapsed unknown values | Fixed — mappers fail loudly (`Error`/`ConflictError`) |
| 7 | P2 | Duplicated docblock in student-payment repo | Fixed — removed |
| 8 | P2 | `JSON.stringify(...).slice(0,2000)` could store broken JSON | Fixed — `serializeAuditDetails()` keeps it parseable |
| 9-11 | P2 | Dead API (`hasFilters`, dead export, dead `onSettled` param) | Fixed — removed |
| 12 | P2 | Client-side `Number()` money parse for zero-check | Fixed — string nonzero-check mirrors backend |
| 13/14 | P2 | Label-as-error-copy; mislabeled filter-clear option | Fixed — dedicated keys |
| 15 | P2 | `requirePositiveIntId` accepted `0x1f`-style IDs | Fixed — strict decimal coercion (`coerceDecimalSessionId` pattern) |
| 16 | P2 | Dead selected columns (`studentEmail`, `teacherEmail`) | Fixed — columns dropped from selects/types (spec SDL only pins names) |
| 17 | P2 | `teacherId: "0"` sentinel could reach the network | Fixed — `skipToken`; standby excluded from refetch |
| 18 | P2 | Nav icon duplicated teacher wallet icon | Fixed — `AccountBalanceOutlined`; comment aligned |
| 19 | P2 | Mid-file import placement | Fixed — moved to top import block |

## Verification after fixes

Service 18, wallet-repo 26, payment-repo 13, journey 6, schema-surface 53, census-drift 19,
audit-completeness 15, integration 27 — all green; locale parity 69 + 21; four AdminFinances UI
suites green ×2 each; tsgo 0; lint/biome clean on every touched file.
