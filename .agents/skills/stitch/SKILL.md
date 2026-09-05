---
name: stitch
description: >
  Master guide for Google Stitch and Stitch MCP server integration.
  Requires the Stitch MCP server to be active. Use this skill when:
  (1) generating, editing, or creating variants of UI screens using Stitch,
  (2) managing Stitch design systems and DESIGN.md specifications,
  (3) orchestrating iterative multi-page website development via the build loop,
  (4) converting Stitch designs to React, Next.js, or HTML components,
  (5) creating interactive prototypes from an implementation plan (e.g. .ai/plans/FEATURE/) — see the "Plan-to-Prototype Recipe" below,
  (6) reviewing, QA-ing, or polishing previously generated Stitch screens ("analyze the screens", "check the prototypes", "make them perfect") — see the "Per-Screen Verification Loop" below. Even if the user doesn't name Stitch, use this when the work involves generated UI screenshots that need to be corrected and regenerated.
license: MIT
compatibility: Requires Stitch MCP server configured with STITCH_API_KEY and GOOGLE_CLOUD_PROJECT
metadata:
  version: "2.0.0"
allowed-tools: Read Write Edit Glob Grep call_mcp_tool
---

# Google Stitch Master Skill

Master guide for orchestrating UI design workflows, design systems, and component generation using **Google Stitch** and the **Stitch MCP Server**.

---

## ⚠️ Requirements & Environment

This skill **requires the Stitch MCP Server** to be configured and available in your environment:

```json
{
  "stitch": {
    "command": "npx",
    "args": ["-y", "@_davideast/stitch-mcp", "proxy"],
    "env": {
      "STITCH_API_KEY": "<YOUR_STITCH_API_KEY>",
      "GOOGLE_CLOUD_PROJECT": "<YOUR_GOOGLE_CLOUD_PROJECT>"
    }
  }
}
```

When invoking Stitch tools, call them directly or via `call_mcp_tool` with `ServerName: "stitch"`.

---

## Quick Reference

| Intent | Tool / Action | Key Parameters |
|:---|:---|:---|
| **List projects** | `list_projects` | `{ filter: "view=owned" }` |
| **Create project** | `create_project` | `{ title: "Project Name" }` |
| **Get project details** | `get_project` | `{ name: "projects/<projectId>" }` |
| **Generate new screen** | `generate_screen_from_text` | `{ projectId, prompt, deviceType, modelId }` |
| **Edit existing screen** | `edit_screens` | `{ projectId, selectedScreenIds: ["<id>"], prompt }` |
| **Explore variations** | `generate_variants` | `{ projectId, selectedScreenIds: ["<id>"], variantOptions }` |
| **List screens** | `list_screens` | `{ projectId }` |
| **Get screen HTML/image** | `get_screen` | `{ projectId, screenId }` |
| **Download assets** | `download_assets` | `{ projectId, outputDir: ".stitch/designs" }` |
| **Manage design system** | `create_design_system` / `upload_design_md` | `{ projectId, designSystem }` / `{ projectId, designMdBase64 }` |
| **Apply design system** | `apply_design_system` | `{ projectId, assetId, selectedScreenInstances: [{ id, sourceScreen }] }` |

---

## Plan-to-Prototype Recipe

When asked to "create a prototype for a plan" (e.g. `.ai/plans/<feature>/specs.md` or `implementation.md`), follow this exact sequence:

1. **Read the plan** (`view`; use `view_range` for large files). Extract:
   - Every distinct **screen/page** the plan describes (lists, forms, detail views, dialogs, per-role views, mobile variants).
   - UI details worth prompting: filters, columns, status badges, autocomplete, auto-fill behavior, per-audience differences.
   - Build a **coverage matrix** before generating: `views × states × form factors`. When the user asks for "all screens", that means every tab/view, every **state** (default, empty, error, in-progress, declined/expired — whatever the plan's journeys touch), and **every form factor the app ships** (typically DESKTOP + MOBILE). Enumerate the full grid explicitly in your report so gaps are visible.
2. **Auth probe**: call `list_projects` first. A 401 means the token is expired — ask the user to re-authenticate before generating anything.
3. **Always create a NEW project**: `create_project` with a title like `"Siraj — <Feature> Prototypes"`. Record the numeric `projectId`. Never reuse an existing plan-prototype project for a different plan — one project per plan keeps screens organized.
4. **Design system** (optional consistency step): call `list_design_systems` on a previous prototype project (or globally) to find a matching system; pass its `designSystem` ID (`assets/...`) to `generate_screen_from_text` for visual consistency across plan prototypes. Fall back to defaults if none fit.
5. **Generate one screen per identified page**, sequential calls with a detailed, self-contained prompt per screen (layout, sidebar, fields, states, badges, data examples from the plan). Use `GEMINI_3_FLASH` for wireframe-speed, `GEMINI_3_1_PRO` for polish. Match `deviceType` to the view (DESKTOP for admin dashboards, MOBILE for self-service/student views).
6. **After each generation, immediately capture** the new screen's `name`/`id`/title from the response (grep the temp output file if needed — see Ground Rules), **and append it to a screen manifest** (`screens.json`) in the output directory:
   ```json
   [{ "screenId": "<id>", "title": "…", "file": "<name>.png", "deviceType": "DESKTOP", "state": "default|empty|error|…" }]
   ```
   This manifest is the ONLY reliable record of screen IDs: `list_screens` is eventually consistent (often returns `{}` for fresh screens) and `get_project` never lists screens. Without it you cannot `edit_screens`/`get_screen` later. Update the manifest after every edit that forks a screen, and whenever a name mapping changes.
7. **Save artifacts locally** under the task's output directory (e.g. `<plan-dir>/prototype/`):
   - `mkdir -p <output-dir>`
   - Name files `<view>-<state>-<form>.png` (e.g. `whatsapp-inbox-declined-mobile.png`) — kebab-case, encoding ALL of view, state, and form factor so "all states of a screen" are distinguishable.
   - Per screen: `curl -sL -o <name>.png "<screenshot.downloadUrl>=s0"` (note the `=s0`). **Do NOT download `.html` files unless the user explicitly asks for them.**
   - Re-fetch URLs with `get_screen` for any screen not in a fresh `list_screens` result.
   - **Beware of embedded-asset traps**: generation responses can contain illustration/other asset downloads; the FIRST `"screenshot"` URL may belong to a 1024×1024 JPEG placeholder inside the screen, not the render itself. Always verify: `file *.png` → must be PNG; desktop renders are 2560×2048, mobile 780×1768. If you got a JPEG or odd dimensions, re-extract from the `design.screens[0].screenshot` path or refetch via `get_screen`.
   - Before committing/serving the artifact dir, delete any scratch files subagents leave behind (`crop-*.png`, partial downloads).
8. **Report**: list saved files + the Stitch project resource name so the user can iterate via `edit_screens` / `generate_variants`.

---

## Workflow Guide

### 1. Project & Design System Setup
- Discover existing workspaces using `list_projects`.
- If starting fresh, call `create_project` and save metadata to `.stitch/metadata.json`.
- Define or upload your design system:
  - Create a dual-representation `DESIGN.md` (see [DESIGN.md Spec](references/design-md-spec.md)).
  - Upload via `upload_design_md` and activate via `create_design_system_from_design_md`, or configure tokens via `create_design_system`.

### 2. Prompt Enhancement & Screen Generation
- Transform user requirements into structured architectural prompts using professional UI/UX terms (see [Prompting & Mappings](references/prompting-and-mappings.md)).
- Call `generate_screen_from_text`:
  - **Models**: Use `GEMINI_3_1_PRO` for high fidelity / production designs, `GEMINI_3_FLASH` for fast wireframes. *(Avoid deprecated `GEMINI_3_PRO`)*.
  - **Device Types**: `DESKTOP`, `MOBILE`, `TABLET`, or `AGNOSTIC`.
  - **Timing**: Generation takes 60–180 seconds. Do not retry on timeout; verify status with `get_screen`.
  - **Capture screen IDs from the generation response** immediately. The response is large and may be saved to a temp file (e.g. `/tmp/*-copilot-tool-output-*.txt`) — parse it with `grep '"name":"projects/<pid>/screens/<id>"'` / `grep '"title":"..."'` instead of re-invoking tools. `list_screens` is **eventually consistent** — it often omits screens generated seconds earlier, may return an empty `{}` right after generation, and may fail with `exception: unmarshalling uint64` (retry once, use cached URLs). Prefer `get_screen` with the captured IDs to fetch fresh download URLs.
  - **Do NOT rely on `get_project` to enumerate screens.** Its response contains project metadata and a thumbnail but not a usable screens list; treat the generation responses + `get_screen` as the source of truth.
  - A successful generation response contains the new screen's ID even when `htmlCode`/`screenshot` URLs in it are placeholders; re-fetch via `get_screen` after ~30s if URLs are missing.

### 3. Iteration & Variants
- **Focused Edits**: Use `edit_screens` with targeted instructions ("Change primary button to deep indigo #4F46E5; keep all other elements identical").
- **Exploration**: Use `generate_variants` with `creativeRange: "EXPLORE"` or `"REIMAGINE"` across aspects (`LAYOUT`, `COLOR_SCHEME`, etc.).

### 4. Asset Download & Code Integration
- Retrieve full metadata with `get_screen`:
  - Fetch HTML code from `htmlCode.downloadUrl` (requires `curl -L` to follow redirects) **only when the user explicitly asks for HTML/code output** — otherwise download PNGs only.
  - Fetch the **full-resolution** screenshot by appending `=s0` to `screenshot.downloadUrl`. The bare URL returns a small, blurry thumbnail (~30–80KB); `=s0` returns the original render (~110–430KB, e.g. 2560×2048 desktop). Prefer `=s0` over `=w{width}`.
- **`download_assets` is unreliable**: it can report success yet write no files at all. Always verify afterwards (`ls` the outputDir + confirm file count). If empty, fall back to downloading each screen's `htmlCode.downloadUrl` and `screenshot.downloadUrl` directly with `curl -sL`, saving with meaningful names.
- After any download, **validate files**: `file *.html *.png` must show HTML/PNG (not JSON) and sizes must be >1KB. A "successful" download of ~100–500 bytes is usually a JSON error payload, not an asset. `file` also reports PNG dimensions — 512×410 means you accidentally saved a thumbnail even when the byte size looked plausible; desktop originals are 2560×2048 and ~110–430KB.
- Convert generated markup into clean React/Next.js/Tailwind components matching your project architecture.

### 5. Per-Screen Verification Loop (quality gate)

When the user asks to analyze/validate/polish generated screens ("check the screens", "analyze each screen", "make them perfect"), run the loop ONCE PER SCREEN — spawn one subagent per screen in parallel with a strict, self-contained spec of what the screen must contain. Each subagent iterates:

1. **View** the local PNG; compare against the spec element-by-element (tabs active, badges, specific copy, states). Check visual breakage: garbled text, truncation, overlaps, off-topic content.
2. **Verdict**:
   - `PASS` → stop; no tool calls needed.
   - `IMPROVE` → `edit_screens` with a targeted fix list (only what is wrong — don't restate the whole screen), then continue.
   - `FAILED/off-topic` (screen regressed into unrelated content, e.g. wrong product) → nudging doesn't work; issue a decisive "this content is WRONG, replace everything with <full spec>" edit prompt.
3. **Detect stale renders**: after an edit, wait ~90s (sleep), then `get_screen`. If the `screenshot.name` file ID is **unchanged**, the DOM ops were applied but the image wasn't re-rendered — issue one more tiny "confirm polish" edit to force the re-render, wait, and refetch. Compare md5 of old vs downloaded PNG to be sure content changed.
4. **Re-download** with `=s0`, validate (`file` → PNG with correct dimensions), view again, loop (max 3 iterations).
5. Final reply in a strict format, e.g. `FINAL: verdict=PASS|IMPROVED|FAILED iterations=N` + one-line notes — this keeps 20+ parallel subagents parseable.

Orchestrator duties: after all subagents finish, eyeball any `IMPROVED` verdicts yourself (screenshot staleness can make agents misread the state), resolve `FAILED` ones manually, verify the full file list, and commit.

### 6. Multi-Page Build Loop
- For multi-page flows, follow the baton protocol in `.stitch/next-prompt.md` and `.stitch/SITE.md` (see [Build Loop Guide](references/build-loop.md)).

---

## Reference Documents

- [MCP Tools & Parameters Reference](references/mcp-tools.md) — Detailed schemas, parameter types, and ID conventions.
- [Prompting & UI Mappings Reference](references/prompting-and-mappings.md) — Professional terminology and prompt structures.
- [Build Loop & Multi-Page Protocol](references/build-loop.md) — Autonomous multi-page application workflows.
- [DESIGN.md Specification](references/design-md-spec.md) — Dual-representation design system format.

---

## Troubleshooting

### 401 "invalid authentication credentials"
The MCP server's OAuth token / `STITCH_API_KEY` is expired or invalid. Symptoms: **every** tool call fails with `Stitch API error (401)`.
- Ask the user to restart/re-authenticate the `stitch` MCP server (new API key in `.mcp.json` env, or re-run the OAuth flow), then retry. A 401 will **not** self-heal by retrying.
- Verify auth with the cheapest call first (`list_projects`) before attempting generation — failing early avoids half-created projects.

### `download_assets` reports success but directory is empty
Known flaky behavior. Do not trust the success message — always verify with `ls`. Fallback: loop over screens and `curl -sL` each `htmlCode.downloadUrl` and `screenshot.downloadUrl` (get fresh URLs from `get_screen`; URLs are signed and expire).

### `edit_screens` succeeded but the screenshot didn't change
DOM-operation edits are sometimes applied without re-rendering the screenshot. Symptoms: `get_screen` returns the same `screenshot.name` (file ID) for >90s after the edit, or the downloaded image is byte-identical (same md5). Fix: issue one more small `edit_screens` (a trivial "polish/confirm" prompt) — this forces a re-render and a new screenshot file ID.

### Downloaded PNG is a 1024×1024 JPEG or wrong dimensions
You grabbed an embedded illustration/asset URL instead of the screen render. The screen render is at `design.screens[0].screenshot.downloadUrl` in the generation response (or via `get_screen`). Verify with `file`: desktop = PNG 2560×2048, mobile = PNG 780×1768.

### A screen shows completely unrelated content
Generation drift — the screen regressed into a different product/page. Incremental nudges won't fix it; use `edit_screens` with a decisive "the current content is WRONG, replace the ENTIRE content with <full spec>" prompt.

### Generation tool output is not a single JSON document
Responses are huge (40–410KB) and the saved `/tmp/…-copilot-tool-output-*.txt` files typically contain **multiple concatenated objects** — e.g. a raw text object then the structured `outputComponents` object — so `json.load` fails on the trailing data. Parse with a loop using `json.JSONDecoder().raw_decode()`. Also note `outputComponents` may appear twice (a compact string copy plus the pretty-printed object); the string copy must be `json.load`ed again before dict access (check `isinstance(component, str)`). Prop shape: `component['design']['screens'][0]` → `name` (`projects/<pid>/screens/<sid>`), `title`, `screenshot.downloadUrl`, `htmlCode.downloadUrl`.

---

## Ground Rules

- **ALWAYS** check that the Stitch MCP server is active before triggering generation workflows (quick `list_projects` probe; a 401 means re-auth needed — do not proceed).
- **ALWAYS** maintain a `screens.json` manifest (screenId, title, file, deviceType, state) in the artifact output directory, updated after every generation or edit — it is the only reliable source of screen IDs.
- **ALWAYS** use numeric/alphanumeric IDs (without `projects/` or `screens/` prefix) for `generate_screen_from_text`, `edit_screens`, `get_screen`, `generate_variants`, and `apply_design_system`.
- **ALWAYS** pass only `id` and `sourceScreen` in `selectedScreenInstances` for `apply_design_system` (omit coordinates and dimensions).
- **ALWAYS** record screen IDs and title→ID mapping from generation responses; never rely solely on `list_screens` for recently generated screens.
- **ALWAYS** download PNGs by default; download `.html` files ONLY when the user explicitly requests HTML/code output.
- **ALWAYS** verify downloaded files exist, have non-trivial size, and are valid PNG with the right dimensions (desktop 2560×2048, mobile 780×1768) — a 1024×1024 JPEG or sub-100KB file is the wrong asset or a thumbnail.
- **ALWAYS** name artifacts `<view>-<state>-<form>.png` (view + state + form factor all encoded) so every state variant is distinguishable.
- **ALWAYS** enumerate the full `views × states × form factors` matrix before generating when "all screens" is requested, and state it explicitly in your report.
- **ALWAYS** verify screenshot content actually changed after `edit_screens` (compare `screenshot.name` file ID or md5); re-render if stale.
- **NEVER** leave subagent scratch files (`crop-*.png`, stray downloads) in the artifact directory — clean before commit.
- **NEVER** spam `generate_screen_from_text` on timeout; wait and verify with `get_screen`.
- **NEVER** delete projects without explicit confirmation from the user.
