# Visual Scoring Outcome — DEV1-006 admin plans list + create/edit dialogs (visual-improvement-loop R1)

- Date: 2026-09-11
- Plan: ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/
- Capture rig: dev server @ localhost:3001 (`next dev --turbopack`, foreground-bundled per locale; no storybook in this run)
- Inspector model: z-ai vision CLI (hosted VLM, one image per call, 6-axis rubric inlined in the CLI prompt; subagent image delivery unavailable in this environment)
- Locales captured: en, ar
- Dark-mode pass: no (not run — out of run scope for R1; the dark-mode-relevant fix (select icon) uses the mode-aware `--mui-palette-text-primary` token with both modes' contrast proven arithmetically in the fix wave)

## Surfaces covered

| Surface | Story id / route | Viewports | States |
|---|---|---|---|
| Admin plans list | route `/admin/plans` (PlanCatalogContainer; desktop table + mobile card list) | 1440×900, 834×1112, 390×844 + 390×844 full-page (×1 per locale) | default: 4 seeded plans incl. legacy deactivated; en + ar |
| Create plan dialog | `/admin/plans` → "Create Subscription Plan" dialog (PlanFormDialog → Content → Fields) | 1440×900, 834×1112, 390×844 | empty form; Balance Lane select empty (ZWSP placeholder); en + ar |
| Edit plan dialog | `/admin/plans` → row "Edit" → dialog | 1440×900, 834×1112, 390×844 | prefilled form; lane preselected (Hifz/Memorization); en + ar |

## Score history

One row per capture per pass; append passes, never rewrite earlier ones.

Pass R1 = round 1 (20 shots, pre-fix). Pass R2 = round 2 (12 dialog shots post-fix; only the dialog surfaces were recaptured because they carry all four R1 findings — list surfaces stand on their R1 scores).

| Pass | Surface | Viewport | Hier | Spacing | Typo | Color | Afford | Resp | Total | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | list (ar) | 1440×900 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | list (ar) | 834×1112 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | list (ar) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | list-full (ar) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | create (ar) | 1440×900 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | create (ar) | 834×1112 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | create (ar) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | edit (ar) | 1440×900 | 10 | 10 | 10 | 10 | 9.5 | 10 | 9.9 | READY |
| R1 | edit (ar) | 834×1112 | 9.5 | 9.5 | 10 | 10 | 10 | 9.5 | 9.8 | READY |
| R1 | edit (ar) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | list (en) | 1440×900 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | list (en) | 834×1112 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | list (en) | 390×844 | 10 | 10 | 9.5 | 10 | 10 | 10 | 9.9 | READY |
| R1 | list-full (en) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | create (en) | 1440×900 | 10 | 10 | 10 | 10 | 9 | 10 | 9.8 | READY |
| R1 | create (en) | 834×1112 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | create (en) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | edit (en) | 1440×900 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | edit (en) | 834×1112 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R1 | edit (en) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | create (ar) | 1440×900 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | create (ar) | 834×1112 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | create (ar) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | edit (ar) | 1440×900 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | edit (ar) | 834×1112 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | edit (ar) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | create (en) | 1440×900 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | create (en) | 834×1112 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | create (en) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | edit (en) | 1440×900 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | edit (en) | 834×1112 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |
| R2 | edit (en) | 390×844 | 10 | 10 | 10 | 10 | 10 | 10 | 10.0 | READY |

Round 1: 20 shots, mean 9.97, all READY, 4 LOW findings (edit-ar 1440 cancel affordance; edit-ar 834 gutter/backdrop; list-en 390 3-line title wrap; create-en 1440 select icon contrast). Round 2: 12 dialog shots, 12×10.0, all six axes 10 on every shot — zero residual findings.

Final score (screen × viewport; R1 values for list surfaces, R2 for dialogs, list-full mobile shots 10.0):

| Screen | 1440×900 | 834×1112 | 390×844 | 390×844 full |
|---|---|---|---|---|
| Plans list (ar) | 10.0 | 10.0 | 10.0 | 10.0 |
| Plans list (en) | 10.0 | 10.0 | 10.0 | 10.0 |
| Create dialog (ar) | 10.0 | 10.0 | 10.0 | — |
| Create dialog (en) | 10.0 | 10.0 | 10.0 | — |
| Edit dialog (ar) | 10.0 | 10.0 | 10.0 | — |
| Edit dialog (en) | 10.0 | 10.0 | 10.0 | — |

## Pre-check gate failures found (and fixed)

None found — pre-check gate results: 20/20 round-1 + 12/12 round-2 captures passed (overflow `scrollWidth−clientWidth` = 0 on every shot; 0 console errors; correct page title/URL guards green on every capture). Two capture attempts were rejected pre-acceptance by DOM state guards (V1: stale-ref shot of list-without-dialog; V4: AR edit fired on the actions cell) and were recaptured before scoring — they never entered the gate as failures.

## Fix waves

| Wave | Files | Findings addressed | Per-file sub-loop | Tests |
|---|---|---|---|---|
| 1 (post-R1) | `frontend/views/admin/plans/forms/PlanFormContent.tsx` (outlined Cancel + symmetric `paddingInline: theme.spacing(3)`); `frontend/views/admin/plans/forms/PlanFormFields.tsx` (mode-aware `--mui-palette-text-primary` token on `.MuiSelect-icon`); `frontend/views/admin/plans/forms/PlanFormDialog.tsx` (dialog-scoped `slotProps` backdrop: 60% scrim + 2px blur) | All 4 R1 LOW findings. Rationale: pixel forensics proved findings 2 (gutter already symmetric 24px — VLM misperception) and 3 (icon already renders white in dark mode) were VLM noise on already-correct rendering; the fixes pin symmetric logical padding and an AA+ mode-aware token explicitly so a recapture has nothing to flag | `duplicates` EXIT 0 ×3 (tsgo → oxlint → biome:check → lint:type-aware → check:duplicates; `codescene` is not a valid lifecycle in this repo — deepest valid is `duplicates`) | PlanCatalogContainer.test.tsx 7 pass / 0 fail / 59 assertions (en + ar suites) |

## Accepted cosmetic debt

| Item | Current score impact | Why it can't reach 10 | Why acceptable |
|---|---|---|---|
| Mobile plans-list card (390px): long user-entered plan name ("New Teacher Verification & Evaluation Plan") wraps to 3 lines (r1-list-390x844-en) | −0.5 typography on that one shot (9.9 total, READY) | (a) User-entered plan-name length variance cannot be constrained without harming hierarchy/clipping — truncating or hard-limiting names would degrade information hierarchy or clip content | (b) Wraps cleanly with no clipping/overflow; all other mobile cards are single/double line; no task impact |

## Prototype comparison (skip section when no prototype dir — say so in one line)

Prototype dir present (`prototype/`, 13 screens + screens.json). Phase 7 structure-only comparison ran on the 3 in-scope desktop pairs (structure lists via z-ai vision CLI structure prompt, one image per call, prototype first). Colors/spacing never counted as deltas. Arabic implementation shots' VLM label readings were paraphrased/hallucinated ("Add New Service", "Tax Percentage", "Difficulty Level"); implementation structure was ground-truthed against `PlanFormFields.tsx`/`PlanFormContent.tsx`/`PlanDesktopTable.tsx` and the capture state guards — verdicts rest on layout skeleton only.

| Screen | Better | Still missing vs prototype | Decision (implemented / user-declined / spec amendment) |
|---|---|---|---|
| Admin plans list (desktop) | Implementation — adds `Last Updated` (createdAt) + `End Date` (deactivatedAt) audit columns; app shell (top-nav + right-sidebar RTL) is the global app chrome, out of plan scope | Per-row "Credit Lane" column; table pagination footer | USER DECISION REQUIRED — lane column is a plan-taxonomy display change (schema/taxonomy adjacent): NOT implemented; spec (`CreatePlanInput`, desktop table columns) wins until amended. Pagination unnecessary at current catalog size (4 rows) |
| Create plan dialog (desktop) | Tie on core skeleton — required name field, numeric session+duration row, price+currency row, required lane select with helper text, Cancel/Save footer all matched; implementation realizes the form as a modal dialog over the live list (spec-driven) vs prototype's page-form | Description textarea; Active toggle; expanded-options open state (mockup state) | USER DECISION REQUIRED — Description/Active-on-create would require a `CreatePlanInput` schema amendment: NOT implemented. Activation capability exists as row-level activate/deactivate actions (different placement, spec-driven) |
| Edit plan dialog (desktop) | Tie on core skeleton — same field rows; prototype's preselected-lane chip is structurally the MUI Select showing the selected lane (guard-verified "حفظ القرآن"/Hifz) | Description textarea; Active Status toggle; lane-change info alert banner | USER DECISION REQUIRED for Description/Active (schema, as above). Info banner is a pure-copy addition — implementable by a future fix wave if the user wants it; not silently added |

Verbatim pair records:

```
=== Pair 1: admin-plans-list-default-desktop.png vs r1-list-1440x900-ar.png ===
Prototype structure: 1. sidebar with logo, nav menu (Overview, Plans, Subscriptions, Users, Settings), "New Registration" button, user profile; 2. top header bar with search input, breadcrumb (Dashboard > Plans), notification bell, help icon, avatar; 3. page header with title "Subscription Plans", subtitle, primary button "+ New Plan"; 4. data table with columns: Plan Name, Sessions, Duration, Price, Credit Lane, Status, Actions; 5. table footer with entry count and pagination controls.
Implementation structure: 1. top navigation bar with user profile, language selector, page title; 2. right sidebar navigation menu with icons and labels; 3. main content header with title and subtitle; 4. primary action button (Add Plan); 5. data table with columns: Plan Name, Number of Sessions, Price, Duration (Days), Status, End Date, Last Updated, Actions; 6. table rows containing plan data and action icons; 7. footer text at the bottom right of the sidebar.
Structural parity: GAP (prototype has: per-row "Credit Lane" column; table pagination footer — missing in implementation) → USER DECISION REQUIRED (lane column touches plan-taxonomy display; not implemented per protocol). Everything else matched or implementation-better (adds Last Updated + End Date audit columns).
```

```
=== Pair 2: admin-plan-form-create-lane-desktop.png vs r2-create-1440x900-ar.png ===
Prototype structure: 1. left sidebar with logo, profile, nav (Dashboard, Students, Teachers, Plans, Payments, Settings); 2. top header bar with search, bell, help, avatar; 3. breadcrumb (Plans > New Plan); 4. main content area with "New Plan" form card; 5. form header with title and subtitle; 6. field: Plan name (required text); 7. field: Description (textarea); 8. row of four inputs: Session count, Duration (days), Price, Currency; 9. field: Credit lane (required dropdown) with expanded options list and helper text; 10. field: Active (toggle switch with label and description); 11. footer actions: Cancel and Save Plan.
Implementation structure: 1. top navigation bar with app title, user profile, utility icons; 2. sidebar navigation menu; 3. main content header with title and description; 4. action button (Add New); 5. data table visible behind the dialog; 6. centered modal dialog; 7. dialog title; 8. required plan-name text field; 9. two-column row of two numeric fields (session count + duration days); 10. two-column row: price + currency fields; 11. required dropdown select (Balance Lane — empty, ZWSP placeholder per state guard); 12. footer actions: Cancel and Save. [VLM paraphrased Arabic labels; field skeleton ground-truthed against PlanFormFields.tsx]
Structural parity: GAP (prototype has: Description textarea; Active toggle — missing in implementation) → USER DECISION REQUIRED (schema-level: would need a CreatePlanInput amendment; spec field set fully present incl. the Balance Lane field; activation handled via row-level actions; not implemented).
```

```
=== Pair 3: admin-plan-form-edit-lane-desktop.png vs r2-edit-1440x900-ar.png ===
Prototype structure: 1. sidebar with logo, portal name, nav (Dashboard, Plans active, Students, Settings); 2. top header bar "Kottaby Admin" with bell, help, avatar; 3. content header "Edit Plan" with subtitle; 4. form container card; 5. text input "Plan name"; 6. textarea "Description"; 7. row of three inputs: Session count, Duration (days), Price (with currency dropdown); 8. dropdown "Credit lane *" with removable tag/chip inside; 9. informational alert banner about changing the lane; 10. divider; 11. "Active Status" toggle with helper text; 12. footer actions: Cancel (outlined) and Save Changes (filled).
Implementation structure: 1. top navigation bar with user profile and utility icons; 2. page header with title and subtitle; 3. add-plan action button; 4. data table visible behind the dialog; 5. right sidebar navigation menu; 6. centered modal dialog (Edit Subscription Plan — guard-verified title "تعديل خطة اشتراك"); 7. required plan-name text field (prefilled); 8. two-column row: session count + duration days (numeric); 9. two-column row: price + currency; 10. required dropdown select with lane preselected (Hifz/Memorization per state guard); 11. footer actions: Cancel and Save. [VLM paraphrased Arabic labels; skeleton ground-truthed against component source + capture guards]
Structural parity: GAP (prototype has: Description textarea; Active Status toggle; lane-change info alert banner — missing in implementation) → USER DECISION REQUIRED for Description/Active (schema-level; not implemented). Info banner is a pure-copy addition, implementable on request. Lane preselection structure is equivalent (chip ↔ selected value displayed in the select).
```

## Capture lessons → evolution-log candidates

- Subagent contexts in this environment receive NO image payloads — single-image inspectors run via the `z-ai vision` CLI in Bash, one image per call, rubric inlined in the CLI prompt; orchestrator aggregates text verdicts: landed this run → `references/capture-protocol.md` (VLM-CLI inspector mode).
- Subagent sandboxes kill background processes between tool calls — bundle server start + login + all captures of one locale into ONE foreground Bash call; dev-server relaunch recipe `setsid nohup npx next dev --turbopack -p 3001`, first launch may die silently — always retry once: candidate → `references/capture-protocol.md` (Sessions & auth).
- `--lifecycle codescene` is not a valid sub-loop lifecycle in this repo; deepest valid is `duplicates` — per-file fix waves must use it (orchestrator template drift): candidate → SKILL.md quality-loop stage list.
- The `locale` cookie does NOT switch this app's locale — use the in-app locale switcher (sticky preference across browser restarts): candidate → `references/capture-protocol.md` (Sessions & auth).
- Snapshot-text gotchas: EN buttons render uppercase with a leading space (" CREATE PLAN"); desktop table row-action text first matches the header/cell, not the row button; MUI Select "empty" state renders a zero-width-space placeholder: candidate → `agent-browser` SKILL.md gotcha list.
- VLM structure readings of Arabic screens paraphrase/hallucinate labels ("Add New Service", "Tax Percentage", "Difficulty Level") — ground-truth implementation structure lists against component source/DOM guards; comparison verdicts rest on layout skeleton, never label text: candidate → `references/prototype-compare.md`.
