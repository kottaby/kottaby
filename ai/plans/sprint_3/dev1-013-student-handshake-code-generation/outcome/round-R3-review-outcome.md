# Round R3 Review Outcome — DEV1-013 Student Handshake Code Generation

**Reviewer:** Independent fresh-context R3 (all four lenses + rotating emphasis)
**Scope:** `git diff origin/main HEAD` — 132 files (≈11.5k insertions). Outcome docs/screens excluded from code review.
**Type check:** `bun run tsgo` → **0 errors** (evidence: clean exit, no diagnostics).
**Mode:** Report only — no fixes applied.

---

## Findings

### LOW

1. **[LOW] [NEW] shared/locale/ar/handshakeCode/index.ts:10 — semantic drift between locales on `pageDescription`.**
   AR reads "أدخل رمز الربط **الذي حصلت عليه من طالبك** للعثور على ملفه الشخصي." ("Enter the handshake code **you received from your student**…") while EN is "Enter your student's handshake code to find their profile." The AR adds a provenance clause EN lacks. Both are accurate and AR is arguably the better UX hint, but the locales teach slightly different things. Key-set + placeholder parity (what `handshakeCode-namespace.parity.test.ts` locks) is unaffected — the parity belt structurally cannot catch semantic drift, which is why this surfaces only in manual review. Suggest aligning EN to "Enter the handshake code your student shared with you…" (or accepting AR as the richer variant deliberately).

### INFO

2. **[INFO] [NEW] shared/locale/ar/handshakeCode/index.ts:13 (mirrored at shared/locale/ar/errors/index.ts:25) — colloquial register: "8 خانات سداسية عشرية".**
   "خانات" (cells/slots) is colloquially clear but the standard technical register is "أحرف/رموز سداسية عشرية" (hexadecimal characters). Fully understandable to a native speaker; cosmetic only. Note the copy is intentionally duplicated verbatim between the `handshakeCode` UI key and the `errors.handshakeCodeInvalid` transport key — consistent, not drift.

3. **[INFO] [PRE-EXISTING — out of diff scope] backend/services/auth/registration.service.ts:87 — docstring drift.**
   `generateHandshakeCode` docstring says "`KSB-<8 uppercase alphanumeric>`" while the implementation (and the canonical `HANDSHAKE_CODE_PATTERN`) emits uppercase **hexadecimal**. Verified pre-existing: `git diff origin/main HEAD -- backend/services/auth/` is empty (registration generation landed on origin/main before this branch point). Recorded for a future doc-only touch-up; not actionable in this diff.

### Zero findings in the following lenses (explicit, with evidence)

- **Types** — canonical types single-sourced: `HandshakeCodeLookupReturnType` (closed 2-key payload) + `HandshakeDiscoveryRowType` via `Pick<StudentSelectType,…> & Pick<UserSelectType,…>` indexed access (`backend/types/students/student.types.ts`), no local resolver types, no duplicates; all leaves `readonly`; `.test-d.ts` pins exact key-set + forbids `id`/`email`/`parentId`/governance fields at the type level. Barrels (`backend/services/index.ts`, `query/index.ts` → `query/students/index.ts`, `shared/constants/index.ts`, `shared/locale/namespaces/index.ts`) wired with side-effect/export-only discipline. Enum **value** imports used (`UserRole` from `@/backend/enum/…` in the resolver, from generated `gql/graphql` in `navItems.ts`).
- **Backend** — validation-before-read enforced (normalize → `isHandshakeCode` → reject BEFORE repo read; proven by the repo-spy test "malformed inputs reject with VALIDATION BEFORE any DB read (repo spy: zero calls)" in `student-handshake.service.test.ts:478`); governance collapse fail-closed incl. missing-window-data (`student-handshake.helpers.ts:44`), captured-`now` purity, byte-identical `null` vs never-existed; tx propagation optional-last-param on both repo reads (savepoint-retry insert preserved); error taxonomy localized `NotFoundError`/`ValidationError` via `getServerTranslations`; log hygiene — submitted code never logged (asserted at `service.test.ts:537`), happy paths/misses/collapses emit nothing (`:563`); zero dead code found; repo layer pure (parameterized `$1` equality only, no LIKE/`sql` templates, fixed column lists); no plan-artifact refs in comments (comments cite AGENTS.md rules and precedent components, which is the house style).
- **Frontend** — `sx`-only styling throughout all four view files; `*Outlined` icons exclusively; colors only via `theme.palette.*` callbacks; translation-driven with zero hardcoded strings (verified by grep: no `KSB-[0-9A-F]{8}` literals in views; working codes exist only in test fixtures); skip-gate via `skipToken` on a stateful `useQuery` (no `useLazyQuery` anywhere in the diff); `network-only` + `refetch`-on-resubmit closes the stale-error/stale-cache gap; `extensions.code` branching via `extractErrorCode` (UNAUTHORIZED/FORBIDDEN → `PermissionDeniedFallback`, STUDENT_NOT_FOUND → localized alert, VALIDATION → inline field error); RTL/LTR handled with the documented `dir="ltr"` HTML-attribute + `unicodeBidi: "isolate"` technique that survives `stylis-plugin-rtl` cssjanus flipping (CodeChip, search input `slotProps.htmlInput.dir`); no fake data (tests use `MockedProvider`/real services only).
- **Pentester** — BOLA: `myHandshakeCode` is zero-argument (identity exclusively `ctx.user.id`; BOLA probes die as validation errors before resolver); `findStudentByHandshakeCode` is capability-by-code with no id surface in the closed payload. BFLA: both fields carry explicit `$all { authenticated, role }` conjunction (ANY-semantics leak pinned as the wrong answer); sibling role, teacher, **and admin/supervisor all denied** — no read override (`handshake-code-surface.test.ts:145` verifies role sets off the built schema; `:206–263` executes anonymous→UNAUTHORIZED and wrong-role→FORBIDDEN through the real scope-auth engine pre-resolver). Oracle hygiene: miss/governed collapse share one indistinguishable `null` channel (service + tests + UI neutral not-found state); `notFoundDescription` copy is reason-agnostic in both locales. Injection: only parameterized SQL (`WHERE s.handshake_code = $1`); no string interpolation of user input into SQL/logs. `HandshakeCodeLookup` has NO `id` field (proven type-level, schema-level, and behaviorally — selecting `id` fails validation) and Apollo `keyFields: false` prevents identity-derived cache keys.

---

## Rotating Emphasis Results (R3)

### 1. i18n layer

- **Locale parity:** compile-typed on BOTH leaves (`HandshakeCodeLabels` on `handshakeCodeEn`/`handshakeCodeAr`) + runtime belt (`handshakeCode-namespace.parity.test.ts`: identical sorted key sets, non-empty values with symmetric sweep, new `errors` keys asserted in both locales, registry + bundle wiring). New `errors` transport keys (`handshakeCodeInvalid`, `studentHandshakeNotFound`) present in both locales with faithful parity.
- **AR copy quality:** natural and grammatical for a native speaker across all 17 keys — correct verb forms ("أدخل"، "يرجى التحقق"، "تعذر نسخ"), correct agreement ("هذا الطالب مرتبط بالفعل"), consistent terminology ("رمز الربط" for handshake code throughout). Only the two register nits above (finding #2).
- **RTL correctness:** the embedded Latin token `KSB-XXXXXXXX` sits inside Arabic sentences as a single strong-LTR run — correct bidi rendering in both the helper text and the transport error; the code chip and search input pin LTR via the cssjanus-proof attribute technique; the masked Arabic name deliberately renders in ambient direction (correct choice). No directionality/punctuation-ordering defects found in any Arabic string.
- **Information-leak review (both locales):** zero leak. Not-found copy is reason-agnostic (no existence oracle); `alreadyLinkedDescription` discloses only "linked to a parent account" (no incumbent identity); `studentHandshakeNotFound` fires only on the caller's OWN row; no copy enumerates a working code — positively locked by the format-copy security pin (every value in `errors`+`handshakeCode` both locales checked against `isHandshakeCode`; `X` is non-hex so the placeholder can never match) and the prefix is positively controlled (format IS taught). The only working-code literals in the tree are test fixtures and one docstring example (finding #3 territory).
- **Parity-test coverage:** comprehensive for its tier (keys/values/placeholders/security/registry). Inherent limitation: semantic drift and translation-naturalness are structurally out of scope — which is exactly where finding #1 lives.

### 2. Test-workflows journey layer

- **Fixture realism (`test/workflows/helpers/journey-fixtures.ts`):** actors are real `users`+role-child rows provisioned through the REAL `RegistrationService` (honest-authorization substrate, no monkey-patching, no seed rows), unique per-run `jrn_<domain>_<8hex>` email prefixes; governance/link writes are short COMMITTING field-mapped transactions emulating future production mutations (documented as DEV1-014 emulation). The `JOURNEY_ACTOR_CREDENTIAL` naming sidesteps the hardcoded-password lint with an honest comment — acceptable test-only fixture.
- **Tracked teardown completeness:** FK-safe order (students → parents → users) inside ONE committing transaction, followed by residue probes on all five tables (`users`, `students`, `parents`, `notifications`, `auditLogs`) asserted at zero in `afterAll` (Step 8). Side-effect contract (pure-read journeys → zero notification/audit rows attributable to tracked actors, both as `notifications.userId` and `auditLogs.actorId|entityId`) asserted before teardown. Journey fixtures smoke test independently proves the harness.
- **Journey step coverage vs specs §2.9 steps 1–8:** all covered — Step 1 canonical+unique codes (System), Step 2 self-read + foreign-id isolation + parent-edge NotFound (Student), Step 2b denials cross-referenced to the GraphQL tier (documented, not duplicated — correct layering), Step 3 two-key payload + mask (Parent), Step 4 case-folding parity + pre-DB garbage rejection + valid-missing → null (with DB grounding that the absent probe matches no row), Step 5 already-linked `linkable:false` + serialization leak probes (Second Parent + Parent), Steps 6a/6b/6c governance collapses byte-identical to never-existed, Step 7 caller-governance denial record-only with DEV2-002 cross-reference, Step 8 teardown + residue. No gaps found.
- **Actor attribution:** every step names its actor in the title/comment (System, Student Yusuf, Parent Fatima, Second Parent Karim, Admin-domain fixture); the registration service plays System. Clean and auditable.

---

## Verification Evidence

| Check | Result |
|---|---|
| `bun run tsgo` | 0 errors |
| `git diff origin/main HEAD --name-only` | 132 files reviewed across 4 lenses |
| Pre-existing filter | Finding #3 verified outside diff (`backend/services/auth/` diff = 0 files); findings #1/#2 verified in touched lines |
| Working-code literal scan (views/shared non-test) | Only docstring example + parity-safe placeholder |

## Verdict

**PASS.** One LOW locale-drift finding and two INFO notes (one pre-existing, out of scope). No blocking defects across types, backend, frontend, or pentester lenses. The i18n layer and the journey-test layer — the R3 emphasis areas — are the strongest parts of this change: both locale parity and journey step coverage are locked with unusual rigor (compile-time + runtime belts; real-service provisioning with tracked hard-delete teardown and residue proof).

**Recommended follow-ups (non-blocking):** align EN `pageDescription` with the AR provenance phrasing; optionally upgrade AR "خانات" → "أحرف"; fix the pre-existing registration docstring "alphanumeric" → "hexadecimal" in a future doc-only commit.
