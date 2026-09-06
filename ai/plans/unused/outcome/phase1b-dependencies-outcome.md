# Phase 1b — Dependencies outcome (T1.2)

Task: verify + remove unused deps, register config-string FPs, add unlisted deps, single lockfile sync.
Baseline derived from a live `knip` run (Bun runtime: `bunx --bun knip`) at HEAD `1c134db`.

> Note: `ai/plans/unused/outcome/phase0-discovery-outcome.md` and `ai/plans/unused/tasks.md` do
> not exist in this working tree (orchestrator scaffolding not landed / sandbox daemon switched
> the repo to `main`). All lists below were re-derived live from knip output — the counts match
> the plan's expected totals (82 deps / 35 devDeps / 3 unlisted), with two Phase-0 FP claims
> corrected (see "Corrections to Phase 0 FP list").

## Script added

`package.json` gained `"check:unused": "bunx --bun knip"`. Plain `bunx knip` (node) crashes with
`RangeError: Array buffer allocation failed` inside oxc-parser raw-transfer; the Bun runtime is
required for knip in this repo.

## Summary

| Category | Flagged | Removed | Kept + ignoreDependencies | Added |
|---|---|---|---|---|
| dependencies | 82 | 77 | 5 | 1 (csstype) |
| devDependencies | 35 | 30 | 5 | 2 |
| unlisted | 3 | — | — | 3 |

## Removed — dependencies (77)

| Package | Reason (verified: zero refs across source, configs, workflows, bins, file-paths, docs bun add/bunx) |
|---|---|
| `@aws-sdk/client-ses`, `@aws-sdk/client-sesv2` | Communication/email layer unbuilt (no adapter code; `.env.example` provider scaffolding only) |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | Zero imports (no drag-and-drop surface) |
| `@escape-tech/graphql-armor-block-field-suggestions` | Never registered in `app/api/graphql/apollo-server.ts` plugins |
| `@google-cloud/secret-manager`, `@google-cloud/storage` | Zero refs (Vercel env + local storage provider) |
| `@hookform/resolvers` | `react-hook-form` used without resolvers (no import) |
| `@mui/x-date-pickers` | Zero imports |
| `@newrelic/browser-agent` | **Phase-0 FP claim corrected**: no import/config/bin anywhere; only inert `NEXT_PUBLIC_NEW_RELIC_*` env placeholders in `.env.example` (server-agent browser-monitor injection needs no npm package) |
| `@pdf-lib/fontkit`, `@pdfme/common`, `@pdfme/schemas`, `@pdfme/ui`, `pdf-lib`, `opentype.js` | PDF/font pipeline has zero imports anywhere |
| `@pothos/plugin-add-graphql`, `-directives`, `-drizzle`, `-errors`, `-simple-objects`, `-tracing` | `builder.ts` loads only scope-auth + with-input; comment claims "added where the features live" but no feature loads them; docs mandate only dataloader (kept) |
| `@react-email/editor`, `react-email` | No email-template code in repo |
| `@sparticuz/chromium`, `puppeteer` | Zero refs (E2E is Playwright; no browser automation code) |
| `@types/google-libphonenumber`, `@types/moment-hijri`, `@types/qrcode`, `@types/react-color`, `@types/validator`, `@types/webfontloader` | Runtime counterparts removed + zero direct refs (tsconfig `types: ["bun"]` so not ambient) |
| `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` | **Phase-0 FP claim corrected**: `eslint.config.mjs` imports the meta package `typescript-eslint` (unflagged) only; rule-name strings are not package refs. Both remain installed transitively via the meta package |
| `@vercel/blob` | Zero refs |
| `@vercel/functions` | Docs-only mention (`docs/notifications/realtime-engine.md` D3 option (b), deferred path) — re-add if that path lands |
| `@xyflow/react` | Zero imports |
| `@yaacovcr/transform` | Never registered in Apollo server |
| `apollo-server-errors` | Zero refs (Apollo v5 error model in use) |
| `bullmq`, `pg-boss` | Queue-adapter layer unbuilt (`queue-adapter.factory.ts` referenced only in stale AGENTS/docs) |
| `card-validator`, `@types/card-validator` | Zero imports (payment validation is custom/zod) |
| `cron-parser` | Only a stale `.env.example` comment ("Validated at build time with cron-parser"); no code; was a peer of removed bullmq/pg-boss |
| `crypto-hash` | Zero imports (SHA256 via `crypto-js` in apollo link) |
| `date-fns` | Zero imports (custom Intl/date formatting) |
| `firebase-admin` | Zero refs (FCM push layer unbuilt; `.env.example` FIREBASE_* placeholders only) |
| `form-data` | Zero imports (peer of removed nodemailer/mailgun) |
| `framer-motion` | Zero imports (MUI transitions) |
| `google-libphonenumber`, `libphonenumber-js`, `mui-tel-input` | Zero imports |
| `graphql-constraint-directive`, `graphql-depth-limit` | Never registered in Apollo server / schema |
| `html-to-image`, `isomorphic-dompurify` | Zero imports |
| `lucide-react` | Zero imports (`@mui/icons-material` in use) |
| `mailgun.js`, `postmark`, `nodemailer`, `@types/nodemailer`, `resend`, `twilio` | Communication layer unbuilt (see above) |
| `material-ui-popup-state` | Zero imports |
| `mermaid` | Zero imports; `scripts/validation/validate-mermaid.ts` is deliberately regex-only ("NO npm deps") |
| `moment-hijri` | Zero imports (landing Hijri strip uses custom Intl-based utils) |
| `qrcode` | Zero imports (handshake codes are textual) |
| `react-color`, `react-dropzone`, `react-leaflet`, `react-zoom-pan-pinch` | Zero imports |
| `tsconfig-paths` | Zero refs (Bun/tsconfig resolve paths; no jest/ts-node anymore) |
| `use-debounce` | Zero imports |
| `uuid` | Zero imports (`node:crypto` randomUUID convention) |
| `validator` | Zero imports |
| `webfontloader` | Zero imports |
| `xlsx-js-style` | Zero imports |
| `zustand` | Zero imports (`frontend/stores/` contains only AGENTS.md) |

## Removed — devDependencies (30)

| Package | Reason |
|---|---|
| `@faker-js/faker` | Zero refs in any test |
| `@graphql-codegen/gql-tag-operations`, `@graphql-codegen/import-types-preset`, `@graphql-codegen/typescript` | Not referenced by `codegen.ts` (plugins are `typescript-operations` + `typed-document-node`); `typescript-operations` has no peer requirement on `@graphql-codegen/typescript` |
| `@next/bundle-analyzer` | Not wired into `next.config.ts` |
| `@open-draft/deferred-promise`, `@open-draft/logger`, `@open-draft/until` | Zero refs |
| `@smithy/fetch-http-handler` | Companion of removed `@aws-sdk/*` |
| `@storybook/addon-onboarding`, `@storybook/addon-themes` | **Phase-0 FP claim corrected**: NOT present in `.storybook/main.ts` addons list (only chromatic, vitest, a11y, docs, mcp, msw-storybook-addon — all unflagged) |
| `@tailwindcss/postcss`, `tailwindcss`, `postcss`, `autoprefixer` | Repo styles with MUI/emotion; no tailwind CSS import, no postcss/tailwind config anywhere |
| `@testing-library/jest-dom` | Zero refs in test setup/tests; only mention is vendored Bun upstream docs (`docs/bun/test/dom.md`), not repo guidance |
| `@types/bcryptjs` | Empty stub (no `.d.ts` shipped); bcryptjs v3 is self-typed |
| `@types/leaflet` | Companion of removed `react-leaflet` (`leaflet` itself was never a direct dep) |
| `@types/newrelic` | **Phase-0 FP claim corrected**: nothing imports the `newrelic` module anywhere (agent kept for config-string reasons only), so its types are dead |
| `glob` | `Glob` in test runners is imported from `"bun"` (`Bun.Glob`), not the npm package |
| `jest`, `ts-jest`, `ts-node` | Bun test runner only; no jest config, no imports |
| `mockdate` | Zero refs |
| `svg-to-ico` | Zero refs (`to-ico` — a different package — is used by `scripts/generator/generate-icons.ts`) |
| `ts-morph` | Zero refs (rejected-alternative mention in an old plan doc only) |

## Kept + registered in `knip.config.ts` `ignoreDependencies` (10 new entries)

| Package | Justification (one-liner also in config) |
|---|---|
| `newrelic` | `next.config.ts` `serverExternalPackages` string + `newrelic.cjs` agent config + NEW_RELIC env surface (agent require()d by runtime, not app code) |
| `@vercel/analytics`, `@vercel/speed-insights` | Imported by `frontend/providers/VercelObservability.tsx` — a knip-flagged *unused file* (Phase 2 owns the file; revisit if deleted) |
| `@pothos/plugin-dataloader`, `dataloader` | Canonical batching pattern mandated by `docs/graphql/dataloader-batching.md` + backend AGENTS.md (`t.loadable()`); no static registration yet by design |
| `@typescript/native-preview` | Provides the `tsgo` bin (`node_modules/.bin/tsgo`) — `bun tsgo` in CI, quality-gate, scripts/health/* |
| `@typescript/typescript6` | Required by literal path in `scripts/ts6-eslint-patch.cjs`; TS6 shim for the eslint type-service |
| `cldr-core`, `cldr-dates-full`, `cldr-localenames-full` | Raw JSON read via `node_modules/...` file paths by `scripts/iana-timezone-generator/paths.ts` |

Pre-existing starter set re-verified: `jscpd` (bin via `check:duplicates`) ✓, `@cspell/dict-ar`
(cspell.config.yaml import) ✓, `lint-staged` ✗ no live reference (husky pre-commit is empty),
`@cspell/eslint-plugin` ✗ only a commented-out import in `eslint.config.mjs` — both flagged for
the T1.3 config-hints pass.

## Added (3 unlisted, lockfile-resolved exact versions)

| Package | Version | Section | Reference surface |
|---|---|---|---|
| `@graphql-codegen/typed-document-node` | `^7.1.0` | devDependencies | `codegen.ts` plugin string `"typed-document-node"` (sits beside `@graphql-codegen/typescript-operations`) |
| `eslint-plugin-react-hooks` | `^7.1.1` | devDependencies | `import reactHooks from "eslint-plugin-react-hooks"` — `eslint.config.mjs:9` |
| `csstype` | `^3.2.3` | dependencies | `import type { Property } from "csstype"` — `frontend/providers/theme/types.ts:2` |

All three were already resolved in `bun.lock` (transitive), so versions are pinned exactly with no bumps.

## Install + gates

- `bun install`: OK — "59 packages installed / Removed: 107" (77 deps + 30 devDeps), lockfile saved
  (`bun.lock` −5298/+~1150 lines). postinstall (`rm -rf node_modules/*/node_modules/typescript`,
  husky) ran clean. A handful of orphaned node_modules dirs (e.g. `zustand`) remain on disk locally
  — cosmetic; `bun.lock` has no entries and CI's `--frozen-lockfile` install is exact.
- tsgo (`run-locked-cmd.ts tsgo tsgo -b --noEmit`): **0 errors** — also proves no source file
  imports a removed package.
- `bunx @biomejs/biome check package.json knip.config.ts` (scoped, non-mutating): **clean**.
- `bun run check:unused`: **Unused dependencies 82→0 · Unused devDependencies 35→0 · Unlisted
  dependencies 3→0.** Exit still 1 as expected (remaining sections are other phases):
  Unused files 38 (Phase 2), Unused exports 90 (Phase 3), Duplicate exports 2 (T1.1 — apparently
  not landed in this tree), Configuration hints 19→18 (the `.css` compiled-extension hint
  disappeared with the tailwind/postcss removal; rest unchanged, T1.3).
- Dev server on :3000: **200**; `dev.log` tail shows normal traffic (health probes, GraphQL
  requests; `Me` UNAUTHORIZED domain rejections are the standard anonymous visitor pattern).

## Carry-forward / blind spots

1. **T1.1 / scaffolding mismatch**: `ai/plans/unused/tasks.md`, `phase0-discovery-outcome.md`,
   and a committed `check:unused` script were absent from this working tree at task start
   (repo was sitting clean on `main` at `1c134db`; duplicate-export findings still = 2). The
   script was re-added by this task; the orchestrator should verify which T1.x work actually
   landed on the intended branch.
2. **Phase 2 coupling**: if `frontend/providers/VercelObservability.tsx` is deleted as an unused
   file, drop the `@vercel/analytics` + `@vercel/speed-insights` ignoreDependencies entries and
   the packages with it.
3. **T1.3 candidates**: `lint-staged` and `@cspell/eslint-plugin` (existing ignore entries, zero
   live references); `@types/jest` remains installed while `jest`/`ts-jest` were removed (knip
   does not flag it — likely its jest-plugin heuristic).
4. **Stale docs/comments to refresh** (out of T1.2 file scope): `backend/graphql/pothos/builder.ts:15-17`
   comment lists six now-removed pothos plugins as "installed"; `README.md` (BullMQ/pg-boss),
   `backend/AGENTS.md` + `backend/services/AGENTS.md` describe `queue-adapter.factory.ts` and
   communication adapters (resend/twilio/FCM) that do not exist in code; `.env.example:158`
   "Validated at build time with cron-parser" is stale.
5. **Broken prebuild (pre-existing)**: `prebuild` script references missing
   `scripts/build/generate-vercel-config.ts`.
6. **`@vercel/functions`**: removed; `docs/notifications/realtime-engine.md` D3 option (b)
   (WebSocket upgrade) would require re-adding it.

---

## Post-Task Reconciliation Note (Orchestrator)

The subagent's warning about missing scaffolding (`tasks.md`, `phase0-discovery-outcome.md`, committed `check:unused` script) was caused by a sandbox git-daemon race: an earlier `git reset --hard` had reverted the working tree to the `main` state while the work was safely committed on `feat/clean-unused`. The orchestrator reconciled by:

- Restoring the `feat/clean-unused` tree (T1.1 + T1.3 edits + plan artifacts) and re-applying T1.2's `package.json`, `bun.lock`, and `ignoreDependencies` block on top
- Replacing T1.2's `check:unused` value (`bunx --bun knip`) with the previously-verified `bun node_modules/knip/bin/knip-bun.js` invocation
- Renumbering T1.2's ledger rows D1–D7 → D5–D11 (D1 "scaffolding mismatch" resolved by this reconciliation; not carried)
- Merging deferred-items with the committed T1.3 rows (D1–D4)

Re-verified gates after reconciliation: see worklog `T1.2 (reconciled)` entry.
