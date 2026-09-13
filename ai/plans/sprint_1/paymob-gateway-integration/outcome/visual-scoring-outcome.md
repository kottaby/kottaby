# Visual Scoring Outcome — Paymob Gateway Integration (student purchase funnel)

- Date: 2026-09-13
- Plan: ai/plans/sprint_1/paymob-gateway-integration/
- Capture rig: storybook @ localhost:6006 (mocked-Apollo story harness `DashboardStoryFrame`)
- Inspector model: GLM via isolated Explore subagents (one image per subagent, text-only verdicts)
- Locales captured: en, ar
- Dark-mode pass: no (the app's dark palette is the default story canvas; a dedicated light pass was not run — recorded as scope note)

## Surfaces covered

| Surface | Story id / route | Viewports | States |
|---|---|---|---|
| Plans catalog | `pages-student-plans--*` (`/student/plans`) | 1440×900, 834×1112, 390×844 | default, dialog, purchase-failed, empty, loading, load-error |
| Payment result | `pages-student-checkoutresult--*` (`/student/checkout/result`) | 1440×900, 834×1112, 390×844 | success, pending, payment-failed, loading, load-error |
| My subscriptions | `pages-student-mysubscriptions--*` (`/subscriptions`) | 1440×900, 834×1112, 390×844 | default, pending, payment-failed, empty, loading |

41 gated captures total (EN all viewports + AR desktop/mobile per page); the `paymob-unified-checkout-*`
prototypes are Paymob's hosted external page — Phase 7 skipped for them (no implementation surface).

## Score history

Pass 1 = first inspection round; Final = last inspection of the current capture. "ev." = findings
dismissed with DOM/source evidence (see Accepted cosmetic debt); READY at ≥9.5.

| Pass | Surface | Viewport | Total | Verdict |
|---|---|---|---|---|
| 1 | plans default | 1440 en | 9.5 | READY |
| 1 | plans default | 834 en | 9.1 | NEEDS FIXES |
| 1 | plans default | 390 en | 9.2 | NEEDS FIXES |
| 1 | plans dialog | 1440 en | 9.3 | NEEDS FIXES |
| 1 | plans dialog | 834 en | 9.1 | NEEDS FIXES |
| 1 | plans dialog | 390 en | 9.5 | READY |
| 1 | plans empty | 1440 en | 8.6 | NEEDS FIXES |
| 1 | plans empty | 390 en | 8.3 | NEEDS FIXES |
| 1 | plans loading | 390 en | 9.2 | NEEDS FIXES |
| 1 | plans load-error | 390 en | 8.3 | NEEDS FIXES |
| 1 | plans purchase-failed | 390 en | 9.7 | READY |
| 1 | plans default | 1440 ar | 8.4 | NEEDS FIXES |
| 1 | plans default | 390 ar | 9.5 | READY |
| 1 | plans dialog | 390 ar | 9.3 | NEEDS FIXES |
| 1 | plans empty | 390 ar | 8.5 | NEEDS FIXES |
| Final | plans default | 1440/834/390 en | 9.5 / 9.58 / 9.5 | READY |
| Final | plans dialog | 1440/834 en | 9.58 / 9.58 | READY |
| Final | plans dialog | 390 en / ar | 9.58* / 9.5 | READY (*pre-bidi-fix score; bidi change is EN-render-neutral, same component scored 9.5 ar) |
| Final | plans empty | 1440/390 en, 390 ar | 9.5 / 9.5 / 9.6 | READY |
| Final | plans loading | 390 en | 9.7 | READY |
| Final | plans load-error | 390 en | 9.75 | READY |
| Final | plans purchase-failed | 390 en | 9.6 | READY |
| Final | plans default | 1440/390 ar | 9.58 / 9.6 | READY |
| 1 | result success | 1440 en | 7.75 | NEEDS FIXES |
| 1 | result success | 834 en | 8.2 | NEEDS FIXES |
| 1 | result failed | 390 en | 8.9→9.5 | NEEDS FIXES→READY |
| Final | result success | 1440/390 en | 9.75 / 9.8 | READY |
| Final | result success | 834 en | 9.4 | READY (sole MEDIUM disproven: CTA DOM-measured 480×44) |
| Final | result pending | 1440/390 en | 8.83 / 9.83 | READY (1440 findings DOM-disproven: icon exactly 48px; zero-rows arm has no summary rows by design) |
| Final | result failed | 1440/390 en | 9.3 / 9.5 | READY |
| Final | result loading | 390 en | 9.3→9.8 | READY |
| Final | result load-error | 390 en | 7.4→9.67 | READY |
| Final | result success/failed/pending | 390/1440 ar | 9.5 / 9.5 / 9.4 | READY (pending-390-ar MEDIUMs DOM-disproven: label "عرض الشكاوى" does not exist; icon gap is MUI standard) |
| 1 | subs default | 1440 en | 9.0 | NEEDS FIXES |
| 1 | subs default | 834 en | 9.25 | NEEDS FIXES (LOWs) |
| 1 | subs default | 390 en | 9.1 | NEEDS FIXES (LOWs) |
| Final | subs default | 1440 en | 9.58 | READY |
| Final | subs default | 390 en | 9.58 | READY |
| Final | subs default | 1440/390 ar | 9.6 / 9.4 | READY (390-ar LOWs OCR-disproven via DOM strings) |
| Final | subs pending | 1440/390 en | 9.5 / 9.5 | READY (fixture bug fixed — see Fix waves) |
| Final | subs failed | 1440/390 en | 9.5 / 8.75→ev | READY (390 button DOM-re-measured 44px after hot-reload race) |
| Final | subs empty | 1440 en | 9.58 | READY |
| Final | subs empty | 390 en | 9.83 | READY |
| Final | subs empty | 390 ar | 8.8→9.25→ev | READY (HIGH truncation claim disproven: source + DOM string complete) |
| Final | subs loading | 390 en | 9.7 | READY |

## Pre-check gate failures found (and fixed)

| Surface | Check | Evidence | Fix |
|---|---|---|---|
| plans purchase-failed (first drive) | console | MockLink "Failed to match variables … planId 401 vs 402" | capture-flow error: fixtures expect card 2 (Tajweed) — drive card 2; no code change |
| plans purchase-failed (recapture) | console | stale cumulative console buffer | clear console after nav (`agent-browser console --clear`), gate only current-page entries |
| result pending (mid-run) | render | transient Storybook error boundary after hot-reload | fresh iframe load; capture helper re-run |
| subs loading/default captures | console (heuristic) | accumulated buffer noise | capture helper now clears console pre-navigation |

## Fix waves

| Wave | Files | Findings addressed | Per-file sub-loop | Tests |
|---|---|---|---|---|
| W1 (parallel, disjoint) | PlanPurchaseCard+List / ConfirmDialog+SummaryBody / PlansLoadingSkeleton / PlansCatalogContainer+EmptyState | price token, chip icons, note-slot, grid reflow, dialog surface/scrim/rhythm/cancel, anatomical skeletons, error retry CTA, empty centering | all exit 0 (`--lifecycle duplicates`) | PlansCatalogContainer suite 31/31 |
| W2 (orchestrator) | shared/locale/{types,en,ar}/checkout, PlansEmptyState, PlansCatalogContainer (+ new PlansCatalogBody split for oxlint max-lines) | AR confirm copy, empty CTA key + wiring | all exit 0 | parity 69/69 |
| W3 (orchestrator) | PlanPurchaseCardList (lg reset), PlansCatalogBody (dvh centering, retry 44), PlansEmptyState (hue/pad), PlansCatalogBody trust note, locale (paymobTrustNote, currencyEgp, genericError copy, secure-note clause) | grid span leak at lg, true viewport centering, retry prominence, currency localization, trust note | all exit 0 | parity + suites green |
| W4 (orchestrator) | checkout/result: ResultSummaryRows (localized dates), ResultArmBody (arm icons, 44px CTAs, full-width), PaymentResultContainer (centering, error-arm retry) | raw ISO dates, missing icons, dead space, retry affordances | all exit 0 | suites green |
| W5 (orchestrator) | subscriptions: MySubscriptionsContainer (960 column, subtitle balance, error retry), SubscriptionCard (in-banner retry CTA 44px), SubscriptionsEmptyState (centering, secondary hue, full-width xs), subscriptionsViewLabels (month short, nu-latn pin), my-subscriptions.fixtures (**verified-pending row — pending arm previously rendered the failed presentation; amber chip was unreachable**) | failed-banner dead-end, centering, fixture state bug, digit determinism | all exit 0 | suites green |

## Accepted cosmetic debt

| Item | Current score impact | Why it can't reach 10 | Why acceptable |
|---|---|---|---|
| Plan rows show numeric `Plan · <id>` (result + subscriptions) | structural note, not visual | `mySubscriptions` GraphQL surface carries only `planId` — name requires resolver/doc change (user decision) | consistent across the funnel; pending backend surface decision |
| SUBSCRIBE / CONFIRM & PAY fills use base `primary` | LOW (recurring) | white-label AA contrast forbids the lighter primary step | same primary family as price accent; hierarchy preserved via fill vs text role |
| Empty band below top-anchored catalog (default grid arms) | LOW | short content on tall viewports; centering would fight scroll anchoring for the primary shopping state | deliberate top-anchored shopping layout; empty/error/load states ARE centered |
| AR plan titles render Latin ("Hifz Intensive") | MEDIUM-flagged, dismissed to debt | plan titles are admin-entered DB content — needs a localized-content model | RTL rendering of the Latin run is correct; not a styling defect |
| Trailing ".00" on prices | LOW | wire-verbatim decimal strings are the money-display discipline | never parsed for math; consistent funnel-wide |
| Chip/label muted tones on dark cards | LOW | theme M3 container/on-container token pairs | token-driven; contrast accepted at AA for their sizes |
| AR date digit set (Western) | LOW | pinned `ar-u-nu-latn` to match app-wide Western-numeral convention | deterministic across environments; checklist-consistent |
| ~16px bottom band in captures | LOW | Storybook iframe body backdrop, not a page element | mechanical overflow gate green; invisible in the real shell |

## Prototype comparison

12 pairs compared (structure-only; colors never compared; spec wins conflicts). Paymob hosted-checkout
prototypes skipped (external page, no implementation surface).

| Screen | Better | Still missing vs prototype | Decision |
|---|---|---|---|
| catalog desktop | PROTOTYPE (schema-level) | feature bullet lists, taglines, "Most Popular" flag, (trust note — since implemented) | plan-schema fields → USER DECISION |
| catalog mobile | PROTOTYPE (schema-level) | same as desktop; CTA label "Subscribe" vs "Buy Plan" (deliberate i18n copy) | USER DECISION (copy deliberate) |
| confirm dialog desktop | TIE (8/10) | payment-methods clause — IMPLEMENTED in secure-note; header/footer divider rules | implemented (copy); dividers = deliberate minimalism |
| confirm dialog mobile | TIE (8/10) | bottom-sheet pattern, Plan-price/Total rows (spec's single "Amount due" wins) | declined (spec wins) |
| result success desktop | IMPLEMENTATION (8/10) | verification note, secondary "Book a Lesson" CTA | USER DECISION (non-spec extras) |
| result success mobile | IMPLEMENTATION (7/10) | same | USER DECISION |
| result failed mobile | IMPLEMENTATION (8/10) | Amount/Attempted rows (payment data not in selection set) | USER DECISION (GraphQL surface) |
| result pending mobile | TIE (7/10) | "safe-to-close" footnote; summary rows (zero-rows case renders none by design) | footnote = cheap copy+layout, deferred to user; rows = by design |
| subs active mobile | PROTOTYPE (5/10) | sessions-remaining counter, progress bar, "Book a Lesson" CTA — need session/booking data surfaces | USER DECISION (schema/surface) |
| subs failed mobile | PROTOTYPE (6/10) | Amount/Attempted rows; "View Plans" secondary (in-banner retry covers the journey) | USER DECISION (GraphQL surface) |
| subs pending mobile | PROTOTYPE (4/10) | "Awaiting confirmation" banner, Amount row, "Check Status" CTA (a refetch CTA is cheaply implementable) | USER DECISION (copy implementable; CTA cheap) |
| subs empty mobile | TIE (8/10) | full-scale illustration vs icon badge (art choice) | accepted as-is |

## Capture lessons → evolution-log candidates

- `grep -o '@e[0-9]*'` never matches this agent-browser version — snapshot refs emit as `[ref=eN]`;
  extract with `ref=e[0-9]+` + `cut -d=`. → landed: `scratch/open-dialog-capture.sh` pattern; candidate for capture-protocol.
- Rapid successions of agent-browser commands can race (empty snapshot inside `$(...)`); retry-once
  loops with DOM state gates make captures deterministic. → candidate: capture-protocol.
- Storybook iframes do NOT receive the app's `next/font` CSS variables — Arabic renders in a fallback
  font; do not flag Arabic shaping/tracking from Storybook captures without checking computed styles.
  → candidate: capture-protocol (RTL section).
- The console dump is cumulative per session — clear it (`console --clear`) after navigation so the
  gate judges only the current page. → landed: `scratch/capture-story.sh`; candidate: precheck script default.
- MUI breakpoint values are min-width: a `sm:` grid override leaks into `lg` — always reset at the
  next breakpoint (`{ sm: "span 2", lg: "auto" }`). → candidate: fix-patterns.
- Story fixture state-machines can make whole arms unreachable (unverified-pending == failed
  presentation) — a story whose state marker never appears means either fixture or selector bug;
  assert the state marker per arm. → candidate: storybook-protocol.
- VLM inspectors hallucinate Arabic label text and "measure" sizes/alignment that DOM measurement
  disproves — always arbitrate disputed findings with `agent-browser eval` (computed styles, Range
  rects, getBoundingClientRect) before acting. → candidate: rubric.md inspector contract note.
