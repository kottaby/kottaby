# Wave C (review-frontend) — Round 4 (confirmation round)

**Reviewer**: independent agent | **Date**: 2026-08-29 | **Scope**: R3 MINOR fix verification (focus-visible rings) + 10-item checklist re-run at HEAD + full interactive-element enumeration

Branch `feat/dev3-010-real-time-notification-engine-websocket` (checked out, verified via `git branch --show-current`; HEAD = `9d25fcc`, the round-3 triage commit). The frontend delta of `9d25fcc` was read in full via `git show 9d25fcc -- frontend/`: it is exactly the ring fix — one `focusVisibleRingSx` import (+ a one-line audit-R4 comment) and sx spreads in the 6 files; **zero MUI prop changes, zero logic changes, zero non-sx edits**. The commit's other deltas (backend `notification-ws-server.ts`/test + the four R3 reports) are outside Wave C scope and were verified by Wave A/B/D.

## R3-F1 MINOR Fix Verification (focus-visible rings on 14 controls) → **FIXED ✅**

All 6 files were read in full at HEAD; every one of the 14 control sites now spreads the shared ring, spread **FIRST** in `sx`:

| File | Sites | Evidence |
|---|---|---|
| `NotificationRealtimeToastHost.tsx` | 1 — toast close IconButton | `:89` `sx={{ ...focusVisibleRingSx, color: "inherit" }}` |
| `MarkAllButton.tsx` | 3 — sweep Button `:55`; dialog cancel `:69` `sx={focusVisibleRingSx}`; dialog confirm `:72` `sx={focusVisibleRingSx}` (with pre-existing `autoFocus`) | all 3 ringed |
| `NotificationFilterChips.tsx` | 4 — mobile toggle Button `:74`; read-state pair `:100`/`:110`; type-chip map `:132` (covers all 7 types) | all `sx={{ ...focusVisibleRingSx, minHeight: 36 }}` |
| `NotificationRow.tsx` | 2 — inline mark-read Button `:180`; xs IconButton `:193` | spread first, then `display`/`flexShrink`/`minHeight` |
| `NotificationFeedError.tsx` | 1 — retry Button `:71` | `sx={{ ...focusVisibleRingSx, flexShrink: 0, minHeight: { xs: 44 } }}` |
| `NotificationsFeedContainer.tsx` | 3 — pager prev `:315`, pager next `:327`, snackbar close `:421` | spread first |

**(a) Spread position**: all 14 sites spread FIRST — matching the `LocaleSwitcher.tsx:58` and `NotificationUnreadBadge.tsx:78` convention exactly (both spread first inside a theme callback). `AuthFormShared.tsx:144` itself has the spread *after* `py`/`position`, so the new sites are actually stricter than one of the convention files. Order is semantically safe either way: `focusVisibleRingSx` (`focusRing.ts:16-22`) has a single key — the nested selector `"&:focus-visible, &.Mui-focusVisible"` — so it cannot collide with any top-level key (`color`, `minHeight`, `display`, `flexShrink`, `width`, `alignSelf`) placed after it. **No site re-declares that selector → no override is lost anywhere** (spread order preserves later overrides vacuously).

**(b) Static chips untouched**: the only non-interactive Chip in the surface — the row's type chip (`NotificationRow.tsx:158-164`, no `clickable`/`onClick`) — still carries only its original `minHeight: 28` + `color` sx; the diff shows no edit to it. Correct: a static label chip must not take focus.

**(c) sx conflicts**: none — see (a); later keys at every site are disjoint plain properties. The two `color: "inherit"` values (toast + snackbar close) are the R3-F2-sanctioned CSS-wide keyword, preserved verbatim by the fix.

**(d) MUI prop misuse**: none introduced — the diff adds only imports, sx contents, and comments; the ring module is imported from the sanctioned standalone `focusRing.ts` (unchanged by this commit, still `satisfies CSSObject`, still react-refresh-clean). `autoFocus` on the dialog confirm is a valid pre-existing Button prop.

## Findings

**ZERO new findings.** Full enumeration of every `Button`/`IconButton`/`Chip` with `onClick`/`onKeyDown`/`clickable` across the 14-file notification surface (fresh grep this round):

- **15 ringed** — the 14 fixed sites above + the bell IconButton (`NotificationUnreadBadge.tsx:73-80`, ringed since R1).
- **1 static** — row type chip (correctly no ring, see (b)).
- **3 pre-existing, out of scope** — `DashboardAppBar.tsx` menu `:88` / theme `:121` / logout `:173` IconButtons have onClick but no ring. These are pre-existing dashboard controls, explicitly classified in R3-F1's scope note as a repo-wide backlog ("this finding is scoped to the NEW controls this feature introduces"); they are enumerated here for completeness, not re-reported as findings.
- **Zero `onKeyDown` handlers anywhere** in the surface (keyboard interaction flows through the controls' native ButtonBase handling); `NotificationList`/`EmptyState`/skeletons/`page.tsx`/hook/`navItems.ts` render no interactive elements at all.

Carry-over INFO items from R3 (F2 `color: "inherit"` ×2, F3 skeleton `borderRadius: 999`, F4 `textAlign: "center"`, F5 docblock nit) — unchanged, not re-reported.

## Checklist Evidence (spot-greps at HEAD `9d25fcc`)

| # | Item | Verdict | Evidence (this round) |
|---|---|---|---|
| 1 | sx-only styling | ✅ PASS | `style={{` over all surface files → 0 matches. |
| 2 | Palette-token colors | ✅ PASS | hex/`rgb(`/`hsl(` → 0; CSS-wide-keyword pattern → exactly the 2 documented `color: "inherit"` sites (R3-F2 ruling; both now also ringed). |
| 3 | Outlined icons only | ✅ PASS | Single-line imports all `*Outlined`; multi-line blocks re-verified: `DashboardAppBar.tsx:4-7` (DarkMode/LightMode/Logout/Menu — all `*Outlined`), `navItems.ts:4-18` (15 icons, all `*Outlined`), `notification-type-presentation.ts:2-8` (7 type icons, all `*Outlined`). Sanctioned `Close` ×2 unchanged. |
| 4 | Enum-handle i18n + property access | ✅ PASS | Bracket-access sweep → sole hit `navItems.ts:113` `t[item.labelKey]` (sanctioned accessor). |
| 5 | No dangerouslySetInnerHTML | ✅ PASS | 0 matches (static-scan suite also green inside the 100/100 gate). |
| 6 | Apollo-only state truth | ✅ PASS | `zustand\|createStore\|persist(` → 0 matches. |
| 7 | useQuery-stateful-only | ✅ PASS | `useLazyQuery` → 0 matches; sanctioned `useMutation` ×2 + the documented `client.query` catch-up exception (R1-F5) unchanged. |
| 8 | Realtime hook contract | ✅ PASS | Mount sweep: host only in `DashboardLayout.tsx`, `useNotificationRealtime` only in the host, badge only in `DashboardAppBar.tsx`; backoff cap `Math.min(…, RECONNECT_MAX_DELAY_MS=30000)` (`:53`,`:111`); abort codes 4401/4009 no-retry early return (`:59-60`, `:514`). |
| 9 | Nav/badge integration | ✅ PASS | `/notifications` entry with `{route,labelKey,Icon}` present for all four roles (`navItems.ts:58`,`:66`,`:74`,`:80`). |
| 10 | RTL logical properties | ✅ PASS | Physical-property sweep → sole hit `textAlign: "center"` (`NotificationList.tsx:162`, R3-F4 symmetric/direction-neutral). Toast/snackbar stacks still `insetInlineStart/End` + block-axis `bottom`. |

## Gates run this round

- **Tests**: `bun run test:ui:components` (approved locked runner, UI preloads) → **100 pass / 0 fail** (602 `expect()` calls, 9 files, 29.53s) — includes all four notification UI suites; nothing regressed from the ring spreads.
- **Method**: HEAD verified; only files read — no repo files modified this round except this report.

## Verdict

**0 findings — 0 BLOCKER, 0 MAJOR, 0 MINOR, 0 new INFO.** Round-3's single MINOR (focus-visible ring coverage) is **fully fixed and confirmed on all 14 control sites across the 6 files**: spread-first placement matching the LocaleSwitcher/UnreadBadge convention, no sx conflicts, static chips correctly untouched, no MUI prop misuse, and the fix diff contains nothing beyond imports + sx spreads + comments. The full interactive-element enumeration of the notification surface finds no remaining unringed NEW control (15/15 interactive feature controls ringed); the only unringed controls in the surface files are the 3 pre-existing AppBar IconButtons already classified as repo-wide backlog in R3. All 10 checklist items PASS at HEAD; `bun run test:ui:components` is 100/0. Wave C is clean — no further frontend action required for this feature.
