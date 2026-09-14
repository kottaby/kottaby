/**
 * Shared Test Runner UI & Formatting Helpers
 *
 * Consolidates duplicate progress bar rendering, line deduplication,
 * and ANSI escape code stripping across test runners.
 */

export function stripAnsiCodes(str: string): string {
  const ESC = String.fromCharCode(27);
  return str
    .split(ESC)
    .map(part => part.replace(/^\[[0-9;]*m/, ""))
    .join("");
}

export function deduplicateLines(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const result: string[] = [];
  let currentLine = "";
  let currentCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line === currentLine && line.length > 0) {
      currentCount++;
    } else {
      if (currentCount > 1) {
        result.push(`  \x1b[90m⤷ (repeated ${currentCount - 1} more times)\x1b[0m`);
      }
      currentLine = line;
      currentCount = 1;
      result.push(line);
    }
  }

  if (currentCount > 1) {
    result.push(`  \x1b[90m⤷ (repeated ${currentCount - 1} more times)\x1b[0m`);
  }

  return result.join("\n");
}

export function renderProgressBar(current: number, total: number, width = 16): string {
  if (total <= 0) return "\x1b[90m[────────────────]\x1b[0m";
  const ratio = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const percent = Math.round(ratio * 100);
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `\x1b[36m[${bar}]\x1b[0m \x1b[1m${percent}%\x1b[0m \x1b[90m(${current}/${total} files)\x1b[0m`;
}

/**
 * Payment/tunnel keys whose DEV `.env` values must never reach a spawned
 * test process. The parent `bun run` auto-loads the cwd `.env` into
 * `process.env`, and dotenv precedence puts an inherited var ABOVE
 * `--env-file=.env.test` — which does not define these keys — so without
 * this strip every spawned test silently resolves the DEV payment
 * provider/webhook state instead of the test defaults (mock gateway,
 * webhooks off). Deleted BEFORE the env-file values merge in, so a future
 * `.env.test` definition still wins. The Paymob live suites are unaffected:
 * they opt in explicitly via `process.env` inside `beforeAll` (after spawn),
 * and their credentials travel through `--env-file=.env.test`.
 */
const DEV_LEAKED_ENV_KEYS = ["PAYMENT_GATEWAY_PROVIDER", "PAYMENT_WEBHOOK_ENABLED"] as const;

/**
 * Deletes every {@link DEV_LEAKED_ENV_KEYS} member from an env record built
 * off `process.env`. Mutates the record in place — call it as the LAST step
 * before spawning, after both env sources (parent env + test env file) have
 * merged.
 */
export function stripDevLeakedEnvKeys(env: Record<string, string | undefined>): void {
  for (const key of DEV_LEAKED_ENV_KEYS) {
    delete env[key];
  }
}
