import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Test infrastructure (test/scripts/run-server-tests.ts, scripts/lib/test-build-env.ts,
  // and `dev:safe`) runs additional Next servers alongside the system dev server.
  // Next derives its dev-server lockfile path from `distDir` (`<distDir>/lock`), so
  // those servers MUST land in a per-instance dist dir (`.next-test-dev`,
  // `.next-test-prod`, `.next-dev`) via the NEXT_DIST_DIR env var. Without this wiring
  // they share `.next/` with the port-3000 server and exit with
  // "Another next dev server is already running".
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  allowedDevOrigins: ["*.space-z.ai", "*.space-zai"],
  experimental: {
    // TypeScript 7.0.2's `lib/tsc.js` is an ESM module that cannot be loaded
    // by Next.js's runTypeScriptCli (which uses require/child_process).
    // Setting `useTypeScriptCli: false` makes Next.js use the `lib/typescript.js`
    // API path instead, which works correctly with the TS6 shim installed by
    // @typescript/typescript6. This fixes the "Could not parse output from
    // TypeScript's --showConfig" error in Storybook.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
