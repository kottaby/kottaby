# Evolution Log

This log is how the skill keeps improving after every run. Each visual-improvement loop ends by
appending its reusable lessons here; lessons then graduate to a permanent home in this skill's own
`references/` files or, optionally, `docs/<domain>/` — and the entry records where it landed.
AGENTS.md and `.agents/instructions/` files are hand-curated; runs NEVER update them.

## Append rules

- One entry per lesson, dated, with the plan/run that produced it.
- Record **where it landed** (or "candidate" until promoted). An entry without a home is a to-do.
- Only GENERAL invariants graduate into this skill's `references/` files or `docs/<domain>/`;
  AGENTS.md and `.agents/instructions/` are hand-curated and never promoted to. Feature specifics
  (entity names, routes, permission strings) stay in the plan's outcome file — never in this log's
  promoted form.
- When a lesson revises an existing reference, update that reference in the same change and say so here.

## Entries

### 2026-08-30 — credit-adjustment-system (skill created from this run)

- `screenshot --full` resets interaction-driven client state on SPA pages with scroll containers —
  prefer viewport shot + `scrollIntoView`; verify DOM state after. → landed: `agent-browser` SKILL.md gotcha 0; `references/capture-protocol.md`.
- Auth expiry silently turns every later capture into a login-page screenshot — `document.title`
  guard is mandatory per capture, re-login via `browser-login.ts --inject` on bounce. → landed: `agent-browser` SKILL.md gotcha 0b; `references/capture-protocol.md`.
- Batched `ReadMediaFile` (multi-megabyte vision payloads) kills the upstream stream — one image per
  inspector subagent; comparator is the single two-image exception. → landed: SKILL.md golden rule 1.
- Prototype color comparison misleads (arbitrary Tailwind values) — structure-only comparison; spec
  wins conflicts. → landed: SKILL.md golden rule 3; `references/prototype-compare.md`.
- Parallel fix waves clobber each other without disjoint file ownership; shared-tree workstreams must
  never be reverted — assign non-overlapping file sets, record (don't fix) foreign pre-existing
  failures. → landed: SKILL.md golden rule 5.
- Re-inspections waste effort re-reporting already-fixed items — pass the prior findings list into
  re-inspection prompts so inspectors confirm-or-contradict. → landed: `references/rubric.md`.
- Inspectors spent effort on mechanical defects a script detects (console errors, overflow, wrong
  page) — objective pre-check gate before scoring. → landed: `references/objective-prechecks.md`, `scripts/visual-precheck.sh`, SKILL.md Phase 3/4.
- RTL/Arabic captures had no scoring criteria. → landed: `references/rubric.md` RTL checklist.
- Fix waves rediscovered the same recipes per finding. → landed: `references/fix-patterns.md`.
- Free-form outcome files made scores non-comparable. → landed: `references/outcome-template.md`.

### 2026-09-11 — subscription-purchase-payment-gateway (visual-improvement-loop R1)

- Subagent contexts in the current environment do NOT receive image payloads — single-image inspectors
  must run via the `z-ai vision` CLI in Bash, one image per call, with the rubric inlined in the CLI
  prompt; the orchestrator aggregates text verdicts. → landed: `references/capture-protocol.md`
  (VLM-CLI inspector mode note under "Reading shots", updated in this change).
- Subagent sandboxes kill background processes between tool calls — bundle server start + login + all
  captures of one locale into ONE foreground Bash call (server relaunch recipe: `setsid nohup npx
  next dev --turbopack -p 3001`; first launch may die silently — always retry once). → candidate:
  `references/capture-protocol.md` (Sessions & auth).
- `--lifecycle codescene` is not a valid sub-loop lifecycle in this repo; deepest valid stage is
  `duplicates` — per-file fix waves must use it (orchestrator template drift). → candidate: SKILL.md
  quality-loop stage list.
- The `locale` cookie does NOT switch this app's locale — use the in-app locale switcher (preference
  is sticky across browser restarts). → candidate: `references/capture-protocol.md` (Sessions & auth).
- Snapshot-text gotchas: EN buttons render uppercase with a leading space (" CREATE PLAN"); desktop
  table row-action text first matches the header/cell, not the row button; MUI Select "empty" state
  renders a zero-width-space placeholder. → candidate: `references/capture-protocol.md` snapshot-text gotchas.
- VLM structure readings of Arabic screens paraphrase/hallucinate labels ("Add New Service", "Tax
  Percentage", "Difficulty Level") — ground-truth implementation structure lists against component
  source/DOM state guards; comparison verdicts rest on the layout skeleton, never label text. →
  candidate: `references/prototype-compare.md`.
- Fix-wave recipes from this run promoted to the playbook: bare-text dialog cancel → outlined variant;
  asymmetric dialog gutter → logical `paddingInline` token spacing; low-contrast select icon →
  mode-aware text token on `.MuiSelect-icon`; weak dialog isolation → scoped `slotProps` backdrop
  scrim+blur. → landed: `references/fix-patterns.md` (4 new rows, updated in this change).

### 2026-09-13 — paymob-gateway-integration (visual-improvement-loop R1: 41 captures, 3 pages, EN+AR)

- Snapshot refs emit as `[ref=eN]` (not `@eN`) in this agent-browser version — `grep -o '@e[0-9]*'`
  never matches; extract `ref=e[0-9]+` and re-prefix `@`. → landed: `references/capture-protocol.md`
  (Version & environment gotchas, updated in this change).
- Console dump is cumulative per session — clear (`console --clear`) after each navigation so the
  pre-check gate judges only the current page. → landed: `references/capture-protocol.md` (same section).
- Back-to-back agent-browser calls inside `$(...)` race (empty snapshots) — retry loops gated on DOM
  state markers. → landed: `references/capture-protocol.md` (same section).
- Storybook iframes lack `next/font` variables — Arabic renders in fallback fonts; Arabic
  shaping/tracking findings are capture artifacts unless computed styles confirm. → landed:
  `references/capture-protocol.md` (same section).
- VLM inspectors hallucinate Arabic labels and estimate sizes/alignment DOM disproves (alert
  "centering", 40px buttons that measure 44, date bidi order, invented strings like "عرض الشكاوى") —
  arbitrate disputed findings with `agent-browser eval` ground truth before acting; a DOM-disproven
  finding is dismissed, not accepted debt. → landed: `references/rubric.md` (DOM arbitration rule,
  updated in this change).
- Story fixture state-machines can make arms unreachable: unverified-pending rows render the derived
  failed presentation, so the amber pending chip never appeared in any capture — assert each arm's
  UNIQUE state marker when capturing. → landed: `references/storybook-protocol.md` (per-arm state
  markers, updated in this change). Feature specifics in the plan outcome.
- MUI breakpoint objects are min-width: `sm` grid overrides leak into `lg`+ — reset at the next
  breakpoint. → landed: `references/fix-patterns.md` (grid reflow row, updated in this change).
- Centered-branch `minHeight` calc must match the page's actual chrome (heading vs no-heading pages
  differ); one-size calcs re-create top-anchoring. → landed: `references/fix-patterns.md`.
- `--lifecycle codescene` drift (flagged 2026-09-11) — promoted the fix: SKILL.md now says
  `--lifecycle duplicates`. → landed: SKILL.md Phase 5 + golden rule 4 wording (updated in this change).
- Subagent image delivery WORKS in the current environment (Explore agents render screenshots) —
  supersedes the 2026-09-11 VLM-CLI note; single-image-per-subagent remains the rule. → landed:
  `references/capture-protocol.md` (Reading shots note, updated in this change).
### 2026-09-13 — subscription-validity-window-expiry (visual-improvement-loop run)

- Sandbox tool-runners kill background dev servers between tool calls, AND a server that was started
  before file edits keeps serving the stale module graph (HMR churn = phantom console errors + stale
  titles after edits). Kill + fresh-start the server before every post-edit capture round; bundle
  server-start + captures into one foreground call. → landed: `references/capture-protocol.md`
  (Sessions & auth, updated in this change).
- The precheck console sweep accumulated session-wide buffer entries across captures (constant phantom
  FAIL on every shot). → landed: `scripts/visual-precheck.sh` now `console --clear` per navigation;
  `references/objective-prechecks.md` note (updated in this change).
- Off-viewport bleed check false-positived on decorative gradients clipped by `overflow:hidden`
  ancestors. → landed: `scripts/visual-precheck.sh` skips ancestor-clipped offenders;
  `references/objective-prechecks.md` check #4 (updated in this change).
- VLM sub-8px alignment/spacing claims are unreliable: across 3 passes, three DIFFERENT icon-offset
  directions, contradicting center/void positionings, and two "misaligned footer" claims — every one
  disproven by DOM `getBoundingClientRect` (deltas 0-2px or token-exact). Pixel-verify before fixing;
  contradictory findings = noise signature. → landed: `references/fix-patterns.md` watch-out row
  (updated in this change); protocol note in `references/capture-protocol.md`.
- VLM integer-granularity totals plateau ≈9.0-9.2 on defect-free surfaces; the 9.5 READY bar is
  reachable only via the rubric's accepted-debt clause with pixel-verified adjudication. → noted in
  `references/rubric.md` (updated in this change).
- Repo db CLIs parse their own `--env-file` (must come AFTER the script path; `bun --env-file` itself
  is consumed by bun). Fresh sandboxes need `cp .env.test.ci .env.test`. → plan outcome only
  (repo-specific; not promoted to skill refs).
