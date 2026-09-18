# Plan Review Report — Parent Session Completion Notification Display

**Plan directory:** `ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display`

## Review Round: 1
## Date: 2026-09-17
## Subagents Dispatched: verify-paths-citations · verify-layer-agents-compliance · verify-i18n-graphql-accuracy · verify-cross-reference-consistency (4 parallel, read-only)

---

## Summary

- **Total issues found:** 9
- **Blocking (CRITICAL/HIGH):** 1 (HIGH — Apollo cache key / GraphQL wire-type-name mismatch)
- **Medium:** 0
- **Low/Notes:** 8

**Verdict: Plan passes all AGENTS.md rules for affected layers** — after the
R1 fix wave; every finding is fixed and re-verified (post-fix greps return
zero stale patterns; REQ traceability zero misses).

---

## Findings by Dimension

| Dimension | Subagent | Issues Found | Status |
|---|---|---|---|
| Paths & Citations | verify-paths-citations | 3 (1 drift class) | ✅ Fixed |
| Layer AGENTS.md Compliance | verify-layer-agents-compliance | 2 | ✅ Fixed |
| i18n + GraphQL Accuracy | verify-i18n-graphql-accuracy | 3 | ✅ Fixed |
| Cross-Reference Consistency | verify-cross-reference-consistency | 1 | ✅ Fixed |

Sampling: ~60 citations verified live; ~57 exact on first pass; the RED
resolver-suite baseline (5 pass / 2 fail) was reproduced live; all
CREATE-labeled symbols confirmed non-existent (no name collisions); all ten
layer AGENTS.md files read; all 19 frozen REQ ids consistent across all four
plan files.

---

## Detailed Findings

### 1. [HIGH] [GRAPHQL/apollo-cache] plan.md §3.5 (+ research-00 R-I) — cache key vs wire type name

- **Location:** plan.md §3.1/§3.2/§3.5; `outcome/research-00-planning-basis.md:89`
- **Expected:** Apollo type policies key on the GraphQL `__typename`. The
  Pothos wire name drops the `ReturnType` suffix — precedent:
  `backend/graphql/pothos/parents/parent-monitoring.pothos.ts:179,:312`
  (`interface ParentReportPageReturnType` ↔ objectRef `"ParentReportPage"`).
- **Actual:** Plan declared SDL `parentSessionTarget(...): ParentSessionTargetReturnType!`
  / objectRef `"ParentSessionTargetReturnType"` while keying the cache policy
  `ParentSessionTarget` — a dead policy for a type that would never exist on
  the wire.
- **Fix Applied:** SDL is now `parentSessionTarget(sessionId: Int!): ParentSessionTarget!`;
  objectRef `.objectRef<ParentSessionTargetReturnType>("ParentSessionTarget")`;
  cache key `ParentSessionTarget` equals the wire name (consistent across
  plan.md, specs.md REQ-030, tasks.md Tasks 3.1/4.1, research-00 §4). The TS
  interface keeps its `ReturnType` name in `backend/types` contexts.

### 2. [LOW] [CITATION DRIFT] auto-select effect lines (specs/plan/tasks/research-00)

- **Expected:** `frontend/views/parent/monitoring/ParentChildrenRootContainer.tsx:25-35`
  (useEffect :25, `router.replace` :32) — re-verified live by the orchestrator.
- **Actual:** cited as `:39-46`.
- **Fix Applied:** All occurrences corrected to `:25-35` (specs.md ×2,
  plan.md ×1, tasks.md ×1, research-00 ×1).

### 3. [LOW] [CITATION DRIFT] TICKETS.md sub-pins (specs/plan/research-04)

- **Expected (grep-verified):** heading `docs/planning/TICKETS.md:2038`;
  Gherkin ACs `:2052-2060`; four test scenarios `:2064-2067`;
  Decision Refs `:2069`; span `2038-2075` valid.
- **Actual:** heading `:2043`, ACs `:2058-2069`, scenarios `:2070-2073`,
  Decision Refs `:2048` (systematic ~5-line shift).
- **Fix Applied:** All sub-pins corrected in specs.md, plan.md, and
  `outcome/research-04-i18n-tests-precedents.md`.
### 4. [LOW] [CITATION DRIFT] plan.md §6.5 — role-plumbing basenames without subdirectories

- **Expected:** `frontend/views/dashboard/layout/DashboardAppBar.tsx:66,172`
  and `frontend/views/notifications/feed/NotificationsFeedContainer.tsx:50,95`
  (both exist; basenames resolve elsewhere).
- **Actual:** cited as bare `DashboardAppBar.tsx` / `NotificationsFeedContainer.tsx`.
- **Fix Applied:** Full paths written in plan.md §6.5.

### 5. [LOW] [CONSISTENCY] tasks.md Task 2 bullet — garbled MODIFY/NOT-touched sentence

- **Expected:** the `notifications` parity belt
  `shared/locale/notifications-namespace.parity.test.ts` is byte-frozen;
  the extended belt is `shared/locale/parentMonitoring-namespace.parity.test.ts`.
- **Actual:** "MODIFY `...notifications-namespace.parity.test.ts` is NOT touched".
- **Fix Applied:** Rewritten; both parity file names verified to exist in
  `shared/locale/`.

### 6. [LOW] [COSMETIC] tasks.md Task 8.1.SR — duplicated clause

- **Fix Applied:** the duplicated "no divergent second highlight
  implementation / SDL regen re-run" clause now appears exactly once.

### 7. [LOW] [GRAPHQL] plan.md §3.5 — no-id cache policy lacked its precedent citation

- **Expected:** cite R14 (`docs/parents/monitoring-portal.md:205` — `keyFields:false`
  for no-id value types ONLY) as the reconciliation against the root AGENTS.md
  "Always include id field" rule.
- **Fix Applied:** R14 reconciliation sentence added in §3.5.

### 8. [LOW] [GRAPHQL/convention] plan.md §3.2 — inline authScopes object

- **Expected:** reuse the file's shared `parentOnlyAuthScopes` const
  (`backend/graphql/query/parents/parent-monitoring.query.ts:102-107`),
  which embodies the load-bearing `$all` conjunction.
- **Fix Applied:** Snippet + §3.3 rationale now prescribe
  `authScopes: parentOnlyAuthScopes`; tasks.md Task 3.1 and research-00 §4
  aligned.

### 9. [LOW] [CROSS-REFERENCE] deferred-items.md D1 — "current" 4-param signature wording

- **Expected:** the CURRENT live signature is 3-param
  `resolveNotificationRoute(relatedEntityType, notificationType?, role?)`
  (`frontend/lib/notification-route-resolution.ts:188`); the optional 4th
  `relatedEntityId?` param is the post-Task-6 target.
- **Fix Applied:** D1 notes reworded accordingly.

---

## Fix Subagents Dispatched

| Subagent | Target Files | Findings Fixed | Status |
|---|---|---|---|
| fix-plan | `plan.md` | 6 fixes (findings 1, 2, 3, 4, 7, 8) | ✅ Complete |
| fix-specs | `specs.md` | 3 fix classes (findings 1, 2, 3) | ✅ Complete |
| fix-tasks | `tasks.md` (+ research-04 pins) | 4 fixes (findings 2, 3, 5, 6) + SDL pin alignment | ✅ Complete |
| fix-deferred-research | `deferred-items.md`, `outcome/research-00-planning-basis.md` | findings 1, 9 | ✅ Complete |

Note: two fixers converged on `research-00` concurrently; the orchestrator
re-verified the final state — zero conflicting or stale fragments remain.

---

## Post-Fix Verification (all executed 2026-09-17, post-fix)

- [x] All stale references resolved — grep across the plan directory for
      `:39-46`, `:2043`, `:2058-2069`, `:2070-2073`, `:2048`,
      `): ParentSessionTargetReturnType!`, and the garbled parity sentence
      returns ZERO hits.
- [x] Wire-name consistency — `ParentSessionTarget!` (SDL) present in
      specs.md, plan.md, tasks.md, research-00 §4; TS interface
      `ParentSessionTargetReturnType` retained only in type-file contexts;
      Apollo key `ParentSessionTarget` equals the wire name.
- [x] AC traceability complete —
      `for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md || echo MISSING: $r; done`
      → zero output (19/19 REQ ids covered).
- [x] Structure check — plan.md carries all mandatory sections
      (Overview+decisions, Data Models, API Contracts+SDL+permission matrix,
      Service/Repo signatures+concurrency assessment+Journey Design,
      UX/Nav spec, Security/Tenancy mitigations; 13 `##` sections).
- [x] Truncation check — every artifact's last line lands complete
      (specs 538 · plan 566 · tasks 372 · deferred 102 · research-00 291 ·
      research-01..04 160/178/145/128 lines).
- [x] Anti-pattern sweep — zero assertive `Translation.` enum usage, zero
      two-arg `getTranslations`, zero `@/frontend/utils/logger` (frontend
      logger correctly cited as `@/frontend/lib/logger`), zero raw
      `bun test` on journeys, zero bottom-nav references, zero
      `trackable-tasks.md`/`implementation.md` filenames (negated
      guardrail mentions only).
- [x] Parity-belt filename verified — `shared/locale/parentMonitoring-namespace.parity.test.ts`
      exists; the frozen `notifications-namespace.parity.test.ts` exists.
- [x] RED baseline re-verified live —
      `KOTTABY_TEST_RUNNER_OK=1 bun test frontend/lib/notification-route-resolution.test.ts`
      → 5 pass / 2 fail (pre-existing, owned by Task 6 / D1).

---

## Lessons for Future Plans

- **The wire-name convention (drop `ReturnType`) must be stated explicitly
  in every plan that adds a Pothos object type** — the Apollo cache policy
  key and the objectRef string silently drift otherwise (this round's only
  HIGH finding).
- **Fine-grained `path:line` pins in planning docs drift when the source file
  is edited after the research wave** — the plan-review pass re-verified all
  TICKETS.md pins live; future waves should re-grep doc pins at review time,
  not trust research snapshots.
- **A binding skeleton (research-00) with frozen REQ ids + signatures kept
  the four-file writer wave consistent**: the cross-reference reviewer found
  exactly one wording drift across 19 REQ ids, 13 tasks, and all signatures.

---

## Traceability

**Plan files modified during R1:**
- `specs.md` — citation pins corrected (findings 1, 2, 3)
- `plan.md` — wire-name fix, R14 citation, authScopes const reuse, full
  role-plumbing paths, citation pins (findings 1, 2, 3, 4, 7, 8)
- `tasks.md` — parity-belt sentence, duplicate clause removal, SDL pin
  alignment, citation pins (findings 2, 3, 5, 6)
- `deferred-items.md` — D1 signature wording (finding 9)
- `outcome/research-00-planning-basis.md` — §4 GraphQL contract aligned to
  the wire name; R-C pin corrected (finding 1)
- `outcome/research-04-i18n-tests-precedents.md` — TICKETS.md pins corrected (finding 3)

**Outcome knowledge base updated:**
- This report saved as: `ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display/outcome/plan-review-R1.md`

---

## Next Steps

- [ ] Commit patched plan files (left to the user — the shared working tree
      carries extensive concurrent-agent activity; a commit here would
      entangle unrelated in-flight work; do NOT push until implementation starts)
- [ ] Proceed to implementation (Task 0 baseline → Task 1 journey test-first)
- [ ] Review round R2 not required — zero findings remain open

---

## Addendum (2026-09-17, post-R1)

After R1 closed, the resolver-suite stale-arg reconciliation (D1 / R-F scope)
was resolved OUT-OF-BAND — a standalone fix requested by the user, outside
plan execution: `frontend/lib/notification-route-resolution.test.ts` was
rewritten to the resolver's current 3-param contract and is now GREEN
(8 tests / 25 expects / 0 fail via
`bun run test/scripts/run-test.ts frontend/lib/notification-route-resolution.test.ts`;
`sub-loop.ts --lifecycle duplicates` exit 0; the resolver module is
byte-unchanged). The plan files were amended accordingly: D1 is ✅ Done,
Task 0 records the current green baseline plus the RED→green history, and
Task 6's remaining scope is the Parent-cell coverage only. This addendum
records the change; the R1 findings and verdict above are unchanged.
