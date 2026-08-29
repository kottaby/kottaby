# Autofix Failure Playbook

Root-cause patterns and fix mechanics for every pipeline phase. Read the section that matches the
failing phase before editing anything. Every fix must comply with the instruction files and
`AGENTS.md` layers the sub-loop prints for the target file.

---

## Phase 2: DB migration failures

### Idempotency contract

Migrations must replay cleanly over ANY reachable DB state: a fresh DB, a drizzle-journaled DB, and
a push-built DB with an empty journal (every folder replays). The enforcer is
`backend/db/scripts/ensureIdempotentMigrations.ts` — it rewrites migration SQL to be idempotent
before replay.

**Known failure class — 42P07 (relation/sequence already exists) on push-built DBs:**
the CTAS heuristic in `transformCreateTable` false-positives when a `CREATE TABLE` body contains a
bare `AS` — e.g. `GENERATED ALWAYS AS IDENTITY` — so the `IF NOT EXISTS` guard is skipped. The fix
pattern: CTAS detection must require a real query start (`AS SELECT|VALUES|EXECUTE|TABLE`), never a
bare `AS`:

```ts
const CTAS_PATTERN = /\bCREATE\s+TABLE\b[\s\S]*?\bAS\s+(?:SELECT|VALUES|EXECUTE|TABLE)\b/i;
```

**Checklist when a migration fails:**
1. Reproduce: is the failing DB journaled or push-built? (`bun db migrate` output names the replayed folders.)
2. Check the failing statement against the idempotency transforms — missing `IF NOT EXISTS`,
   non-idempotent custom SQL (`DO $$` blocks, plain `CREATE INDEX` without `IF NOT EXISTS`).
3. Fix the transform or the migration source — NEVER hand-edit the generated folder without
   fixing the generator, or the next replay drifts again.
4. A rewritten schema folder (`backend/drizzle/<ts>_schema/migration.sql`) is an INTENDED artifact —
   commit it together with the generator fix in one scoped commit.

### Seed failures

The seed is idempotent by doctrine (demo users are skipped when they exist, plans are reused).
A seed failure is almost always a schema/seed contract mismatch introduced by a recent migration —
diagnose the column/type mismatch, fix the source of truth, and re-run.

### Codegen drift (`generate:gqlSchema` / `codegen` dirty the tree)

Committed artifacts (`frontend/graphql/generated/schema.graphql`, `.../gql/graphql.ts`) must be
byte-identical to freshly generated output. A non-empty `git status` after generation is a REAL
finding. Adjudicate before acting:

- **Intentional schema change** (someone changed Pothos definitions without regenerating): review
  the diff, confirm it matches the source change, commit the artifacts WITH the source change.
- **Unintentional drift**: a generator config or plugin version changed output shape — fix the
  config, do not commit artifacts that disagree with the source of truth.
- Never hand-edit generated files.

---

## Phase 3: Quality gate stage failures

Stages run in strict order — tsgo → oxlint → biome → lint:type-aware → check:duplicates. Fix only
the failing stage, then re-run `bun quality-gate` (resume). Never interleave stages within a fix
wave.

### tsgo (type errors)

Group errors by dependency (shared imports/types = same group). Fix groups sequentially, files
within a group in parallel (one subagent per file, `--lifecycle tsgo`). Re-run `bun tsgo` after each
group — type fixes cascade.

### oxlint

Fix patterns live in `docs/quality/linting-rules.md`. The recurring ones:

| Rule | Fix pattern |
|---|---|
| `no-unsafe-type-assertion` | Type guards (`value is Type`), `instanceof Error`, `satisfies Partial<T>`. `as unknown as T` does NOT bypass. |
| `no-await-in-loop` | `Promise.all(arr.map(...))` for independent work; sequential helper for shared transactions. `for await...of` is not flagged. |
| `consistent-function-scoping` | Move non-capturing functions to module scope. |
| `no-object-type-as-default-prop` | Extract default to module-level `const`. |
| `no-shadow` | Destructuring rename or `_` prefix for unused params. |
| `consistent-return` | `return undefined` explicitly; `throw` after unhandled switch cases. |

Never add `oxlint-disable` comments — fix the root cause.

### biome

Biome auto-fixes (`--write --unsafe`). After a biome pass, `git diff` to see what it rewrote —
biome may reformat regions you are about to edit, so RE-READ the file before applying `Edit`
operations. Remaining biome findings are usually intentional-format conflicts; fix the code, not
the config.

### lint:type-aware (ESLint + sonarjs)

Surfaces after oxlint fixes (type context changed). Recurring patterns:

| Rule | Fix pattern |
|---|---|
| `sonarjs/super-linear-regex` | Split one combined alternation into several small linear regexes; scan per line instead of one whole-file multiline regex. |
| `sonarjs/regex-complexity` | Same decomposition; keep each pattern's complexity under the threshold (20). |
| `sonarjs/cognitive-complexity` | Extract case blocks / nested conditionals into named module-scope helpers. |
| `sonarjs/no-nested-functions` | Extract nested callbacks to module-scope factory functions. |
| `sonarjs/different-types-comparison` | `T | null` (no `undefined`) → drop `!== undefined`, keep `!== null`. |
| `sonarjs/no-hardcoded-passwords` | Extract to a module constant sourced from env. |
| `sonarjs/void-use` | Wrap the expression in a validation IIFE that returns a boolean. |

### check:duplicates (jscpd)

Remediation patterns: `docs/frontend/duplication-elimination-patterns.md` (A–G) and
`docs/frontend/ui-shared-scaffold-pattern.md`. Hard rules: zero `jscpd:ignore` comments, zero
`.jscpd.json` edits. Clones UNDER the threshold are benign — note the count, don't chase them.

---

## Phase 4: Test suite failures

### Isolate before diagnosing

Run the single failing file through the run-test script before theorizing:

```bash
bun run scripts/run-test/run-test.ts <test-path>
bun run scripts/run-test/run-test.ts --last <test-path>
```

If it passes in isolation, suspect test pollution or shared state — not the test's subject.

### Test pollution

- Suites share physical DBs (e.g., the graphql runner has historically shared `kottaby_test`).
  Audit-trail pollution across tests is a known failure class — the guard exists; new tests must
  respect it (clean per-test state, don't assert on cross-test residue).
- Server-backed suites (`test:graphql`, `test:ui:components` with `TEST_SERVER_MODE=production`)
  must not run concurrently with code edits or another server run — serialize them.

### Suite-specific gotchas

- **locale**: requires `KOTTABY_TEST_RUNNER_OK=1` — running bare `bun test shared/locale/` looks
  like a failure but is a missing env var.
- **integration**: may be an empty tier; the runner exits 0 gracefully. An empty tier is green.
- **ui:static**: import-boundary scans only (per `test/ui/AGENTS.md`) — client-isolation
  (`"use client"` modules must not import `@/backend/*`, `server-only`, `@/shared/locale/server`,
  `next/server`, `next/headers`) and viewport-hook isolation (`useMediaQuery` only in client
  modules). A red here means a REAL boundary violation in source code — fix the importing module.
- **db/services parallel runners**: a flaky failure that vanishes on re-run with an unchanged tree
  may be inter-file DB contention; reproduce once before declaring flake.

---

## Fix-loop mechanics

- Per-file progressive verification (short-circuits at first failure):
  ```bash
  bun run scripts/health/sub-loop.ts <file-path> --lifecycle lint        # tsgo→oxlint→biome→lint:type-aware
  bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates  # + check:duplicates
  ```
- Batch verification of everything uncommitted (runs each check once, project-wide):
  ```bash
  bun run scripts/health/sub-loop-uncommitted.ts [--lifecycle <stage>]
  ```
- Cross-file dependency report format (stop editing, hand to orchestrator):
  ```
  CROSS-FILE DEPENDENCY:
    Target file: <this file>
    Blocked by: <other file>
    Rule violated: <rule>
    Required fix: <what the other file needs>
  ```
- Parallel subagent pools: 16 max per wave, one file per subagent, `git add` the file after its
  sub-loop passes. Full orchestration detail: the `quality-gate` skill.

## Incident-derived lessons (append as they recur)

- **Biome rewrites files mid-wave** → re-Read files before `Edit` or your `old_str` will not match.
- **Generated schema folders rewritten by the idempotency enforcer are expected** → commit them
  with the generator fix, never alone, never reverted.
- **A gate green is not a repo green** → only a full autofix round (pipeline + gate + all suites)
  counts as green.
