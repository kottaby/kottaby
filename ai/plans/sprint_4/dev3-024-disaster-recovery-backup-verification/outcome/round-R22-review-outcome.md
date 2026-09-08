# Round R22 — Review Outcome (post-confirmation verification wave)

Trigger: independent confirmation pass requested on the completed plan. The R21-close claim ("zero findings") was re-validated empirically from a cold state.

## Scope reviewed

`git diff --name-only` vs Phase-0 baseline, plus re-execution of the full toolchain on the branch worktree.

## Re-executed gates

| Check | Result | Exit |
|---|---|---|
| `bun run tsgo` | 0 errors | 0 |
| `bun run biome:check` | 1438 files, no fixes needed | 0 |
| `bun run oxlint` | 1412 files, 0 warnings / 0 errors | 0 |
| `bun run check:unused` (knip) | clean | 0 |
| `bun run check:duplicates` (jscpd) | 0 clones | 0 |
| `scripts/lint-service.ts --type-aware` (full repo) | 0 problems | 0 |
| `bun run quality-gate` (full suite) | ✨ ALL QUALITY GATES PASSED — Lifecycle: DONE (Empirically verified) | 0 |
| Unit suite (4 files: `_shared`, `backup-database`, `restore-verify`, `scripts-registration`) | **261 pass / 0 fail**, 1593 expect calls | 0 |

## Findings (2 — both fixed this round)

1. `[HIGH]` `scripts/ops/restore-shared.ts:276` — `sonarjs/regex-complexity`: the monolithic three-alternative libpq `dbname=` scan regex scored 21 against the allowed 20, failing both the type-aware lint stage and plain `bun run lint`. **Fix (behavior-preserving):** split into two simpler scans — a quoted-forms regex (double/single groups) and an unquoted-span regex — merged into libpq's single leftmost, non-overlapping keyword walk via offset-stable ordering (`toSorted`) with a `scannedTo` overlap guard; at a shared offset the quoted candidate wins, exactly matching the previous alternation precedence. Overlap semantics verified equivalent to `matchAll` resumption (inner candidates dropped; `start === scannedTo` boundary accepted).
2. `[MEDIUM]` `scripts/ops/restore-shared.ts:292` — `sonarjs/different-types-comparison`: `doubleQuoted === undefined` compared a `RegExpMatchArray` index-typed `string` against `undefined` (statically always-false, while undefined at runtime when the group did not participate). **Fix:** switched to named capture groups (`?<double>`, `?<single>`, `?<unquoted>`) read via `match.groups?.` (honestly typed `string | undefined`) with `typeof … === "string"` guards — the same runtime-safe pattern already used for the single-quote group. Branch order (single → double → unquoted) unchanged.

## Verification of the fix

- `bun run scripts/health/sub-loop.ts scripts/ops/restore-shared.ts --lifecycle duplicates` → exit 0 (all five stages).
- Full-repo type-aware lint → exit 0, 0 problems (the 2 errors no longer appear anywhere).
- Unit suite → 261/261 pass, 1593 expect calls — identical counts to the prior gate, confirming conninfo redaction semantics are unchanged (quote folding, escape folding, quoted-precedence, overlap behavior).
- Full `LINT_MAX_OLD_SPACE_MB=3072 bun run quality-gate` → exit 0.

## Environment note (non-code)

On this 3.9 GiB-RAM sandbox the lint service's adaptive child heap cap (floor(totalMem × 0.7) ≈ 2828 MB) OOMs during full-repo type-aware lint; `LINT_MAX_OLD_SPACE_MB=3072` is the empirically proven value (3328 gets kernel-killed). `NODE_OPTIONS` is intentionally overridden by `scripts/lint-service.ts`, so the dedicated env var is required. No repo change made for this (host-specific tuning knob already exists).

## Cross-file dependencies

None — single-file fix, no other file required changes.

## Carry-forward knowledge

- Trust gate claims only from cold caches; a stale `.eslintcache` can mask findings (the prior "final gate PASS" ran before these two files' last edits).
- Use `toSorted`/`toReversed` on arrays derived from spread literals — the repo's oxlint ruleset enforces `unicorn/no-array-sort`.
- RegExpMatchArray's numeric index signature types matched groups as `string`; runtime groups can be `undefined` — always guard with `typeof` or read named groups via `match.groups?.`.

## Verdict

**Round R22: 2 findings, 2 fixed, re-reviewed green. Zero feature-specific findings remain open.**
