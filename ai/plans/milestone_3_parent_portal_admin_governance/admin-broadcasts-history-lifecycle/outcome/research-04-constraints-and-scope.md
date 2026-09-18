# Research — Constraints, test-layer policy & scope boundaries

Purpose: record the hard constraints (UI-test retirement, canonical-doc state, locked out-of-scope list) and the house-style exemplar that the specs/plan/tasks phases must respect.

Date: 2026-09-18

## Verified findings

### UI test retirement (commit c3472eff, branch `plans`)

- `test/ui` is now E2E-only — only `test/ui/e2e/paymob-checkout.e2e.test.ts` remains under `test/ui/e2e/`.
- `test/ui/test-env.ts` is retained (it is the `--preload` for e2e server runs).
- `test:ui:static` and `test:ui` npm scripts were removed from `package.json` — only `test:ui:e2e:paymob` remains (`package.json:34`).
- NO UI component tests exist and NONE may ever be created.
- Consequence: the plan must contain NO component-test or UI-e2e-test tasks; UI verification = journey/integration/documents-lock tests + optional agent-browser manual verification (screenshots under `scratch/screenshots/`), with NO committed UI test files.

### Canonical doc §10 — verified current state

- `docs/notifications/broadcast-notifications.md` §10 "Test map (evidence)" (:83) currently lists exactly five evidence rows: cross-actor journey (`test/workflows/notifications/admin-broadcast.journey.test.ts`), service behavior matrix (`backend/services/notifications/admin-broadcast.service.test.ts`), repository suite (`backend/db/test/logic/notifications/broadcast-audience.repository.test.ts`), wire integration (`backend/graphql/test/admin-broadcast.integration.test.ts`), and locale parity (`shared/locale/adminBroadcasts-namespace.parity.test.ts`).
- CORRECTION to earlier reporting: §10 does NOT cite the deleted `test/ui/components/admin/BroadcastComposeContainer.test.tsx` or `test/ui/page-guards/admin-broadcasts-page.test.ts` — no `test/ui` reference exists anywhere in the doc (verified by grep for `test/ui`, `BroadcastComposeContainer`, `page-guards`).
- Therefore the planned docs-update task does NOT need to drop stale component-test rows from §10; any §10 change reduces to ADDING rows for new history/stop-lifecycle evidence.

### Locked out-of-scope list

- Out of scope for this feature (locked):
  - hard-delete of broadcast records;
  - broadcast content editing after send;
  - scheduling / delayed sends;
  - live WebSocket retraction push;
  - per-recipient delivery/read breakdown UI;
  - un-publishing already-delivered realtime envelopes.
- These six items are mirrored with rationale and revisit triggers in `ai/plans/admin-broadcasts-history-lifecycle/deferred-items.md` (D1–D6).

### House-style exemplar plan dir (verified)

- `ai/finished_plans/milestone_3_parent_portal_admin_governance/broadcast-notifications-system-wide-targ/` contains:
  - `specs.md` (236 lines; REQ-021 at :63 is the metadata-only audit-details rule this feature inherits);
  - `plan.md` (422 lines);
  - `tasks.md` (296 lines — corrected from an earlier 302-line estimate).
- Official process templates live in `.agents/spec-process-guide/templates/` (incl. `deferred-items-template.md`, `tasks-template.md`).

### Repo discipline

- Bun runtime (never plain node/npm).
- Plan docs live under `ai/plans/<feature>/`.
- Commits must be pathspec-scoped (`git add <paths>`, never `git add -A`) and never pushed, because another agent has unrelated staged changes in the shared index.
- The plan is documentation only for now — the later phases (specs.md, plan.md, tasks.md, implementation) are executed by other agents, never by the research pass.

## Carry-over notes for plan phases

- tasks.md must include zero UI-test tasks; UI verification rides on journey/integration suites plus manual agent-browser capture (screenshots to `scratch/screenshots/`, never committed).
- The docs-update task should still touch `docs/notifications/broadcast-notifications.md` — but to EXTEND §10 (new history/stop evidence rows) and possibly §9/§7 (stop-lifecycle contract), not to remove stale component-test rows (none exist).
- specs.md should inherit REQ-021's metadata-only audit-details discipline for any new audit rows (e.g. a stop action logging metadata like `{stoppedAt, recipientCount}`, never message copy).
- The scope statement should enumerate the six locked out-of-scope items verbatim so tasks cannot silently re-include them.
- Use the exemplar dir's structure (specs → plan → tasks granularity) as the house-style reference for the later authoring agents.
- The plan must instruct executors to load the `drizzle-*` skills at migration time rather than hardcoding migration journal mechanics.
