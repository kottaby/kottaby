# Capture Protocol (agent-browser)

Used by the visual-improvement-loop skill. All screenshots must land in `scratch/screenshots/`.

## Sessions & auth

- Fresh session per loop: `agent-browser session id --scope worktree --prefix <short-prefix>`; export the value as `AGENT_BROWSER_SESSION`.
- App pages (dev server): authenticate via `bun run scripts/browser-login.ts --inject` — never type credentials into a login form; the AI layer redacts emails and the submission fails Email validation. If `--inject` errors on daemon startup, fall back to `agent-browser cookies set --curl .browser-auth/playwright.cookies.json --domain localhost`.
- Storybook (`localhost:6006`): NO auth needed. Capture from the raw iframe URL, not the full manager UI:
  `http://localhost:6006/iframe.html?id=<story-id>&viewMode=story&globals=locale:en|ar`

## Viewports

- Per shot: `agent-browser set viewport <W> <H>`. Default trio: `1440 900`, `834 1112`, `390 844`. For tall pages needing the full form in frame, a taller viewport (e.g. `1440 1600`) is safer than `--full`.
- Re-set the viewport before every URL change when alternating sizes (viewport survives one page open but not sessions).

## State-verified capture (the loop-critical discipline)

Screenshots must not be trusted just because `screenshot` exited 0. Verify:

1. **Title guard** before accepting: `agent-browser eval "document.title"` must match the expected page (e.g. `"Student Credits | Siraj"` — not `"Login | Siraj"`). A stale/expired session turns everything after into login-page screenshots. Re-auth and recapture.
2. **State guard** for interaction-driven content (expanded banners, selected options, prefilled forms): run the interaction, then check the expected DOM marker twice — immediately before AND after the screenshot. If either check is off, redo.
3. Allow settle time: dev server + Suspense + apollo mocks need 10-15s on first open per bundle. Use a fixed short sleep then verify via DOM — never `waitForTimeout`-style blind sleeps inside tests; for captures a plain `sleep 10` + DOM verification is correct and sufficient.

## `--full` screenshot pitfall (observed)

`agent-browser screenshot --full` can destabilize client state on authenticated SPA pages with scroll containers (observed: a store-driven section present in the DOM pre-capture was gone post-capture). Prefer:

- Plain viewport screenshot, plus `document.querySelector("<selector>").scrollIntoView({ block: "center", behavior: "instant" })` to frame a specific section.
- Reserve `--full` for stateless, fully-rendered pages, and even then verify DOM state after the shot.

## Batch capture discipline (added 2026-09-13)

- Re-verify the ACTIVE tab + a content marker with `agent-browser eval` before EVERY screenshot in
  a viewport-marching batch — browser/session churn between commands has produced captures of the
  wrong tab's content.
- Re-pin `NEXT_LOCALE` + viewport after every re-login; the locale cookie silently reverts.
- The browser session console buffer persists across navigations: after fixing a console error,
  the gate can still see stale `[error]` entries. Gate on a FRESH session, or confirm the error
  count is 0 after a verified reload.
- If a fixed source still serves stale/broken output after a dev-server restart, the Turbopack
  `.next-dev` disk cache is poisoned (a transient syntax error got compiled in): stop the server,
  `rm -rf .next-dev`, restart. This is a dev build artifact — the "never clear caches" rule covers
  lint/quality-gate caches, not the dev bundle dir.

## Reading shots

The orchestrator NEVER calls ReadMediaFile on screenshots in its own loop. Images go to isolated inspector subagents; the main context receives text-only verdicts.

**VLM-CLI inspector mode**: when subagent image delivery is unavailable (agent contexts that never receive image payloads), inspectors run via the `z-ai vision` CLI in Bash — one image per call, rubric inlined in the prompt; the orchestrator aggregates text verdicts.

## Useful DOM-first verifications (don't need pixels)

- `agent-browser snapshot -i -c` — interactive a11y tree: proves headings, fields, per-row actions, checkmarks.
- `agent-browser console --level error` — error log check before each capture round.
- `agent-browser network requests --filter "<pattern>"` — GraphQL traffic proof when mutation flows matter.
