# Round R5 Review Outcome — DEV1-013 Student Handshake Code Generation

- **Iteration:** R5 (independent fresh-context; all four lenses: types, backend, frontend, pentester)
- **Rotating emphasis (R5):** cross-layer consistency contracts — (a) shared constants consumed identically by the frontend form gate and the backend service gate; (b) `HandshakeCodeLookupReturnType` flowing unchanged backend/types → pothos → codegen → documents → component props; (c) i18n keys consumed by components vs. codes emitted by service/resolver errors; (d) D4 savepoint behavior vs. `docs/auth/user-registration.md`.
- **Scope:** `git diff origin/main HEAD --name-only` — 117 files (24 source-bearing outside outcome/screens: shared constants/lib, backend types/repo/services/graphql, frontend documents/views/providers/nav, locales, tests, bunfig preloads).
- **Gate:** `bun run tsgo` → **exit 0, 0 errors** (verified twice, captured exit code).

---

## 1. Findings

### NEW findings

**None blocking.** Two INFO-level nitpicks and one forward observation, all NEW (introduced in this diff's touched lines):

- **[INFO] NEW** `frontend/views/parent/handshake/HandshakeDiscoveryContainer.tsx:171-174` — in `deriveResultState`, the `error` check outranks `loading`. During a manual retry `refetch()` after a generic error, Apollo retains the prior `error` until the refetch result lands, so the stale generic-error `Alert` stays visible instead of the "searching" skeleton for the duration of the retry round-trip. Cosmetic state-machine nitpick only — the form stays retryable and the end state is correct (the code comment even documents the retryable posture). No action required.
- **[INFO] NEW** `backend/db/repo/students/student.repository.ts:123-150` — `findDiscoveryByHandshakeCode` maintains two parallel read implementations (raw parameterized SQL string for the `queryDb` fast path + Drizzle select for the tx branch) with a hand-kept alias-parity comment. The two column lists can drift silently if edited asymmetrically; only tests would catch it. This mirrors the `UserRepository.findByEmail` house pattern per `backend/db/repo/AGENTS.md`, so it is the sanctioned shape — noted as a maintenance hazard, not a defect.
- **[INFO] NEW (forward observation, not a defect)** `backend/services/students/student-handshake.service.ts:152` — `linkable: row.parentId === null` reports "already linked" even when the linked parent account is later soft-deleted (`users.isDeleted`) while `students.parent_id` remains set. The linking lifecycle (and any re-link/unlink semantics) is owned by the DEV1-014 link-request feature (deferred item D1); for this ticket `linkable := parentId IS NULL` is exactly the documented contract. Flagged for DEV1-014's awareness only.

### PRE-EXISTING findings (verified outside this diff's touched lines)

- **[LOW] PRE-EXISTING** `backend/services/auth/registration.service.ts:86-95` (+ `docs/auth/user-registration.md` §2.1 prose) — the generator docstring says "`KSB-<8 uppercase alphanumeric>`" while the implementation emits uppercase **hex** (`randomUUID().replace(/-/g,"").toUpperCase().slice(0,8)`), and the generator hardcodes the `KSB-` prefix instead of consuming `HANDSHAKE_CODE_PREFIX` from `@/shared/constants`. Independently verified: (1) the emitted charset `[0-9A-F]` is a strict subset of the canonical `HANDSHAKE_CODE_PATTERN` — **no false rejections possible**; (2) `git diff origin/main HEAD -- backend/services/auth/` is empty — this file is untouched by this branch, so it is pre-existing and already ledgered as **D5** in `deferred-items.md`. Not actionable in this diff.
- **[LOW] PRE-EXISTING (documented/accepted)** No per-parent/per-IP rate limiting on the discovery query — brute-force throttling is deferred to DEV2-002 (ledgered as **D2** at plan baseline; non-blocking by plan contract). R5 pentester lens confirms the remaining guardrails are in place: authenticated-parent-only scope, 4.3B code space, zero working-code literals in any locale copy (locked by the format-copy security pin test).

---

## 2. R5 Emphasis — Cross-Layer Consistency Contracts

### (a) Shared constants: identical gate semantics both sides — ✅ VERIFIED

- **Backend gate** (`student-handshake.service.ts:126-127`): `normalizeHandshakeCode(code)` → `isHandshakeCode(normalized)`, imported from `@/shared/constants/handshake-code.constants`.
- **Frontend gate** (`HandshakeDiscoveryContainer.tsx:189-192`, `normalizeAndValidate`): `normalizeHandshakeCode(raw)` → `isHandshakeCode(normalized)`, imported via the `@/shared/constants` barrel — same underlying module, same functions, same order (normalize-THEN-validate).
- `normalizeHandshakeCode` = `value.trim().toUpperCase()`; `HANDSHAKE_CODE_PATTERN = /^KSB-[0-9A-F]{8}$/` — anchored, single bounded `{8}` quantifier, no alternation (linear-time, no ReDoS surface). Both sides therefore accept exactly the same input set (e.g. ` ksb-abcd1234 ` → `KSB-ABCD1234` passes both; `KSB-ABCD123G` fails both).
- The single shared module is dependency-free (imports nothing), so no layer re-derives the shape. The i18n format copy ("8 hexadecimal characters") is consistent with the hex pattern in both locales. Server `VALIDATION` re-judgment is structurally unreachable through the UI (same gate), yet still handled defensively at the field — correct defense-in-depth.

### (b) `HandshakeCodeLookupReturnType` flow: zero shape drift — ✅ VERIFIED

| Layer | Shape | Evidence |
|---|---|---|
| Backend canonical type | `{ readonly maskedName: string; readonly linkable: boolean }` | `backend/types/students/student.types.ts:12-15` |
| Pothos object | `objectRef<HandshakeCodeLookupReturnType>`; `exposeString("maskedName")` + `exposeBoolean("linkable")` — both non-null, pure passthrough, no local type | `handshake-code.pothos.ts:32-39` |
| Generated schema | `type HandshakeCodeLookup { maskedName: String!, linkable: Boolean! }`; `findStudentByHandshakeCode(code: String!): HandshakeCodeLookup` (nullable outer) | `frontend/graphql/generated/schema.graphql:24-27,76` |
| Codegen documents types | `{ maskedName: string, linkable: boolean }` (+ nullable outer on the query) | `frontend/graphql/generated/gql/graphql.ts:110-115` |
| Component consumption | `deriveResultState` reads `lookup.maskedName`/`lookup.linkable` → `HandshakeCodeResultCard` props `{ maskedName: string; linkable: boolean }` | `HandshakeDiscoveryContainer.tsx:177-181`, `HandshakeCodeResultCard.tsx:8-13` |

No field added, dropped, renamed, or re-nullified anywhere along the chain; the exact key set is additionally compile-pinned by `student.types.test-d.ts` and behaviorally pinned by the surface test ("discloses EXACTLY `maskedName: String!` and `linkable: Boolean!`", "selecting `id` FAILS validation"). The embedded type is registered `keyFields: false` in `apolloCache.ts:45-47`, consistent with the no-`id` design.

### (c) i18n keys ↔ emitted error codes: exact mapping — ✅ VERIFIED

| Server emission (extensions.code) | Frontend consumption | Copy source | Consistency |
|---|---|---|---|
| `VALIDATION` (service `ValidationError(t.handshakeCodeInvalid)`, thrown pre-DB) | `HandshakeDiscoveryContainer.tsx:74` `errorCode === "VALIDATION"` → field error with `t.invalidFormat` | `handshakeCode.invalidFormat` ≡ `errors.handshakeCodeInvalid` — **byte-identical strings in EN and in AR** | ✅ both locales |
| `STUDENT_NOT_FOUND` (service `NotFoundError("STUDENT")`, auto-code verified) | `HandshakeCodeCard.tsx:92` `code === "STUDENT_NOT_FOUND"` → `te.studentHandshakeNotFound` | `errors.studentHandshakeNotFound` | ✅ |
| `UNAUTHORIZED` / `FORBIDDEN` (scope-auth 401/403 split) | both components → `PermissionDeniedFallback` | — | ✅ |
| any other error | `errors.internalServerError` Alert | — | ✅ |

AR/EN key parity is locked twice (compile-time typed leaf consts + the runtime parity suite in `shared/locale/handshakeCode-namespace.parity.test.ts`), the two new `errors` keys are asserted non-empty in both locales, and the format-copy security pin proves no locale value contains a literal working code while both format helpers carry the `KSB-` prefix. No orphan keys, no missing keys.

### (d) D4 savepoint vs. `user-registration.md` contract — ✅ VERIFIED

- Doc §2.2: "If the `handshake_code` unique constraint fires (23505), the service regenerates and retries **inside the same transaction**."
- Implementation: `StudentRepository.createForRegistration` (`student.repository.ts:51-73`) wraps each insert attempt in `tx.transaction(async sp => …)` — a Drizzle nested transaction on the caller's tx, which issues a **SAVEPOINT** on the node-postgres Pool session (driver verified: `drizzle({ client: getPool() })` in `backend/db/index.ts:79` — Pool-based, savepoint-capable; not neon-http). A 23505 rolls back only the savepoint and **rethrows the driver error unchanged**, so the service's `isUniqueViolation` (which traverses the Drizzle cause chain) sees the real 23505 instead of the 25P02 aborted-transaction follow-on; the retry loop (`registration.service.ts:347-387`, untouched by this diff) regenerates and re-inserts on the SAME transaction. On success the savepoint releases transparently (same atomicity as a bare insert).
- Observable contracts preserved: retry bound 5, `HANDSHAKE_COLLISION`/`HANDSHAKE_EXHAUSTED` domain logs, `ConflictError` on exhaustion; doc's repo signature table (`createForRegistration(userId, handshakeCode, tx)`) unchanged. The absorption lock (`handshake-code-generation-locks.test.ts`) plus the immutability scan and generation format-lock tests are present in the diff as the permanent regression locks. **The documented absorption contract is restored; no drift between doc and behavior remains on this surface.**

---

## 3. Four-Lens Sweep (non-emphasis highlights)

- **Types:** canonical payload `readonly`, closed two-key shape, single-sourced from `@/backend/types` (pothos imports it, no local redefinition); `HandshakeDiscoveryRowType` composed via `Pick` on canonical select types; `.test-d.ts` proof suite pins exact key sets, forbidden fields (`id`/`email`/`parentId`/`passwordHash`/`handshakeCode`), nullability, and readonly-ness with `@ts-expect-error` negatives. `bun run tsgo` → 0 errors.
- **Backend:** validation-before-read proven by repo-spy test (21 malformed probes → zero repo calls); governance collapse fail-closed (incl. missing suspension-window data → excluded) evaluated against one caller-supplied `now`; miss and collapse byte-identical `null` (no existence oracle); tx propagation optional-last-param on both reads; error taxonomy localized via `getServerTranslations(...).errorsTranslations` property access; log hygiene locked by tests (submitted code never logged — asserted for raw AND normalized forms; happy paths/misses/collapses emit nothing; bounded `{code, entity, locale}` context on the discovery reject, `{code, entity, entityId, locale}` on the self-read reject); zero dead code found (all 4 constant exports consumed); repo layer pure (fixed column lists, parameterized `$1` equality only, no LIKE/`sql` templates, no business rules).
- **Frontend:** MUI `sx`-only styling with theme-palette callbacks throughout; `*Outlined` icons only (`SearchOutlined`, `SearchOffOutlined`, `TagOutlined`, `ContentCopyOutlined`, `LinkOutlined`, `PersonSearchOutlined`, `LinkOffOutlined`); skip-gate via `skipToken` + `validatedCode` state (zero-network proof for malformed input; **no `useLazyQuery` anywhere**); unchanged-code retry via `refetch`; `network-only` fetchPolicy with a load-bearing rationale comment; RTL handled via `dir="ltr"` HTML attribute + `unicodeBidi: "isolate"` on the code chip (cssjanus-flip-proof) and LTR-isolated code input with ambient-direction labels; `extensions.code` branching exactly as documented in the state machine table; nav label cross-namespace collision carved out at compile time (`NavLabelKey`); page guard `withPageAuth({ roles: [Parent] })` is the sole authorization boundary with server-translated shell labels.
- **Pentester:** BOLA — `myHandshakeCode` is zero-argument (identity exclusively from `ctx.user.id`; foreign-id probes die as GraphQL validation failures); discovery reads only what the capability grants. BFLA — `$all` conjunction (authenticated AND role) on both fields, no admin/supervisor override; 401/403 split verified by pre-resolver tests. BOPLA — payload closed by construction (masked name + server-computed linkable; no ids, contacts, or governance state; `parentId` never leaves the service). Injection — parameterized SQL only (`WHERE s.handshake_code = $1`), no `sql` templates, no string interpolation of user input. Oracle hygiene — governance vs. never-existed indistinguishable; not-found is a neutral UI state (not error-styled); format-only `VALIDATION` oracle teaches only the public format; no working-code literals in copy (test-locked). Permission matrix — surface tests pin Student-only/Parent-only role sets and absence from the public-operation allowlist.

---

## 4. Verdict

**PASS — ship-ready.** Zero NEW blocking findings. Two INFO nitpicks (stale-error-during-retry-refetch derivation ordering; dual-branch read duplication) and one forward observation (`linkable` semantics vs. soft-deleted parent, for DEV1-014). Pre-existing items (generator prefix hardcoding + "alphanumeric" prose → D5; discovery rate limiting → D2) are outside this diff's touched lines and already ledgered with owners. All four R5 cross-layer consistency contracts verified intact end-to-end; `bun run tsgo` exits 0 with 0 errors.

| Gate | Result |
|---|---|
| `bun run tsgo` | ✅ exit 0, 0 errors |
| Emphasis (a) shared gate constants | ✅ identical semantics both sides |
| Emphasis (b) payload type flow | ✅ zero shape drift across 5 layers |
| Emphasis (c) i18n ↔ error-code mapping | ✅ exact, both locales, parity-locked |
| Emphasis (d) D4 savepoint vs doc contract | ✅ contract restored & lock-pinned |
| NEW findings | 0 blocking, 2 INFO + 1 forward observation |
| Pre-existing findings | 2 (both ledgered: D5, D2) — filtered, not in diff lines |
