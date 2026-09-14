# Visual Scoring Outcome — Admin Financial Auditing (Payments, Wallets, Withdrawal Approval)

- Date: 2026-09-13
- Plan: ai/plans/sprint_3/admin-financial-auditing-payments-wallet/
- Capture rig: dev server @ localhost:3000 (Storybook skipped — no stories existed; user brief explicitly asked for dev-server viewport captures)
- Inspector: one isolated subagent per screenshot (Read tool; one image per subagent, per user requirement)
- Locales captured: en (AR spot-captures happened accidentally mid-run and were discarded; AR pass consciously deferred)
- Dark-mode pass: no (app currently ships the dark navy theme as its default surface)

## Surfaces covered

| Surface | Route / URL | Viewports | States |
|---|---|---|---|
| Payments audit | `/admin/finances` (default tab) | 1440×900, 834×1112, 390×844 | populated (12 fixture rows), filters, mobile cards |
| Withdrawal queue | `/admin/finances?tab=withdrawals` | 1440×900, 834×1112, 390×844 | populated (3 fixture rows), reject dialog open (3 viewports) |
| Wallet inspector | `/admin/finances?tab=wallet(&teacherId=4724)` | 1440×900, 834×1112, 390×844 | unpicked empty, picked+populated (ledger), adjust dialog (desktop+mobile) |

## Score history (first scored pass → final pass)

| Pass | Surface | Viewport | Total | Verdict |
|---|---|---|---|---|
| 1 | payments-desktop-1440 | 1440×900 | 8.6 | NEEDS FIXES |
| 1 | payments-tablet-834 | 834×1112 | 8.8 | READY |
| 1 | payments-mobile-390 | 390×844 | 8.7 | READY |
| 1 | withdrawals-desktop-1440 | 1440×900 | 7.3 | NEEDS FIXES |
| 1 | withdrawals-tablet-834 | 834×1112 | 8.92 | NEEDS FIXES |
| 1 | withdrawals-mobile-390 | 390×844 | 8.6 | NEEDS FIXES |
| 1 | reject-dialog-desktop | 1440×900 | 8.5 | NEEDS FIXES |
| 1 | reject-dialog-mobile | 390×844 | 8.5 | NEEDS FIXES |
| 1 | wallet-empty-desktop | 1440×900 | 8.2 | NEEDS FIXES |
| 1 | wallet-empty-tablet | 834×1112 | 8.7 | NEEDS FIXES |
| 1 | wallet-empty-mobile | 390×844 | 9.42 | NEEDS FIXES |
| 1 | wallet-picked-desktop | 1440×900 | 7.0 | NEEDS FIXES |
| 1 | wallet-picked-tablet | 834×1112 | 7.5 | NEEDS FIXES |
| 1 | wallet-picked-mobile | 390×844 | 8.3 | NEEDS FIXES |
| 1 | adjust-dialog-desktop | 1440×900 | 8.9 | NEEDS FIXES |
| 1 | adjust-dialog-mobile | 390×844 | 8.2 | NEEDS FIXES |
| final | payments-desktop | 1440×900 | **9.6** | READY |
| final | payments-tablet | 834×1112 | **9.7** | READY |
| final | payments-mobile | 390×844 | **9.0** (gap fix landed post-score; LOW-only) | accepted |
| final | withdrawals-desktop | 1440×900 | **9.5** | READY (zero findings) |
| final | withdrawals-tablet | 834×1112 | **9.8** | READY |
| final | withdrawals-mobile | 390×844 | **9.5** | READY |
| final | reject-dialog-desktop | 1440×900 | **9.5** | READY |
| final | reject-dialog-mobile | 390×844 | **9.5** | READY (zero findings) |
| final | wallet-empty-desktop | 1440×900 | **10.0** | READY |
| final | wallet-empty-tablet | 834×1112 | **9.5** | READY |
| final | wallet-empty-mobile | 390×844 | **9.4** | accepted (LOW-only) |
| final | wallet-picked-desktop | 1440×900 | **9.6** | READY |
| final | wallet-picked-tablet | 834×1112 | **9.5** | READY (zero findings) |
| final | wallet-picked-mobile | 390×844 | **9.5** | READY (zero findings) |
| final | adjust-dialog-desktop | 1440×900 | **9.5** | READY (zero findings) |
| final | adjust-dialog-mobile | 390×844 | **9.7** | READY |

## Pre-check gate failures found (and fixed)

| Surface | Check | Output line | Fix |
|---|---|---|---|
| all @390px | offscreen | `offenders: [BUTTON.MuiButtonBase-root]` (Wallet Inspector tab right=478) | `Tabs variant="scrollable"` — real fix (AdminFinancesContainer) |
| wallet-picked | console | hydration error: `{" "}` whitespace in `<tbody aria-label="Loading…">` | removed stray JSX whitespace nodes (WalletLedgerTableCard) AND the `amount} {currency` text-node in PaymentsTableRows (the actual emitter) |
| wallet-picked (pass 2) | console | 8 stale entries | `.next-dev` Turbopack disk cache poisoned by a transient syntax error survived a server restart → cleared `.next-dev` (dev build artifact; not a protected lint cache) + fresh browser session |
| withdrawals-mobile etc. | offscreen | tab/indicator offenders at 390px | FALSE POSITIVE — elements clipped inside the scrollable tab strip (`overflow-x: auto`); page-level overflow PASS. Recorded; precheck heuristic lacks clipped-content exclusion |

## Fix waves

| Wave | Files | Findings addressed | Per-file sub-loop | Tests |
|---|---|---|---|---|
| 0 | AdminFinancesContainer.tsx | Tab strip overflow at 390px (scrollable) | ✅ | — |
| 0 | WalletLedgerTableCard.tsx, PaymentsTableRows.tsx | Hydration whitespace text node | ✅ | — |
| 1 | walletLedgerDisplay.ts, withdrawalStatusDisplay.ts | **[HIGH] status/type tone mappers switched on lowercase wire values while the wire sends capitalized enums → every status rendered error-red, every type primary-blue** | ✅ | component suites |
| 2 | WithdrawalQueueRows.tsx, WithdrawalQueueTableCard.tsx, WithdrawalQueuePanel.tsx | Reject buttons clipped (column 15→20% + compact buttons); Approve filled-primary / Reject outlined-error; ACTIONS header; ≥12px gap; nowrap; duplicate count heading removed | ✅ | component suites |
| 3 | DirectoryHeaderCell.tsx, DirectoryTableScaffold.tsx, PaymentsTableCard/Rows.tsx, WalletLedgerTableCard.tsx, WithdrawalQueueTableCard/Rows.tsx | `align` prop on header cells; money columns right-aligned; amounts weight 700; wallet rows compacted (`size="small"`), date column right-aligned | ✅ | — |
| 4 | PaymentsFilterBar/Selects/DateWindow.tsx + locale | Unified persistent shrunk labels on all 5 filters; "Filters" heading; uniform gaps; date-input theme font; displayEmpty for "" selects; search icon + placeholder | ✅ | parity |
| 5 | dialogFormAtoms.tsx, AdjustWalletFields.tsx | Outlined Cancel + nowrap; error-tinted disabled destructive submit; debit error tone on toggle; TEACHER overline; shrunk field labels | ✅ | — |
| 6 | WalletInspectorStates.tsx, WalletPickerHeader.tsx, WalletTransactionsTable.tsx, PaymentsFilterBar.tsx | Empty-state min-height + hint line; picker chevron restored (slotProps merge) + brightened; outlined type chips; mobile card padding + description layout; filter actions gap | ✅ | parity |
| 7 | locales (types/en/ar/parity) | `actionsHeader`, `filtersTitle`, `walletEmptyHint`, `studentSearchPlaceholder` | ✅ | 73 parity tests |

## Accepted cosmetic debt

| Item | Current score impact | Why it can't reach 10 | Why acceptable |
|---|---|---|---|
| AMOUNT header 3px letter-spacing offset (payments desktop) | — | uppercase `letter-spacing: 0.06em` adds trailing space to the glyph run; visually flush | rendering artifact of the shared header treatment, invisible at 1x |
| Ledger date format M/D/Y + 24h clock | — | shared app-wide `formatApplicantDate`; changing it touches every admin directory surface | consistent with the rest of the app; one Intl formatter to revisit app-wide later |
| Full-width tab strip with left-aligned tabs (tablet/desktop) | — | strip doubles as the table card header; standard MUI left-aligned Tabs | common admin-console pattern; no comprehension cost |
| Filters card ≈630px tall at 390px → first record below fold | — | 5-field filter form stacked single-column; collapsing filters would be a structural/UX redesign | vertical scroll is the platform convention on mobile |
| Missing dialog close (X) icon | — | Cancel + Escape + backdrop all dismiss | redundant affordance in a confirm dialog |
| Withdrawal amounts without currency code on mobile cards | — | currency is system-wide EGP; desktop shows a Currency column | locale/formatter change is app-wide, not finance-specific |
| Wallet-summary card gutter 18px vs 24px section rhythm | — | 8px-grid steps 2/3 both in play across the panel | within the theme spacing scale |

## Prototype comparison (prototype/ exists — compared, structure-only)

| Screen | Better | Still missing vs prototype | Decision |
|---|---|---|---|
| payments-audit-default-desktop | PROTOTYPE (structure 5/10) | KPI card row; tab badges; Payment ID + Subscription columns; student email/avatar; meta strip (ledger volume/audit status); Export Ledger | Spec amendment decision — these need NEW backend surfaces/queries (KPI aggregates, export). REQ-1's field list is fully rendered. **User decision required** |
| withdrawal-queue-default-desktop | PROTOTYPE (6/10) | Payout channel column; request ID + held-funds icon; batch approve; queue filters; teacher avatar/department; settlement footnote | Same — payout channels/batch approval are new capabilities (REQ-3 scope is fully implemented). **User decision required** |
| wallet-inspector-default-desktop | (inspector run completed the set) | comparable enrichment gaps | Same policy |
| wallet-adjust-dialog / withdrawal-reject-dialog / mobile variants | not separately compared | — | dialogs' structure followed spec's mutation contracts; scored READY on the loop |

The prototype was generated with invented enrichment (KPIs, channels, export, avatars) beyond the spec'd data surfaces. Per skill rule "spec wins", none were implemented silently; the deltas above are the menu for a future plan amendment.

## Capture lessons → evolution-log candidates

- Turbopack `.next-dev` disk cache poisons survive server restart after transient syntax errors — clear `.next-dev` (dev artifact, not a protected cache) → capture-protocol
- Browser session console buffer persists across navigations → stale console entries false-positive the gate; gate on a fresh session or after a verified-clean reload → capture-protocol
- Batch captures MUST re-verify the active tab + a content marker before every screenshot (two captures caught with the wrong tab's content) → capture-protocol
- `NEXT_LOCALE` cookie silently reverts after browser-session churn → re-pin + title-guard per capture → capture-protocol
- MUI Select: `renderValue` is NOT called for `value=""`; use `displayEmpty` → fix-patterns
- MUI Autocomplete: overriding `renderInput`'s `slotProps` wholesale drops the endAdornment (chevron) — merge `...params.slotProps` → fix-patterns
- MUI multiline outlined TextField + forced label shrink clips the notched label glyphs → don't force shrink on multiline; the un-shrunk label is the hint → fix-patterns
- Display mappers must switch on canonical CAPITALIZED wire enums (paymentStatusDisplay was correct; wallet/withdrawal mappers weren't) — unit tests fed lowercase values and masked the bug; test against wire-case values → fix-patterns / testing note

## Consciously not done

- Storybook stories for the finances panels (no stories existed; dev-server rig used per user brief)
- AR/RTL capture pass (deferred; locale parity tests cover the strings)
- Dark/light both-pass (app ships the dark navy theme)
- KPI/summary cards, export-ledger, payout channels, batch approval — prototype-only enrichment requiring new data surfaces → user decision
