# Task 10 Outcome — Knowledge Propagation (Task ID 10)

**Plan directory:** `ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display`
**Task:** 10.1 Extend the monitoring-portal canonical doc + outcome synthesis (REQ-061; resolves deferred-item **D6**)
**Executed:** 2026-09-18 (clock) on branch `feat/parent-session-completion-notification-display` (verified via `git branch --show-current` before any write; STABLE worktree `/home/z/kw` only; no commits — orchestrator commits).
**Touch set:** `docs/parents/monitoring-portal.md`, this outcome file, `tasks.md` checkbox flips ONLY. AGENTS.md files and `.agents/instructions/*.instructions.md` were NOT created or updated (hand-curated surfaces — respected). `deferred-items.md` NOT edited (D6's ledger flip is the orchestrator's move, same pattern as D2/D3/D4/D5; this file is the verification reference).

---

## 1. Summary

Closed the last scheduled work item (ledger D6): the canonical portal doc `docs/parents/monitoring-portal.md` now carries the SHIPPED session-completion deep-link display contract, replacing the `:307` DEV1-017 forward-item marker with shipped-state prose, and the plan's carry-over knowledge is synthesized below. All doc claims were cross-checked against the outcome corpus AND the shipped source (path:line greps, §4.2); markdown link integrity verified (14/14 resolve, §4.3); no session/child PII in any example (§4.4). One structural quality-loop finding was reproduced, evidenced, and reported to the orchestrator (§4.1 — the per-file sub-loop's oxlint stage cannot pass for a `.md` file; every repo lint lane config-ignores markdown by design).

## 2. Doc changes (`docs/parents/monitoring-portal.md`)

| # | Location (post-edit lines) | Change |
|---|---|---|
| 1 | `:7` (intro) | Doc-content enumeration updated: "five GraphQL query contracts" → "six GraphQL query contracts"; "the deep-link contract consumed by downstream notification work" → "the shipped session-completion deep-link display contract (DEV1-017)". |
| 2 | `:28`–`:30` | Heading "The five read-only query contracts" → "The six read-only query contracts"; "exactly five root `Query` fields" → "exactly six root `Query` fields". |
| 3 | `:49` | Query-contract table gains row 6: `parentSessionTarget` / `sessionId: Int!` / `ParentSessionTarget!` / `ParentMonitoringService.getSessionTarget(ctx.user.id, args.sessionId, ctx.locale)`. |
| 4 | `:51` | Client-supplied-parameter sentence updated: `args.studentId` AND the session-target read's `args.sessionId` are the only client-supplied parameters; both gated inside the service before any data read. |
| 5 | `:146`, `:197` (R5) | "The five service methods are pure READs" → "The six service methods are pure READs" (both the Pattern section and rule R5). |
| 6 | `:154` | Cache section: "six GraphQL types without an `id`" → seven (adds `ParentSessionTarget` as the session-target deep-link value pair); appended the no-cache-identity property (each `sessionId` variable is a distinct inline entry; repeated resolutions never collide or merge; a failed resolution leaves no stale value for a subsequent id). |
| 7 | `:206` (R14) | "The six no-`id` portal types" → seven, adding `ParentSessionTarget` to the opt-out list. |
| 8 | `:208` (R16) | R16 (the binding deep-link contract) extended with a pointer: "The full shipped contract — entry URL, two-hop resolution, denial fallback, and tab threading — is specified in the session-completion deep-link display contract section below." |
| 9 | `:307` | The DEV1-017 forward-item bullet REMOVED from Forward items (REQ-061: replacing the `:307` marker with shipped-state prose). Remaining forward items untouched. |
| 10 | `:314`–`:369` | **NEW `##` section: "Session-completion deep-link display contract (DEV1-017 — shipped)"** — the core deliverable (content in §3). |
| 11 | `:379` | Related Documents entry for `docs/sessions/session-report-homework.md` extended to name the "link invite, not content mirror" notification-copy principle the display contract honors. |

Scope decision recorded: the original `## Rollout Summary` tables are the HISTORICAL record of the original portal rollout (five fields, ten refs, 62 slots at that time) and were left untouched; the DEV1-017 slice's own surface is captured in the new section's shipped-surface table. Present-tense claims elsewhere in the doc (intro, Pattern, R5, R14) WERE reconciled because the new section would otherwise contradict them — the same docblock/doc count-drift class this plan caught in Task 2 (parity-belt slot counts), the Task 4.5 mid-point wave (READ COMMITTED docblock), and the Task 9 review waves (doc counts ×3).

## 3. The new display-contract section (content, cross-checked SHIPPED)

The section (`:314`–`:369`) documents, in the doc's established structure/tone (### subsections, authoritative paths cited, prose rules):

- **Framing.** Closes the DEV1-017 forward item; extends binding R16 into shipped form. The notification row stays a **link invite, not a content mirror** (`docs/sessions/session-report-homework.md` §4 ruling): no grade/note/child data rides the row or any URL; the content promise is honored only on the gated portal surfaces after resolution. Zero new routes / zero nav entries.
- **Entry URL** (`### The entry URL`): Parent viewer's `SessionCompletion` row routes through a builder cell — `parentSessionCompletionEntry` composes `/parent/children?session=<id>` from `PARENT_PORTAL_ROOT_ROUTE = "/parent/children"`; `<id>` is the row's `relatedEntityId` (the SESSION id, string form). Fires ONLY for a non-empty string-form id — absent/`null`/empty falls to the notifications feed, NEVER fabricated; unresolvable VALUES (e.g. `"0"`) DO compose the URL by design (the portal root owns the failure path). Both call sites (feed `NotificationList.tsx`, drawer `NotificationDrawerBody.tsx`) thread the id via native `<Link>`; the realtime toast path has no navigation.
- **The `parentSessionTarget` read** (`###`): the portal's sixth root query field (`parentSessionTarget(sessionId: Int!): ParentSessionTarget!`, same `parentOnlyAuthScopes` `$all` conjunction) delegating with zero business logic to `ParentMonitoringService.getSessionTarget`; closed two-field value pair `{ sessionId, studentId }` (no `id`, no session content — the child id can only come from the grant check); the frozen flow (validation arm FIRST with generic `errorsTranslations.validation` copy — a SHAPE failure, not the constant denial; `requireActor` → portal rate limit → ONE `repeatable read` transaction: session read → constant localized `ForbiddenError` on miss → `requireLinkedChild` in the SAME snapshot → the pair). Constant-denial oracle extends to this read (nonexistent ≡ foreign ≡ unlinked ≡ severed; byte-identical localized 403s per locale at service/wire/journey tiers); EXACTLY ONE bounded `logDomainError` per denial arm, bag exactly `{ code, entity: "sessions", entityId, locale }` (the linked-child gate inside logs its established `"students"` bag); zero row fields in logs. Document `parentSessionTargetQueryDocument` (closed `sessionId studentId` selection, `$sessionId: Int!` sole variable, identity server-side); `ParentSessionTarget` = seventh no-`id` cache type.
- **Two-hop resolution** (`###`): Hop 1 — the server shell extracts raw `?session=` via the detail shell's `firstValueOf` pattern and forwards it as a plain prop (guard-only: zero fetch, zero server redirect). Hop 2 — `useSessionResolution`: skip-guarded stateful `useQuery(parentSessionTargetQueryDocument)` (skipped when no pointer AND when `parseSessionId` yields no positive safe integer — unusable pointers fail without reaching the wire; the pre-feature root fires zero extra network operations); on success exactly ONE `router.replace` to the canonical R16 landing `/parent/children/<studentId>?tab=reports&session=<sessionId>` composed through the detail container's `buildDetailUrl` (the ONE URL builder), written exactly once per resolved pointer (ref-ledger gated). Single-writer navigation: while the pointer is pending or has landed the first-child auto-select is suppressed (`autoSelectPermitted`) — the landing and auto-select arms are never both open; on failure ownership releases to the auto-select (whose replace clears the stale `?session=`); back-navigation re-arms resolution fresh.
- **Constant-denial fallback** (`###`): every failure cause (FORBIDDEN denial / network / malformed pointer) collapses into ONE client-side boolean → the transient localized notice `sessionTargetUnavailableNotice` (exact en/ar copy quoted; outlined info `Alert`, `data-testid="parent-session-target-unavailable"`) then first-child auto-select. Cause-blind client-side (as invisible as the 403 bytes are server-side); privacy hygiene pinned by the `parentMonitoring` parity belt; failure path performs NO URL write and adds zero logging.
- **One link, three content tabs** (`###`): `renderTabContent` threads the parsed pointer to `ReportsTab`/`HomeworkTab`/`EvaluationsTab`; homework and evaluations rows apply the same mechanism as the shipped report row — shared match rule `isDeepLinkTargetRow` (single-sourced in `ParentChildDetailContainer.helpers.ts`; the reports row's inline rule is decision-identical), `rowRef` + `useEffect` `scrollIntoView({ behavior: "smooth", block: "center" })`, `aria-current="true"`, primary-border treatment. ONE link surfaces report + homework + evaluations rows; tab switches preserve `?session=` via the pre-existing `buildDetailUrl` handlers (no code was needed — none added); progress/attendance deliberately NOT threaded; a pointer absent from the child's own rows matches NOTHING (existence non-disclosure; rows are already `requireLinkedChild`-gated reads).
- **Shipped surface + verification layers** (two tables): implementation anchors per surface, and the final Task-9 suite baselines (journey 6/0, service 88/0, wire 38/0, SDL 71/0, resolver 16/0, documents 18/0, portal-root helpers 19/0, tab highlights 12/0 ×2, parity 160/0) with the approved runner named.

## 4. Verification evidence

### 4.1 10.1.QL — quality loop on the edited `.md` (doc lint lanes)

The prescribed command `bun run scripts/health/sub-loop.ts docs/parents/monitoring-portal.md --lifecycle duplicates` **cannot exit 0 for ANY markdown file in this repo — a structural tool/file-type mismatch, reproduced and reported (Fix-Or-Report), not a content finding**:

- The sub-loop's oxlint stage runs `oxlint --deny-warnings --ignore-path .gitignore docs/parents/monitoring-portal.md` → oxlint prints `No files found to lint.` and exits 1 (markdown is not a lintable extension). Reproduced standalone: `OXLINT EXIT = 1` with zero diagnostics.
- Every repo lint lane config-ignores markdown BY DESIGN: `oxlint.config.mts` `ignorePatterns` includes `"docs/**"` (`:179`) and `"**/*.md"` (`:189`); `eslint.config.mjs` ignores `"docs/**"` (`:46`) and `"**/*.md"` (`:71`) — the lint service returns "File ignored because of a matching ignore pattern" with **0 errors** for this file; biome reports the path as ignored (markdown is not a Biome language; "No files were processed"); `.jscpd.json` scans only `format: ["typescript","tsx"]` AND ignores `docs/**` — the sub-loop's own duplicates check classifies that as **skipped-by-config PASS** (the same classification every `.test.ts` file in this plan's outcomes received).

The lanes that APPLY to a doc-only change were run and pass:

```
bun run scripts/health/sub-loop.ts docs/parents/monitoring-portal.md --lifecycle tsgo
→ ✅ tsgo passed (no errors for docs/parents/monitoring-portal.md)
→ ✅ All checks for lifecycle "tsgo" passed.
→ SUB-LOOP EXIT = 0          (project-wide tsgo run WITH the doc change in the tree — zero type-level drift)

bun run scripts/lint-service.ts -f docs/parents/monitoring-portal.md --json
→ success: false / exitCode: 1 — output is EXACTLY the config-ignore warning
  ("File ignored because of a matching ignore pattern", 0 errors, 1 warning)
  → proves eslint's own ignore policy for md; zero lint findings on content.
```

**CROSS-FILE DEPENDENCY (reported to orchestrator, not fixed — script outside this task's touch set):**
`scripts/health/sub-loop.ts` oxlint stage treats "no files found to lint" as failure; for `.md`/other non-lintable extensions the stage should mirror the script's own jscpd skip (extension/out-of-scope guard → skipped-PASS) so future doc tasks can satisfy a literal `--lifecycle duplicates` exit 0. Rule basis: Fix-Or-Report (never modify an unassigned file); evidence: this section.

### 4.2 10.1.SR — doc matches SHIPPED behavior (cross-checked, not plan-intent)

Every claim in the new section was verified against the working tree (branch `feat/parent-session-completion-notification-display`), not just the outcome prose:

| Doc claim | Shipped evidence |
|---|---|
| `PARENT_PORTAL_ROOT_ROUTE = "/parent/children"`; builder `` `${PARENT_PORTAL_ROOT_ROUTE}?session=${relatedEntityId}` ``; 4th param `relatedEntityId?: string \| number \| null`; nullish/empty → feed (never fabricate) | `frontend/lib/notification-route-resolution.ts:44`, `:114-115`, `:250`, `:212`, `:270` (Task 6 outcome §5 contract) |
| Call sites thread `relatedEntityId` via native `<Link>` | `NotificationList.tsx` / `NotificationDrawerBody.tsx` (Task 6 §2/§5; unchanged since) |
| Sixth query field, `$all` parentOnlyAuthScopes, `ctx.user` narrowing, zero-logic delegation to `getSessionTarget(ctx.user.id, args.sessionId, ctx.locale)` | `backend/graphql/query/parents/parent-monitoring.query.ts:250-269` |
| Frozen service flow; validation arm FIRST (generic validation copy); constant `ForbiddenError` on miss; `requireLinkedChild` in same tx; closed pair; log bag `entity: "sessions"` | `backend/services/parents/parent-monitoring.service.ts:366-394` (`:386` = `entity: "sessions"`) |
| Seventh no-`id` cache type | `frontend/providers/apollo/apolloCache.ts:119` (`ParentSessionTarget: { keyFields: false }`) |
| `parentSessionTargetQueryDocument` closed selection / single variable | `frontend/graphql/sharedDocuments/parents/parent-monitoring.documents.ts:242` |
| Shell `firstValueOf` extraction + plain-prop forwarding, guard-only | `app/(dashboard)/parent/children/page.tsx:49`, `:70`, `:72` |
| Skip-guarded `useQuery`, exactly-once ref-ledger `router.replace`, parse gate | `frontend/views/parent/monitoring/useSessionResolution.ts:37-66` |
| `parseSessionId` / `resolveSessionFlow` / `autoSelectPermitted` / `landingReplaceDue` / `buildSessionLandingUrl` | `frontend/views/parent/monitoring/ParentChildrenRootContainer.helpers.ts:48,98,116,131,141` |
| `isDeepLinkTargetRow` single-sourced; homework/evaluations rows carry the mechanism | `ParentChildDetailContainer.helpers.ts:28`; `HomeworkTab.parts.tsx:51`, `EvaluationsTab.parts.tsx:63` |
| Notice copy en/ar + privacy pins | `shared/locale/en/parentMonitoring/index.ts:16` ("This session's details are no longer available."); ar per Task 2 outcome + parity belt 160/0 |
| Verification-layer table counts | Task 9 outcome final test-layer table (verbatim) |

Counts reconciled in the doc (§2 items 1–7) are the shipped deltas of Tasks 3/5 (sixth field, seventh no-id type). The en/ar notice strings and all URL examples contain NO session/child PII — placeholders only (`<id>`, `<sessionId>`, `<studentId>`).

### 4.3 Markdown link integrity

Programmatic check over every markdown link in the edited doc (relative-path resolution against the repo): **14 links resolve / 0 broken** (2 intro links + 12 Related Documents links, including the extended `../sessions/session-report-homework.md`). No new links were added that could break; heading outline verified (single `##` section with five `###` subsections, `---` separators preserved).

### 4.4 SEC (per task text — docs only)

No session/child PII in examples: all ids are `<placeholder>` form; the only 4+-digit numeric token in the whole doc is the pre-existing PostgreSQL error code `42702` (Anti-patterns section, untouched). No grade/score/notes content quoted anywhere; the quoted notice copy is the parity-pinned static string.

### 4.5 10.1.IV — `.agents/spec-process-guide/` conventions

- `execution/implementation-guide.md` §Post-Implementation Knowledge Propagation: read ALL outcome files first (done — full corpus §5.1); durable knowledge goes to `docs/` + outcome files ONLY; **AGENTS.md / `.agents/instructions/` are hand-curated and NEVER updated by plan work — respected (zero touches)**; docs-file structure conventions (Why/Pattern/Rules/What-NOT-to-do/Rollout/Related) honored by EXTENDING the existing canonical doc in its own structure rather than minting a new file.
- `templates/checklists.md` knowledge-propagation checklist: final task propagates learnings into the canonical doc under `docs/<domain>/`; rule files untouched ✓.
- `execution/quality-assurance.md` review-wave pattern: Task 9 executed it; this task consumed its final baselines rather than re-running waves.
- Sub-loop discovery for the doc printed root `AGENTS.md` (no applicable `.agents/instructions` files for `.md`) — read and honored (no summary-markdown files created; this outcome file is the plan's own required bookkeeping, P4/P5).

## 5. Knowledge synthesis — carry-over patterns/gotchas across the outcome corpus

Durable knowledge lands in `docs/parents/monitoring-portal.md` (the display contract) + this outcome; the recurring, cross-task classes:

1. **Wire-name vs `ReturnType` discipline** (Tasks 3.1/4.1/5.1; mid-point review-types): canonical TS type `ParentSessionTargetReturnType` lives in `backend/types/parents/`; the wire name `ParentSessionTarget` (dropping the `ReturnType` suffix, per the ten-ref precedent) is confined to objectRef/SDL/pins; codegen emits the compact extracted type `ParentSessionTargetQuery_parentSessionTarget`; the documents file exports `parentSessionTargetQueryDocument` while the operation-named runtime const `ParentSessionTargetDocument` inside `gql/graphql.ts` must NEVER be imported. Keep the three namespaces separate or the pins drift.
2. **Per-file QL loop effectiveness** (every task; ~15 gate findings across the plan, all fixed in-file, zero suppressions): the progressive tsgo→oxlint→biome→lint→duplicates short-circuit catches real classes — `unicorn/consistent-function-scoping` (non-capturing closures → module scope), `sonarjs/no-alphabetical-sort` (comparator-less `toSorted` → `localeCompare`), `no-unsafe-type-assertion` (`Reflect.get` + `unknown` + type guard, never `as unknown as`), `react-refresh/only-export-components` (pure helpers CANNOT live in component-bearing `frontend/views/**` files → `.helpers.ts` is the sanctioned home), `react(refs)` (refs read/written only inside effects), `exhaustive-effect-dependencies`, `max-lines-per-function` (extract hooks/pure modules). Budget for 1–3 rounds on new view/hook files.
3. **Test-first forward-contract bridge for RED-first journeys** (Task 1.1 → 3.1): a locally-declared interface + `Reflect.get` member lookup + a LOUD missing-contract failure lets a journey compile against a contract that doesn't exist yet (tsgo stays clean, RED is attributable to exactly the missing member), then the implementing task deletes the bridge and swaps in direct typed calls. RED→GREEN history (3 pass/3 fail → 6/0) becomes the honesty record.
4. **Docblock/doc count-drift class** (Task 2: stale 74/76 slot counts → 117; mid-point: READ-COMMITTED docblock vs repeatable-read code; Task 9: doc counts ×3; Task 10: canonical-doc "five fields"/"six no-id types" reconciled): any embedded count (slot totals, method counts, type inventories) drifts silently when inventory grows — sweep and update counts in the SAME change as the growth, and prefer structural pins over prose counts.
5. **Sandbox branch-flip / shared-worktree mitigation** (Task 0 branch note; Tasks 3/4 external HEAD flips; Tasks 5/6 concurrent uncommitted files; mid-point INFO): re-assert `git branch --show-current` before EVERY critical step; keep to the dedicated worktree (`/home/z/kw`); disjoint file sets per task; attribute concurrent deltas at review time (Task 9 did) instead of touching them.
6. **Test-infra gotchas worth keeping**: never pin transaction-object identity across `withTransaction(outerTx, …)` (savepoint = NEW handle; pin propagation); `TEST_SERVER=1`/`TEST_CI=1` bypass the portal rate limiter (temp-clear + `finally`-restore for one probe on a dedicated actor; per-file process spawn makes it safe); wire fixtures must be visible to the wire server (real PostgreSQL 17 shared visibility; PGlite would break them); a wedged warm server on port 3066 eats the 120s `beforeAll` cap (check the port/log before suspecting the suite); plain `bun` is the working binary (`~/.bun/bin/bun` absent in this sandbox); approved runner only (`bun run test/scripts/run-test.ts <path>`), never raw `bun test`; GraphQL `Int!` rejects `2^31` at parse time while 0/−1 reach the service's VALIDATION arm — keep the two boundary arms distinct.
7. **Scope-boundary posture that held all plan long**: byte-frozen surfaces (emission substrate, `notifications` namespace, schema/mutations) verified zero-diff at every task; pre-existing failures (`navItems.test.ts`, `purchaseVerificationPlan` pin drift) RECONCILED with the file's own documented patterns, never silently fixed from an unassigned task.

## 6. D6 satisfaction evidence (for the orchestrator's ledger flip)

Ledger row D6: "`docs/parents/monitoring-portal.md` DEV1-017 display-contract section update (knowledge propagation) … Extends the binding deep-link contract at `docs/parents/monitoring-portal.md:207` and the DEV1-017 forward item `:307` with the resolver/portal display behavior."

- `:207` (R16) extended with the pointer to the shipped contract (§2 item 8). ✅
- `:307` forward item REMOVED, replaced by the shipped-state section at `:314-369` covering two-hop navigation, the `parentSessionTarget` read, entry-URL → canonical-URL mapping, the constant-denial oracle/fallback, and the tab-highlight threading (§3) — exactly REQ-061.1's enumeration. ✅
- REQ-061.2 satisfied by this outcome file (delivered surface §2–3, deviations/structural finding §4.1, carry-overs §5). ✅
- Suggested ledger flip: D6 → ✅ Done, verified by `10-knowledge-propagation-outcome.md` §2–4. After the flip, `grep -c "❌\|⚠️" deferred-items.md` = 0 and the plan is complete.

## 7. Protocol confirmations

- **P1 outcome read:** ALL outcome files read in full before work: `0-baseline`, `1.1`, `2.1`, `3.1`, `4.1`, `midpoint-review-R1`, `5.1`, `6.1`, `7.1`, `8.1`, `9.1` (plus `tasks.md`, `specs.md` REQ-061, `deferred-items.md`, root `AGENTS.md`, `.agents/spec-process-guide/` knowledge-propagation guidance).
- **P2 QL:** §4.1 — applicable doc lanes green (tsgo exit 0 with the change in-tree; all code-lint lanes config-ignore `docs/**`+`**/*.md` by design, evidenced); the sub-loop `.md` gap reported per Fix-Or-Report.
- **P3 SR:** §4.2 claim-by-claim cross-check against shipped source; §4.3 link integrity 14/0; count drift reconciled; Rollout Summary preserved as historical record.
- **P4/P5:** this outcome file + the `tasks.md` checkbox flips (`10.1`, `10.1.QL`, `10.1.SR`, `10.1.IV` → `[x]`; TE/SEC left N/A per the task text) are the task bookkeeping; no summary markdown created.
- **P6 IV:** §4.5 — hand-curated rule files untouched; approved tooling only; no caches cleared anywhere.
