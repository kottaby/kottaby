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
