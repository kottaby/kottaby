import type { KnipConfig } from "knip";

/**
 * Knip unused-code / unused-dependency analysis.
 * Prefer `knip.config.ts` over `knip.ts` so `import … from "knip"` resolves to the package.
 *
 * Next.js, Storybook, Bun test, ESLint, Biome, and Drizzle plugins auto-detect their own
 * entry files; `entry` / `project` below set the analysis scope for this monorepo layout.
 */
const config: KnipConfig = {
  entry: [
    "app/**/page.tsx",
    "app/**/layout.tsx",
    "app/**/route.ts",
    "scripts/**/*.ts",

    // Backend DB seed & migration runners — invoked via `bun run` / `drizzle-kit`,
    // they are the import-graph root for 100+ backend/db/seeds/** files
    "backend/db/scripts/**/*.ts",
    "backend/db/seeds/index.ts",

    // GraphQL schema side-effect registration — `import "@/backend/graphql/pothos"`
    // registers all Pothos types by side-effect (no named imports from the call site)
    "backend/graphql/gqlSchema.definitions.ts",
    "backend/graphql/pothos/index.ts",
    "backend/graphql/query/index.ts",
    "backend/graphql/mutation/index.ts",

    // Bun --preload test roots — loaded via `bun test --preload <file>` CLI flag,
    // never statically imported (package.json scripts: test:ui:components, test:ui:e2e, etc.)
    "test/ui/test-env.ts",
    "test/ui/components/happydom-preload.ts",
    "test/ui/components/next-dynamic-mock.ts",

    // Bun test runners invoked by path string only (run-locked-cmd wrapper args
    // in package.json scripts + the AGENTS.md-documented AI runner) — knip
    // cannot see nested wrapper commands.
    "test/scripts/build-test.ts",
    "test/scripts/run-server-tests.ts",
    "test/scripts/run-test.ts",
  ],
  project: [
    "app/**/*.{ts,tsx}",
    "backend/**/*.{ts,tsx}",
    "frontend/**/*.{ts,tsx}",
    "shared/**/*.{ts,tsx}",
    "scripts/**/*.{ts,tsx}",
    "test/**/*.{ts,tsx}",
  ],
  ignore: [
    "!.storybook/**",
    "**/generated/**",

    // Storybook story aggregation — re-exports *.stories.tsx, accessed only by
    // @storybook/react plugin globbing, never by app code
    "frontend/stories/**",

    // Auto-generated IANA timezone catalog (ids/labels/territories/enum) — outputs of
    // `generate:iana-timezones` (scripts/iana-timezone-generator/paths.ts). Consumed via
    // Object.values() + the codegen IanaTimezone scalar mapping; members are never
    // referenced by name. Regenerated deterministically — never hand-edit, never delete.
    "shared/constants/iana-timezone*.ts",

    // DB/GraphQL-schema-backed enums — member/export usage is invisible to knip's
    // import graph (values live as pgEnum string literals in the schema + migrations,
    // or the whole enum is registered with Pothos). Grep-verified per file:
    //   - payment-status: "refunded" is part of the live `payment_status`
    //     pgEnum (backend/db/schema/enums.ts + drizzle migration 20260904084151)
    //     — the TS enum must stay value-complete to mirror the DB type.
    //   - register-public-role: whole enum registered as the GraphQL
    //     `RegisterPublicRole` type (backend/graphql/pothos/shared/enum.pothos.ts)
    //     — all three members are schema-exposed.
    //   - surah-juz-ref: mirrors the live `surah_juz_ref` pgEnum backing
    //     home_work.current/revision_surah_juz columns; Pothos registration is
    //     pending future schema work.
    //   - recitation-reading: documented backend re-export shim of the canonical
    //     shared enum (docs/auth/qiraah-selection-and-c5.md) — an intentional
    //     @/backend/enum import-path alias, not a second value list.
    "backend/enum/billing/payment-status.enum.ts",
    "backend/enum/users/register-public-role.enum.ts",
    "backend/enum/shared/surah-juz-ref.enum.ts",
    "backend/enum/shared/recitation-reading.enum.ts",
  ],

  // Dependencies that are genuinely used but invisible to knip's import graph.
  // Each entry has a functional reference (config string, bin invocation, file-path
  // access, or docs-mandated runtime) — grep-verified before registration.
  ignoreDependencies: [
    // jscpd: bin invoked through the `check:duplicates` script wrapper (knip cannot
    // see binaries nested inside run-locked-cmd.ts arguments).
    "jscpd",
    // @cspell/dict-ar: dictionary loaded by cspell.config.yaml
    // (`@cspell/dict-ar/cspell-ext.json`) — config-string reference, never imported.
    "@cspell/dict-ar",
    // lint-staged / @cspell/eslint-plugin: no live reference found (husky pre-commit
    // hook is empty; the eslint import is commented out). Retained pending a
    // removal decision in a later cleanup wave.
    "lint-staged",
    "@cspell/eslint-plugin",

    // newrelic: string in next.config.ts `serverExternalPackages` + the newrelic.cjs
    // agent config + NEW_RELIC_* env surface (agent is require()d by the runtime,
    // not imported by app code).
    "newrelic",

    // @pothos/plugin-dataloader + dataloader: canonical batching pattern mandated
    // by docs/graphql/dataloader-batching.md + backend AGENTS.md ("t.loadable() for
    // any per-parent field") — no static registration yet by design.
    "@pothos/plugin-dataloader",
    "dataloader",

    // @typescript/native-preview: provides the `tsgo` bin (node_modules/.bin/tsgo)
    // used by CI, the quality gate, and scripts/health/*.
    "@typescript/native-preview",

    // @typescript/typescript6: required by literal path in scripts/ts6-eslint-patch.cjs
    // (swaps eslint's typescript for the TS6 shim) + next.config.ts useTypeScriptCli.
    "@typescript/typescript6",
    // cldr-*: raw JSON files read via node_modules/... file paths by the IANA
    // timezone generator (scripts/iana-timezone-generator/paths.ts).
    "cldr-core",
    "cldr-dates-full",
    "cldr-localenames-full",
  ],
};

export default config;
