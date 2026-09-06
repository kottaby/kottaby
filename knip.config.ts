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

    // Auto-generated exhaustive IANA timezone catalog — consumed via Object.values(),
    // individual members are never referenced by name (441 enumMember false positives)
    "shared/constants/iana-timezone.enum.ts",
  ],

  // Tooling-only / lifecycle dependencies not statically imported from any source file.
  // These are spell-check dicts and duplicate scanner.
  // Conservative starter set — re-run knip after entry changes to verify remaining deps.
  ignoreDependencies: ["lint-staged", "jscpd", "@cspell/dict-ar", "@cspell/eslint-plugin"],
};

export default config;
