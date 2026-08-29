# Wave C (review-frontend) — Round 2

**Reviewer**: independent agent | **Date**: 2026-08-29 | **Scope**: round-1 fix verification + fresh frontend-discipline sweep

Branch `feat/dev3-010-real-time-notification-engine-websocket` (checked out, verified via `git branch --show-current`; HEAD = `45a0c9e`, the round-1 triage commit). Since Round 1 reviewed the full surface, the ONLY frontend delta is `45a0c9e`'s single-file diff (`frontend/views/notifications/NotificationRow.tsx`, +32/−7 — verified via `git show 45a0c9e --stat -- frontend/`), so this round re-read that file in full, re-ran the Wave-C checklist greps over the whole surface, re-ran the four notification UI test files, and empirically verified the fix's computed CSS and its browser-level side effects (method notes in §Gates).

## Findings

### F1 — MAJOR — MUI `sx` numeric transforms silently reinterpret the visually-hidden recipe (`width: 1` → `100%`, `height: 1` → `100%`, `margin: -1` → `-8px`), producing a viewport-sized clipped box that pollutes document scroll extent (Chromium-verified)
- **Location**: `frontend/views/notifications/NotificationRow.tsx:21-32` (`VISUALLY_HIDDEN_TEXT_SX`), consumed at `:126-128` inside the unread dot.
- **Evidence chain** (each step verified this round):
  1. Installed `@mui/system` 9.3.0 `sizingTransform` = `value <= 1 && value !== 0 ? \`${value * 100}%\` : value` (`node_modules/@mui/system/sizing/sizing.js`); the spacing transform maps `margin: -1` → `-8px` (`theme.spacing(1)` = `8px`).
  2. Empirical resolution: `unstable_styleFunctionSx({ sx: VISUALLY_HIDDEN_TEXT_SX, theme: createTheme() })` returns
     `{"position":"absolute","width":"100%","height":"100%","padding":"0px","margin":"-8px","overflow":"hidden","clip":"rect(0 0 0 0)","clipPath":"inset(50%)","whiteSpace":"nowrap","border":"0px solid"}`
     — **not** the 1px/−1px recipe the docblock describes.
  3. `Box` resolves `sx` through exactly this pipeline: `createBox` → `styledEngine('div', …)(styleFunctionSx)` (`node_modules/@mui/system/createBox/createBox.js`).
  4. No ancestor of the row is positioned: the only `position: "relative"` under `frontend/**` are `AuthFormShared.tsx:143`, `ApiStatusIndicator.tsx:177`, `SiteFooter.tsx:119/152` (none are ancestors); the surface's positioned boxes (toast stacks `NotificationsFeedContainer.tsx:379`, `NotificationRealtimeToastHost.tsx:41`, snackbar) are siblings of the list — so the span's containing block is the initial containing block (viewport).
  5. Headless Chromium 1.62.1 (playwright; scratch page mirroring the app: static wrapper chain, 8×8 dot host at (300, 200), `html,body{overflow-x:hidden}` per `app/index.css:6-15`, viewport 1280×720):
     | case | docScrollW | scrollH | span rect |
     |---|---|---|---|
     | control (no span) | 1280 | 720 | — |
     | **sx-transformed recipe (as shipped)** | **1572** | **912** | 1280×720 @ (292,192) |
     | canonical `1px`/`-1px` recipe | 1280 | 720 | 1×1 @ (299,199) |
     | sx-transformed, `dir="rtl"` | 1280 | **912** | 1280×720 @ (8,192) |
- **Impact**: `overflow-x: hidden` on html/body (`app/index.css:14`) masks the horizontal axis, but the **vertical axis is not masked**: whenever the feed content is shorter than `dotY + 100vh` — short feeds with ≥1 unread row (fresh / mostly-read inboxes; especially mobile, e.g. ~500px of blank scroll on a 390×844 phone with a one-row feed) — the page gains blank scrollable space at the bottom. Chromium computes scrollable overflow from the clip-path'ed box's border box; the canonical 1px sizing exists precisely to foreclose this. Tall feeds mask the symptom entirely.
- **NOT affected**: the a11y goal of the round-1 fix — screen readers ignore CSS clipping, so `labels.filterUnread` IS announced; paint invisibility holds via `clipPath: inset(50%)` + legacy `clip` regardless of box size; `position: absolute` keeps the span out of flow, so the 8×8 dot and the row layout are untouched.
- **Secondary inaccuracies in the same block**: docblock `:15-20` calls it "the standard clip-into-1px recipe" (it is not, as computed); `:50-51` still claims "no physical margins anywhere" (the span now carries `margin: -8px`).
- **Fix (one line)**: px string literals bypass both transforms — `width: "1px", height: "1px", margin: "-1px"` — matching the framework's own constant `@mui/utils/visuallyHidden` = `{"border":0,"clip":"rect(0 0 0 0)","height":"1px","margin":"-1px","overflow":"hidden","padding":0,"position":"absolute","whiteSpace":"nowrap","width":"1px"}`. The code comment's claim "no dedicated a11y utility is a direct dependency" is **accurate** (root `package.json` declares only `@mui/material`, `@mui/icons-material`, `@emotion/react` — verified), so hand-rolling the constant is the right call; it just needs px strings.
- **Rule**: checklist #1/#10 spirit (sx correctness / no layout side effects). Regression introduced by `45a0c9e`.

### F2 — INFO — the new hidden-text node ships unpinned by tests
- `45a0c9e` touched only the component (diffstat: 1 file). No assertion covers `t.filterUnread` as ROW text: the feed suite uses `getByRole("button", { name: t.filterUnread })` for the filter CHIP only (`notifications-feed.test.tsx:232,291,303,421,499`), and no snapshot exists for the row. A future regression back to a bare `<Box aria-label>` (round-1 F1) would pass the current suite. Cheap pin: `screen.getByText(t.filterUnread)` scoped to a row, or a static-scan extension asserting the visually-hidden pattern survives in `NotificationRow.tsx`.

### F3 — INFO — round-1 RTL grep-pattern gap: camelCase physical properties escaped the kebab-case pattern
- `frontend/views/notifications/NotificationList.tsx:162` — `textAlign: "center"`. Round 1's grep used kebab-case `text-align` and could not match sx camelCase; the property was present at round-1 time. The value is direction-neutral (center mirrors trivially under `dir="rtl"`), so there is **no RTL impact** — same class as round-1 F3 (sanctioned vertical margins). Recommendation: future waves grep camelCase variants (`textAlign|marginLeft|marginRight|paddingLeft|paddingRight`) alongside the kebab-case forms.

## Round-1 Fix Verification

### R1-F1 (MINOR — dead `aria-label` on a generic `Box` unread dot) → **INTENT FIXED; implementation carries new MAJOR F1**
- (a) **Visually-hidden pattern**: correct technique family — `position:absolute` + `overflow:hidden` + `clip: rect(0 0 0 0)` + `clipPath: inset(50%)` + `whiteSpace:"nowrap"`: screen readers announce text content regardless of CSS clipping; sighted users see nothing (clip-path zeroes the paint area independent of box size). The `role="img"` rejection is **legitimately justified**: `oxlint.config.mts:21` enables the `jsx-a11y` plugin with `categories: { correctness: "error" }` (`prefer-tag-over-role` is in that set; `frontend/AGENTS.md:44` documents the pattern). BUT the numeric sizing is silently transformed — see F1.
- (b) **Module-level constant**: YES — `NotificationRow.tsx:21-32`, module scope, `as const`; stable reference across renders (stable emotion class). ✅
- (c) **`bgcolor: … : undefined`**: line 95 — `styleFunctionSx` skips undefined keys, so no declaration is emitted; the element's initial `background-color` is `transparent` — computed rendering identical to the old `"transparent"` literal. ✅
- (d) **RTL**: layout untouched — the dot stays in the leading flex slot and mirrors under `dir="rtl"`; the hidden span is out-of-flow so it cannot affect mirroring; clip values are direction-symmetric. RTL experiment confirms the span rect flips x-position but remains paint-clipped. ✅ (the vertical scroll pollution of F1 is direction-independent).

### R1-F2 (MINOR — bare `"transparent"` color keyword) → **FIXED ✅**
- Line 95 now `bgcolor: unread ? theme.palette.action.selected : undefined`. Surface grep for hex/`rgb(`/`hsl(`/color keywords now matches only the sanctioned `color-mix(... ${theme.palette.common.white} 16%, transparent)` endpoint (`NotificationRealtimeToastHost.tsx:98`, palette-token-backed per the Round-1 ruling) and a docblock sentence (`NotificationRow.tsx:59`). No color-keyword VALUE remains anywhere in the surface.

## Checklist Evidence (re-verified on the current tree)

| # | Item | Verdict | Evidence (this round) |
|---|---|---|---|
| 1 | sx-only styling | ✅ PASS | `rg 'style=\{\{'` over views/notifications + both ui notification components + hook + `app/(dashboard)/notifications/page.tsx` + AppBar + navItems → 0 matches. New code uses `sx={VISUALLY_HIDDEN_TEXT_SX}` — still sx-only (content correct, numeric form → F1). |
| 2 | Palette-token colors | ✅ PASS | `rg -ni '#[0-9a-f]{3,8}\b\|rgb(\|hsl(\|<20 common color keywords>` over the same surface → only `NotificationRealtimeToastHost.tsx:98` color-mix endpoint (sanctioned) + docblock prose at `NotificationRow.tsx:59`. The bare `"transparent"` VALUE is gone. |
| 3 | Outlined icons only | ✅ PASS | Import audit re-run: `NotificationsOutlined`, `DoneOutlined`, `DoneAllOutlined`, `FilterListOutlined`, `RefreshOutlined` everywhere; sanctioned `Close as CloseIcon` (Host:3, Container:6 — `GraphQLErrorSurfaceHost.tsx:3` precedent, R1-verified); type-presentation + navItems + AppBar imports unchanged by the fix commit. |
| 4 | Enum-handle i18n + property access | ✅ PASS | Call-by-key grep (`t[\|labels[\|commonT[`) over the surface → sole hit `navItems.ts:113` `t[item.labelKey]` (sanctioned nav labelKey accessor, untouched). New code is `labels.filterUnread` property access. ar/en parity pinned by `shared/locale/notifications-namespace.parity.test.ts` (untouched by `45a0c9e`). |
| 5 | No dangerouslySetInnerHTML | ✅ PASS | Grep → 0; static-scan test re-run and PASSED this round (part of 63/63 below). |
| 6 | Apollo-only state truth | ✅ PASS | `rg 'zustand\|createStore\|persist\('` → 0 matches. |
| 7 | useQuery-stateful-only | ✅ PASS | Stateful `useQuery` ×3 (Container:163-164, Badge:60) + sanctioned `useMutation` ×2 (mark ops); `client.query` only at `hook:406-411` (documented catch-up exception, R1-F5); zero `useLazyQuery`. |
| 8 | Realtime hook contract | ✅ PASS | Single host mount re-verified: only non-comment hit is `DashboardLayout.tsx:149` (authenticated branch); badge never opens a socket. Backoff cap/abort codes/dedupe code untouched by `45a0c9e` (R1 evidence stands). |
| 9 | Nav/badge integration | ✅ PASS | `navItems.ts` + `DashboardAppBar.tsx` untouched by the fix commit (diffstat = 1 file); `/notifications` entries + single badge mount unchanged; icon imports re-audited. |
| 10 | RTL logical properties | ✅ PASS (INFO F3; new F1) | Horizontal physical props in the surface: 0 (the `textAlign: "center"` at `NotificationList.tsx:162` is a symmetric value — F3; Round-1 kebab-case grep missed it). New physical props in the fix are confined to the clipped out-of-flow span (F1) — no inline-axis layout impact; toast stacks keep `insetInlineStart/End` (Container:380-381, Host:42-43). |

## Gates run this round
- **Tests**: approved-runner env + preloads over the 4 notification UI files (`notifications-feed`, `notifications-static-scan`, `notification-badge`, `notification-realtime`) → **63 pass / 0 fail** (457 expect() calls). No feed-test regression from `45a0c9e`: no test asserted the old dot `aria-label`; the `markReadButtons` helper selects by `aria-label` (unaffected); the `li` first-child `aria-hidden` assertion (feed test :258) targets the type-icon Box (unaffected); no row snapshots exist.
- **Lint**: scoped `oxlint -c oxlint.config.mts frontend/views/notifications/NotificationRow.tsx` → **0 warnings, 0 errors** (301 rules).
- **Method notes**: MUI `sx` resolution verified empirically via `unstable_styleFunctionSx` + `createBox` source on the installed packages; scroll-extent behavior verified in headless Chromium 1.62.1 via the repo's playwright install (scratch script kept outside the repo and removed afterwards — no repo changes made this round). A parallel review agent switched the shared worktree to `main` late in this session (after the test run); all checklist evidence above was additionally re-pinned to the branch ref via `git grep feat/dev3-010-real-time-notification-engine-websocket -- …` (fix lines :21/:95/:126 confirmed; surface greps re-confirmed: color keywords 0, dangerouslySetInnerHTML/zustand/createStore/useLazyQuery 0).

## Verdict
**3 findings — 0 BLOCKER, 1 MAJOR, 0 MINOR, 2 INFO.** Round-1 F2 (color keyword): **fully fixed**. Round-1 F1 (dead aria-label): **a11y intent achieved** — the dot now exposes real text content to assistive tech, the `role="img"` avoidance is legitimately rule-driven, the constant is module-level, and `bgcolor: … : undefined` renders identically — but the replacement recipe's numeric literals are silently reinterpreted by MUI's `sx` transforms into a viewport-sized clipped box that pollutes document scroll extent (Chromium-verified; masked on tall feeds and on the horizontal axis by `app/index.css`). One-line fix: px string literals (`width: "1px", height: "1px", margin: "-1px"`). All 10 Wave-C checklist items still PASS on the current tree; no test or lint regressions.
