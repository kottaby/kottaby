import { restoreCanonicalNextEnvDts } from "@/scripts/lib/restore-next-env-dts";

const restored = await restoreCanonicalNextEnvDts();
if (restored) {
  process.stdout.write("Restored next-env.d.ts to canonical dev dist dir (.next-dev).\n");
}

// Exit explicitly: importing through module scope can construct long-lived
// singletons (e.g. the DB pool under DB_PROVIDER=pglite) that keep the Node
// event loop alive after the script's work is done. This is a one-shot CLI
// step ahead of the type-checker — it must always terminate on its own.
process.exit(0);
