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

### 2026-09-13 — parent-read-only-monitoring-portal pass 2 (pglite dev rig)
- Subagent single-image inspectors are flaky in sandboxed environments: 3/6 calls returned "images
  are not available in sub-agent context" on files other agents read fine. Fallback per the skill:
  VLM-CLI inspector mode (`z-ai vision -p <rubric> -i image`, ONE image per call); prototype
  comparisons work there with two `-i` args (prototype first). → landed: `references/capture-protocol.md`
  (Reading shots section, updated in this change).
- Inspector prompts must DECOUPLE "prototype structure delta" from the six scored axes. A rubric
  that left them coupled produced 6.5-8.5 verdicts dominated by out-of-scope redesign requests
  ("restore the audio player", "replace cards with a table") on a spec-driven implementation; the
  decoupled rubric scored the SAME pixels 9.2-10 with zero findings. → landed:
  `references/prototype-compare.md` + `references/rubric.md` (updated in this change).
- VLM digit-script claims ("mixed Arabic-Indic vs Latin numerals") are disprovable in one DOM eval:
  enumerate the digit codepoints over `main.textContent` and `new Set` them. Both claimed
  mixed-format findings were all-Latin hallucinations. → landed: `references/objective-prechecks.md`
  manual-eval fallback (updated in this change).
- "Toast overlaps the title" claims survive repeat passes as zombie findings; a single geometry
  probe (`.MuiSnackbar-root` rects vs header rect) killed it (no snackbar nodes existed at all).
  → landed: `references/fix-patterns.md` adjudication row (updated in this change).
- Sandbox rigs without a Postgres install: `DB_PROVIDER=pglite` + `PGLITE_DATA_DIR` run the FULL
  dev server + db/service/journey/UI suites green (the db CLI still demands a format-valid
  DATABASE_URL placeholder). Fixture data dirs copy freely between worktrees while unheld. → plan
  outcome only (repo-specific; not promoted to skill refs).

### 2026-09-13 — parent-read-only-monitoring-portal prod-rig cross-check (second independent run)
- Chromium withholds `SameSite=Strict` injected cookies from the FIRST top-level navigation (about:blank initiator); curl succeeds and the failure mimics a server auth bug. Inject `SameSite=Lax` in capture rigs, or warm the origin with one same-origin navigation before the guarded URL. → landed: `references/capture-protocol.md` (Production-build rig fallback).
- When a sandbox's dev server never hydrates (`__next_f` empty, React fiber absent, zero app-initiated fetches), `next build --experimental-build-mode compile` + `next start` is the fallback rig: hydration-correct, memory-stable, and immune to PGlite single-data-dir worker aborts. → landed: `references/capture-protocol.md`.
- Multi-shot harnesses must key login per credential pair (per-shot email/password keys); a per-invocation login captured the populated parent's state for the empty-state shot. → landed: `references/capture-protocol.md`.
