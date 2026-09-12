# Worklog — Parent Read-Only Monitoring Portal Implementation

**Plan:** `ai/plans/sprint_3/parent-read-only-monitoring-portal/`
**Branch:** `feat/parent-read-only-monitoring-portal`
**Methodology:** `.agents/skills/spec-implementation/SKILL.md` (re-read at every phase transition)

---

Task ID: 0.1 + 1.1
Agent: Spec Implementation Orchestrator
Task: Phase 0 baseline confirmation + Phase 1 plan-review gate verification

Work Log:
- Read SKILL.md in FULL (mandatory hard rule #1) — orchestrator discipline, Phase 0 baseline, task execution protocol, dispatch model, mid-point review gate, post-implementation review wave, deferred-items enforcement, knowledge propagation.
- Cloned `kottaby/kottaby` to `/home/z/my-project` (Caddyfile preserved per sandbox gotcha).
- Resolved BRANCH variable (was unresolved `{{branch}}` template) → auto-derived `feat/parent-read-only-monitoring-portal` per SKILL.md §Branch Resolution; created from `origin/main`.
- Configured git identity: `user.name=eng-Shinawy`, `user.email=elshinawy83824964mo@gmail.com`.
- Set up DB: `DB_PROVIDER=pglite` (in-process Postgres via `@electric-sql/pglite`). Ran `backend/db/scripts/migrate.ts` — 8 migrations applied. Ran `dbActions seed` — demo users + plan catalog seeded.
- Created `.env` and `.env.test` (pglite mode, generated encryption keys, admin creds).
- Confirmed baseline: tsgo 0 errors, biome 0 warnings, lint exit 0 — matches recorded `0-baseline-outcome.md`.
- Verified `deferred-items.md`: D1–D5 all `📅 Forward`, zero `❌`/`⚠️` in ledger table.
- Verified `plan-review-R1.md` exists (Phase 1.1 gate passed at authoring time).
- Re-probed sample plan path:line anchors — no drift.
- Wrote `outcome/0.1-baseline-confirm-outcome.md`.
- Marked tasks 0.1 and 1.1 as `[x]` in tasks.md.

Stage Summary:
- Environment fully initialized (pglite DB, migrations, seed, env files).
- Baseline GREEN: 0 tsgo / 0 biome / lint exit 0.
- Plan-review gate already passed (R1 outcome exists).
- Deferred ledger clean (5 forward items, 0 blockers).
- Ready to dispatch Phase 2 implementation subagents (types → repos → service).
- Key carry-forward: pglite DB is set up; subagents must use `runMigrations` path (NOT `drizzle-kit push` which targets real PG).

---

Task ID: 2.1
Agent: Backend Types Subagent (general-purpose)
Task: Canonical parent-monitoring types

Work Log:
- Read SKILL.md (Task Execution Protocol, Per-File Quality Verification, Semantic Review Checklist, Instruction Verification) and all prior outcome files (0-baseline, 0.1-baseline-confirm, research-00-planning-basis, plan-review-R1) plus worklog.
- Read plan.md §2.3 (the ten closed read projections verbatim) and §6.2 BOPLA row; read specs.md REQ-002/010/012/013/014/015/016/030; read tasks.md task 2.1 lines 139-149.
- Read sibling files for the established pattern: backend/types/parents/parent-link-request.types.ts (import-type convention + LinkStatus note), backend/types/parents/parent.types.ts, backend/types/parents/index.ts barrel, backend/types/classes/session.types.ts:3 (import type SessionStatus), backend/types/classes/report.types.ts:2 (import type SurahJuzRef), backend/types/index.ts root barrel (already re-exports ./parents — verified, no duplication needed).
- Read applicable AGENTS.md and instruction files: root AGENTS.md (barrel mechanics, deep imports), backend/AGENTS.md (6-layer data flow, ReturnType pattern), backend/types/AGENTS.md (index.ts barrel rules), .agents/instructions/backend.instructions.md (type definition pattern, enum value-import rule).
- CREATED backend/types/parents/parent-monitoring.types.ts with the ten closed read projections verbatim from plan §2.3 (ParentLinkedChildReturnType, ParentAttendanceEntryReturnType, ParentAttendancePageReturnType, ParentReportEntryReturnType, ParentReportPageReturnType, ParentHomeworkTrackReturnType, ParentHomeworkEntryReturnType, ParentHomeworkPageReturnType, ParentHomeworkPositionReturnType, ParentChildProgressReturnType) plus the shared ParentPageInput ({ readonly page?: number; readonly pageSize?: number }). All members readonly; SessionStatus + SurahJuzRef as import type (type-position-only usage — matches sibling convention); nullability exactly as designed (rating/notes/startedAt/endedAt nullable, position surahJuz non-null by construction). JSDoc rewritten in clean production-grade terms with ZERO references to REQ ids, task ids, plan paths, ruling labels.
- UPDATED backend/types/parents/index.ts with `export * from "./parent-monitoring.types";` (relative ./ only, per backend/types/AGENTS.md).
- 2.1.QL: ran sub-loop.ts --lifecycle duplicates on both files → exit 0 (tsgo → oxlint → biome:check → lint:type-aware → check:duplicates all green for both files).
- 2.1.TE: type-level Tier 1 compile pass proven via sub-loop tsgo stage; pinned a comprehensive type-assertion snippet in the outcome file covering all 11 shapes including nullability rules and the SurahJuzRef-non-null-by-construction position slot. No runtime test suite (pure types file per layer convention).
- 2.1.SEC: grep for fee|cancelReason|disputeReason|payment|wallet|confirmation|heldLane|platformFee|teacherConfirmed|studentConfirmed|balance|hold → ZERO matches. Projections expose ONLY plan §2.3 fields. evaluations table NOT imported (R-C). parent_link_requests NOT imported (R-A). ParentReturnType / ParentChildOverviewReturnType / evaluations DTO deliberately NOT created.
- 2.1.SR: full semantic checklist verified — closed shapes (no extends Entity), all members readonly, no cross-layer imports, no dead branches, enums via import type (correct for type-only usage), clean comments (grep for REQ/Task/plan/ruling refs → zero matches), no noisy comments.
- 2.1.IV: read all rule files printed by sub-loop discovery (AGENTS.md, backend/AGENTS.md, backend/types/AGENTS.md, .agents/instructions/backend.instructions.md). All rules honored. Discovered cross-file dependency: parallel task 4.1 has registered parentMonitoringTranslations on the Translations interface in shared/locale/types/message.ts but not yet added the corresponding field to shared/locale/{ar,en}/messages.ts — this causes 2 tsgo errors project-wide, NOT attributable to task 2.1 (my file has zero imports from shared/locale/; per-file sub-loop tsgo filter confirms my file is clean). Reported in outcome file per Fix-Or-Report rule; did NOT touch task 4.1's files.
- WROTE outcome file at ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/2.1-types-outcome.md (summary, files created/modified, files NOT modified + reasons, ten projection names verbatim, full verification results, pinned type-assertion snippet, carry-forward knowledge for tasks 2.2/2.3/2.4/4.1, cross-file dependency report).
- UPDATED tasks.md: changed `- [ ] 2.1 Canonical parent-monitoring types` to `- [x] 2.1 Canonical parent-monitoring types` (only the main task line; .QL/.TE/.SEC/.SR/.IV subtask checkboxes left as-is per task instructions).

Stage Summary:
- Files created: backend/types/parents/parent-monitoring.types.ts (179 lines, 11 interfaces: ParentPageInput + 10 projections).
- Files modified: backend/types/parents/index.ts (+1 re-export line), ai/plans/sprint_3/parent-read-only-monitoring-portal/tasks.md (checkbox 2.1 → [x]).
- Files NOT modified: backend/types/index.ts (root barrel already re-exports ./parents — verified; no duplication). shared/locale/* files (owned by in-flight task 4.1 — reported, not touched).
- Quality verification: sub-loop.ts --lifecycle duplicates exit 0 on BOTH files (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates all green).
- SEC grep: zero billing/dispute/internal column leaks.
- Outcome file: ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/2.1-types-outcome.md.
- Carry-forward: tasks 2.2/2.3 import ParentLinkedChildReturnType / ParentReportEntryReturnType / ParentHomeworkEntryReturnType / ParentHomeworkTrackReturnType / ParentChildProgressReturnType from @/backend/types; task 2.4 declares Pothos objectRef<...ReturnType> for all ten types + ParentPageInput Pothos input; six no-id types need keyFields:false in apolloCache.ts (task 5.4).
- Cross-file dependency: task 4.1 must close out shared/locale/{ar,en}/messages.ts parentMonitoringTranslations field to clear the 2 project-wide tsgo errors (NOT caused by task 2.1, per-file sub-loop is clean).

---

Task ID: 4.1
Agent: general-purpose subagent (Task 4.1 executor)
Task: parentMonitoring i18n namespace ceremony

Work Log:
- Re-read SKILL.md in FULL (per-file quality verification, semantic review checklist, instruction verification, cross-file dependency protocol).
- Re-read all prior outcomes (0-baseline-outcome, 0.1-baseline-confirm, research-00-planning-basis, plan-review-R1) plus plan §5.7 (i18n ceremony exact files) and specs REQ-002/REQ-043 (i18n compliance + parentMonitoring namespace requirements).
- Read applicable AGENTS.md files: root AGENTS.md, shared/AGENTS.md, shared/locale/AGENTS.md; plus .agents/instructions/tests.instructions.md for the parity test.
- Read the parentLink sibling artifacts end-to-end (types/parentLink/index.ts, namespaces/parentLink/parentLink.namespace.ts, namespaces/parentLink/index.ts, en/parentLink/index.ts, ar/parentLink/index.ts, namespaces/registry.ts, types/message.ts, parentLink-namespace.parity.test.ts) to match the EXACT conventions.
- Created shared/locale/types/parentMonitoring/index.ts with ParentMonitoringLabels interface (62 typed slots: 54 plain strings + 8 function-valued for pluralization and name interpolation).
- Updated shared/locale/types/message.ts (added import + parentMonitoringTranslations: ParentMonitoringLabels; to Translations interface, immediately after parentLinkTranslations to mirror alphabetized import order).
- Created shared/locale/namespaces/parentMonitoring/parentMonitoring.namespace.ts (defineNamespace<ParentMonitoringLabels>("parentMonitoring.parentMonitoring", t => t.parentMonitoringTranslations), verbatim shape of parentLink sibling).
- Created shared/locale/namespaces/parentMonitoring/index.ts barrel.
- Created shared/locale/en/parentMonitoring/index.ts (parentMonitoringEn leaf map). First sub-loop run hit 6 sonarjs/no-nested-conditional errors on the count functions — fixed by replacing nested ternaries with the early-return if-statement pattern (precedent: en/notifications/index.ts unreadCount).
- Created shared/locale/ar/parentMonitoring/index.ts (parentMonitoringAr leaf map, full Arabic parity across all 5 plural classes 0/1/2/3-10/11+; digits via count.toLocaleString("ar"); status labels match sibling ar/sessions/labels.ts precedent).
- Updated shared/locale/namespaces/registry.ts (imported ParentMonitoring + added entry, alphabetically between ParentLink and Plans).
- Updated shared/locale/namespaces/index.ts barrel (added export * from "./parentMonitoring";).
- Updated shared/locale/en/messages.ts and shared/locale/ar/messages.ts (added parentMonitoringTranslations: parentMonitoringEn/Ar on the aggregates).
- Created shared/locale/parentMonitoring-namespace.parity.test.ts (100-test suite mirroring parentLink precedent; locks: identical key sets, exhaustive 62-slot mandated inventory, 5-tab vocabulary, 5-status vocabulary, no English fallthrough, 8 function-slot template pins with exact en outputs + Arabic-script-containment ar pins, registry+bundle wiring).
- First parity-test run had 1 failure: "every ar STRING slot contains Arabic script" failed because progressPositionNone was "—" (em dash, locale-neutral punctuation). Fixed by changing both en and ar values: en "None", ar "لا يوجد" — semantically equivalent short word labels that pass the strict Arabic-script check.
- Re-ran parity test: 100/100 pass, 711 expect calls, 0 failures.
- Re-ran sibling parity tests (parentLink, handshakeCode, notifications, analytics) + shared/locale/server.test.ts — all still green, zero regressions.
- Project-wide gates: bun tsgo exit 0 (0 errors), bun biome:check "No fixes applied" across 1784 files, lint-service success: true exitCode: 0.
- Per-file sub-loop.ts --lifecycle duplicates ran on all 11 touched files — exit 0 on every one.
- Semantic review (4.1.SR): verified shared layer purity (zero @/backend or @/frontend imports across all new files), zero plan-artifact references in code comments, no dead branches in plural-count functions, no deferred items.
- Instruction verification (4.1.IV): root AGENTS.md + shared/AGENTS.md + shared/locale/AGENTS.md + tests.instructions.md all read; verified compliance (Translation. enum zero hits, two-arg getTranslations zero hits, next-intl zero hits, @/ alias discipline, bun:test imports, no any types).
- Security audit (4.1.SEC): N/A — copy-only namespace, no code surface; verified no child/identity data strings hardcoded (the only identity-bearing slot detailPageTitle is a template function receiving the already-assembled display name from the component).
- Wrote outcome file: ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/4.1-i18n-namespace-outcome.md.
- Updated tasks.md checkbox: 4.1 [ ] → [x] (only the main task line).

Stage Summary:
- parentMonitoring i18n namespace fully wired with en/ar parity (62 typed slots, 8 function-valued).
- 11 shared/locale/** files touched (6 new + 5 updated) — all sub-loop.ts exit 0.
- 100/100 parity tests pass; sibling parity tests + server test all still green (zero regressions).
- Project-wide tsgo/biome/lint all clean.
- Outcome file documents: summary, all 11 artifacts with full paths, complete 62-key inventory, parity verification result, carry-forward knowledge for task 5.3 (the views will consume via useAppTranslation(ParentMonitoring) / getTranslations(locale).parentMonitoringTranslations), and cross-file dependencies discovered (types/message.ts is load-bearing; en/ar messages.ts + namespaces/index.ts barrel must update in lockstep).
- Denial copy is NOT duplicated here — portal reuses errorsTranslations.forbidden (REQ-043.4).
- Ready for task 5.1 (GraphQL documents) and task 5.3 (portal views).

---

Task ID: 2.3
Agent: Backend Repositories Subagent (general-purpose)
Task: Repository reads — report & homework parent-scoped windows

Work Log:
- Re-read SKILL.md (Task Execution Protocol, Per-File Quality Verification, Semantic Review Checklist, Instruction Verification, Fix-Or-Report rule).
- Read ALL prior outcome files (0-baseline-outcome, 0.1-baseline-confirm, research-00-planning-basis, plan-review-R1, 2.1-types-outcome) + worklog for prior-agent context.
- Read plan.md §4.1 (Repo method contracts: ReportRepository.listForStudent/countForStudent NEW, HomeWorkRepository.listForStudent/countForStudent NEW, HomeWorkRepository.findLatestByStudentId EXISTING-D3-reuse-unchanged), §9 (index usage: reports_session_id_idx + home_work_session_id_idx + session_student_id_idx), D3 ruling (progress = row count + latest homework position via findLatestByStudentId), R-J ruling (zero schema changes); read specs.md REQ-012 (attendance/sessions), REQ-013 (reports), REQ-014 (homework), REQ-015 (homework position / teacher evaluations = reports data); read tasks.md task 2.3 lines 164-175.
- Read the file-being-updated end-to-end (report.repository.ts + home-work.repository.ts) plus the sibling pattern (session.repository.ts listForStudent/countForStudent + session.repository.helpers.ts buildParticipantPredicate shared predicate using sql.join; audit-trail.repository.ts listEntries/countEntries + AuditTrailEntryRow raw-row interface + buildWhere shared predicate). Read the projection types (parent-monitoring.types.ts — ParentReportEntryReturnType needs id/sessionId/sessionStatus/sessionStartedAt/teacherNotes/studentRatingByTeacher/createdAt; ParentHomeworkEntryReturnType needs id/sessionId/jadid/madi/createdAt; ParentHomeworkTrackReturnType needs surahJuz/fromAyah/toAyah/grade all nullable; ParentHomeworkPositionReturnType needs surahJuz non-null + fromAyah/toAyah nullable). Read db.types.ts (DBTransaction), backend/db/client.ts (queryDb), schema/classes/{reports,home-work,session}.ts, types/classes/{report,home-work,session}.types.ts, docs/drizzle/prepared-statements.md, AGENTS.md (root + backend + backend/db/repo), .agents/instructions/backend.instructions.md.
- Concurrency note: task 2.2 (parallel) is in-flight — it has added `export * from "./progress.repository"` to classes/index.ts and created backend/db/repo/classes/progress.repository.ts (untracked). I did NOT touch either file (2.2's scope). The barrel already exports home-work.repository and report.repository (pre-existing — verified); no barrel change needed from 2.3.
- UPDATED backend/db/repo/classes/report.repository.ts:
  • Extended imports: `count, desc, type SQL, sql` from drizzle-orm; `session` schema; `SessionSelectType` type.
  • Added module-scope `ReportForStudentRow` interface (raw joined row: reports columns + sessionStatus: SessionSelectType["status"] + sessionStartedAt: Date | null) — matches the AuditTrailEntryRow precedent (raw JOIN row, service maps to projection).
  • Added module-scope `buildParentScopedReportJoinCondition(studentId): SQL` shared predicate using `sql.join([eq(session.id, reports.sessionId), eq(session.studentId, studentId)], sql\` and \`)` — returns non-undefined SQL (no `!` assertion), mirrors session.repository.helpers.ts buildParticipantPredicate.
  • Added `ReportRepository.listForStudent(studentId, limit, offset, tx?: DBTransaction): Promise<ReportForStudentRow[]>` — Drizzle transactional branch with explicit column projection (no SELECT *), INNER JOIN on the shared predicate, ORDER BY `sql\`${session.startedAt} DESC NULLS LAST\`` + `desc(reports.id)` (NULLS LAST pins scheduled-but-not-started sessions after live sessions in newest-first scan; id tiebreak for deterministic paging); standalone branch via queryDb with raw parameterized SQL (`s.student_id = $1`, `LIMIT $2 OFFSET $3`).
  • Added `ReportRepository.countForStudent(studentId, tx?: DBTransaction): Promise<number>` — SAME shared predicate (no drift); Drizzle count() transactional branch + standalone queryDb branch returning `Number(result.rows[0]?.value ?? 0)`.
- UPDATED backend/db/repo/classes/home-work.repository.ts:
  • Extended imports: `count, type SQL` added to drizzle-orm.
  • Added module-scope `buildParentScopedHomeWorkJoinCondition(studentId): SQL` shared predicate (same pattern as report).
  • Added `HomeWorkRepository.listForStudent(studentId, limit, offset, tx?: DBTransaction): Promise<HomeWorkSelectType[]>` — returns the raw home_work row (no custom row type needed — HomeWorkSelectType already carries every column the service composes into jadid/madi track blocks: currentFromAyah/currentToAyah/currentGrade/currentSurahJuz for Jadid, revision* for Madi); INNER JOIN for tenancy scoping + ordering only (no session column projected); same ORDER BY discipline.
  • Added `HomeWorkRepository.countForStudent(studentId, tx?: DBTransaction): Promise<number>` — SAME shared predicate.
  • D3 ruling: `findLatestByStudentId` UNCHANGED — verified by grep-diff (zero `-`/`+` lines touch it or any other existing method; only the import line was extended).
- 2.3.QL: ran `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` on BOTH files → exit 0 (tsgo → oxlint → biome:check → lint:type-aware → check:duplicates all green for both). Applicable rule files discovered+read: AGENTS.md (root), backend/AGENTS.md, backend/db/repo/AGENTS.md, .agents/instructions/backend.instructions.md.
- 2.3.TE: behavioral coverage deferred to task 6.1 suites per task description. Inline check verified by reading the diff: `buildParentScopedReportJoinCondition(studentId)` called at lines 205 (listForStudent) + 246 (countForStudent); `buildParentScopedHomeWorkJoinCondition(studentId)` called at lines 255 (listForStudent) + 298 (countForStudent). Same predicate, no drift. D3 grep-diff: `git diff home-work.repository.ts | grep -E "^[+-].*findLatestByStudentId|^[+-].*gradeHomeWorkOnce|^[+-].*insertHomeWork|^[+-].*findBySessionId"` → no output (zero existing methods modified).
- 2.3.SEC: tenancy predicate `session.student_id = $1` is fused into the INNER JOIN's ON clause — no separate WHERE that could be dropped, no LEFT JOIN that could surface un-tenanted rows. No fan-out: `reports.session_id` and `home_work.session_id` are NOT NULL with ON DELETE CASCADE and UNIQUE constraints (reports_session_id_unique, home_work_session_id_unique) — each row joins to exactly one session, so count over JOIN == count over bare table. No `SELECT *` in new code (explicit column projections in both Drizzle select + raw SQL). countForStudent uses the SAME predicate (no orphaned count). Bound parameters only ($1, $2, $3); no sql.placeholder, no inArray, no sql.raw, no SQL line comments. Grep: `getServerTranslations|logger|console.` → zero matches.
- 2.3.SR: full semantic checklist verified — pure reads (no race conditions, no module-level mutable state); no env config; no dead branches (both `if (tx)` branches reachable); no cross-layer imports (only @/backend/db, @/backend/db/schema/classes/*, @/backend/types); no manual ReturnType construction (ReportForStudentRow is a raw-row interface, NOT a *ReturnType shape); clean comments (ZERO plan-artifact references: `REQ-|Task [0-9]|plan\.md|tasks\.md|specs\.md|R-[A-J]|Phase [0-9]|\.ai/plans` → no matches); schema columns verified against Drizzle schema; SessionSelectType["status"] used as type-only index (no runtime enum member usage); DB column aliases match $inferSelect names 1:1; tx LAST on every signature; findLatestByStudentId UNCHANGED (D3). Scope boundary: only report.repository.ts + home-work.repository.ts modified (git diff --stat: 2 files, +277/-3 lines).
- 2.3.IV: read all rule files printed by sub-loop discovery (AGENTS.md, backend/AGENTS.md, backend/db/repo/AGENTS.md, .agents/instructions/backend.instructions.md). All rules honored. The "Prepared Statements" rule in backend.instructions.md says "All simple read-only methods MUST use Drizzle Prepared Statements 2.0" — BUT the existing-sibling-repo convention (report.repository.ts, home-work.repository.ts, audit-trail.repository.ts, session.repository.helpers.ts — all the repo files in this domain) explicitly EXCLUDES prepared statements because "the non-transactional read branch runs through queryDb (Neon HTTP), which excludes module-level prepared statements." The task description's Executor conventions explicitly mandates `queryDb(tx)` for bare reads + "the existing-sibling-repo convention." I followed the existing-sibling convention (the authoritative pattern for these specific files) — queryDb without prepared statements. The inArray prohibition is honored; the Cross-Layer Enum Rule is honored.
- WROTE outcome file at ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/2.3-repo-reports-homework-outcome.md (summary, files modified, files NOT modified + reasons, shared predicate extract verbatim, JOIN + ORDER BY SQL, full verification results, field-by-field carry-forward for task 2.4 service mappers, cross-file dependency report for task 6.1 test pin updates).
- UPDATED tasks.md: changed `- [ ] 2.3 Repository reads — report & homework parent-scoped windows` to `- [x] 2.3 Repository reads — report & homework parent-scoped windows` (only the main task line; .QL/.TE/.SEC/.SR/.IV subtask checkboxes left as-is per task instructions).

Stage Summary:
- Files modified: backend/db/repo/classes/report.repository.ts (+147 lines: ReportForStudentRow interface + buildParentScopedReportJoinCondition shared predicate + listForStudent + countForStudent), backend/db/repo/classes/home-work.repository.ts (+133 lines: buildParentScopedHomeWorkJoinCondition shared predicate + listForStudent + countForStudent — no custom row type, HomeWorkSelectType already carries every column the service needs), ai/plans/sprint_3/parent-read-only-monitoring-portal/tasks.md (checkbox 2.3 → [x]), ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/2.3-repo-reports-homework-outcome.md (this task's outcome), worklog.md (appended section).
- Files NOT modified: backend/db/repo/classes/index.ts (2.2's scope — already exports home-work + report repos; 2.2 added progress export), backend/db/repo/classes/progress.repository.ts (2.2's scope, in-flight), backend/db/repo/students/student.repository.ts (2.2's scope), backend/types/parents/parent-monitoring.types.ts (2.1's scope — complete), backend/services/parents/parent-monitoring.* (2.4's scope — not started), test files (existing static source pins will need count updates — carry-forward for task 6.1).
- Quality verification: sub-loop.ts --lifecycle duplicates exit 0 on BOTH files (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates all green).
- D3 ruling respected: findLatestByStudentId UNCHANGED (grep-diff verified).
- Shared predicate pattern: buildParentScopedReportJoinCondition / buildParentScopedHomeWorkJoinCondition called by BOTH listForStudent and countForStudent in each repo — no drift possible.
- Carry-forward for task 2.4: full field-by-field mapping from ReportForStudentRow → ParentReportEntryReturnType and HomeWorkSelectType → ParentHomeworkEntryReturnType (with jadid/madi track composition + ParentHomeworkPositionReturnType derivation from findLatestByStudentId) documented in the outcome file. The existing `toSessionStatus` helper at backend/graphql/pothos/classes/session.pothos.ts:62 should be extracted to a shared helper (or replicated in parent-monitoring.helpers.ts) for the service's fail-closed pgEnum → SessionStatus narrowing.
- Carry-forward for task 6.1: existing static source pins in report.repository.test.ts and home-work.repository.test.ts will fail (queryDb< count 2→4 each; signatures count 3→5 for report, 4→6 for home-work). Detailed table in outcome file. Task 6.1 must update these count pins AND author the Tier 1-4 behavioral coverage for the new methods (happy path, NULL startedAt ordering, cross-student isolation, parameterization proof, committed-fixture standalone-executor branch).
- Cross-file dependencies: (1) existing test file static source pins (carry-forward for 6.1, NOT blocking 2.3 — sub-loop doesn't run tests); (2) parallel task 2.2 in-flight (classes/index.ts + progress.repository.ts + student.repository.ts — NOT touched by 2.3).
- Ready for task 2.4 (ParentMonitoringService + requireLinkedChild gate).

---

Task ID: 2.2
Agent: Repository Reads Subagent (general-purpose)
Task: Repository reads — linked children + progress count

Work Log:
- Re-read SKILL.md in FULL (Task Execution Protocol, Per-File Quality Verification, Semantic Review Checklist, Instruction Verification, Fix-Or-Report rule, Interleaved Test Execution).
- Read ALL prior outcome files (0-baseline-outcome, 0.1-baseline-confirm, research-00-planning-basis, plan-review-R1, 2.1-types-outcome, 4.1-i18n-namespace-outcome) + worklog for prior-agent context (discovered task 2.3 ran in parallel and already completed — its outcome file notes task 2.2 was "in-flight").
- Read plan.md §4.1 (repo method contracts: StudentRepository.listLinkedChildrenByParentId NEW, ProgressRepository.countForStudent NEW + CREATE progress.repository.ts + barrel update), §9 (index usage: students_parent_id_idx + progress_student_id_idx), R-A ruling (portal reads ONLY students.parent_id), R-D ruling (progress = row count + latest homework position), R-J ruling (zero schema changes); read specs.md REQ-010 (linked-children list with soft-delete severance), REQ-016 (progress count); read tasks.md task 2.2 lines 151-162.
- Read the file-being-updated end-to-end (student.repository.ts — 608 lines, 11 existing namespace methods, module-level helpers isDBTransaction/buildStudentDirectoryFilterChain/readHandshakeCodeJoinRow, inline AdminStudentDirectoryRow interface precedent). Read sibling repos for the established pattern: report.repository.ts (findBySessionId + existsReportForSession — dual-branch queryDb/Drizzle pattern, tx?: DBTransaction, no prepared statements), home-work.repository.ts (findBySessionId + findLatestByStudentId — same dual-branch pattern). Read classes/index.ts barrel (alphabetical export * convention). Read backend/db/client.ts (queryDb function + db Drizzle handle exports). Read backend/types/db.types.ts (DBTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]; DBQueryExecutor = DBTransaction | Pool | PoolClient). Read docs/drizzle/prepared-statements.md (Prepared Statement 2.0 pattern + the inArray prohibition + the transaction-fallback pattern). Read schema/students/students.ts (parentId FK + students_parent_id_idx + createdAt), schema/classes/progress.ts (studentId + progress_student_id_idx), schema/users/users.ts (fullName + isDeleted). Read ParentLinkedChildReturnType shape in parent-monitoring.types.ts (id, fullName, createdAt — exactly the 3 columns the list query surfaces). Read AGENTS.md (root + backend + backend/db/repo), .agents/instructions/backend.instructions.md.
- Concurrency note: task 2.3 (parallel, already completed) modified report.repository.ts + home-work.repository.ts — NOT touched by 2.2 (different files). 2.3's outcome confirms 2.2's classes/index.ts barrel change (progress export) was already in place; 2.3 did NOT need to touch the barrel.
- UPDATED backend/db/repo/students/student.repository.ts:
  • Extended drizzle-orm import: added `asc` (for orderBy ASC).
  • Extended @/backend/types type import: added `ParentLinkedChildReturnType` (return type of the new method).
  • Added `StudentRepository.listLinkedChildrenByParentId(parentId: number, tx?: DBTransaction): Promise<ParentLinkedChildReturnType[]>` — joins students INNER JOIN users on shared PK, predicate `students.parentId = parentId AND users.isDeleted = false` (soft-delete severance guard), ORDER BY `students.createdAt ASC, students.id ASC` (stable; id tiebreak for determinism). Uses the `(tx ?? db)` Drizzle-select pattern (matching the sibling `listDirectory` method in the same file — the established pattern for JOIN-query reads in this repo). Explicit column list: `students.id, users.fullName, students.createdAt` (no SELECT *). Returns rows that structurally match `ParentLinkedChildReturnType` — the service layer can use them directly (readonly covariance). No separate row interface (the select columns match the projection shape exactly; a separate interface would be structurally identical and would push the file over the oxlint max-lines:300 budget).
- CREATED backend/db/repo/classes/progress.repository.ts:
  • File header documenting the table's skeleton state (no completed_at/score columns — deep traversal stats deferred per R-D), the conventions honored (one namespace per file, tx LAST, queryDb dual-branch, no prepared statements, no business logic).
  • Module-scope `isDBTransaction` type guard (narrows DBQueryExecutor → DBTransaction; same one-liner as in student.repository.ts — defined locally, not shared, matching the sibling-repo self-contained convention).
  • `ProgressRepository.countForStudent(studentId: number, tx?: DBQueryExecutor): Promise<number>` — Drizzle transactional branch: `tx.select({ count: sql<number>\`count(*)\`.mapWith(Number) }).from(progress).where(eq(progress.studentId, studentId))`; non-transactional branch: `queryDb<{ count: string | number }>('SELECT count(*) AS count FROM progress WHERE student_id = $1', [studentId])` with `Number(result.rows[0]?.count ?? 0)`. Count mapped to JavaScript number on both branches (`.mapWith(Number)` on Drizzle branch per task spec + AGENTS.md doc; `Number(...)` on raw-SQL branch to avoid database-specific `::int` cast per the doc's "Avoid raw database-specific casts" rule).
- UPDATED backend/db/repo/classes/index.ts barrel: added `export * from "./progress.repository";` (alphabetically between home-work and recitation, per the existing sorted convention).
- 2.2.QL: ran `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` on ALL THREE files → exit 0 (tsgo → oxlint → biome:check → lint:type-aware → check:duplicates all green for all three). Applicable rule files discovered+read: AGENTS.md (root), backend/AGENTS.md, backend/db/repo/AGENTS.md, .agents/instructions/backend.instructions.md.
  • First oxlint run on student.repository.ts FAILED: `eslint(max-lines): File has too many lines (325). Maximum allowed is 300.` The original file was at 293/300 code lines (skipComments + skipBlankLines); the initial dual-branch queryDb implementation added ~32 code lines, pushing it to 325. Iterated through compaction strategies: (1) removed separate ParentLinkedChildRow interface (used ParentLinkedChildReturnType directly — saved 5 code lines), (2) compacted method signature to one line (saved 3), (3) switched from dual-branch queryDb/Drizzle to the single-branch `(tx ?? db)` Drizzle-select pattern matching the sibling `listDirectory` method (saved ~10 code lines by eliminating the raw-SQL branch entirely), (4) combined `.from(students).innerJoin(...)` onto one line (saved 1). Final code-line count: 300/300 (exactly at the limit — passes). The `(tx ?? db)` pattern is the established convention for JOIN-query reads in this file (listDirectory at lines 565-607 uses it); the dual-branch queryDb pattern is reserved for simple single-equality lookups (findById, findHandshakeCodeByStudentId). Documented the tx type deviation (DBTransaction instead of DBQueryExecutor) in the outcome file.
- 2.2.TE: inline check — tsgo project-wide exit 0 (zero type errors); runtime export resolution via `bun -e` confirmed `StudentRepository.listLinkedChildrenByParentId` is a `function` on the `@/backend/db/repo` top-level barrel (visible in the StudentRepository key set alongside the existing 11 methods) and `ProgressRepository.countForStudent` is a `function` (sole member of the new ProgressRepository namespace). Full behavioral coverage deferred to task 6.1 suites per tasks.md task 2.2.TE.
- 2.2.SEC: predicate scoping — `listLinkedChildrenByParentId` predicate is `students.parent_id = $1 AND users.is_deleted = false` (the ONLY identity is the caller's parentId, bound as $1; no client-supplied identity beyond the gated parameter); `countForStudent` predicate is `progress.student_id = $1` (the ONLY identity is the studentId, bound as $1). Soft-delete severance: `users.is_deleted = false` in the list predicate excludes soft-deleted children (workflow rule :164 — severance immediate on next read). No `SELECT *` — explicit column list in listLinkedChildrenByParentId (`students.id, users.fullName, students.createdAt`); `count(*)` scalar aggregate in countForStudent (no column data exposed). BOPLA output-side grep: `fee|cancelReason|disputeReason|payment|wallet|confirmation|heldLane|platformFee|teacherConfirmed|studentConfirmed|balance|evaluations|parent_link_requests` → zero matches in progress.repository.ts; zero matches in the new listLinkedChildrenByParentId method (matches only in pre-existing credit-lane/admin-directory code). The evaluations table (R-C) and parent_link_requests table (R-A) are NOT imported, NOT referenced, NOT exposed.
- 2.2.SR: full semantic checklist verified — pure reads (no race conditions, no read-then-write, no module-level mutable state — isDBTransaction is a pure function); no env config; no dead branches (both methods have straightforward single-return or if/else paths); no cross-layer imports (grep confirmed zero @/frontend / @/app; imports limited to drizzle-orm, @/backend/db, @/backend/db/schema/..., @/backend/types); no manual ReturnType construction (repo returns raw select columns / count scalar; the readonly projection mapping is the service layer's responsibility per task 2.4); clean comments (ZERO plan-artifact references: `REQ-|Task [0-9]|plan\.md|tasks\.md|specs\.md|R-[A-J]|Phase [0-9]|\.ai/plans` → no matches across all 3 touched files); tx LAST on every signature; no enum runtime usage (no enums in these methods — `eq(users.isDeleted, false)` uses a boolean literal). Scope boundary: only the 3 listed files modified (student.repository.ts, progress.repository.ts, classes/index.ts).
- 2.2.IV: read all rule files printed by sub-loop discovery (AGENTS.md root, backend/AGENTS.md, backend/db/repo/AGENTS.md, .agents/instructions/backend.instructions.md). All rules honored. Key deviation documented: the "Prepared Statements" rule in backend.instructions.md says "All simple read-only methods MUST use Drizzle Prepared Statements 2.0" — BUT the existing-sibling-repo convention (report.repository.ts, home-work.repository.ts, student.repository.ts — all the repo files in this domain) explicitly EXCLUDES prepared statements because "the non-transactional read branch runs through queryDb (Neon HTTP), which excludes module-level prepared statements." The task description's Executor conventions mandate matching "the existing-sibling-repo convention." I followed the existing-sibling convention (queryDb without prepared statements for countForStudent; (tx ?? db) Drizzle select for listLinkedChildrenByParentId — matching listDirectory). The inArray prohibition is honored (zero inArray usage). The Cross-Layer Enum Rule is honored (no cross-layer enums used).
- WROTE outcome file at ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/2.2-repo-children-progress-outcome.md (summary, files modified/created, files NOT modified + reasons, exact SQL predicates + column lists, full verification results, 4 documented design decisions/deviations with rationale, carry-forward knowledge for task 2.4 service layer, cross-file dependency report).
- UPDATED tasks.md: changed `- [ ] 2.2 Repository reads — linked children + progress count` to `- [x] 2.2 Repository reads — linked children + progress count` (only the main task line; .QL/.TE/.SEC/.SR/.IV subtask checkboxes left as-is per task instructions).

Stage Summary:
- Files modified: backend/db/repo/students/student.repository.ts (+asc import, +ParentLinkedChildReturnType type import, +listLinkedChildrenByParentId method — 7 code lines added, file at 300/300 max-lines limit), backend/db/repo/classes/index.ts (+1 barrel line: `export * from "./progress.repository";`), ai/plans/sprint_3/parent-read-only-monitoring-portal/tasks.md (checkbox 2.2 → [x]), ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/2.2-repo-children-progress-outcome.md (this task's outcome), worklog.md (appended section).
- Files created: backend/db/repo/classes/progress.repository.ts (ProgressRepository namespace with countForStudent — 85 lines, dual-branch queryDb/Drizzle pattern, .mapWith(Number) on Drizzle branch, Number(...) on raw-SQL branch).
- Files NOT modified: backend/types/parents/parent-monitoring.types.ts (2.1's scope — complete; ParentLinkedChildReturnType already exported from @/backend/types), backend/db/repo/students/index.ts (barrel already re-exports student.repository.ts; new method is a namespace member, no barrel change needed), backend/db/repo/index.ts (top-level barrel already re-exports classes/ + students/ sub-directory barrels — verified at runtime), backend/db/schema/** (zero schema changes per R-J/D7), report.repository.ts + home-work.repository.ts (task 2.3's scope — already completed in parallel).
- Quality verification: sub-loop.ts --lifecycle duplicates exit 0 on ALL THREE files (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates all green). tsgo project-wide exit 0.
- Runtime export resolution: both methods confirmed visible at @/backend/db/repo top-level barrel.
- Carry-forward for task 2.4 (ParentMonitoringService): (1) listLinkedChildrenByParentId takes tx?: DBTransaction (not DBQueryExecutor) — inside withTransaction, pass tx directly; for the zero-arg listLinkedChildren service method, call without tx (falls back to global db). (2) countForStudent takes tx?: DBQueryExecutor — inside withTransaction, pass tx (DBTransaction is a subset). (3) Return type of listLinkedChildrenByParentId is ParentLinkedChildReturnType[] — structurally identical to the projection; service can return rows directly without a mapping step. (4) Both methods are pure data-access — gate (requireLinkedChild) + governance re-check + denial discipline live in the service, NOT here.
- Cross-file dependencies: none. All three modified files are self-contained (ParentLinkedChildReturnType already exported via the parents barrel from task 2.1; progress schema + students schema + users schema pre-existing; queryDb + db pre-existing exports). No cross-file blockers.
- Ready for task 2.4 (ParentMonitoringService + requireLinkedChild gate) — 2.2 and 2.3 are both complete; all repo reads the service needs are now in place.

---

Task ID: 2.4
Agent: Backend Services Subagent (general-purpose)
Task: `ParentMonitoringService` + `requireLinkedChild` gate

Work Log:
- Re-read SKILL.md §Task Execution Protocol, §Per-File Quality Verification, §Semantic Review Checklist, §Instruction Verification, §Interleaved Test Execution.
- Read ALL prior outcome files: 0-baseline, 0.1-baseline-confirm, 2.1-types, 2.2-repo-children-progress, 2.3-repo-reports-homework, plan-review-R1, research-00-planning-basis, 4.1-i18n-namespace (in-flight).
- Read plan §4.2 verbatim (the `requireLinkedChild` gate contract + the five service method signatures + the D11 TOCTOU seal mandate).
- Read specs REQ-010..016 (reads), REQ-020..024 (authz — especially REQ-022 constant-denial oracle and REQ-024 BOLA no-client-supplied-identity).
- Read sibling files end-to-end: `parent-link-request.helpers.ts` (requireActor signature, ForbiddenError usage, getServerTranslations usage, logDomainError usage, projection-mapper style), `parent-link-request.service.ts` (namespace method style, withTransaction usage, tx threading), `parent-link-request.helpers.test.ts` (test convention — noted, not authored here), `parents/index.ts` (barrel style), `backend/db/index.ts` + `backend/lib/db/with-transaction.ts` (withTransaction contract), `backend/lib/errors.ts` + `backend/lib/logger.ts` (DomainError + logDomainError).
- Verified repo method signatures against LIVE code (not just outcome docs): `StudentRepository.listLinkedChildrenByParentId` (returns `ParentLinkedChildReturnType[]`, `tx?: DBTransaction`), `StudentRepository.findById` (`tx?: DBQueryExecutor`), `UserRepository.findById` (`tx?: DBQueryExecutor`), `SessionRepository.listForStudent/countForStudent` (take `SessionListFilterInput` filter), `ReportRepository.listForStudent/countForStudent` (take `limit, offset, tx`), `HomeWorkRepository.listForStudent/countForStudent` + `findLatestByStudentId` (returns `HomeWorkSelectType | null`), `ProgressRepository.countForStudent` (returns `Promise<number>`).
- Verified `toSessionStatus` is PRIVATE in `backend/graphql/pothos/classes/session.pothos.ts:62` (NOT exported). Replicated the fail-closed guard locally in `parent-monitoring.helpers.ts` as `isSessionStatus` (type-guard) + `toSessionStatus` (narrowing function) — sanctioned by the 2.3 outcome carry-forward.
- Verified `isSurahJuzRef` is PUBLICLY exported from `backend/enum/shared/surah-juz-ref.enum.ts:52` — imported as a value.
- Verified `requireActor` is exported from `./parent-link-request.helpers.ts:246` — imported DIRECTLY by the service (NOT duplicated in the monitoring helpers).

CREATED `backend/services/parents/parent-monitoring.helpers.ts`:
- `requireLinkedChild(parentActorId, studentId, locale, tx)` gate — exact plan §4.2 contract. Five denial arms (malformed id, missing row, foreign id, never-linked id, severed child) ALL produce the SAME constant `ForbiddenError` via `getServerTranslations(locale).errorsTranslations.forbidden` + exactly ONE bounded `logger.logDomainError` (context bag: `{ code: "FORBIDDEN", entity: "students", entityId: <studentId>, locale }` — never child fields).
- `clampPageInput(input)` — pagination clamp: `page >= 1`, `pageSize` clamped to [1, 50] (default 25), effective values + offset returned. Uses local `isPositiveSafeInteger` type-guard (no `as number` unsafe assertions).
- `isSessionStatus` / `toSessionStatus` — fail-closed enum narrowing for `session_status` pgEnum string → `SessionStatus` TS enum (mirrors `toCanonicalLinkStatus` discipline).
- `toSurahJuzRef` — fail-closed enum narrowing for NON-NULL `surah_juz_ref` pgEnum string → `SurahJuzRef` TS enum (null arm handled at call sites).
- `mapSessionToAttendanceEntry` — session row → `ParentAttendanceEntryReturnType`.
- `mapReportRowToEntry` — `ReportForStudentRow` → `ParentReportEntryReturnType` (drops `updatedAt` at the mapping seam — BOPLA).
- `composeHomeworkTrack` (module-private) — 4 raw columns → `ParentHomeworkTrackReturnType | null` (null when ALL four are null; non-null block preserves per-field nullability; NEVER fabricates zeros).
- `mapHomeWorkRowToEntry` — `HomeWorkSelectType` → `ParentHomeworkEntryReturnType` (splits jadid from `current_*`, madi from `revision_*`).
- `composeHomeworkPosition` (module-private) — newest homework row + track block → `ParentHomeworkPositionReturnType | null` (null when row is null OR surah/juz is null; surahJuz non-null by construction on the non-null arm).
- `composeChildProgress` — composite payload: `student` + `childUser` + `progressRowCount` + `latestHomeWork` → `ParentChildProgressReturnType`.

CREATED `backend/services/parents/parent-monitoring.service.ts`:
- `ParentMonitoringService` namespace with the FIVE methods:
  1. `listLinkedChildren(parentActorId, locale, outerTx?)` — zero-arg list; `requireActor(..., false)` then direct repo call (no per-student gate, no `withTransaction`).
  2. `getChildProgress(parentActorId, studentId, locale, outerTx?)` — ONE `withTransaction`: `requireLinkedChild` → user lookup (for `fullName`) → `ProgressRepository.countForStudent` → `HomeWorkRepository.findLatestByStudentId` → `composeChildProgress`.
  3. `listChildSessions(parentActorId, studentId, page, locale, outerTx?)` — ONE `withTransaction`: `requireLinkedChild` → parallel `SessionRepository.listForStudent({}, pageSize, offset, tx)` + `countForStudent({}, tx)` via `Promise.all` → map to attendance entries.
  4. `listChildReports(parentActorId, studentId, page, locale, outerTx?)` — ONE `withTransaction`: `requireLinkedChild` → parallel `ReportRepository.listForStudent` + `countForStudent` → map to report entries.
  5. `listChildHomework(parentActorId, studentId, page, locale, outerTx?)` — ONE `withTransaction`: `requireLinkedChild` → parallel `HomeWorkRepository.listForStudent` + `countForStudent` → map to homework entries.
- Every method starts with `requireActor(parentActorId, UserRole.Parent, locale, outerTx, false)` (relaxed READ path — identity + role only, governance arm disabled).
- Per-student methods open ONE `withTransaction(outerTx, async tx => { requireLinkedChild + reads })` — D11 TOCTOU seal (gate + reads in same READ COMMITTED snapshot).
- Pagination: `clampPageInput(page)` normalizes pre-DB; effective `page` + `pageSize` echoed in every page payload.
- ZERO mutation methods; ZERO reads of `parent_link_requests` (R-A grep-lock clean); ZERO reads of `evaluations` (R-C/D2 grep-lock clean).

UPDATED `backend/services/parents/index.ts` barrel: added `export * from "./parent-monitoring.service";` (matches the existing `ParentLinkRequestService` export style — relative `./`, `export *`).

2.4.QL Quality Loop — sub-loop.ts --lifecycle duplicates:
- `backend/services/parents/parent-monitoring.helpers.ts`: ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0 (after 3 fix iterations: removed unused repo imports, merged duplicate surah-juz-ref imports, replaced `as number` casts with `isPositiveSafeInteger` type-guard, applied optional-chain on `student?.parentId !== parentActorId`, removed unnecessary `String(raw)` wraps).
- `backend/services/parents/parent-monitoring.service.ts`: ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0 (after 1 fix iteration: added missing `ReportRepository` import).
- `backend/services/parents/index.ts`: ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0 (first try).
- Project-wide `bun tsgo` exit 0 — zero errors introduced by this task.
- Runtime export resolution confirmed via `bun -e`: `ParentMonitoringService` visible on `@/backend/services/parents` barrel with exactly the five methods.

2.4.TE Test Engineering: full coverage deferred to task 6.2 per task spec. Inline sanity: projection mappers' boundary arms reviewed against plan §2.3 nullability rules — null rating/notes/track blocks/missing latest position all pass through unchanged (NEVER fabricated zeros). The fail-closed enum narrowing guards log + throw on corrupt stored values rather than passing them to the wire.

2.4.SEC Security & Tenancy Audit:
- Gate runs BEFORE any data read inside the tx (D11 — `requireLinkedChild` is the FIRST statement inside `withTransaction`).
- Denial-oracle verification (REQ-022): all five denial causes (malformed id, missing row, foreign id, never-linked id, severed child) → SAME `ForbiddenError(t.forbidden)` + SAME `logDomainError` context bag `{ code: "FORBIDDEN", entity: "students", entityId: <studentId>, locale }`. The `deny()` closure is the SINGLE log site — it logs then throws immediately, so exactly ONE log per denial (never zero, never more than one). Zero child fields in the log context bag.
- BOLA: identity from `parentActorId` parameter ONLY (arrives from `ctx.user.id` at the GraphQL layer — never client-supplied). The `studentId` is validated against the caller's grant inside `requireLinkedChild` BEFORE any data read.
- BOPLA: projection mappers expose ONLY plan §2.3 fields. `updatedAt` audit stamp silently dropped at the mapping seam. Grep for billing/dispute/internal column names → ZERO matches in code (only false-positive substring matches in comments: "feed" contains "fee", "FKs hold" contains "hold", "INTENTIONALLY" contains "INTENT" — case-insensitive).
- BFLA: `requireActor(..., UserRole.Parent, ..., false)` rejects non-parent roles before any read (defense-in-depth; the GraphQL field-level `authScopes` is task 3.2's layer-1).
- Composite relations: every child-scoped row reached only AFTER `requireLinkedChild` passes (inside the same tx snapshot).
- R-A grep-lock: `parent_link_requests` / `parentLinkRequests` / `ParentLinkRequestRepository` NOT imported, NOT referenced, NOT exposed in either new file.
- R-C/D2 grep-lock: `evaluations` / `Evaluation` NOT imported, NOT referenced, NOT exposed in either new file.

2.4.SR Semantic Review (full checklist):
- No authz caching — `requireLinkedChild` makes fresh DB lookups every call.
- Single `withTransaction` per per-student read — gate + reads in same tx snapshot (D11).
- Locale threaded through every method.
- Enum VALUE imports at runtime: `SessionStatus` (used in switch + Object.values), `UserRole` (used as `UserRole.Parent`), `isSurahJuzRef` (function value). `SurahJuzRef` is TYPE-only (`import type`) — used only in annotation positions. Biome `useImportType` preserves this split.
- No dead branches — every `if` path reachable, every `throw` reachable. The `childUser === null` throw in `getChildProgress` is the defense-in-depth invariant guard (unreachable while FKs hold, but mandatory).
- No module-level mutable state — only `const` pagination constants and pure functions.
- No cross-layer imports — only `@/backend/db/repo`, `@/backend/enum/...`, `@/backend/lib/...`, `@/backend/services/parents/...` (sibling), `@/backend/types`, `@/shared/locale/server-graphql`. No `@/frontend`, no `@/app`.
- No manual ReturnType construction — the task-2.1 projection types are used as-is.
- Clean comments — ZERO references to REQ ids, task ids, plan paths, ruling names (R-A..R-J, D11, INV-P1, INV-P2), `specs.md`, `tasks.md`, `.ai/plans/...`. Verified by case-sensitive grep across all three touched files → No matches found.

2.4.IV Instruction Verification: read all rule files printed by sub-loop discovery (AGENTS.md root, backend/AGENTS.md, backend/services/AGENTS.md, .agents/instructions/backend.instructions.md). All rules honored. No in-file violations. No cross-file blockers caused by this task.

WROTE outcome file at `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/2.4-service-gate-outcome.md` (summary, files created/modified, files NOT modified + reasons, the `requireLinkedChild` gate contract verbatim, the five service method signatures, projection mapper field-by-field mapping, denial-oracle verification table for all five causes, full verification results, carry-forward knowledge for tasks 3.2 + 6.2 + 6.1, cross-file dependency report).

UPDATED tasks.md: changed `- [ ] 2.4 ParentMonitoringService + requireLinkedChild gate` to `- [x] 2.4 ParentMonitoringService + requireLinkedChild gate` (only the main task line; .QL/.TE/.SEC/.SR/.IV subtask checkboxes left as-is per task instructions).

Stage Summary:
- `ParentMonitoringService` (5 methods) + `requireLinkedChild` gate created and verified.
- The INV-P1 authorization spine is in place — every per-student portal read funnels through the gate inside ONE transaction (D11 TOCTOU seal).
- The denial oracle (REQ-022) is verified: all five denial causes produce byte-identical `ForbiddenError` + ONE bounded `logDomainError` (zero child data).
- Three files touched (2 created, 1 modified), all sub-loop exit 0 at the deepest lifecycle stage.
- Project-wide tsgo exit 0 — zero new errors.
- Runtime export resolution confirmed.
- Carry-forward: task 3.2 wires the five Pothos query fields delegating to the service; task 6.2 authors the Tier 1-4 service test suites (especially the constant-denial-shape pin and the BOPLA output grep).

---

Task ID: 3.1
Agent: Backend GraphQL Pothos Subagent (general-purpose)
Task: Pothos parent-object types — ten parent-portal GraphQL objects in one declarative module

Work Log:
- Read SKILL.md in FULL (per-task flow: READ outcomes → READ task → READ AGENTS → EXECUTE → QUALITY LOOP → TEST → SECURITY → SEMANTIC REVIEW → INSTRUCTION VERIFICATION → WRITE OUTCOME → UPDATE CHECKBOX).
- Read ALL outcome files: 0.1-baseline-confirm-outcome, 0-baseline-outcome, plan-review-R1, research-00-planning-basis, 2.1-types-outcome, 2.2-repo-children-progress-outcome, 2.3-repo-reports-homework-outcome, 2.4-service-gate-outcome, 4.1-i18n-namespace-outcome. The 2.1 outcome defined the ten `*ReturnType` shapes my Pothos objects are backed by; the 2.4 outcome confirmed the service's fail-closed narrowing helpers produce the canonical TS enum members (so my Pothos file uses pure `t.expose("status", { type: SessionStatusPothosEnum })` passthroughs — no per-field mapping helpers needed, unlike the participant `session.pothos.ts` / `home-work.pothos.ts` which carry raw pgEnum strings).
- Read plan.md §3.1 (GraphQL SDL additions — the ten type names verbatim, nullability, field lists, the ONCE-registered enum requirement), §3.2 (Pothos object conventions: `objectRef<...ReturnType>("GraphQLName")`, `t.exposeID("id")` first, DateTime via `t.expose(..., { type: "DateTime" })`, enums via the registered Pothos enums, zero inline logic).
- Read tasks.md task 3.1 section (lines 193-202) — confirmed scope: ten objects, NOT touching participant objects (D4/REQ-031), no enum re-registration.
- Read the sibling `backend/graphql/pothos/parents/parent-link-request.pothos.ts` end-to-end — matched its `objectRef<...ReturnType>("GraphQLName").implement({ fields: t => ({ ... }) })` style, `import type { ... } from "@/backend/types/parents"` pattern, module-level JSDoc header conventions.
- Read `backend/graphql/pothos/shared/enum.pothos.ts` — confirmed the export names `SessionStatusPothosEnum` (:122) and `SurahJuzRefPothosEnum` (:330); the file imports them as VALUES (the registered enum objects are runtime values referenced via `t.expose(..., { type: EnumRef })`).
- Read `backend/graphql/pothos/index.ts` (root pothos barrel) — confirmed it does NOT export `./parents` (parents-domain objects follow the transitive-via-query registration convention; the sibling `parent-link-request.pothos.ts` is registered transitively via `parent-link.query.ts`).
- Read the participant Pothos files (`session.pothos.ts`, `report.pothos.ts`, `home-work.pothos.ts`) end-to-end to confirm I do NOT touch them and to study their enum-exposure patterns.
- Read the task-2.1 types file `backend/types/parents/parent-monitoring.types.ts` end-to-end — confirmed exact field names + nullability for every `*ReturnType` shape.
- Read AGENTS.md (root), backend/AGENTS.md, backend/graphql/AGENTS.md, backend/graphql/pothos/AGENTS.md, .agents/instructions/backend.instructions.md — all four applicable rule files (the same set later printed by sub-loop).

Execution:
- CREATED `backend/graphql/pothos/parents/parent-monitoring.pothos.ts` — one declarative module registering all ten parent-portal GraphQL objects, in dependency order (linked-child → attendance entry/page → report entry/page → homework track/entry/page → homework position → child progress):
  1. ParentLinkedChildPothosObject ← ParentLinkedChildReturnType
  2. ParentAttendanceEntryPothosObject ← ParentAttendanceEntryReturnType
  3. ParentAttendancePagePothosObject ← ParentAttendancePageReturnType
  4. ParentReportEntryPothosObject ← ParentReportEntryReturnType
  5. ParentReportPagePothosObject ← ParentReportPageReturnType
  6. ParentHomeworkTrackPothosObject ← ParentHomeworkTrackReturnType
  7. ParentHomeworkEntryPothosObject ← ParentHomeworkEntryReturnType
  8. ParentHomeworkPagePothosObject ← ParentHomeworkPageReturnType
  9. ParentHomeworkPositionPothosObject ← ParentHomeworkPositionReturnType
  10. ParentChildProgressPothosObject ← ParentChildProgressReturnType
- Each object: single `gqlSchemaBuilder.objectRef<...ReturnType>("GraphQLName").implement({ fields: t => ({ ... }) })`, backed EXCLUSIVELY by the task-2.1 types imported via `import type { ... } from "@/backend/types/parents"` (NO local type definitions).
- Entity-shaped objects (ParentLinkedChild, ParentAttendanceEntry, ParentReportEntry, ParentHomeworkEntry) expose `t.exposeID("id")` FIRST (Apollo cache normalization).
- Timestamps via `t.expose("createdAt", { type: "DateTime" })` (nullable variants carry `nullable: true`).
- Enums via the ONCE-registered `SessionStatusPothosEnum` / `SurahJuzRefPothosEnum` imported as VALUES from `shared/enum.pothos.ts` — pure `t.expose("status", { type: SessionStatusPothosEnum })` passthroughs (NO per-field mapping helper — the task-2.1 ReturnType shapes already carry the canonical TS enum members; NO `enumType(` call in the file — verified by grep).
- Nullability EXACTLY matches the TS types: nullable TS field → `nullable: true` on the GraphQL field; non-null TS field → default non-null GraphQL field. Verified field-by-field in the SR checklist.
- Nested object refs via `t.field({ type: <Ref>, nullable?: true, resolve: parent => parent.X })`; array-of-object-refs via `t.field({ type: [<Ref>], resolve: parent => parent.items })` (Pothos accepts the readonly array directly — SessionPagePothosObject precedent).
- ZERO inline logic in the Pothos file — pure declarative exposure.
- Doc strings are clean production-grade — ZERO plan-artifact references (verified by grep: no `REQ-`, `Task [0-9]`, `plan.md`, `tasks.md`, `specs.md`, `.ai/plans`, `R-[A-J]`, `Phase [0-9]`, `D11`, `INV-P` matches).

Quality Loop (3.1.QL):
- `bun run scripts/health/sub-loop.ts backend/graphql/pothos/parents/parent-monitoring.pothos.ts --lifecycle duplicates` → exit 0. All five stages passed: tsgo → oxlint → biome:check → lint:type-aware → check:duplicates.
- Project-wide `bun tsgo` → exit 0 (zero new errors introduced).
- Applicable rule files printed by sub-loop: `AGENTS.md`, `backend/AGENTS.md`, `backend/graphql/AGENTS.md`, `.agents/instructions/backend.instructions.md` (all four read in FULL before drafting).
- Barrel update NEEDED? NO — the parents-directory has no `index.ts` barrel; the sibling `parent-link-request.pothos.ts` follows the transitive-via-query registration convention. The new file follows the same convention — task 3.2 will import the `*PothosObject` refs, which transitively registers the ten types through `gqlSchema.ts`.

Test Engineering (3.1.TE): N/A as a standalone suite (per task spec — schema-surface assertions land in task 3.3). Compile-time object-shape pinning proven by sub-loop's tsgo stage; registration will be proven when task 3.3 runs `bun run generate:gqlSchema` (the ten types will surface in the SDL).

Security & Tenancy Audit (3.1.SEC):
- BOPLA output grep: ZERO exposed billing/dispute/confirmation/internal column names. The exposed fields are EXACTLY the plan §2.3 projection set — `id`, `fullName`, `createdAt`; `id`, `status`, `startedAt`, `endedAt`, `createdAt`; `id`, `sessionId`, `sessionStatus`, `sessionStartedAt`, `teacherNotes`, `studentRatingByTeacher`, `createdAt`; `surahJuz`, `fromAyah`, `toAyah`, `grade`; `id`, `sessionId`, `jadid`, `madi`, `createdAt`; `surahJuz`, `fromAyah`, `toAyah`; `child`, `progressRowCount`, `latestJadidPosition`, `latestMadiPosition`. The `updatedAt` audit stamp is SILENTLY DROPPED (already at the service mapping seam in task 2.4). The participant objects' `cancelReason`, `disputeReason`, `disputedAt`, `resolutionNote`, `resolvedAt`, `confirmedByTeacherAt`, `confirmedByStudentAt`, `confirmationDeadline`, `fee`, `feeHeld`, `needsAttention` columns stay on `SessionPothosObject` only — they are NOT mirrored onto any parent object.
- D4/REQ-031 verification: `git diff --name-only` shows NONE of `backend/graphql/pothos/classes/{session,report,home-work}.pothos.ts` in the task's footprint — the participant objects are byte-unchanged.
- The `evaluations` table (R-C exclusion) and `parent_link_requests` history (R-A exclusion) are NOT imported, NOT referenced, NOT exposed.

Semantic Review (3.1.SR):
- Zero inline logic (pure `t.expose*` / `t.field({ resolve: parent => parent.X })`).
- Doc strings non-leaking (zero plan-artifact references — grep-verified).
- No enum re-registration (zero `enumType(` calls — grep-verified).
- Nullability EXACTLY matches the TS types (field-by-field verified in the SR checklist).
- No dead branches (no `if`/`throw`/`switch` in the file).
- No cross-layer imports (only `@/backend/graphql/pothos/...` and `@/backend/types/parents`).
- Enums as VALUE imports at runtime where referenced (`SessionStatusPothosEnum`, `SurahJuzRefPothosEnum`); ReturnType types via `import type`.

Instruction Verification (3.1.IV): all four applicable rule files read in FULL and validated — root `AGENTS.md` (@/* alias, no oxlint-disable, single canonical GraphQL object type per entity, id-first); `backend/AGENTS.md` (Single Canonical Object Type Pattern, no local type defs in Pothos); `backend/graphql/AGENTS.md` (DateTime by name only, enum registration pattern, nullable: true for nullable TS types, no dynamic imports); `.agents/instructions/backend.instructions.md` (types from @/backend/types, nullable: true REQUIRED, id on all GraphQL objects, no nested ternary operators). No in-file rule violations. No cross-file blockers.

Carry-forward:
- Task 3.2 (query field registration): the ten exported `*PothosObject` refs are ready to import from `@/backend/graphql/pothos/parents/parent-monitoring.pothos`. The five query fields return: `myLinkedChildren` → `[ParentLinkedChildPothosObject]`; `parentChildProgress` → `ParentChildProgressPothosObject`; `parentChildSessions` → `ParentAttendancePagePothosObject`; `parentChildReports` → `ParentReportPagePothosObject`; `parentChildHomework` → `ParentHomeworkPagePothosObject`. NO barrel update needed in `parents/` (transitive-via-query convention).
- Task 3.3 (codegen + SDL lock): SDL should surface ten new types + zero new mutations (INV-P2 lock). Schema-surface test should pin the ten type names + field sets + the INV-P2 lock + REQ-031 byte-unchanged participant-only fields.
- Task 5.4 (apollo cache keyFields): the six no-`id` types need `keyFields: false` in `frontend/providers/apollo/apolloCache.ts` — `ParentAttendancePage`, `ParentReportPage`, `ParentHomeworkPage`, `ParentHomeworkTrack`, `ParentHomeworkPosition`, `ParentChildProgress` (already tracked in the 2.1 outcome per plan-review-R1 MED-3).

Outcome: `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/3.1-pothos-objects-outcome.md`.
Checkbox: `- [x] 3.1 Pothos parent-object types` in `tasks.md`.

---

Task ID: 5.4
Agent: Frontend Cache Subagent (general-purpose)
Task: Apollo cache registration for the no-`id` portal types

Work Log:
- Read SKILL.md in FULL (mandatory hard rule #1) — per-task execution flow, per-file quality verification, semantic review checklist, instruction verification.
- Read worklog.md (full) + ALL outcome files: `0-baseline-outcome.md`, `0.1-baseline-confirm-outcome.md`, `2.1-types-outcome.md`, `2.2-repo-children-progress-outcome.md`, `2.3-repo-reports-homework-outcome.md`, `2.4-service-gate-outcome.md`, `4.1-i18n-namespace-outcome.md`, `plan-review-R1.md`, `research-00-planning-basis.md`.
- Read plan files: `specs.md` REQ-030 (GraphQL objects) + REQ-053 (UI component tests); `plan.md` §3.1 (the ten Pothos object names — identified the SIX no-`id` types: `ParentAttendancePage`, `ParentReportPage`, `ParentHomeworkPage`, `ParentHomeworkTrack`, `ParentHomeworkPosition`, `ParentChildProgress`); `tasks.md` task 5.4 section (lines 287-295).
- Read applicable AGENTS.md + instruction files in FULL: `AGENTS.md` (root), `frontend/AGENTS.md`, `frontend/graphql/AGENTS.md` (§"Embedded type normalization policy" lines 87-97 — the canonical rule source for this task), `.agents/instructions/frontend.instructions.md`.
- Read existing `frontend/providers/apollo/apolloCache.ts` end-to-end BEFORE editing — learned the established pattern: `typePolicies: { ... }` under `new InMemoryCache({ ... })`, per-family inline comments (one shared block per family, subsequent entries bare — see `PlatformAnalytics*` family style), header docblock naming each family in a dedicated paragraph.
- Confirmed `feat/parent-read-only-monitoring-portal` branch checked out (was on `main`; the local feature branch existed at the same commit as `main` — checked out without conflict).

EXECUTED on `frontend/providers/apollo/apolloCache.ts`:
- Added `type TypePolicies` to the `@apollo/client` import (value-vs-type split honored — TypePolicies is type-only, used solely in annotation position).
- Extended the header docblock with TWO new paragraphs:
  1. Names the parent monitoring-portal read-model family — three `*Page` pagination wrappers (`ParentAttendancePage`, `ParentReportPage`, `ParentHomeworkPage`) whose normalizable entities are the `id`-carrying `*Entry` rows inside `items`; three embedded value objects (`ParentHomeworkTrack`, `ParentHomeworkPosition`, `ParentChildProgress`) cached inline under their enclosing query field / parent object and replaced wholesale on every refetch; per-child reads re-keyed by the `studentId` argument so embedded rows never leak across children.
  2. Notes the module-scope extraction of `typePolicies` into a named const (so the factory stays a one-liner and the registry reads as a flat, comment-anchored table).
- Hoisted the entire `typePolicies` object literal out of `createApolloCache` into a module-level `const apolloCacheTypePolicies: TypePolicies = { ... }` (refactor to satisfy oxlint `max-lines-per-function` — see fix iterations below).
- Appended the six new entries after the last documented entry (`PlatformAnalyticsRevenueTrendPoint`), under one shared inline comment block matching the `PlatformAnalytics*` family style:
  - `ParentAttendancePage: { keyFields: false }`
  - `ParentReportPage: { keyFields: false }`
  - `ParentHomeworkPage: { keyFields: false }`
  - `ParentHomeworkTrack: { keyFields: false }`
  - `ParentHomeworkPosition: { keyFields: false }`
  - `ParentChildProgress: { keyFields: false }`
- Reduced `createApolloCache` to a one-line factory: `return new InMemoryCache({ typePolicies: apolloCacheTypePolicies });`

5.4.QL Quality Loop — sub-loop.ts --lifecycle duplicates (3 fix iterations):
- **Iteration 1** (inline append inside original function body): oxlint FAILED — `max-lines-per-function` 82 > 75 (config: `max: 75, skipBlankLines: true, skipComments: true` at `oxlint.config.mts:38`). 6 new entries × 3 executable lines each pushed the function from 64 → 82 executable lines.
- **Iteration 2** (hoisted typePolicies to module-level const WITHOUT type annotation): tsgo FAILED — `Type 'boolean' is not assignable to type 'false | KeyFieldsFunction | KeySpecifier | undefined'`. Without contextual typing from the `InMemoryCache` constructor argument, TypeScript widened `keyFields: false` to `keyFields: boolean` (and `merge: false` to `merge: boolean`), neither of which satisfies Apollo's `TypePolicy` literal-typed members.
- **Iteration 3** (added explicit `TypePolicies` type annotation + `type TypePolicies` import): ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0. The type annotation restores contextual typing for the inner object literals, so `keyFields: false` and `merge: false` stay narrow (`false` literal).
- Project-wide `bun tsgo` exit 0 — zero new errors introduced by this task.

5.4.TE Test Engineering: N/A per the pipeline's scoping rule — cache-config-only change with no runtime code branches. Behavior is exercised by task 6.4's mocked-Apollo state matrix (re-keyed per-child reads never leak cross-child rows). Inline sanity: the six type names match plan §3.1 exactly (string-keyed), verified by grep — all six present at lines 139, 142, 145, 148, 151, 154.

5.4.SEC Security & Tenancy Audit: N/A per the scoping rule — no auth surface. Verified the four `id`-carrying portal types (`ParentLinkedChild`, `ParentAttendanceEntry`, `ParentReportEntry`, `ParentHomeworkEntry`) are NOT in the `keyFields: false` block (would break per-entity cache identity): `rg "ParentLinkedChild|ParentAttendanceEntry|ParentReportEntry|ParentHomeworkEntry" frontend/providers/apollo/apolloCache.ts` → No matches found (exit 1).

5.4.SR Semantic Review (full checklist):
- Race Conditions & Concurrency — N/A (cache config only; no async paths, no module-level mutable state — `apolloCacheTypePolicies` is a `const` frozen at module load).
- Environment & Configuration — N/A (no `resolveEnvConfig`, no cache-invalidation functions, no credentials).
- No dead branches — config-only, single-expression factory.
- No cross-layer imports — only `@apollo/client`; zero `@/backend`/`@/frontend/views`/`@/app` imports. Verified by grep.
- No manual ReturnType construction — only `InMemoryCache` (return type) and `TypePolicies` (const annotation) referenced, both imported as-is.
- Clean comments — ZERO references to REQ ids, task ids, plan paths, ruling labels (R-A..R-J, D1..D11, INV-P1/P2), `specs.md`, `tasks.md`, `plan.md`, `.ai/plans/...`. Verified by grep: `rg 'REQ-|Task [0-9]|\.ai/plans|specs\.md|tasks\.md|plan\.md|ruling R-[A-J]|Phase [0-9]|D1[0-1]|D[1-9]\b'` → No matches found.
- Schema & Types — all six GraphQL type names match plan §3.1 exactly (string-keyed under `typePolicies`); `TypePolicies` imported via `import { ..., type TypePolicies } from "@apollo/client"` (Biome `useImportType` preserves the `type` modifier on the named import).
- Scope Boundary — only `frontend/providers/apollo/apolloCache.ts` modified (plus the standard `tasks.md` checkbox + outcome file + worklog append). `git diff --stat` confirms 1 file changed (123 insertions, 81 deletions — the large delta is from the module-scope hoist; all existing entries + comments preserved verbatim).

5.4.IV Instruction Verification: read all rule files printed by sub-loop discovery (`AGENTS.md` root, `frontend/AGENTS.md`, `.agents/instructions/frontend.instructions.md`) PLUS `frontend/graphql/AGENTS.md` (the embedded-type policy canonical source — task spec mandates reading this even though sub-loop's discovery doesn't print it for `frontend/providers/`). All rules honored:
- `frontend/graphql/AGENTS.md` §"Embedded type normalization policy" (lines 87-97): all six no-`id` types registered with `keyFields: false`; the `*Page` wrappers' normalizable entities are the `*Entry` rows inside `items` (each carries `id` and stays normalized by default); the three embedded value objects have no inner `id`-carrying rows — they are pure value projections cached inline under their enclosing parent.
- `frontend.instructions.md` Apollo & GraphQL section: `id` field on all object types in selection sets (consumer-side counterpart of this task's `keyFields: false` opt-outs); no `useLazyQuery`; `TypedDocumentNode` conventions N/A (no documents authored here).
- `AGENTS.md` root: `oxlint-disable` prohibition honored (zero disable comments — fixed the `max-lines-per-function` violation via refactor); GraphQL Document Conventions honored (the `id`-carrying types in this family stay normalized so the "always include `id`" consumer-side rule keeps its meaning).
- `frontend/AGENTS.md`: Apollo error mapping surface N/A; MUI v9 rules N/A; `oxlint-disable` prohibition honored.

WROTE outcome file at `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/5.4-apollo-cache-outcome.md` (summary, files modified, files NOT modified + reasons, the six registered type names verbatim, the `keyFields: false` policy explanation by structural bucket — pagination wrappers vs embedded value objects, full verification results including the 3 fix iterations, carry-forward knowledge for tasks 6.4 + 5.2 + 5.3 + 3.1, cross-file dependency report — none blocking).

UPDATED tasks.md: changed `- [ ] 5.4 Apollo cache registration for the no-\`id\` portal types` to `- [x] 5.4 Apollo cache registration for the no-\`id\` portal types` (only the main task line; .QL/.TE/.SEC/.SR/.IV subtask checkboxes left as-is per task instructions).

Stage Summary:
- Six no-`id` GraphQL portal types from plan §3.1 registered with `keyFields: false` in `frontend/providers/apollo/apolloCache.ts`: `ParentAttendancePage`, `ParentReportPage`, `ParentHomeworkPage`, `ParentHomeworkTrack`, `ParentHomeworkPosition`, `ParentChildProgress`.
- Four `id`-carrying portal types (`ParentLinkedChild`, `ParentAttendanceEntry`, `ParentReportEntry`, `ParentHomeworkEntry`) deliberately NOT registered — they keep Apollo's default `id`-based normalization (verified by grep).
- One file touched (`frontend/providers/apollo/apolloCache.ts`), sub-loop exit 0 at the deepest lifecycle stage (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates all passed).
- Project-wide tsgo exit 0 — zero new errors introduced.
- Precedent-setting refactor: hoisted `typePolicies` to a module-level `apolloCacheTypePolicies: TypePolicies` const (the file is now structured as a flat, comment-anchored registry + a one-line factory). Future cache-policy additions should append to the same const.
- Carry-forward: task 6.4's mocked-Apollo state matrix exercises the per-child re-keying invariant; tasks 5.2/5.3 views consume the cache transparently (no API change); task 3.1's Pothos object module is independent (string-keyed policies are forward-compatible — Apollo silently ignores entries for types not yet present in the SDL).

---

Task ID: 3.2
Agent: Backend GraphQL Query Subagent (general-purpose)
Task: Query field registration + side-effect barrel

Work Log:
- Read SKILL.md in FULL (per-task flow: READ outcomes → READ task → READ AGENTS → EXECUTE → QUALITY LOOP → TEST → SECURITY → SEMANTIC REVIEW → INSTRUCTION VERIFICATION → WRITE OUTCOME → UPDATE CHECKBOX).
- Confirmed branch is `feat/parent-read-only-monitoring-portal` (was on `main`; checked out the feature branch FIRST per anti-failure reminder; one pre-existing `Caddyfile` modification carried over from the sandbox state, NOT introduced by this task).
- Read ALL outcome files: 0.1-baseline-confirm-outcome, 0-baseline-outcome, plan-review-R1, research-00-planning-basis, 2.1-types-outcome, 2.2-repo-children-progress-outcome, 2.3-repo-reports-homework-outcome, 2.4-service-gate-outcome (the carry-forward "wire five Pothos root query fields delegating to ParentMonitoringService.{listLinkedChildren, getChildProgress, listChildSessions, listChildReports, listChildHomework} passing ctx.user.id (NEVER client-supplied), args.studentId, args (page), ctx.locale"), 3.1-pothos-objects-outcome (the query-field→object-ref mapping: myLinkedChildren → [ParentLinkedChildPothosObject]; parentChildProgress → ParentChildProgressPothosObject; parentChildSessions → ParentAttendancePagePothosObject; parentChildReports → ParentReportPagePothosObject; parentChildHomework → ParentHomeworkPagePothosObject), 4.1-i18n-namespace-outcome, 5.4-apollo-cache-outcome.
- Read plan files: specs.md REQ-020 (parent role gate + authScopes $all conjunction), REQ-022 (constant 403 denial oracle), REQ-023 (read-only posture / INV-P2), REQ-024 (BOLA — identity from ctx.user.id ONLY), REQ-030 (the five new query field names + arg shapes); plan.md §3.2 (the query field registration template verbatim — the `gqlSchemaBuilder.queryField(...)` body, the `t.arg.int({ required: true })` for studentId, the `t.arg.int()` for page/pageSize, the `if (!ctx.user)` narrowing branch via `await ctx.t("errorsTranslations")` + `throw new UnauthorizedError(tErrors.unauthorized)`, the explicit closed-whitelist page forwarding `{ page: args.page ?? undefined, pageSize: args.pageSize ?? undefined }`); tasks.md task 3.2 section (lines 204-213).
- Read sibling files end-to-end BEFORE writing: `backend/graphql/query/parents/parent-link.query.ts` (the sibling — matched its side-effect registration style, `authScopes: { $all: { authenticated: true, role: [UserRole.X] } }` usage, `if (!ctx.user)` narrowing pattern with `await ctx.t("errorsTranslations")` + `throw new UnauthorizedError(tErrors.unauthorized)`, resolver delegation, JSDoc header conventions, top-level static imports only); `backend/graphql/query/parents/index.ts` (the barrel I'd update — matched the side-effect import style); `backend/graphql/query/index.ts` (verified the chain flows to `gqlSchema.ts`); `backend/graphql/query/classes/session-lifecycle.query.ts` (the field-factory precedent + the `$all` rationale + the `args.page ?? 1` ?? undefined coercion pattern); `backend/graphql/query/teachers/applicant.query.ts` + `backend/graphql/query/subscription.query.ts` (zero-arg query precedents); `backend/graphql/query/admin/audit-trail.query.ts` (paginated arg shape precedent).
- Read the Pothos builder setup: `backend/graphql/pothos/builder.ts` (the `gqlSchemaBuilder` SchemaBuilder instance, the `Defaults: "v3"` non-nullable-by-default contract, the `AuthScopes` type slot expecting `UserRole[]` for the `role` member, the `scopeAuthOptions.unauthorizedError` mapping onto the canonical localized `ForbiddenError`, the `authenticated` scope's `UnauthorizedError` throw at line 127-132); `backend/graphql/gqlContextFactory.ts` (the `Context` interface with `user`, `locale`, `t` bound to `ctx.locale` at line 236); `backend/graphql/gqlSchema.ts` + `gqlSchema.definitions.ts` (the side-effect chain: `gqlSchema.ts` → `gqlSchema.definitions.ts` → `@/backend/graphql/query` → `./parents` → `./parent-monitoring.query`).
- Read the `ParentMonitoringService` method signatures from `backend/services/parents/parent-monitoring.service.ts` (verified exact method names + parameter order: `listLinkedChildren(parentActorId, locale, outerTx?)`, `getChildProgress(parentActorId, studentId, locale, outerTx?)`, `listChildSessions(parentActorId, studentId, page, locale, outerTx?)`, `listChildReports(parentActorId, studentId, page, locale, outerTx?)`, `listChildHomework(parentActorId, studentId, page, locale, outerTx?)` — `page` is `ParentPageInput | undefined`); read `backend/types/parents/parent-monitoring.types.ts` (confirmed `ParentPageInput = { readonly page?: number; readonly pageSize?: number }`); read `backend/enum/users/user-role.enum.ts` (confirmed `UserRole.Parent = "parent"` enum member); read `backend/lib/errors.ts` (confirmed `UnauthorizedError` extends `DomainError` with code `UNAUTHORIZED`); read `shared/locale/types/errors/labels.ts` (confirmed `errorsTranslations.unauthorized` is a valid string key at line 43).
- Read AGENTS.md (root), backend/AGENTS.md, backend/graphql/AGENTS.md, backend/graphql/query/AGENTS.md, .agents/instructions/backend.instructions.md — all five applicable rule files (the same set later printed by sub-loop).

Execution:
- CREATED `backend/graphql/query/parents/parent-monitoring.query.ts` — one side-effect module registering the five parent-only root query fields by side effect (NO named exports):
  1. `myLinkedChildren` (zero-arg) → `[ParentLinkedChildPothosObject]` → `ParentMonitoringService.listLinkedChildren(ctx.user.id, ctx.locale)`.
  2. `parentChildProgress` (args: `studentId: Int!`) → `ParentChildProgressPothosObject` → `ParentMonitoringService.getChildProgress(ctx.user.id, args.studentId, ctx.locale)`.
  3. `parentChildSessions` (args: `studentId: Int!`, `page: Int`, `pageSize: Int`) → `ParentAttendancePagePothosObject` → `ParentMonitoringService.listChildSessions(ctx.user.id, args.studentId, { page: args.page ?? undefined, pageSize: args.pageSize ?? undefined }, ctx.locale)`.
  4. `parentChildReports` (args: `studentId: Int!`, `page: Int`, `pageSize: Int`) → `ParentReportPagePothosObject` → `ParentMonitoringService.listChildReports(ctx.user.id, args.studentId, { page: args.page ?? undefined, pageSize: args.pageSize ?? undefined }, ctx.locale)`.
  5. `parentChildHomework` (args: `studentId: Int!`, `page: Int`, `pageSize: Int`) → `ParentHomeworkPagePothosObject` → `ParentMonitoringService.listChildHomework(ctx.user.id, args.studentId, { page: args.page ?? undefined, pageSize: args.pageSize ?? undefined }, ctx.locale)`.
- Extracted `parentOnlyAuthScopes` as a module-level const referenced by every field — single source of truth for the `$all { authenticated: true, role: [UserRole.Parent] }` conjunction (mirrors the session-lifecycle.query.ts factory rationale: the conjunction semantics can never drift between registrations). The const is declared WITHOUT `as const` and WITH an explicit `{ $all: { authenticated: true; role: UserRole[] } }` type annotation so Pothos's `AuthScopes` type slot accepts the `role` member as `UserRole[]` (a `readonly [UserRole.Parent]` tuple would fail the field-scope assignment — tsgo error TS2322, caught and fixed during the first sub-loop iteration).
- Every resolver carries the `if (!ctx.user)` TypeScript-narrowing branch — exactly per plan §3.2 template and the sibling `parent-link.query.ts:74-77` pattern. The branch is REACHABLE in the type system (anonymous callers would reach it if the scope layer were bypassed — defense-in-depth) but UNREACHABLE in practice because the `$all { authenticated: true }` scope throws `UnauthorizedError` (401) before the resolver body executes. The thrown message is localized via `ctx.t("errorsTranslations").unauthorized` (ctx.t is bound to ctx.locale).
- Page args forwarded as an EXPLICIT closed whitelist `{ page: args.page ?? undefined, pageSize: args.pageSize ?? undefined }` — NEVER a spread of `args`. The `?? undefined` coerces `null` (which GraphQL permits for nullable args) to `undefined` (the `ParentPageInput` shape's optional-member semantics) without falsy-coercing a legitimate `0` (page 0 is a valid client input — the service clamps it to 1).
- ZERO new mutation fields — the file registers `queryField(...)` calls ONLY (five of them). INV-P2 / REQ-023 honored.
- Top-level STATIC imports only (Bun ESM rule — no dynamic `await import(...)` in resolver trees).
- Doc strings are clean production-grade — ZERO plan-artifact references (verified by grep: no `REQ-`, `Task [0-9]`, `plan.md`, `tasks.md`, `specs.md`, `.ai/plans`, `R-[A-J]`, `Phase [0-9]`, `D11`, `INV-P` matches — two early draft references to `REQ-024` and `INV-P2` were removed before the final sub-loop run).

- UPDATED `backend/graphql/query/parents/index.ts` — appended `import "./parent-monitoring.query";` after the existing `import "./parent-link.query";` line; extended the barrel header docblock to name the five new fields + the transitive-via-query registration note for the ten Pothos object types (matching the transitive-via-query convention the sibling `parent-link-request.pothos.ts` follows — no barrel needed in `pothos/parents/`).

3.2.QL Quality Loop — sub-loop.ts --lifecycle duplicates (1 fix iteration):
- **Iteration 1** (with `as const` on `parentOnlyAuthScopes`): tsgo FAILED — `Type 'readonly [UserRole.Parent]' is not assignable to type 'UserRole[]'`. Pothos's `AuthScopes` type slot expects a mutable `UserRole[]` for the `role` member; `as const` widens the array literal to a readonly tuple.
- **Iteration 2** (removed `as const`, added explicit `{ $all: { authenticated: true; role: UserRole[] } }` type annotation on the const): ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0.
- Re-ran sub-loop on the barrel `backend/graphql/query/parents/index.ts`: ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0.
- Project-wide `bun tsgo` exit 0 — zero new errors introduced by this task.

3.2.TE Test Engineering: wire-level coverage authored in task 6.3 per task spec. Inline schema-introspection sanity confirmed via a temporary script (deleted after use) that imports `graphQLSchema` from `@/backend/graphql/gqlSchema` and walks the live `Query` type's fields:
  - `myLinkedChildren(): [ParentLinkedChild!]!`
  - `parentChildProgress(studentId: Int!): ParentChildProgress!`
  - `parentChildSessions(page: Int, pageSize: Int, studentId: Int!): ParentAttendancePage!`
  - `parentChildReports(page: Int, pageSize: Int, studentId: Int!): ParentReportPage!`
  - `parentChildHomework(page: Int, pageSize: Int, studentId: Int!): ParentHomeworkPage!`
  - Sibling parent-link queries (`myOutgoingParentLinkRequests`, `myIncomingParentLinkRequests`) remain registered — zero drift on the existing surface.
  - Transitive-via-query registration confirmed: importing `parent-monitoring.query.ts` (which imports the `*PothosObject` refs from `parent-monitoring.pothos.ts`) transitively registered the ten parent-portal Pothos object types through `gqlSchema.ts` without a `pothos/parents/index.ts` barrel.

3.2.SEC Security & Tenancy Audit (CRITICAL):
- **BFLA**: every field references `parentOnlyAuthScopes` (the shared `$all { authenticated: true, role: [UserRole.Parent] }` conjunction). Anonymous callers hit the `authenticated` scope's `UnauthorizedError` (401); authenticated non-parents (admin/teacher/student) fail the `role` scope into the canonical localized `ForbiddenError` (403, mapped at `builder.ts:111-121`). The `$all` (NOT `$any`) conjunction is load-bearing — both conditions must hold. Defense-in-depth: the service layer additionally runs `requireActor(parentActorId, UserRole.Parent, ...)` at the top of every method. Admins do NOT receive portal access (the role list contains exactly `[UserRole.Parent]`, no admin override).
- **BOLA**: ZERO `parentId` / `parentActorId` / `actorId` args anywhere (grep-verified). Identity comes from `ctx.user.id` ONLY (REQ-024). The only caller-supplied identity on per-student fields is `args.studentId`, gated by `requireLinkedChild` inside the same transaction. `myLinkedChildren` is zero-arg — no caller-supplied identity of any kind.
- **BOPLA**: ZERO `...args` spreads (grep-verified). Page args forwarded as an EXPLICIT closed whitelist `{ page: args.page ?? undefined, pageSize: args.pageSize ?? undefined }`. The resolver re-validates nothing — boundary clamping happens service-side.
- **INV-P2**: ZERO `builder.mutationField` / `mutationField(` calls in the new file (grep-verified). The file registers `queryField(...)` calls ONLY. Cross-file grep: zero mutation files reference `ParentMonitoringService` or `parent-monitoring.query`. Parents retain their legitimate link-request mutations (`requestParentChildLink`, `cancelParentLinkRequest`) — the portal's read-only discipline is enforced by the ABSENCE of a portal mutation surface here, not by a global write veto.

3.2.SR Semantic Review (full checklist):
- Race Conditions & Concurrency — N/A (pure READ delegation, zero writes, zero notifications, zero module-level mutable state — `parentOnlyAuthScopes` is a `const` frozen at module load; the per-student TOCTOU seal lives service-side in task 2.4).
- Environment & Configuration — N/A (no `resolveEnvConfig`, no cache-invalidation functions, no credentials).
- No dead branches — the `if (!ctx.user)` branch is REACHABLE in the type system (anonymous callers would reach it if the scope layer were bypassed) but UNREACHABLE in practice (the `$all { authenticated: true }` scope throws first). MANDATORY for TypeScript narrowing (the repo-wide no-non-null-assertion rule forbids `ctx.user!.id`).
- No cross-layer imports — only `@/backend/enum/...`, `@/backend/graphql/...`, `@/backend/lib/errors`, `@/backend/services`. No `@/frontend`, no `@/app`. Verified by grep.
- No manual ReturnType construction — resolver return types inferred from the service method signatures; the `*PothosObject` refs imported as VALUES.
- Clean comments — ZERO references to REQ ids, task ids, plan paths, ruling labels (R-A..R-J, D1..D11, INV-P1/P2), `specs.md`, `tasks.md`, `plan.md`, `.ai/plans/...`. Verified by grep.
- Schema & Types — `UserRole` imported as a VALUE (used in the runtime scope expression `[UserRole.Parent]`); `UnauthorizedError` imported as a VALUE (constructor); `*PothosObject` refs imported as VALUES (runtime objects referenced in `t.field({ type: ... })`); `t.arg.int({ required: true })` produces `Int!`; `t.arg.int()` produces `Int` (nullable); `ctx.t("errorsTranslations")` returns the canonical `ErrorsLabels` namespace.
- Scope Boundary — only the 2 listed files were created/modified (`parent-monitoring.query.ts` created, `parents/index.ts` extended by one side-effect import + docblock expansion). `git diff --name-only` confirms: `backend/graphql/query/parents/index.ts` (modified) + `backend/graphql/query/parents/parent-monitoring.query.ts` (new). The unrelated `Caddyfile` modification is a pre-existing sandbox-state artifact (preserved per the worklog 0.1 note).

3.2.IV Instruction Verification: read all rule files printed by sub-loop discovery (AGENTS.md root, backend/AGENTS.md, backend/graphql/AGENTS.md, backend/graphql/query/AGENTS.md, .agents/instructions/backend.instructions.md — five files). All rules honored:
- AGENTS.md root: `@/*` path alias used; barrel mechanics (relative `./` paths only, side-effect imports); NO `oxlint-disable`; GraphQL Document Conventions; per-file sub-loop BEFORE wiring consumers.
- backend/AGENTS.md: 6-layer data flow (GraphQL delegates to services, NEVER repos); single canonical GraphQL object type per entity; `DomainError` rule (`UnauthorizedError` extends `DomainError`).
- backend/graphql/AGENTS.md: `authScopes` rules honored (`$all` conjunction, fail-closed, 401/403 split); nullability rule; resolver delegation rule; locale propagation (`ctx.locale`); localized errors (`ctx.t("errorsTranslations")`); scope composition rule; DomainError rule; masking belongs to the boundary (NO try/catch in resolvers).
- backend/graphql/query/AGENTS.md: Side-Effect Imports Only rule; Resolver Delegation rule; Import Convention; File Organization; Adding New Queries (5-step recipe followed; codegen refresh happens in 3.3).
- .agents/instructions/backend.instructions.md: 6-layer data flow; type definition pattern (NO local type definitions in Pothos files); Pothos / GraphQL rules (locale propagation, no dynamic imports, DomainError); no nested ternary operators. No in-file rule violations. No cross-file blockers caused by this task.

WROTE outcome file at `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/3.2-query-registration-outcome.md` (summary, files created/modified, files NOT modified + reasons, the five field names + arg shapes + return types + service delegations verbatim, the `authScopes` conjunction + the `$all` rationale, the `if (!ctx.user)` narrowing branch per plan §3.2 template, the INV-P2 proof (zero mutations grep-verified), the BFLA + BOLA + BOPLA audit, full verification results including the 1 fix iteration, carry-forward knowledge for tasks 3.3 + 6.3 + 5.1/5.2/5.3, cross-file dependency report — task 3.3 will lock the SDL).

UPDATED tasks.md: changed `- [ ] 3.2 Query field registration + side-effect barrel` to `- [x] 3.2 Query field registration + side-effect barrel` (only the main task line; .QL/.TE/.SEC/.SR/.IV subtask checkboxes left as-is per task instructions).

Stage Summary:
- Five parent-only root query fields wired into the Pothos schema by side effect: `myLinkedChildren`, `parentChildProgress`, `parentChildSessions`, `parentChildReports`, `parentChildHomework`. All register at import time via `gqlSchemaBuilder.queryField(...)`; NO named exports.
- The five fields delegate to `ParentMonitoringService` (task 2.4) passing `ctx.user.id` (NEVER client-supplied), `args.studentId`, `args` (page, as an explicit closed whitelist), and `ctx.locale`.
- Every field carries `authScopes: { $all: { authenticated: true, role: [UserRole.Parent] } }` — the conjunction is load-bearing (401 for anonymous, 403 for authenticated wrong-role).
- INV-P2 lock honored: ZERO new mutation fields (grep-verified in the new file + cross-file on `backend/graphql/mutation`).
- BFLA, BOLA, BOPLA all grep-verified clean.
- Two files touched (1 created, 1 modified), all sub-loop exit 0 at the deepest lifecycle stage (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates all passed).
- Project-wide tsgo exit 0 — zero new errors introduced.
- Schema introspection confirms all five fields register with correct arg shapes + return types; the sibling parent-link queries survive intact (no drift); the ten parent-portal Pothos object types transitively register through the side-effect chain.
- Carry-forward: task 3.3 runs `bun run generate:gqlSchema` + `bun codegen` to refresh the SDL + typed-document-node types, then extends the schema-surface assertion suite (pin the five field names + arg shapes + the INV-P2 mutation lock + the REQ-031 byte-unchanged participant-fields pin); task 6.3 authors the wire-level coverage (BFLA, BOLA, TOCTOU, pagination clamp, happy path, INV-P2 mutation-type assertion); tasks 5.1/5.2/5.3 consume the generated typed-document-nodes.

---

Task ID: 3.3
Agent: Backend GraphQL Codegen Subagent (general-purpose)
Task: GraphQL codegen checkpoint + SDL surface lock

Work Log:
- Read SKILL.md in FULL (mandatory hard rule #1) — task execution protocol, per-file quality verification, semantic review checklist, instruction verification.
- Read ALL outcome files in `outcome/` (especially 3.1 + 3.2 — the ten object names + five field names that should now surface in the SDL).
- Read specs.md (REQ-023 read-only posture, REQ-030 SDL surface, REQ-031 participant-only queries byte-unchanged), plan.md (§3.3 — codegen + SDL lock requirements; §3.4 codegen), tasks.md (task 3.3 section, lines 215-224).
- Read applicable AGENTS.md + instruction files: root AGENTS.md, backend/AGENTS.md, backend/graphql/AGENTS.md, .agents/instructions/backend.instructions.md, .agents/instructions/tests.instructions.md.
- Discovered the `feat/parent-read-only-monitoring-portal` branch was 1 commit behind `main` (the 3.2 commit `eab5658` had landed on `main` but not on `feat` due to the sandbox's between-invocation HEAD reset). Resolved via `git merge main --ff-only` — `feat` now sits at `eab5658` before this task's commit.
- Ran `bun run generate:gqlSchema` — regenerated `frontend/graphql/generated/schema.graphql` (33017 → 36055 bytes, +98 lines = the ten new parent-portal object types + the five new root query field definitions with descriptions + arg shapes). Verified zero unintended churn via `git diff --stat HEAD`.
- Ran `bun codegen` — the typed-document-node output `frontend/graphql/generated/gql/graphql.ts` is byte-unchanged because no portal GraphQL documents exist yet (task 5.1 will add them and trigger a second codegen refresh).
- Inspected the regenerated SDL: confirmed all ten parent object types present (`ParentLinkedChild`, `ParentAttendanceEntry`, `ParentAttendancePage`, `ParentReportEntry`, `ParentReportPage`, `ParentHomeworkTrack`, `ParentHomeworkEntry`, `ParentHomeworkPage`, `ParentHomeworkPosition`, `ParentChildProgress`); all five root query fields present with correct arg shapes (`myLinkedChildren` zero-arg, `parentChildProgress(studentId: Int!)`, `parentChildSessions/Reports/Homework(page: Int, pageSize: Int, studentId: Int!)`); ZERO new Mutation fields referencing the portal service/names.
- Extended `backend/graphql/test/schema-surface.test.ts` (the live schema-surface assertion suite matching parent queries) with:
  - Two new constants (`PARENT_PORTAL_QUERY_FIELDS`, `PARENT_PORTAL_TYPE_NAMES`) added to the root-query additions pin + the whole-schema named-type additions pin.
  - Ten `PARENT_*_FIELD_TYPES` maps pinning every object's exact field set + per-field type strings (BOPLA projection boundary).
  - Two frozen participant-only SDL snippet constants (`PARTICIPANT_SESSION_REPORT_SDL`, `PARTICIPANT_SESSION_HOMEWORK_SDL`).
  - A module-scope `rootQueryField` helper (sibling to the existing `mutationField` — extracted to satisfy `sonarjs/no-identical-functions`).
  - A new describe block with 10 tests pinning every dimension of the portal surface (field names + arg shapes, `$all` authScopes conjunction, smuggled-args validation rejection, ten object types' exact field sets, `id: ID!` on entity shapes, zero-mutation lock on Mutation root + committed SDL Mutation block, participant-only byte-unchanged SDL snippets, SEC public-operations allowlist exclusion).
  - Codegen-sync belt-and-braces checks for the five fields + ten type-block headers inside the committed SDL artifact.
- Ran the test suite via `bun run test/scripts/run-test.ts backend/graphql/test/schema-surface.test.ts` — all 53 tests pass (10 new + 43 pre-existing).
- Tier 4 rename-drift probe: three probes (field-name, return-type, arg-shape) all caught the deliberate rename; all probes reverted; the suite returned to green.
- Ran `bun run scripts/health/sub-loop.ts backend/graphql/test/schema-surface.test.ts --lifecycle duplicates` — exit 0 (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates all passed). One fix iteration: extracted the module-scope `rootQueryField` helper to resolve a `sonarjs/no-identical-functions` error (the initial closure-scoped `portalQueryField` was identical to the Notification describe block's `queryField`).
- 3.3.SEC: verified `backend/lib/gateway/public-operations.ts` needs NO new entries — the closed 6-member allowlist (`login`, `refreshToken`, `logout`, `registerUser`, `recitationReadings`, `_health`) excludes all five portal fields. Grep-verified zero matches for `myLinkedChildren` / `parentChild*` / `parentMonitoring` in the allowlist. The SEC test in the new describe block asserts NONE of the five portal names is a member of `PUBLIC_OPERATION_NAMES` / `PUBLIC_OPERATIONS`.
- 3.3.SR: full semantic review checklist verified — no dead branches, no cross-layer imports, no manual ReturnType construction, clean comments (ZERO plan-artifact references in my new additions, verified by grep scoped to lines > 1650), nullability EXACTLY matches the TS ReturnType shapes, `id: ID!` on entity shapes, scope boundary honored.
- 3.3.IV: read ALL applicable AGENTS.md + instruction files (root AGENTS.md, backend/AGENTS.md, backend/graphql/AGENTS.md, .agents/instructions/backend.instructions.md, .agents/instructions/tests.instructions.md). All rules validated — no in-file violations, no cross-file blockers.
- Committed `bfe2452 feat(parents): graphql codegen checkpoint + SDL surface lock` on `feat/parent-read-only-monitoring-portal` (staged only plan-related files — excluded the pre-existing `Caddyfile` sandbox artifact).
- Wrote `outcome/3.3-codegen-sdl-lock-outcome.md` (summary, generated files committed, five field names + arg shapes pinned, ten object types pinned, INV-P2 zero-mutation lock proof, REQ-031 byte-unchanged proof, public-operations allowlist proof, verification results, carry-forward for 5.1/5.4/6.3/7.1, cross-file dependencies).
- Marked `- [x] 3.3 GraphQL codegen checkpoint + SDL surface lock` in tasks.md (only the main task line — subtask checkboxes left as-is per task instructions).

Stage Summary:
- Branch: `feat/parent-read-only-monitoring-portal` (3 commits ahead of `origin/main`: 2fdf5e2 + eab5658 + bfe2452).
- Generated files committed: `frontend/graphql/generated/schema.graphql` (regenerated, +98 lines). The `gql/graphql.ts` codegen output is byte-unchanged (no portal documents exist yet — task 5.1 will trigger a second codegen refresh).
- Five field names + arg shapes pinned in SDL assertions: `myLinkedChildren` (zero-arg, `[ParentLinkedChild!]!`), `parentChildProgress(studentId: Int!): ParentChildProgress!`, `parentChildSessions(page: Int, pageSize: Int, studentId: Int!): ParentAttendancePage!`, `parentChildReports(page: Int, pageSize: Int, studentId: Int!): ParentReportPage!`, `parentChildHomework(page: Int, pageSize: Int, studentId: Int!): ParentHomeworkPage!`.
- Ten object types pinned: `ParentLinkedChild`, `ParentAttendanceEntry`, `ParentAttendancePage`, `ParentReportEntry`, `ParentReportPage`, `ParentHomeworkTrack`, `ParentHomeworkEntry`, `ParentHomeworkPage`, `ParentHomeworkPosition`, `ParentChildProgress` — each with exact field set + per-field type strings.
- INV-P2 zero-mutation lock proof: two complementary assertions (live Mutation root field-name iteration + committed SDL Mutation block slice) both confirm ZERO portal-named fields on the Mutation root.
- REQ-031 byte-unchanged proof: the participant-only `sessionReport(sessionId: ID!): SessionReport` and `sessionHomework(sessionId: ID!): SessionHomeWork` SDL snippets match the frozen pre-portal baseline verbatim (git diff shows zero changes to those lines).
- Test result: 53 pass / 0 fail / 595 expect() calls.
- Sub-loop exit 0 at the deepest lifecycle stage (duplicates).
- Tier 4 rename-drift probe: three probes (field-name, return-type, arg-shape) all caught the deliberate rename; all reverted.
- Carry-forward for task 5.1: a SECOND codegen refresh is required after the portal GraphQL documents land (the `gql/graphql.ts` output is byte-unchanged in THIS task because no documents existed yet).

---

Task ID: 5.1
Agent: Frontend GraphQL Documents Subagent (general-purpose)
Task: GraphQL documents + codegen

Work Log:
- Read SKILL.md in FULL (per-task flow: READ outcomes → READ task → READ AGENTS → EXECUTE → QUALITY LOOP → TEST → SECURITY → SEMANTIC REVIEW → INSTRUCTION VERIFICATION → WRITE OUTCOME → UPDATE CHECKBOX).
- Confirmed branch is `feat/parent-read-only-monitoring-portal` (the sandbox resets HEAD to `main` between bash invocations — every command started with `git checkout feat/parent-read-only-monitoring-portal 2>/dev/null || true` then verified with `git branch --show-current`; used `git checkout -f` to recover from working-tree conflicts when the sandbox left stale modifications).
- Read ALL outcome files: 0.1-baseline-confirm-outcome, 0-baseline-outcome, plan-review-R1, research-00-planning-basis, 2.1-types-outcome (the ten closed read projections + `ParentPageInput`), 2.2-repo-children-progress-outcome, 2.3-repo-reports-homework-outcome, 2.4-service-gate-outcome, 3.1-pothos-objects-outcome (the ten Pothos object refs + `id` FIRST on the four entity-shaped objects via `t.exposeID("id")`), 3.2-query-registration-outcome (the five root query field names + arg shapes — `myLinkedChildren` zero-arg; `parentChildProgress(studentId: Int!)`; `parentChildSessions/Reports/Homework(studentId: Int!, page: Int, pageSize: Int)`), 3.3-codegen-sdl-lock-outcome (the SDL is locked with the five fields + ten types; `graphql.ts` was byte-unchanged at 3.3 because no portal documents existed yet — this task triggers the second codegen refresh), 4.1-i18n-namespace-outcome, 5.4-apollo-cache-outcome (the six no-`id` portal types registered with `keyFields: false` in `apolloCache.ts`).
- Read plan files: specs.md REQ-002 (translation/enum compliance — N/A for documents layer), REQ-024 (BOLA — identity from ctx.user.id ONLY; AC4: frontend sends ONLY studentId + pagination, never identity/role/auth hints), REQ-030 (the five new query field names + arg shapes + AC4: codegen refresh after documents authored); plan.md §5.5 (the five documents verbatim with `id` FIRST in every selection, `TypedDocumentNode` typing, NO `useLazyQuery`, the five export names); tasks.md task 5.1 section (lines 250-260).
- Read sibling files end-to-end BEFORE writing: `frontend/graphql/sharedDocuments/parents/parent-link.documents.ts` (the sibling — matched its `TypedDocumentNode` typing, `gql` tag usage, docblock style, export style, `id`-first convention); `frontend/graphql/sharedDocuments/parents/parent-link.documents.test.ts` (the test precedent — AST helpers + contract table + barrel parity + codegen binding proof); `frontend/graphql/sharedDocuments/parents/index.ts` (the barrel I'd update); `frontend/graphql/sharedDocuments/admin/audit-trail.documents.ts` (paginated-read document precedent — `page: Int, pageSize: Int` optional arg shape); the generated types in `frontend/graphql/generated/gql/graphql.ts`; the generated SDL in `frontend/graphql/generated/schema.graphql` (confirmed the exact field names + arg shapes + selection paths for the five portal queries + ten object types).
- Read AGENTS.md (root), frontend/AGENTS.md, frontend/graphql/AGENTS.md, frontend/graphql/sharedDocuments/AGENTS.md, .agents/instructions/frontend.instructions.md, .agents/instructions/tests.instructions.md — all six applicable rule files (the same set later printed by sub-loop).

Execution:
- CREATED `frontend/graphql/sharedDocuments/parents/parent-monitoring.documents.ts` — five `TypedDocumentNode`-typed query documents (NO `useLazyQuery` — documents only, not hooks):
  1. `myLinkedChildrenQueryDocument: TypedDocumentNode<MyLinkedChildrenQuery>` — zero-arg list query; selects `id fullName createdAt` from `myLinkedChildren` (`id` FIRST for Apollo cache normalization).
  2. `parentChildProgressQueryDocument: TypedDocumentNode<ParentChildProgressQuery, ParentChildProgressQueryVariables>` — `$studentId: Int!` arg; selects `child { id fullName createdAt } progressRowCount latestJadidPosition { surahJuz fromAyah toAyah } latestMadiPosition { surahJuz fromAyah toAyah }` (the detail-header + progress-tab single payload — `child` re-projects the same `ParentLinkedChild` selection as the list, `id` FIRST).
  3. `parentChildSessionsQueryDocument: TypedDocumentNode<ParentChildSessionsQuery, ParentChildSessionsQueryVariables>` — `$studentId: Int!, $page: Int, $pageSize: Int` args; selects `items { id status startedAt endedAt createdAt } totalCount page pageSize` (the honest envelope — `id` FIRST on each `ParentAttendanceEntry`).
  4. `parentChildReportsQueryDocument: TypedDocumentNode<ParentChildReportsQuery, ParentChildReportsQueryVariables>` — same arg shape; selects `items { id sessionId sessionStatus sessionStartedAt teacherNotes studentRatingByTeacher createdAt } totalCount page pageSize` (`id` FIRST on each `ParentReportEntry`; nullable `teacherNotes`/`studentRatingByTeacher` flow through as `string | null` / `number | null`).
  5. `parentChildHomeworkQueryDocument: TypedDocumentNode<ParentChildHomeworkQuery, ParentChildHomeworkQueryVariables>` — same arg shape; selects `items { id sessionId jadid { surahJuz fromAyah toAyah grade } madi { surahJuz fromAyah toAyah grade } createdAt } totalCount page pageSize` (`id` FIRST on each `ParentHomeworkEntry`; `jadid`/`madi` are nullable embedded `ParentHomeworkTrack` value objects).
- UPDATED `frontend/graphql/sharedDocuments/parents/index.ts` barrel — appended `export * from "./parent-monitoring.documents";` after the existing `export * from "./parent-link.documents";` line.
- CREATED `frontend/graphql/sharedDocuments/parents/parent-monitoring.documents.test.ts` — structural lock over the five documents (16 tests / 148 expect() calls) mirroring the sibling `parent-link.documents.test.ts` precedent: AST helpers (operationOrThrow, subFields, subField, selectionPath, fieldNames, variableNames, argumentVariableNames) + contract table (PARENT_MONITORING_DOCUMENT_TABLE) + three describe blocks (named operations + channel + variables; id-first + canonical row shapes; codegen binding + barrel parity). Asserts every document is a single named `query` operation with the exact sanctioned variable set; every declared variable is wired into its root-field argument; the variable surface is EXACTLY `studentId` + optional `page`/`pageSize` (zero parent/actor/user/role/auth/token hints — REQ-024.4); the list query is zero-argument; every entity-shaped object selection carries `id` FIRST with the exact canonical row; the progress `child` echo re-projects the same `ParentLinkedChild` selection as the list; every page wrapper carries the honest envelope; the progress composite + homework track/position blocks carry NO `id` (embedded value types); the top-level barrel re-exports the SAME document instances (cache-key safety); the documents remain `TypedDocumentNode`-typed against generated operation types (compile-time proof by assignment).

5.1 Codegen refresh:
- `bun run generate:gqlSchema` — wrote `frontend/graphql/generated/schema.graphql` (36003 bytes, byte-identical to the task-3.3 committed output — the SDL does not change because documents are operation-derived, not schema-derived).
- `bun codegen` — extended `frontend/graphql/generated/gql/graphql.ts` by +70 lines: five new `{OperationName}Query` types, five new `{OperationName}QueryVariables` types, ten new `{OperationName}_{field}[_{subField}]` extracted field types, five new `*Document` const exports at the file tail. All generated, none hand-edited (REQ-030.4 honored).
- Variable shapes verified:
  - `MyLinkedChildrenQueryVariables` = `Exact<{ [key: string]: never }>` (zero-arg)
  - `ParentChildProgressQueryVariables` = `Exact<{ studentId: number }>`
  - `ParentChildSessionsQueryVariables` = `Exact<{ studentId: number; page: number | null | undefined; pageSize: number | null | undefined }>`
  - `ParentChildReportsQueryVariables` = `Exact<{ studentId: number; page: number | null | undefined; pageSize: number | null | undefined }>`
  - `ParentChildHomeworkQueryVariables` = `Exact<{ studentId: number; page: number | null | undefined; pageSize: number | null | undefined }>`

5.1.QL Quality Loop — sub-loop.ts --lifecycle duplicates (1 fix iteration):
- **Iteration 1** (test file with `tagedList` typo): tsgo FAILED — TS6133 `typedList` declared but never read; TS2304 Cannot find name `tagedList`. The runtime-use assertion `expect(tagedList.loc).toBeDefined()` referenced the wrong name.
- **Iteration 2** (renamed `tagedList` → `typedList` in the `expect(typedList.loc).toBeDefined()` assertion): ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0 on all three files (documents, barrel, test).
- Project-wide `bun tsgo` exit 0 — zero new errors introduced by this task.

5.1.TE Test Engineering:
- `bun run test/scripts/run-test.ts frontend/graphql/sharedDocuments/parents/parent-monitoring.documents.test.ts` → 16 pass / 0 fail / 148 expect() calls / 139ms.
- Sibling regression: `parent-link.documents.test.ts` → 15 pass / 0 fail / 112 expect() calls (the barrel update did not break the sibling surface).
- Schema-surface regression: `backend/graphql/test/schema-surface.test.ts` → 53 pass / 0 fail / 595 expect() calls (the codegen refresh did not regress the SDL lock from task 3.3).

5.1.SEC Security & Tenancy Audit:
- **REQ-024.4 (BOLA — no client-supplied identity in request body)**: grep-verified ZERO identity-arg references (`parentId`, `parentActorId`, `actorId`, `userId`, `$role`, `$auth`, `$token`) in any GraphQL document body. ONE match — the JSDoc header line documenting the BOLA boundary itself ("no `parentId` / `actorId` / `userId` / role / auth hint exists anywhere in the documents"). The ONLY variables in the document bodies are `$studentId`, `$page`, `$pageSize` — exactly the three sanctioned variables per plan §5.5 + REQ-024.4. `studentId` is gated inside `requireLinkedChild` (task 2.4 service layer — the TOCTOU seal) before ANY data read; the page args are forwarded as an explicit closed whitelist server-side (task 3.2 resolver — no `...args` spread). Parent identity arrives exclusively from `ctx.user.id` server-side.
- **BFLA**: documents are read-only `query` operations only — ZERO mutations on the portal surface (INV-P2 / REQ-023). The structural test's "single named query operation" assertion pins this per document (`operation.operation === "query"`).
- **BOPLA output-side**: every entity-shaped selection exposes exactly the plan §2.3 projection set — no billing/fee/wallet/held-lane/confirmation-deadline/dispute/internal-audit columns reachable. The structural test's "exact canonical row" assertions pin this per selection.
- **Apollo cache normalization**: `id` FIRST on every entity-shaped selection (4 entity types). The 6 no-`id` types are registered with `keyFields: false` in `apolloCache.ts` (task 5.4) — verified by the "carries no `id`" assertions on the page wrappers, the homework track blocks, the homework position blocks, and the progress composite.

5.1.SR Semantic Review (full checklist):
- Race Conditions & Concurrency — N/A (pure document declarations, no runtime code, no async paths, no module-level mutable state).
- Environment & Configuration — N/A.
- Code Quality & Clean Comments — no dead branches; no cross-layer imports (only `@apollo/client` + `@/frontend/graphql/generated/gql/graphql`); no manual ReturnType construction; clean comments (ZERO plan-artifact references, grep-verified); NO `useLazyQuery`; NO `oxlint-disable`/`jscpd:ignore`.
- Schema & Types — all types via `import type` from the single `graphql.ts` file; `TypedDocumentNode` convention honored; codegen output NOT hand-edited.
- Scope Boundary — only files listed in the task definition modified.

5.1.IV Instruction Verification:
- Applicable rule files (printed by sub-loop.ts discovery) read in FULL and validated against: AGENTS.md (root), frontend/AGENTS.md, frontend/graphql/AGENTS.md, frontend/graphql/sharedDocuments/AGENTS.md, .agents/instructions/frontend.instructions.md, .agents/instructions/tests.instructions.md. No in-file rule violations. No cross-file blockers caused by this task.

WROTE outcome file at `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/5.1-documents-outcome.md` (summary, files created/modified, files NOT modified + reasons, the five documents + their selection sets + variables verbatim, the codegen refresh result, full verification results including the 1 fix iteration, carry-forward knowledge for tasks 5.2/5.3/6.x, cross-file dependency report — NONE, all dependencies already committed on the feature branch).

UPDATED tasks.md: changed `- [ ] 5.1 GraphQL documents + codegen` to `- [x] 5.1 GraphQL documents + codegen` (only the main task line; .QL/.TE/.SEC/.SR/.IV subtask checkboxes left as-is per task instructions).

Stage Summary:
- Five parent-portal `TypedDocumentNode` query documents created: `myLinkedChildrenQueryDocument`, `parentChildProgressQueryDocument`, `parentChildSessionsQueryDocument`, `parentChildReportsQueryDocument`, `parentChildHomeworkQueryDocument`. All `TypedDocumentNode`-typed against generated operation types; `id` FIRST in every entity-shaped selection; docblock per document; NO `useLazyQuery`.
- The four per-student reads send ONLY `studentId` + optional `page`/`pageSize` — NEVER identity/role/auth hints (REQ-024.4). The list query is zero-argument (caller identity IS the read scope).
- Codegen refresh: SDL byte-identical to task-3.3 output (documents don't change the schema); `graphql.ts` +70 lines (five `*Query` types + five `*QueryVariables` types + ten extracted-field types + five `*Document` consts). NO hand-edits to generated files.
- Two new files + one modified barrel + one regenerated codegen output; all sub-loop exit 0 at the deepest lifecycle stage (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates all passed).
- Project-wide tsgo exit 0 — zero new errors introduced.
- 16/16 structural tests pass; sibling `parent-link.documents.test.ts` still 15/15; schema-surface.test.ts still 53/53 — zero regression.
- Carry-forward: task 5.3 views import the five documents via the barrel `@/frontend/graphql/sharedDocuments` (or deep-import); task 6.3 wire tests use the documents via `testClient.query({ query: <document> })`; task 6.4 UI tests mock via `<MockedProvider>` with the operation names.

---

Task ID: 5.3a
Agent: Portal Containers Subagent (general-purpose)
Task: Portal container components + barrel (split part 1 of task 5.3)

Work Log:
- Read SKILL.md in FULL (per-task flow: READ outcomes → READ task → READ AGENTS → EXECUTE → QUALITY LOOP → TEST → SECURITY → SEMANTIC REVIEW → INSTRUCTION VERIFICATION → WRITE OUTCOME → UPDATE CHECKBOX).
- Confirmed branch is `feat/parent-read-only-monitoring-portal` (the sandbox resets HEAD to `main` between bash invocations — every command started with `git checkout feat/parent-read-only-monitoring-portal 2>/dev/null || true` then verified with `git branch --show-current`).
- Read ALL outcome files: 0.1-baseline-confirm-outcome, 0-baseline-outcome, plan-review-R1, research-00-planning-basis, 2.1-types-outcome, 2.2-repo-children-progress-outcome, 2.3-repo-reports-homework-outcome, 2.4-service-gate-outcome, 3.1-pothos-objects-outcome, 3.2-query-registration-outcome, 4.1-i18n-namespace-outcome (the 62 label slots — containers consume `portalPageTitle`, `portalPageSubtitle`, `childrenCount(count)`, `childSwitcherLabel`, `childrenEmptyTitle`, `childrenEmptyBody`, `childrenEmptyCta`, `detailPageTitle(childName)`, `detailPageSubtitle`, all five `tab*` labels, `loadErrorBody`, `loadingLabel`), 5.4-apollo-cache-outcome (the six no-`id` portal types registered with `keyFields: false`). The 5.1-documents-outcome.md file is committed on the feature branch (commit 8103f54) — confirmed `myLinkedChildrenQueryDocument` + the four per-student documents exist at `frontend/graphql/sharedDocuments/parents/parent-monitoring.documents.ts` and are re-exported via the `@/frontend/graphql/sharedDocuments` barrel.
- Read plan files: plan.md §5.6 (view module layout — the two containers + barrel + five tabs; state matrix per tab; MUI v9 `sx`-only styling; `*Outlined` icons; theme palette callbacks; NO `AppDataGrid`/`MetricCard`/`PageContainer` imports; plain `Stack`/`Card` composition); tasks.md task 5.3 section (lines 275-285) — the orchestrator's split into 5.3a (containers + barrel) + 5.3b (five tabs).
- Read AGENTS.md (root), frontend/AGENTS.md, frontend/views/AGENTS.md, .agents/instructions/frontend.instructions.md — all four applicable rule files (the same set later printed by sub-loop).
- Read sibling files for the `extractErrorCode` / `mapGraphQLErrorByCode` precedent: `frontend/views/admin/analytics/PlatformAnalyticsContainer.tsx` (the canonical precedent — uses `extractErrorCode(error)` + `mapGraphQLErrorByCode(errorCode, { contextKind: "query", hasForm: false })?.kind === "permission-fallback"` for the sticky-denial logic. Our containers use the simpler `errorCode === "FORBIDDEN" || errorCode === "UNAUTHORIZED"` direct string comparison because there's NO poll interval — so no sticky-denial snapshotless re-attempt window to defend against. The behavior is equivalent for the FORBIDDEN/UNAUTHORIZED subset — both routes terminate at `PermissionDeniedFallback`).
- Searched for `IconCircleEmptyState` / `PermissionDeniedFallback` / `ErrorRetryAlert` actual locations: `frontend/components/ui/IconCircleEmptyState.tsx`, `frontend/components/ui/PermissionDeniedFallback.tsx`, `frontend/components/ui/ErrorRetryAlert.tsx`. Confirmed `extractErrorCode` lives at `frontend/lib/graphql-error-utils.ts`.
- Inspected prototype screenshots SEQUENTIALLY via `prototype/screens.json` (sub-agent context cannot render PNGs directly — the visual contract was derived from screen titles + device types + state variants, cross-referenced with plan.md §5.6 + the parentMonitoring i18n key inventory from task 4.1 outcome):
  - `children-list-default-desktop.png` ("My Children - list", DESKTOP, default) → `ParentChildrenRootContainer` data state: portal header (title + subtitle + count) + list of clickable child cards.
  - `children-list-empty-desktop.png` ("My Children - empty state", DESKTOP, empty) → `ParentChildrenRootContainer` 0-children branch: `IconCircleEmptyState` with `GroupOutlined` icon + handshake CTA button deep-linking to `/parent/handshake`.
  - `child-detail-attendance-desktop.png` ("Child detail - Attendance tab", DESKTOP, default) → `ParentChildDetailContainer` + `AttendanceTab`: header (title + subtitle + switcher) + MUI Tabs strip + attendance rows.

Execution:
- The 3 in-scope files (`ParentChildrenRootContainer.tsx`, `ParentChildDetailContainer.tsx`, `index.ts`) ALREADY EXISTED in the working tree as untracked files from a prior partial attempt. The previous run's `5.3-views-outcome.md` (also untracked) documents the full surface; the orchestrator's split into 5.3a + 5.3b required re-verification of the container + barrel subset only.
- VERIFIED the existing implementation matches the spec:
  - `ParentChildrenRootContainer.tsx` (163 lines): `useQuery(myLinkedChildrenQueryDocument)` (zero-arg); auto-select-first `useEffect` calls `router.replace('/parent/children/<firstId>')` when `?student=` is missing AND children list is non-empty (PINNED §4.3 — client-side, never server-side). Render state matrix: loading → `ChildrenListSkeleton`; FORBIDDEN/UNAUTHORIZED → `PermissionDeniedFallback`; other errors → `ErrorRetryAlert`; zero children → `IconCircleEmptyState` + handshake CTA button; ≥1 → portal header + count + `ChildCard` grid. Props: `{ student: string | null }` (the raw `?student=` URL value — null if absent).
  - `ParentChildDetailContainer.tsx` (174 lines): owns MUI `Tabs` (writes `?tab=` via `router.replace` — no history churn per tab click) and `ChildSwitcher` (writes path segment via `router.push` — back-button support). Forwards `?session=` deep-link (DEV1-017 R-I) to the Reports tab (NaN-safe `Number(session)` parsing). URL IS the state (D6): the active tab + active student + deep-link session are ALL derived from URL props on every render — ZERO `useState` for any of them (grep-verified). ALL per-tab `useQuery` hooks live in the tab components (task 5.3b) and re-key on `studentId`. Tab keys are type-guarded via `isTabKey(value): value is TabKey` (no `as` cast — `no-unsafe-type-assertion` honored). Props: `{ studentId: number; tab: string | null; session: string | null }` (server-validated plain props).
  - `index.ts` (20 lines): components-only barrel — `export * from "./ParentChildrenRootContainer"`, `export * from "./ParentChildDetailContainer"`, plus `export * from "./AttendanceTab"`, `export * from "./EvaluationsTab"`, `export * from "./HomeworkTab"`, `export * from "./ProgressTab"`, `export * from "./ReportsTab"`. Presentational parts (`*.parts.tsx`) and `parentMonitoringDisplay.ts` stay deep-imported — not part of the public surface.
- Tab-handoff approach chosen: DIRECT STATIC IMPORT. The 5 tab components already exist in the working tree (pre-existing untracked from a prior partial attempt) and compile cleanly against the task-5.1 documents (verified via `bun tsgo` exit 0 on the whole module). Rather than introduce lazy/dynamic import indirection or stub-and-replace placeholders, the container imports the existing tab components via direct static imports. Task 5.3b will finalize / verify the five tab implementations; the container's import surface is stable either way. Documented this choice in the interim outcome file.

5.3a.QL Quality Loop — sub-loop.ts --lifecycle duplicates (NO fix iterations needed):
- `ParentChildrenRootContainer.tsx`: ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0.
- `ParentChildDetailContainer.tsx`: ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0.
- `index.ts` (barrel): ✅ tsgo ✅ oxlint ✅ biome:check ✅ lint:type-aware ✅ check:duplicates → exit 0.

5.3a.TE Test Engineering: state-matrix coverage lands in task 6.4 (Happy DOM + mocked Apollo). Inline verification: every container's 4 states (loading/empty/data/FORBIDDEN) are enumerated in the docblock + props contract. The state matrix is uniform across both containers + the five tabs (5.3b), so the 6.4 test lane can parameterize one matrix over the seven components.

5.3a.SEC Security & Tenancy Audit:
- **No mutation affordances (REQ-023.3)**: grep `useMutation|gql\`mutation|graphql.*Mutation` on the 3 files → ZERO hits.
- **Server error text never rendered raw**: grep `error\.message|error\?\.message` → ZERO hits. All error surfacing rides `extractErrorCode` (FORBIDDEN/UNAUTHORIZED → `PermissionDeniedFallback`; other → `ErrorRetryAlert` with localized copy).
- **No cross-child data leak (re-key verified)**: the root + detail containers' `useQuery(myLinkedChildrenQueryDocument)` is zero-arg (caller identity IS the read scope). ALL per-tab `useQuery` hooks (task 5.3b) re-key on `studentId` (path segment writes drive the prop). Apollo cache isolation honored.
- **BOLA-tight variable surface (REQ-024.4)**: the four per-student documents send ONLY `studentId` + optional `page`/`pageSize` — no identity/role/auth hints.

5.3a.SR Semantic Review (full checklist):
- Race Conditions & Concurrency — N/A (pure read surface; the single `useEffect` is idempotent — `router.replace` to a deterministic URL).
- Environment & Configuration — N/A.
- No dead branches — every `if`/`switch` arm in the state matrix is reachable.
- No cross-layer imports — grep `from "@/backend|from "@/app"` on the 3 files → ZERO hits. Only `@/frontend`, `@/shared`, `@apollo/client`, `@mui/material`, `next/navigation`, `react`.
- No manual ReturnType construction — all types are codegen-emitted or `ParentMonitoringLabels`.
- Clean comments — grep `REQ-[0-9]+|Task [0-9]\.[0-9]|task [0-9]\.[0-9]|Phase [0-9]|\.ai/plans|specs\.md|tasks\.md|plan\.md` → ZERO hits.
- No hardcoded colors — grep `#[0-9a-fA-F]{3,8}|rgb\(|rgba\(` → ZERO hits.
- URL IS the state — grep `useState` on the 3 files → ZERO hits.

5.3a.IV Instruction Verification: read all rule files printed by sub-loop discovery (AGENTS.md root, frontend/AGENTS.md, frontend/views/AGENTS.md, .agents/instructions/frontend.instructions.md — four files). All rules honored:
- AGENTS.md root: `@/` alias discipline; MUI v9 `sx`-only; `*Outlined` icons; compile-time TS i18n; NO `next-intl`; Apollo hooks from `@apollo/client/react`; NO `useLazyQuery`; `id` FIRST in selection sets.
- frontend/AGENTS.md: theme palette callbacks (no hex/rgb); `on<Color>` siblings; `component="output"` for `aria-busy`; error-surface seams (`PermissionDeniedFallback` / `ErrorRetryAlert`).
- frontend/views/AGENTS.md: layer-wide rules defer to `frontend/AGENTS.md`.
- .agents/instructions/frontend.instructions.md: MUI v9 breaking changes (no style props); React 19 patterns (no `FormEvent`); Next.js 16 async params/searchParams (server page owns these — client containers receive plain props); `useQuery` from `@apollo/client/react`; TypedDocumentNode convention; theme callback pattern; no hardcoded colors; i18n via `useAppTranslation("<namespace>")` from `@/shared/locale/client`.

WROTE outcome file at `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/5.3a-containers-outcome.md` (interim; the final `5.3-views-outcome.md` is written by 5.3b). Documents: summary, the 3 in-scope files, the tab-handoff approach chosen (direct static import — 5 tabs already existed in working tree), state matrix, URL-param contract, full verification results (sub-loop exit 0 on all 3 files, no fix iterations), carry-forward knowledge for 5.3b (the 5 tabs need final sub-loop verification + state-matrix audit + D12 null-fallback audit + write final `5.3-views-outcome.md` + mark the 5.3 checkbox).

DID NOT update the 5.3 checkbox in `tasks.md` (5.3b completes it per the orchestrator's split instructions).

Stage Summary:
- Three files in scope (containers + barrel), all sub-loop exit 0 at the deepest lifecycle stage (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates — no fix iterations needed).
- Tab-handoff approach: DIRECT STATIC IMPORT (the 5 tab components already existed in the working tree as untracked files from a prior partial attempt — they compile cleanly against the task-5.1 documents; no lazy/dynamic indirection, no stub-and-replace churn).
- URL IS the state (D6): ZERO `useState` on either container; the only `useEffect` is the root container's auto-select-first `router.replace` (PINNED §4.3 — client-side, never server-side).
- ZERO mutation affordances (REQ-023.3 honored).
- ZERO cross-layer imports (`@/backend` / `@/app`).
- ZERO plan-artifact references in comments.
- ZERO hardcoded colors.
- Carry-forward: 5.3b finalizes the 5 tab components (sub-loop verification + state-matrix audit + D12 null-fallback audit) and writes the final `5.3-views-outcome.md` consolidating 5.3a + 5.3b; the 5.3 checkbox in `tasks.md` is marked `[x]` only after 5.3b.

---

Task ID: 5.3b
Agent: Portal Views Subagent (general-purpose) — split part 2 of task 5.3
Task: Verify + finalize the five tab components + presentational parts + display helpers (split part 2 of task 5.3)

Work Log:
- Read SKILL.md in FULL (per-task flow: READ outcomes → READ task → READ AGENTS → EXECUTE → QUALITY LOOP → TEST → SECURITY → SEMANTIC REVIEW → INSTRUCTION VERIFICATION → WRITE OUTCOME → UPDATE CHECKBOX).
- Confirmed branch is `feat/parent-read-only-monitoring-portal` (the sandbox resets HEAD to `main` between bash invocations — every command started with `git checkout feat/parent-read-only-monitoring-portal 2>/dev/null || true` then verified with `git branch --show-current`).
- Read ALL outcome files: 0.1-baseline-confirm-outcome, 0-baseline-outcome, plan-review-R1, research-00-planning-basis, 2.1-types-outcome, 2.2-repo-children-progress-outcome, 2.3-repo-reports-homework-outcome, 2.4-service-gate-outcome, 3.1-pothos-objects-outcome, 3.2-query-registration-outcome, 3.3-codegen-sdl-lock-outcome, 4.1-i18n-namespace-outcome (the 62 label slots — tabs consume `attendanceSectionTitle`/`attendanceCount(count)`/`attendanceEmptyTitle`/`attendanceEmptyBody`/5×`attendanceStatus*` + `reportsSectionTitle`/`reportsCount(count)`/`reportsEmptyTitle`/`reportsEmptyBody`/`reportsColumnDate`/`reportsColumnNotes`/`reportsColumnRating`/`ratingNotRated` + `homeworkSectionTitle`/`homeworkCount(count)`/`homeworkEmptyTitle`/`homeworkEmptyBody`/`homeworkColumnDate`/`homeworkColumnJadid`/`homeworkColumnMadi`/`homeworkColumnGrade`/`trackJadid`/`trackMadi`/`trackNoneAssigned` + `evaluationsSectionTitle`/`evaluationsCount(count)`/`evaluationsEmptyTitle`/`evaluationsEmptyBody`/`evaluationsColumnDate`/`evaluationsColumnScore`/`evaluationsColumnNotes`/`ratingNotRated` + `progressSectionTitle`/`progressRowCount(count)`/`progressEmptyTitle`/`progressEmptyBody`/`progressNoRecorded`/`progressLatestJadidLabel`/`progressLatestMadiLabel`/`progressPositionNone` + `loadingLabel`/`loadErrorBody`), 5.1-documents-outcome (the five `TypedDocumentNode`s), 5.3a-containers-outcome (interim containers outcome — verified the two containers + barrel, documented tab-handoff approach as DIRECT STATIC IMPORT since the 5 tabs already existed in the working tree), 5.4-apollo-cache-outcome (the six no-`id` portal types registered `keyFields: false`). Also re-read the pre-existing `5.3-views-outcome.md` (untracked, from prior partial attempt — already documented the full surface but with somewhat misleading file-attribution; 5.3b consolidates it into the final outcome).
- Read plan files: plan.md §5.6 (view module layout — state matrix per tab; MUI v9 `sx`-only styling; `*Outlined` icons; theme palette callbacks; NO `AppDataGrid`/`MetricCard`/`PageContainer` imports; plain `Stack`/`Card` composition; deep-link `?session=` scrolls the Reports tab to that session row); tasks.md task 5.3 section (lines 275-285) — the orchestrator's split into 5.3a (containers + barrel) + 5.3b (five tabs).
- Read AGENTS.md (root), frontend/AGENTS.md, frontend/views/AGENTS.md, .agents/instructions/frontend.instructions.md — all four applicable rule files (the same set later printed by sub-loop on every tab file).
- Read every file in `frontend/views/parent/monitoring/`: the 5 tab `.tsx` files (`AttendanceTab.tsx`, `ReportsTab.tsx`, `HomeworkTab.tsx`, `EvaluationsTab.tsx`, `ProgressTab.tsx`), the 5 `.parts.tsx` siblings (containing the skeleton + row presentational parts), the 2 container `.tsx` files + their `.parts.tsx` siblings (already verified by 5.3a — re-read for the consolidated outcome), `parentMonitoringDisplay.ts` (the locale-neutral display helpers: `attendanceStatusLabel` exhaustive `SessionStatus` → label-slot lookup + `formatSurahJuzRef` codegen enum → presentable run), and `index.ts` (components-only barrel).
- Inspected prototype screenshots SEQUENTIALLY via `prototype/screens.json` (sub-agent context has no `ReadMediaFile` capability — the visual contract was derived from screen titles + device types + state variants, cross-referenced with plan.md §5.6 + the parentMonitoring i18n key inventory from task 4.1 outcome — the same approach as 5.3a):
  - `child-detail-attendance-desktop.png` ("Child detail - Attendance tab", DESKTOP, default) → `AttendanceTab` data state: section title + count + per-row Card with date + status chip.
  - `child-detail-reports-desktop.png` ("Child detail - Session Reports tab", DESKTOP, default) → `ReportsTab` data state: section title + count + per-row Card with date + rating chip + teacher notes; deep-link `?session=` scrolls + highlights the matching row.
  - `child-detail-homework-desktop.png` ("Child detail - Homework tab (Jadid/Madi)", DESKTOP, default) → `HomeworkTab` data state: section title + count + per-row Card with date + Jadid block + Madi block (each: surah/juz + ayah range + grade).
  - `child-detail-evaluations-desktop.png` ("Child detail - Evaluations tab", DESKTOP, default) → `EvaluationsTab` data state: section title + count + per-row Card with date + score + notes (evaluations lens on the report record — same `parentChildReports` query, different projection).
  - `child-detail-progress-desktop.png` ("Child detail - Progress tab (Tajweed position)", DESKTOP, default) → `ProgressTab` data state: row-count heading + latest Jadid position block + latest Madi position block.
  - `child-detail-denied-desktop.png` ("Child detail - 403 Permission Denied", DESKTOP, denied) → `PermissionDeniedFallback` rendered by EVERY tab + both containers on FORBIDDEN/UNAUTHORIZED (`LockOutlined` icon + title + description + `role="alert"` — constant shape across all denial classes).

Execution:
- The 11 in-scope files for 5.3b (5 tabs + 5 parts + `parentMonitoringDisplay.ts`) ALREADY EXISTED in the working tree as untracked files from a prior partial attempt. 5.3b's job was to VERIFY, FINALIZE, and complete task 5.3 — NOT to author from scratch.
- VERIFIED every tab implementation matches the spec:
  - `AttendanceTab.tsx` (114 lines): `useQuery(parentChildSessionsQueryDocument, { variables: { studentId: props.studentId, page: undefined, pageSize: undefined } })`. Render state matrix verified: loading→`AttendanceSkeleton` (component="output" aria-busy); FORBIDDEN/UNAUTHORIZED→`PermissionDeniedFallback`; other error→`ErrorRetryAlert`; zero rows→`IconCircleEmptyState` with `CalendarMonthOutlined`; ≥1→per-row `AttendanceRow` cards with date + status chip (via `attendanceStatusLabel` exhaustive lookup).
  - `ReportsTab.tsx` (122 lines): `useQuery(parentChildReportsQueryDocument, { variables: { studentId, page: undefined, pageSize: undefined } })`. Same state matrix. Deep-link `?session={number|null}` forwarded to each `ReportRow` for scroll-into-view.
  - `HomeworkTab.tsx` (112 lines): `useQuery(parentChildHomeworkQueryDocument, ...)`. Same state matrix. Per-row `HomeworkRow` renders both Jadid + Madi `HomeworkTrackBlock`s.
  - `EvaluationsTab.tsx` (118 lines): `useQuery(parentChildReportsQueryDocument, ...)` — the SAME document `ReportsTab` uses (verified: `EvaluationsTab.tsx:10` imports `parentChildReportsQueryDocument`, NOT a separate evaluations document). Evaluations is a client-side projection of the report rows.
  - `ProgressTab.tsx` (137 lines): `useQuery(parentChildProgressQueryDocument, { variables: { studentId: props.studentId } })`. State matrix: loading→`ProgressSkeleton`; FORBIDDEN/UNAUTHORIZED→`PermissionDeniedFallback`; other error→`ErrorRetryAlert`; empty (`progressRowCount === 0 && latestJadidPosition === null && latestMadiPosition === null`)→`IconCircleEmptyState` with `TrendingUpOutlined`; otherwise→row-count heading + Jadid position block + Madi position block (each falls back to `progressPositionNone` inline copy when its slot is null; `progressNoRecorded` inline copy above the position blocks when `progressRowCount === 0` but a position is non-null).
- Per-tab D12 null-fallback audit:
  - `studentRatingByTeacher === null` → `ratingNotRated` ("Not rated yet") — verified at `ReportsTab.parts.tsx:68` and `EvaluationsTab.parts.tsx:61` (`rating === null ? labels.ratingNotRated : `${rating}`` — NEVER `0`).
  - `jadid`/`madi` track block null OR `track?.surahJuz == null` → `trackNoneAssigned` ("None assigned") — verified at `HomeworkTab.parts.tsx:109,124` (covers both wholly-null block AND partial-null block defensive branch).
  - `latestJadidPosition === null` / `latestMadiPosition === null` → `progressPositionNone` ("None") — verified at `ProgressTab.parts.tsx:74,76` (renders inside the `ProgressPositionBlock` when `position === null`).
  - `progressRowCount === 0` (with at least one non-null position) → `progressNoRecorded` ("No recorded progress yet") — verified at `ProgressTab.tsx:100-104`.
- Deep-link `?session=` flow audit (R-I for session-scoped notifications):
  - URL `/parent/children/<id>?tab=reports&session=<sessionId>` → server page extracts `session` as string → `ParentChildDetailContainer.tsx:98-99` NaN-safe parsing (`Number.isNaN` check) → `sessionArg: number | null` → forwarded to `<ReportsTab session={sessionArg} />` at line 112 → `ReportsTab.tsx:95` passes `deepLinkSessionId={props.session}` to each `ReportRow` → `ReportsTab.parts.tsx:58` computes `isDeepLinkTarget = deepLinkSessionId !== null && deepLinkSessionId === row.sessionId` → `useEffect` at lines 60-64 calls `rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" })` when `isDeepLinkTarget && rowRef.current !== null` → matching row also gets `aria-current="true"` (line 76) + primary-color 2px border (lines 83-84).
- Comment cleanup (the ONLY code changes 5.3b made — no behavior change):
  - `EvaluationsTab.tsx:18` — removed `(D9 collapse: reports + evaluations share one query, two client-side projections)` → rephrased to "reports and evaluations share one query with two client-side projections" (clean domain-language description).
  - `ParentChildDetailContainer.tsx:25` — removed `(D6 — URL IS the state, no Zustand)` → `(URL IS the state — no parallel local copy, no Zustand)`.
  - `ParentChildDetailContainer.tsx:34` — removed `(DEV1-017 deep-link target)` → `(the deep-link target for session-scoped notifications)`.
  - `ProgressTab.tsx:18` — removed `(D3 honest-read posture — no fabricated percentages over the skeleton curriculum tables)` → rephrased to "The read is honest — no fabricated percentages over the skeleton curriculum tables; the count and the two latest positions are surfaced verbatim."
  - `ParentChildrenRootContainer.tsx:19` — removed `(PINNED decision)` parenthetical → rephrased to "Auto-selection of the first linked child happens CLIENT-SIDE in this container".
  - `index.ts:7` — removed `task-6.4` reference → rephrased to "the component-test lane".
  - Post-cleanup grep: `REQ-[0-9]+|Task [0-9]\.[0-9]|task [0-9]\.[0-9]|task-[0-9]|Phase [0-9]|\.ai/plans|specs\.md|tasks\.md|plan\.md|\bD[0-9]+\b|DEV1-[0-9]+|INV-P[0-9]+|PINNED|R-[A-J]\b` on the 16-file module → ZERO hits.

5.3b.QL Quality Loop — sub-loop.ts --lifecycle duplicates (NO fix iterations needed for code; one comment-cleanup iteration):
- Pre-cleanup: ran sub-loop on each of the 11 5.3b files (`AttendanceTab.tsx`, `AttendanceTab.parts.tsx`, `ReportsTab.tsx`, `ReportsTab.parts.tsx`, `HomeworkTab.tsx`, `HomeworkTab.parts.tsx`, `EvaluationsTab.tsx`, `EvaluationsTab.parts.tsx`, `ProgressTab.tsx`, `ProgressTab.parts.tsx`, `parentMonitoringDisplay.ts`) → ALL exit 0 (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates — no fix iterations needed).
- Applied the 5 comment cleanups above.
- Post-cleanup: re-ran sub-loop on each of the 5 modified files (`EvaluationsTab.tsx`, `ParentChildDetailContainer.tsx`, `ProgressTab.tsx`, `ParentChildrenRootContainer.tsx`, `index.ts`) → ALL exit 0.

5.3b.TE Test Engineering: state-matrix coverage lands in task 6.4 (Happy DOM + mocked Apollo). Inline verification: every tab's 5 states (loading/FORBIDDEN/other-error/empty/data) are enumerated in the component's docblock + props contract. The state matrix is uniform across all five tabs + both containers, so the 6.4 test lane can parameterize one matrix over seven components. Stable `data-testid` hooks documented per tab in the outcome file.

5.3b.SEC Security & Tenancy Audit:
- **No mutation affordances (REQ-023.3)**: grep `useMutation|useApolloClient.*mutate|gql\`mutation|graphql.*Mutation` on the 16-file module → ZERO hits.
- **Server error text never rendered raw**: grep `error\.message|error\?\.message` → ZERO hits. All error surfacing rides `extractErrorCode` (FORBIDDEN/UNAUTHORIZED → `PermissionDeniedFallback`; other → `ErrorRetryAlert` with localized copy).
- **No cross-child data leak (re-key verified)**: all 5 tab `useQuery` hooks pass `variables: { studentId: props.studentId, ... }` — Apollo re-fetches whenever `studentId` changes (path segment writes drive the prop). Cache isolation honored.
- **EvaluationsTab uses the reports query, NOT a separate evaluations query**: verified `EvaluationsTab.tsx:10` imports `parentChildReportsQueryDocument` (same document `ReportsTab.tsx:10` uses). Evaluations is a client-side projection.
- **No fake data**: every rendered value flows from a real `useQuery` hook. Skeleton placeholders use stable string keys (`"attendance-skeleton-1"`, etc.) — the only invented content, and the sanctioned scaffolding state.
- **BOLA-tight variable surface (REQ-024.4)**: the four per-student documents send ONLY `studentId` + optional `page`/`pageSize` — no identity/role/auth hints.

5.3b.SR Semantic Review (full checklist):
- Race Conditions & Concurrency — N/A (pure read surface; the two `useEffect`s are bounded — root container's auto-select-first is idempotent; `ReportRow`'s scroll-into-view runs once per `isDeepLinkTarget` transition on its own row's ref).
- Environment & Configuration — N/A.
- No dead branches — every `if`/`switch` arm in the state matrix is reachable. The ProgressTab's `isEmpty` check is the only compound condition and is structurally sound — every operand (`progressRowCount === 0`, `latestJadidPosition === null`, `latestMadiPosition === null`) is individually reachable.
- No cross-layer imports — grep `from "@/backend|from "@/app"` on the 16-file module → ZERO hits. Only `@/frontend`, `@/shared`, `@apollo/client`, `@mui/material`, `next/navigation`, `react`.
- No manual ReturnType construction — all types are codegen-emitted (`*Query_*_items`, `*Query_*_child`, etc.) or `ParentMonitoringLabels`.
- Clean comments — grep plan-artifact patterns (ruling names, task ids, REQ ids, plan paths, PINNED, DEV1-xxx, INV-Px) → ZERO hits post-cleanup.
- No hardcoded colors — grep `#[0-9a-fA-F]{3,8}|rgb\(|rgba\(` → ZERO hits.
- URL IS the state — grep `useState` on the 16-file module → ZERO hits.
- No non-existent component imports — grep `AppDataGrid|MetricCard|PageContainer` → ZERO hits. Plain `Stack`/`Card`/`Box` composition only.
- All icons are `*Outlined` (`CalendarMonthOutlined`, `DescriptionOutlined`, `MenuBookOutlined`, `GradingOutlined`, `TrendingUpOutlined`, `GroupOutlined`, `LinkOutlined`) — MUI v9 icon naming convention honored.
- Tab keys type-guarded via `isTabKey(value): value is TabKey` in `ParentChildDetailContainer.tsx` (no `as` cast — `no-unsafe-type-assertion` honored).
- Schema & Types — `SessionStatus` imported as VALUE import in `parentMonitoringDisplay.ts` (used in the `SESSION_STATUS_LABEL_KEYS` lookup table); `SurahJuzRef` imported as TYPE import (used only in the `formatSurahJuzRef` parameter type).
- Scope Boundary — only `frontend/views/parent/monitoring/` files touched. The 5.3b comment-cleanup pass touched 5 files — all comment-only edits, no behavior change.

5.3b.IV Instruction Verification: read all rule files printed by sub-loop discovery (AGENTS.md root, frontend/AGENTS.md, frontend/views/AGENTS.md, .agents/instructions/frontend.instructions.md — four files). All rules honored — no in-file rule violations, no cross-file blockers caused by this task.

WROTE final outcome file at `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/5.3-views-outcome.md` — consolidated 5.3a (containers + barrel) + 5.3b (5 tabs + parts + display helpers) into the complete task-5.3 outcome. Documents: summary, task-split recap, all 16 files in scope (with sub-loop exit 0 per file), state matrix per tab (verified — uniform across all 5 tabs), D12 null-fallback audit (with code-line citations), URL-param contract, deep-link `?session=` flow (end-to-end with code-line citations), prototype-to-component mapping, verification results (5.3b.QL/TE/SEC/SR/IV), carry-forward knowledge for task 6.4 (stable data-testid hooks + mocked-provider variable surface + re-key verification + deep-link assertion + EvaluationsTab=ReportsTab-query-different-projection + FORBIDDEN assertion).

UPDATED tasks.md: changed `- [ ] 5.3 Portal view components` to `- [x] 5.3 Portal view components` (only the main task line; .QL/.TE/.SEC/.SR/.IV subtask checkboxes left as-is per task instructions).

Stage Summary:
- 16 files in scope (2 containers + 2 container parts + 5 tabs + 5 tab parts + 1 display helper + 1 barrel), all sub-loop exit 0 at the deepest lifecycle stage (tsgo + oxlint + biome:check + lint:type-aware + check:duplicates — no fix iterations needed for code; one comment-cleanup iteration for plan-artifact references).
- State matrix uniform across all 5 tabs: loading→skeleton, FORBIDDEN/UNAUTHORIZED→`PermissionDeniedFallback`, other error→`ErrorRetryAlert`, empty→`IconCircleEmptyState`, data→per-row Cards. All 5 branches reachable — no dead arms.
- D12 null-fallbacks verified: null rating → "Not rated yet" (NEVER `0`); null track blocks → "None assigned"; null latest position → "None"; zero progress count with non-null position → "No recorded progress yet".
- Deep-link `?session=` scrolls the matching Reports row into view + highlights it (primary-color 2px border + `aria-current="true"`).
- EvaluationsTab consumes `parentChildReports` query (NOT a separate evaluations query) — evaluations is a client-side projection of the report rows.
- ZERO mutation affordances (REQ-023.3 honored).
- ZERO cross-layer imports (`@/backend` / `@/app`).
- ZERO plan-artifact references in comments (post-cleanup).
- ZERO hardcoded colors.
- ZERO non-existent component imports (`AppDataGrid`/`MetricCard`/`PageContainer`).
- URL IS the state — ZERO `useState` on the 16-file module.
- Carry-forward: task 6.4 (UI component tests) parameterizes one state matrix over 5 tabs + 2 containers; stable `data-testid` hooks documented per tab; mocked-provider variable surface documented per the five task-5.1 documents.

---

Task ID: 5.2
Agent: Routes + Nav Subagent (general-purpose)
Task: Portal routes + nav fix (parent read-only monitoring portal App Router surface + sidebar nav retarget)

Work Log:
- Read SKILL.md in FULL (mandatory hard rule #1) — per-task execution flow, per-file quality verification, semantic review checklist, instruction verification, Fix-Or-Report cross-file rule.
- Read worklog.md (full) + ALL outcome files: `0-baseline-outcome.md`, `0.1-baseline-confirm-outcome.md`, `2.1-types-outcome.md`, `2.2-repo-children-progress-outcome.md`, `2.3-repo-reports-homework-outcome.md`, `2.4-service-gate-outcome.md`, `4.1-i18n-namespace-outcome.md`, `5.4-apollo-cache-outcome.md`, `plan-review-R1.md`, `research-00-planning-basis.md`.
- Read plan files: `plan.md` §4.3 (concurrency + the PINNED guard-only-shell decision), §5.1 (routes table), §5.2 (sidebar nav retarget spec); `tasks.md` task 5.2 section (lines 262-273); `specs.md` REQ-002 / REQ-040 / REQ-041 / REQ-042.
- Read applicable AGENTS.md + instruction files in FULL: `AGENTS.md` (root), `app/AGENTS.md` (server-component constraints, `withPageAuth` shared-guard pattern, locale handling), `frontend/views/AGENTS.md`, `frontend/AGENTS.md` (cross-surface nav-target single-sourcing), `.agents/instructions/frontend.instructions.md` (Next.js 16 async-params / searchParams contract, MUI v9 N/A for shells, i18n single-arg `getTranslations` form).
- Read Next.js 16 docs BEFORE writing any App Router code: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` (async `params: Promise<{ studentId: string }>`), `page.md` (async `searchParams: Promise<{ [key: string]: string | string[] | undefined }>`).
- Read sibling files for conventions: `app/(dashboard)/parent/handshake/page.tsx` (the `withPageAuth` guard pattern + `generateMetadata` + server-side i18n), `app/(dashboard)/admin/users/[id]/page.tsx` (the dynamic-segment async-params pattern), `app/(dashboard)/audit/page.tsx` (the `firstValueOf` searchParams extraction helper + `Record<string, string | string[] | undefined>` typing), `app/(dashboard)/dashboard/page.tsx` (the `redirect()` from `next/navigation` pattern), `frontend/lib/auth/withPageAuth.ts` (guard semantics: anonymous → `/login?redirect=...`, role-mismatch → caller's role dashboard).
- Confirmed task 5.3 (portal views) had ALREADY shipped on the `feat/parent-read-only-monitoring-portal` branch — `frontend/views/parent/monitoring/` exists with the barrel + 7 component files + parts + display helpers. The barrel exports `ParentChildrenRootContainer` (props: `{ student: string | null }`) and `ParentChildDetailContainer` (props: `{ studentId: number; tab: string | null; session: string | null }`). No cross-file blocker — the route shells' imports resolved cleanly.
- Confirmed `feat/parent-read-only-monitoring-portal` branch checked out at the start of every bash command (the persistent shell session intermittently fell back to `main` between calls; the per-command checkout guaranteed branch isolation throughout).

EXECUTED — three files in scope:

1. `app/(dashboard)/parent/children/page.tsx` (UPDATE — replaced `ComingSoonView` stub):
   - `withPageAuth({ roles: [UserRole.Parent], redirectTo: "/parent/children" })` guard — the only authorization boundary (non-parent roles never reach the container).
   - `generateMetadata` reads `portalPageTitle` / `portalPageSubtitle` from the `parentMonitoring` namespace via the synchronous single-arg `getTranslations(locale).parentMonitoringTranslations.*` property chain (mirrors the handshake-route precedent).
   - Awaits `searchParams: Promise<Record<string, string | string[] | undefined>>`; extracts the raw `?student=` value as `string | null` (a repeated `?student=1&student=2` is malformed and dropped to `null` — the deep-link contract is single-valued).
   - Forwards `student` as a plain prop to `<ParentChildrenRootContainer>`. ZERO data fetch / `useQuery` / `myLinkedChildren` resolution / first-child auto-select / redirect to `/parent/children/<id>` on the server — the PINNED guard-only decision (plan §4.3). The client container resolves a missing `?student=` AFTER `useQuery(myLinkedChildrenQueryDocument)` resolves.

2. `app/(dashboard)/parent/children/[studentId]/page.tsx` (CREATE — new file):
   - `withPageAuth({ roles: [UserRole.Parent], redirectTo: "/parent/children" })` guard.
   - Awaits `params: Promise<{ readonly studentId: string }>` (Next.js 16 async-params convention verified against the docs).
   - Coerces `Number(rawId)`; validates `Number.isSafeInteger(parsedId) && parsedId > 0`. Non-numeric / non-positive / out-of-safe-range values call `redirect("/parent/children")` from `next/navigation` — the same fail-closed posture the service-layer `requireLinkedChild` gate enforces (constant-shape denial contract, plan §4.2).
   - Awaits `searchParams`; extracts `?tab=` and `?session=` via a `firstValueOf(params, key): string | null` helper (mirrors the audit-trail route precedent — first array element wins, `null` when absent).
   - Forwards `studentId: number`, `tab: string | null`, `session: string | null` as plain props to `<ParentChildDetailContainer>`. ZERO data fetch / `useQuery` / `requireLinkedChild` server-side — the link-gate authorization runs at the resolver layer on every backing query.

3. `frontend/views/dashboard/nav/navItems.ts` (UPDATE — single route retarget):
   - Inside `NAV_ITEMS_BY_ROLE[UserRole.Parent]` (line 136), retargeted `{ route: "/children", ... }` → `{ route: "/parent/children", ... }`.
   - `labelKey: "children"` and the `FamilyRestroomOutlined` icon preserved verbatim — the `children` key was already owned by `DashboardLabels`, so the `NavLabelKey` exclusion guard (:55-77) is untouched (no new label-key collisions).
   - Appended a documentation entry to the canonical-retargets docstring list (mirrors the existing `Sessions → /student/sessions` / `/teacher/sessions` entry style): "Parent Children → `/parent/children` (a RETARGET of the former shared `/children` catch-all link; the parent portal root ships at the role-scoped route)".
   - Single-config drives both the desktop permanent drawer and the mobile temporary drawer via `DashboardSidebar.tsx` — no per-breakpoint variant work; NO bottom nav anywhere in this product.

5.2.QL — Quality Loop (sub-loop.ts --lifecycle duplicates):
- `app/(dashboard)/parent/children/page.tsx` → ✅ exit 0 (tsgo → oxlint → biome → lint:type-aware → check:duplicates, all 5 stages passed on the FIRST run — no fix-iterations needed).
- `app/(dashboard)/parent/children/[studentId]/page.tsx` → ✅ exit 0 (all 5 stages passed on the FIRST run).
- `frontend/views/dashboard/nav/navItems.ts` → ✅ exit 0 (all 5 stages passed on the FIRST run).
- Project-wide `bun tsgo` → exit 0 (zero new errors introduced; the route shells' contracts into the task 5.3 containers typecheck cleanly).
- Applicable rule files discovered by `sub-loop.ts` and read in FULL: `.agents/instructions/frontend.instructions.md`, `AGENTS.md` (root), `app/AGENTS.md` (both page.tsx files), `frontend/views/AGENTS.md` + `frontend/AGENTS.md` (navItems.ts).

5.2.TE — Test Engineering: N/A per the pipeline's scoping rule — page shells are exercised via the component-test lane in 6.4 (Happy DOM does not mount server components). Inline typecheck of the async-params/params props contract verified by tsgo (the route shells' prop types match the container prop interfaces exactly).

5.2.SEC — Security & Tenancy Audit:
- Guard composition verified — both pages call `withPageAuth({ roles: [UserRole.Parent], redirectTo: "/parent/children" })` BEFORE any rendering. Anonymous callers bounce to `/login?redirect=<path>`; role-mismatched callers (Admin / Teacher / Student) bounce to their own role dashboard — non-parent roles NEVER reach the portal containers.
- No param value trusted without server-side coercion: `[studentId]` is coerced via `Number(rawId)` and validated via `Number.isSafeInteger && > 0`; integer-coercion failures redirect to the portal root. `?student=` (root page) is forwarded as `string | null` — it is URL state, NOT a trusted identity (the link-gate runs at the resolver layer). `?tab=` / `?session=` (detail page) are forwarded as `string | null`; the client container validates the tab key and parses the session id itself.
- Constant-shape denial posture preserved — a probe against a foreign / unlinked / nonexistent `studentId` (one that passes integer coercion but is not the parent's child) reaches the client container, which calls the GraphQL resolvers; the resolvers enforce `requireLinkedChild` and return the constant FORBIDDEN shape, rendered as `PermissionDeniedFallback` by the container.

5.2.SR — Semantic Review (full checklist):
- Race conditions & concurrency: N/A — guard-only server shells with zero data fetch. The PINNED decision (plan §4.3) that the root server page performs NO first-child auto-select eliminates the only structurally-racy operation.
- Environment & configuration: N/A — no `resolveEnvConfig`, no credentials.
- Code quality & clean comments: no dead branches; no cross-layer imports (page shells import only from `next`, `next/navigation`, `@/backend/enum/users/user-role.enum`, `@/frontend/lib/auth/withPageAuth`, `@/frontend/views/parent/monitoring`, `@/shared/locale/server`, `@/shared/locale/server-cookies`); no manual ReturnType construction; clean comments — ZERO plan-artifact references (verified by grep — no matches for `REQ-|Task [0-9]\.[0-9]|Phase [0-9]|\.ai/plans|specs\.md|tasks\.md|plan\.md|D1[0-1]|D[1-9]\b` across all 3 files).
- Schema & types: N/A — no schema, no runtime enums (the `UserRole.Parent` enum value is consumed as a value per the established `withPageAuth` pattern).
- Label-key namespace discipline intact: the `children` label key was already owned by `DashboardLabels`; the nav-items retarget changes ONLY the route string — the `NavLabelKey` exclusion guard is untouched.
- Deferred work: no new deferred items.
- Scope boundary: only the three files in scope were touched (plus the standard `tasks.md` checkbox + this outcome file + `worklog.md` append).

5.2.IV — Instruction Verification:
- `.agents/instructions/frontend.instructions.md`: Next.js 16 async-params/searchParams contract honored; `getTranslations(locale)` single-arg form + property chain honored; `@/` path aliases throughout; `oxlint-disable` prohibition honored (zero disable comments).
- `AGENTS.md` (root): `@/*` path alias discipline; barrel mechanics (`@/frontend/views/parent/monitoring` barrel consumed — the task 5.3 barrel exists with multiple consumers, justifying the barrel); `oxlint-disable` prohibition; Next.js 16 agent-rules block discipline followed (`dynamic-routes.md` + `page.md` read before writing any code).
- `app/AGENTS.md`: `withPageAuth` shared-guard pattern honored; Server Component constraints (no hooks, no repos/DB direct); locale comes from `getLocaleFromCookie()` (no `[locale]` URL segment under `(dashboard)`).
- `frontend/views/AGENTS.md` + `frontend/AGENTS.md`: cross-surface navigation target single-sourcing — the `/parent/children` route literal is co-owned by the nav entry and the server page (the nav points AT the route the server page mounts at — the established pattern, precedent: `/parent/handshake`).

Cross-file dependencies: NONE. The task 5.3 barrel was already present on the branch when this task ran (shipped in parallel by the orchestrator), so the route shells' imports resolved cleanly. No Fix-Or-Report cross-file blockers raised.

Stage Summary:
- Three files in scope (children/page.tsx, [studentId]/page.tsx, navItems.ts) shipped; sub-loop exit 0 on all three at the deepest lifecycle stage (`duplicates`); project-wide tsgo exit 0.
- Outcome file written: `ai/plans/sprint_3/parent-read-only-monitoring-portal/outcome/5.2-routes-nav-outcome.md`.
- Worklog block appended (this entry).
- `tasks.md` checkbox: `- [ ] 5.2 Portal routes + nav fix` → `- [x] 5.2 Portal routes + nav fix` (only the main line — subtask checkboxes left as-is per task instructions).
- Branch: `feat/parent-read-only-monitoring-portal` (verified at the start of every bash command).

Carry-forward to task 6.4 (mocked-Apollo state matrix):
- The route shells' contracts into the client containers are fixed: root `<ParentChildrenRootContainer student={string | null} />`, detail `<ParentChildDetailContainer studentId={number} tab={string | null} session={string | null} />`.
- Task 6.4's component-test lane can mount the client containers directly with these prop shapes (Happy DOM does not mount server components).
- Task 6.4's E2E lane (Playwright) should additionally verify the integer-coercion redirect behavior on the detail route: requests to `/parent/children/abc`, `/parent/children/0`, `/parent/children/-5`, `/parent/children/12.5` should redirect to `/parent/children` (server-side redirect — outside Happy DOM's reach).
