# Spec Plan Generator — `{{ticket_id}}`

**Invoke the `spec-driven-development` skill** (`.agents/skills/spec-driven-development`) and follow it end-to-end — requirements → design → tasks → Phase 1.5 review gate — using its templates in `.agents/spec-process-guide/templates/`. Do not re-derive its rules here; the skill is the source of truth for structure, subtask pipelines, and quality gates.

## Inputs
- **Ticket**: `{{ticket_id}}` — read its section in `docs/planning/TICKETS.md`; derive sprint from `| **Sprint** |`; kebab-case the title.
- **Extra focus**: {{extra_instructions}}

## Verify-then-claim (compute BEFORE writing)
- Inspect real code before labelling EXISTING/UPDATE/EXTEND; prose-only ⇒ CREATE. Ground truth lives in `backend/db/schema/`, `backend/types/`, `backend/services/`, `backend/graphql/`, `docs/specs/`, `docs/workflows/`.
- **Every cited `path:line` and symbol must be verified with grep/view** — off-by-one line refs (`guards.ts:27-34` vs real `:123`) and invented type names (`LocaleType` doesn't exist — services take `locale: string`) are known failure modes. Check helper signatures, not just names.
- **Plan directory**: `ai/plans/sprint_<n>/{{ticket-id}}-<slug>/` — cite this exact path in every header, self-reference, and ledger.

## Post-generation audit (MANDATORY — never skip)
1. **Truncation check**: read the LAST line of each artifact; if it ends mid-sentence/mid-table, the phase hit `max_tokens` — complete the remaining sections manually, preserving existing content.
2. **Structure check**: `plan.md` MUST contain all sections (Overview+decisions, Data Models, API Contracts+SDL+permission matrix, Services/Repo signatures+concurrency assessment+Journey Design, UX/Nav spec — even if explicit no-UI ruling, Security/Tenancy mitigations). Fill any gap.
3. **Traceability check**: `for r in $(grep -oE 'REQ-[0-9]+' specs.md | sort -u); do grep -q "$r" tasks.md || echo MISSING: $r; done` — zero misses, including ranges in section headers.
4. **Anti-pattern sweep on your own output**: no `Translation.` enum, no two-arg `getTranslations`, no `@/frontend/utils/logger`, no raw `bun test` on workflows, no bottom-nav, no invented paths.
5. **Phase 1.5 gate**: record the review verdict + fixes in `outcome/plan-review-R1.md` before finishing.

## Deliverables (all, in the plan directory)
`specs.md` · `plan.md` · `tasks.md` · `deferred-items.md` · `outcome/`

Depth = production-grade: tables over prose, exact signatures over descriptions, evidence over assertions.
