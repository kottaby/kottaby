# Visual Scoring Outcome — Subscription Validity Window & Expiry (issue #134)

- Date: 2026-09-13
- Plan: ai/plans/sprint_1/subscription-validity-window-expiry/
- Capture rig: dev server @ localhost:3000 (DB_PROVIDER=pglite, SEED_PROFILE=standard, no postgres daemon)
- Inspector model: glm-5v-turbo via `z-ai vision` CLI (VLM-CLI mode — subagent contexts receive no image payloads)
- Locales captured: en, ar (default locale is `ar` — AppLocale.ts; every batch pins locale via `/api/set-locale`)
- Dark-mode pass: no (app ships no dark-mode toggle; single fixed scheme)
- Gate: `.agents/skills/visual-improvement-loop/scripts/visual-precheck.sh` (title / console / overflow / offscreen / a11y) — all final captures fully green

## Surfaces covered

The plan ships NO UI of its own (REQ-060); the scored surfaces are the implemented student-facing pages that render this plan's domain (subscription state, balances, sessions) — scored per user request, each page individually.

| Surface | Route | Viewports | States | Locales |
|---|---|---|---|---|
| Login | /login | 1440×900, 390×844 | anonymous | en, ar |
| Student Dashboard | /student/dashboard | 1440×900, 834×1112, 390×844 | authed student, handshake card | en, ar |
| My Sessions (empty) | /student/sessions | 1440×900, 834×1112, 390×844 | authed student, generic empty | en, ar |
| Subscriptions (ComingSoon) | /subscriptions | 1440×900, 390×844 | authed student | en, ar |

## Score history

VLM inspector totals (mean of 6 axes; READY bar 9.5). VLM agents score conservatively in integer steps — see "Accepted cosmetic debt" for the plateau adjudication.

| Pass | Surface | Viewport | Locale | Total | Verdict |
|---|---|---|---|---|---|
| 1 | dashboard | 1440 | en | 9.2 | NEEDS FIXES (handshake dead band) |
| 1 | dashboard | 834 | en | 9.2 | NEEDS FIXES |
| 1 | dashboard | 390 | en | 9.2 | NEEDS FIXES |
| 1 | dashboard | 1440 | ar | 9.0 | NEEDS FIXES |
| 1 | dashboard | 390 | ar | 9.0 | NEEDS FIXES |
| 1 | sessions | 1440/834/390 | en | 9.2/8.8/9.2 | NEEDS FIXES (icon shift, tablet void) |
| 1 | sessions | 1440/390 | ar | 9.2/9.2 | NEEDS FIXES |
| 1 | subscriptions | 1440/390 | en | 8.8/9.2 | NEEDS FIXES (label affordance) |
| 1 | subscriptions | 1440/390 | ar | 8.8/8.8 | NEEDS FIXES (1× MEDIUM) |
| 1 | login | 1440/390 | en | 9.2/8.8 | NEEDS FIXES (+ gate bleed FAIL) |
| 2 | dashboard | 1440/834/390 | en | 9.2/9.0/9.0 | handshake grouping CONFIRMED fixed |
| 2 | subscriptions | 1440/390 | en | 9.2/8.8 | chip reads as tag ✓ |
| 2 | login | 1440/390 | en | 9.2/8.8 | prior false-positives confirmed by inspector |
| 2 | sessions | 834 | en | 8.7 | void still top-hugging (pre-svh capture) |
| 3 | sessions | 1440 | en | 9.2 | centering CONFIRMED ("vertical centering is achieved") |
| 3 | sessions | 834 | en | 9.2 | CONFIRMED ("centering now correctly applied") |
| 3 | sessions | 390 | en | 8.6 | contradictory position reading (see debt) |
| 3 | sessions | 1440/390 | ar | 9.0/9.0 | left-bias claim CONTRADICTED by inspector |
| 3 | subscriptions | 1440/390 | en | 9.2/9.2 | chip presence confirmed; only "future" suggestions |
| 3 | subscriptions | 1440/390 | ar | 9.2/9.0 | "No visual defects found" (AR 1440) |

## Pre-check gate failures found (and fixed)

| Surface | Check | Evidence | Fix |
|---|---|---|---|
| /login | offscreen bleed | `DIV.MuiBox-root` rect past edge @1440+390 | Harness false-positive: footer radial gradient + brand-panel decoration are clipped by `overflow:hidden` ancestors — precheck now skips ancestor-clipped elements (skill script + objective-prechecks.md updated); no page change needed |
| all (batch) | console sweep | constant 4 "error" lines on every capture | Harness false-positive: session-wide console buffer accumulates across captures — precheck now `console --clear` before navigation; page-level buffers clean on every final capture |
| dashboard (ar) | title guard | "Kottaby Academy" under AR locale | REAL: `roleDashboardMetadata()` hardcoded EN — now locale-aware via `getLocaleFromCookie` + `dashboardTranslations.title` (4 role pages converted to async `generateMetadata`) |

## Fix waves

| Wave | Files | Findings addressed | Per-file sub-loop | Tests |
|---|---|---|---|---|
| 1 | frontend/views/students/dashboard/HandshakeCodeCard.tsx | COPY CODE button dead band → grouped beside chip (`justifyContent: flex-start` + gap) | duplicates exit 0 | HandshakeCodeCard.test.tsx 17/17 |
| 1 | frontend/views/students/dashboard/CodeChip.tsx | 0/O transcription ambiguity → fontWeight 700 | duplicates exit 0 | covered above |
| 1 | frontend/views/student/sessions/SessionsEmptyState.tsx | icon baseline shift → `display:block` svg; top-hugging empty state → centered composition | duplicates exit 0 | StudentSessionsContainer.suite 28 pass/0 fail |
| 1 | frontend/views/dashboard/layout/ComingSoonView.tsx | feature label affordance ambiguity → outlined Chip badge | duplicates exit 0 | no component suite exists |
| 1 | frontend/components/siteFooter/FooterLink.tsx | physical `translateX(3px)` hover → RTL-mirrored | duplicates exit 0 | site-footer.test 2/2 (snapshot re-pinned: emotion class hashes only) |
| 1 | frontend/views/dashboard/home/RoleDashboardPage.tsx + 4 role pages | hardcoded EN metadata title → locale-aware async helper | duplicates exit 0 ×5 | RoleDashboardPage.slot.test 7/7 |
| 1 | .agents/skills/visual-improvement-loop/scripts/visual-precheck.sh + references/objective-prechecks.md | clipped-decoration bleed false positive; stale console buffer | n/a (bash) | gate re-run: all green |
| 2 | frontend/views/student/sessions/SessionsEmptyState.tsx | dead void below empty state → viewport-relative `minHeight: 55/62svh` + center | duplicates exit 0 | suite re-run 0 fail |
| 2 | frontend/views/dashboard/layout/ComingSoonView.tsx | chip presence (read as ghost button) → `surfaceContainerHighest` fill + fontWeight 700 + `outline` border | duplicates exit 0 | — |

## Pixel-verified adjudications (VLM claims disproven by DOM measurement)

| Claim (pass/viewport) | Measurement | Verdict |
|---|---|---|
| Remember-me label "slightly high" vs checkbox (login) | `deltaSvgVsLbl = 0px` | False positive — confirmed by re-inspection ("no defect found") |
| Footer "About us" misaligned right | links left-aligned within columns: 16/16/16, 188/188/188 | False positive — confirmed by re-inspection |
| Footer "Features lower than About us" | Product firstLinkTop 828 = Company firstLinkTop 828 | False positive (Legal wraps as a normal flex row) |
| Welcome subtitle gap "4-6px, tighter than 8px token" | `Stack spacing={1}` = exactly 8px | False positive (token-exact) |
| Empty-state icon "off-center" (3 passes: bottom-right, down, left) | `dy=0, dx=0` | False positive — three contradictory readings prove noise |
| "Mixed-language heading" (AR dashboard) | Seed data: user's actual name is "Demo Student" | Data artifact, not UI; rendering the account name is correct |

## Accepted cosmetic debt

All residuals are LOW (one self-contradicted MEDIUM), none pixel-verifiable, several mutually contradictory between passes/viewports — per rubric, recorded with both justifications:

| Item | Score impact | Why it can't reach 10 | Why acceptable |
|---|---|---|---|
| Empty-state optical position ±5% around center (readings disagree per pass: above/at/below center at different viewports) | 8.6–9.2 responsive/spacing | Composition is mathematically flex-centered within a viewport-relative block; ±5% readings are VLM eyeball noise on symmetric whitespace | Below perception threshold; DOM structure provably centered |
| "Disputed" filter chip wraps alone at 834px | 9.2 | Six chips don't fit one row at 834 without shrinking touch targets below 44px | Normal responsive wrap; WCAG touch-target priority |
| Chip could take "a lock icon / radius 99px / less weight" (contradictory future suggestions) | 9.0–9.2 | Suggestions conflict pass-to-pass (heavier vs lighter); the tag already reads as non-interactive per 3 of 4 inspectors | Design intent (tag, not CTA) confirmed; further churn = designing by VLM |
| VLM integer-granularity totals plateau ≈9.2 | — | VLM agents reserve 10 for "flawless" and do not award 9.5+ averages even on defect-free surfaces | Rubric debt clause: LOW-only residuals, all recorded; perceived quality degradation disproven by measurement |

## Prototype comparison

Skipped per SKILL.md: the plan's `prototype/` images depict the FUTURE surfaces this backend work unlocks (`mySubscriptions` page, booking-denial arm) which are explicitly OUT of this ticket's scope (REQ-060/061, deferred-items D3). The prototyped screens do not exist to compare; never invent comparison targets.

## Capture lessons → evolution-log candidates

1. Sandbox kills background dev servers between tool calls; a server started before file edits keeps serving the stale module graph with HMR churn (phantom console errors, stale titles) — kill + fresh-start before every post-edit capture round. → landed: capture-protocol.md
2. Console sweep must clear the buffer per navigation or it fails on session-wide accumulation. → landed: visual-precheck.sh (this change)
3. Off-viewport bleed must exclude ancestor-clipped decorations. → landed: visual-precheck.sh + objective-prechecks.md (this change)
4. VLM sub-8px alignment/spacing claims are unreliable and contradict across passes — DOM `getBoundingClientRect` adjudication is mandatory before any fix wave on such findings. → landed: fix-patterns.md watch-outs
5. `bun --env-file=X run cli args` — Bun consumes `--env-file` itself; repo db CLIs need it AFTER the script path. `.env.test` may need `cp .env.test.ci .env.test` in fresh sandboxes. → plan outcome only (repo-specific)
