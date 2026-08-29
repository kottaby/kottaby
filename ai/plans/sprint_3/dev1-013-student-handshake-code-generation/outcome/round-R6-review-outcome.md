# Round R6 Review Outcome — DEV1-013 Student Handshake Code Generation

- **Iteration:** R6 (independent fresh-context; all four lenses + rotating emphasis)
- **Rotating emphasis:** documentation-accuracy + dead-code sweep
- **Scope:** `git diff origin/main HEAD --name-only` (~130 files; 63 code/config files after excluding plan/outcome/screen artifacts)
- **Typecheck:** `bun run tsgo` → **exit 0, zero errors** (verified twice)

## Verdict: ✅ PASS — no functional, security, or type findings; 4 LOW doc-accuracy nits + 3 INFO notes

---

## Findings

All findings are **NEW** (introduced by this diff). No pre-existing issue was found on any touched line.

### LOW

1. `[LOW] shared/constants/handshake-code.constants.ts:17-19 — NEW` — `HANDSHAKE_CODE_PREFIX` JSDoc claims the prefix is "shared by the registration generator", but `backend/services/auth/registration.service.ts:96` (pre-existing, **untouched by this diff**) hardcodes its own `` `KSB-${hex.slice(0, 8)}` `` and does not import the shared constant. The "single source of truth" claim is aspirational, not factual. The *underlying* duplication is pre-existing; the *inaccurate claim* is new.

2. `[LOW] frontend/views/students/dashboard/HandshakeCodeCard.tsx:26 — NEW` — production-source comment cites "the 4.2.BS browser loop" — a plan-task artifact marker. Should be plain domain language ("verified via browser devtools: computed `font-family` on the chip was Inter").

3. `[LOW] frontend/graphql/test/students/handshake-code.documents.test.ts:11 — NEW` — test header cites "Task 4.1 gates — REQ-061 / REQ-063" — plan-artifact markers (`Task ` / `REQ-`) in a code comment.

4. `[LOW] shared/locale/types/handshakeCode/index.ts:56-59 — NEW` — JSDoc for `alreadyLinkedTitle`/`alreadyLinkedDescription` says "already linked **to the caller**", but the backend signal is `parentId !== null` — the student may be linked to **any** parent, not the caller. The en/ar runtime copy ("linked to a parent account") is correct; only the JSDoc misstates semantics.

### INFO

5. `[INFO] frontend/views/dashboard/navItems.ts:53 — NEW` — `export type NavLabelKey` has no external importer (consumed only inside its own module; `navItems.test.ts` mentions it in comments only). Candidate to un-export (dead-export sweep).

6. `[INFO] ai/plans/sprint_3/dev1-013-.../deferred-items.md:21 (item D3) — NEW` — claims "DEV1-013 exposes the [generateHandshakeCode] entry point", but no generation entry point is exported anywhere in this diff (`generateHandshakeCode` remains a private function in the untouched registration.service.ts). Misleading for the DEV3-019 consumer stream.

7. `[INFO] cross-ticket markers in test comments — NEW` — `shared/locale/handshakeCode-namespace.parity.test.ts:34` ("DEV2-004 precedent"), `test/workflows/helpers/journey-fixtures.ts:24,153`, `test/workflows/helpers/journey-fixtures.smoke.test.ts:9,124`, `test/workflows/parents/handshake-discovery.test.ts:228,321` (DEV1-014 / DEV2-002). These document cross-stream ownership of not-yet-built boundaries (not markers of THIS plan); acceptable, listed for completeness under the zero-plan-artifact sweep.

### PRE-EXISTING (verified NOT in this diff's touched lines — not charged to this PR)

- `KSB-` prefix duplicated between `registration.service.ts` and the new shared constants module (generator side untouched; see finding 1).
- No per-parent/per-IP rate limiting on discovery — tracked deferral **D2** (owned by DEV2-002), explicitly documented in `deferred-items.md`; brute-force surface is 16^8 ≈ 4.3B codes behind parent-only auth.

---

## Rotating-emphasis results (R6)

### (a) Comment/JSDoc accuracy + plan-artifact sweep
- Grepped every added line across the 63 diff code files for `REQ-|Task |Phase |specs.md|tasks.md|plan.md|sprint_3|DEV1-013|D1-D13|DEV\d+-\d+|4.2.BS` → 9 hits total, all listed above (findings 2, 3, 7). Zero hits for `DEV1-013`, `sprint_3`, `specs.md`, `tasks.md`, `plan.md`, `Phase ` in code comments.
- Spot-verified factual claims: `HandshakeCodeCard.tsx` font claim (app/layout.tsx loads only `--font-inter`/`--font-cairo` — ✓ accurate); `navItems.ts` "namespaces are disjoint today" (no `navLinkMyChild` key in dashboard namespace — ✓); `apollo-dev-flag.ts` registration-order claims (wired as last preload in bunfig, value-imported in documents test — ✓); repository `queryDb`/Drizzle dual-branch descriptions — ✓ accurate; `mask-full-name.ts` contract doc matches implementation — ✓.

### (b) Dead-code / unused-export sweep
- Every new export checked for consumers: `HandshakeCodeLookupReturnType` (pothos+service), `HandshakeDiscoveryRowType` (repo+helpers+service), `isGovernanceExcludedFromDiscovery` (service+tests), `maskFullName` (service+tests), `isHandshakeCode`/`normalizeHandshakeCode` (service+container+tests), `myHandshakeCodeQueryDocument`/`findStudentByHandshakeCodeQueryDocument` (views+tests), `HandshakeCodeLookupPothosObject` (query), `handshakeCodeEn/Ar` (messages), `HandshakeCode` namespace (sidebar/container/page/tests), `apolloDevModePreloaded` (documents test), locale barrel additions — all consumed. Sole exception: `NavLabelKey` (INFO finding 5). No unused imports/variables introduced (tsgo clean; no knip config present).

### (c) AGENTS.md edits
- `frontend/graphql/AGENTS.md` — single additive list entry under the existing embedded-type policy (`HandshakeCodeLookup`, fields `linkable`/`maskedName`, no `id`) — field list matches the Pothos object and SDL exactly; `keyFields: false` matches `apolloCache.ts`; rule-only, no duplicated guidance. ✓
- No other AGENTS.md edited in this diff.

### (d) Barrel files
- All additive-only, alphabetical, no circular re-exports: `backend/services/index.ts` (+`./students`), `backend/services/students/index.ts` (service only — helpers imported by path, avoiding a cycle), `backend/graphql/query/index.ts` (+`./students`), `backend/graphql/query/students/index.ts` (side-effect import, no named exports), `frontend/graphql/sharedDocuments/index.ts` (+`./students`), `frontend/graphql/sharedDocuments/students/index.ts`, `frontend/views/parent/handshake/index.ts`, `frontend/views/students/dashboard/index.ts`, `shared/constants/index.ts` (+constants), `shared/locale/namespaces/index.ts` (+`./handshakeCode` export, `HandshakeCode` import, `namespaces` map entry), `test/workflows/helpers/index.ts`. Barrels verified leaf-terminating (namespace → define-namespace; documents → generated types). ✓

---

## Four-lens review results (all clean)

- **Types:** canonical `HandshakeCodeLookupReturnType`/`HandshakeDiscoveryRowType` live in `backend/types/students`, derived via `Pick` from canonical select types; readonly fields; Pothos object is a structural passthrough with zero local type definitions; no new enums needed. ✓
- **Backend:** validation-before-read enforced (service normalizes+validates pre-DB; repo-spy test proves zero DB calls on malformed input); governance collapse to a byte-identical `null` (deleted/blocked/active-suspension, fail-closed on incomplete suspension data); `tx` propagated verbatim to both repo reads (in-rollback fixture discoverable only through propagated tx); error taxonomy via canonical `ValidationError`/`NotFoundError("STUDENT")` → `VALIDATION`/`STUDENT_NOT_FOUND`; log hygiene (bounded context bag, submitted code never logged, happy paths/misses/collapses emit nothing, unexpected errors bubble unswallowed); no dead code; no races (`new Date()` captured once per request); layer purity (repo zero business rules/i18n/logs, resolver delegates with locale propagation only). ✓
- **Frontend:** `sx`-only styling with theme-palette callbacks; `*Outlined` icons only; all copy via `useAppTranslation(HandshakeCode|Errors)` property access; `skipToken` skip-gate (zero-network malformed-input proof), no `useLazyQuery`/`styled(` (grep-verified across views); `network-only` on the point-in-time lookup with refetch retry on unchanged code; RTL/LTR handled via `dir="ltr"` attribute + `unicodeBidi: "isolate"` (stylis-rtl-safe) and LTR input field; `extensions.code` branching on UNAUTHORIZED/FORBIDDEN/VALIDATION/STUDENT_NOT_FOUND with shared `PermissionDeniedFallback`. ✓
- **Pentester:** BOLA — self-read is zero-argument with identity from `ctx.user.id` only (foreign-id probes die at GraphQL validation); BFLA — explicit `$all` conjunction, student-only/parent-only, no admin override, spy-proven "denied cells never execute the service"; BOPLA — closed two-key payload, no `id` field (selecting `id` fails validation), raw `parentId` never leaves the service; injection — single parameterized equality, no LIKE/sql templates/inArray; oracle hygiene — governed and nonexistent codes byte-identical, neutral not-found UI identical for every miss reason, distinct localized VALIDATION/STUDENT_NOT_FOUND messages. Rate limiting = tracked deferral D2. ✓

---

## Gates

| Gate | Result |
|---|---|
| `bun run tsgo` | ✅ exit 0, zero errors |
| Plan-artifact references in code comments | ⚠️ 2 LOW (findings 2, 3) + INFO cross-ticket notes |
| Dead exports | ⚠️ 1 INFO (`NavLabelKey`) |
| AGENTS.md accuracy | ✅ |
| Barrels additive/no cycles | ✅ |
| Four-lens functional/security | ✅ zero findings |

**Recommendation:** Approve. Findings 1–4 are comment/doc-only touch-ups (one JSDoc semantic correction, two plan-marker removals, one constant-JSDoc claim fix); finding 5 optional un-export; finding 6 a one-line correction to the deferred-items register. None block merge.
