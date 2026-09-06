# Phase 0 — Discovery Outcome (T0.2, T0.3, T0.4)

**Plan:** `ai/plans/unused/clean_unused.md` (unused-code cleanup)
**Branch:** `feat/clean-unused`
**Author:** discovery subagent (T0.2–T0.4)
**Date:** 2026-09-06

---

## 0. How the knip baseline was captured (IMPORTANT for `check:unused`)

- `check:unused` script does **NOT exist** in package.json yet (a later phase adds it — out of scope for this task; no source file was modified here).
- **Sandbox constraint discovered:** running knip under Node (`bunx knip` → bin shebang `#!/usr/bin/env node` → Node v24.19.0) **crashes with `RangeError: Array buffer allocation failed`** inside `oxc-parser` raw-transfer (`ARRAY_BUFFER_SIZE = BLOCK_SIZE 2147483632 + BLOCK_ALIGN 4294967296` ≈ 6.4 GB). This sandbox has 4.1 GB RAM, no swap, and a dev server running → the allocation always fails.
- **Workaround used:** run knip under the **Bun runtime** (oxc-parser disables raw transfer under Bun, falling back to the serialization path): `bun node_modules/knip/bin/knip-bun.js`. The knip package ships a dedicated `knip-bun` bin (`#!/usr/bin/env bun`; symlink exists at `node_modules/.bin/knip-bun`).
- **Carry-forward to the phase that adds `check:unused`:** the script must NOT be plain `"knip"` (bunx resolves the node-shebang bin and OOM-crashes on this host). Use `"check:unused": "bun node_modules/knip/bin/knip-bun.js"` (or `bunx knip-bun`). Verify with a quick re-run before committing the script.
- Raw outputs:
  - JSON reporter: `/tmp/knip-baseline.json` (63 KB, 147 files-with-issues)
  - Default (symbols) reporter: `/tmp/knip-baseline.txt` (372 lines — includes the 19 **configuration hints**, which the JSON reporter does NOT emit)
  - Grouped inventory: `/tmp/knip-inventory-grouped.txt`, `/tmp/knip-inventory.md`
- knip version: 6.34.0. Exit code with findings: **1** (expected non-zero).
- Commands run (this task): `bun node_modules/knip/bin/knip-bun.js --reporter json` and `bun node_modules/knip/bin/knip-bun.js` (default reporter).

---

## 1. Knip findings inventory (T0.2) — THE WORKING LIST for Phases 1–3

Total: **360 issues** (+19 configuration hints, reported only by the default reporter).

| Category | Count | Notes |
|---|---:|---|
| Unused files | 38 | incl. 3 known false positives (path-invoked) + 3 generated files |
| Unused dependencies | 82 | runtime deps in `dependencies` |
| Unused devDependencies | 35 | incl. 3 known false positives (node_modules file access) |
| Unlisted dependencies | 3 | imported/config-referenced but not in package.json |
| Unlisted binaries | 0 | `copilot` suppressed via `ignoreBinaries` |
| Unused exports | 90 | functions/values/classes |
| Unused exported types | 87 | types/interfaces/enums |
| Unused enum members | 4 | 2 enums |
| Unused namespace members | 2 | class static members |
| Duplicate exports | 2 | Phase 1.1 material |
| Configuration hints | 19 | 10 "Remove from ignore", 7 "no matches", 2 extension hints |
| Unresolved imports | 0 | — |
| Cycles | not requested | not part of default report |

Per-directory concentration (files+exports+types+members+duplicates): `backend/types` 36, `test/workflows` 26, `frontend/views` 24, `backend/graphql` 22, `frontend/providers` 18, `backend/db` 15, `shared/i18n` 9, `backend/enum` 9, `frontend/hooks` 8, `shared/lib` 7, `shared/locale` 7, `backend/services` 7 — remaining dirs ≤ 5 each.

### 1.1 Unused files (38)

```
frontend/context/index.ts
frontend/hooks/index.ts
frontend/providers/VercelObservability.tsx
backend/types/appearance.types.ts
test/scripts/run-test.ts                       ← FALSE POSITIVE (AGENTS.md-documented runner, see §2)
test/scripts/run-server-tests.ts               ← FALSE POSITIVE (run-locked-cmd wrapper args, see §2)
test/scripts/build-test.ts                     ← FALSE POSITIVE (run-locked-cmd wrapper args, see §2)
.storybook/shims/node-process.ts               ← no path/import references found (likely dead; verify in Phase 2)
shared/i18n/index.ts
shared/i18n/link.tsx
shared/i18n/navigation.ts
shared/types/index.ts
shared/types/localized-string.ts
shared/constants/iana-timezone-territories.ts  ← GENERATED (output of generate:iana-timezones, see §5)
shared/constants/iana-timezone-labels.ts       ← GENERATED (output of generate:iana-timezones, see §5)
shared/constants/iana-timezones.ts             ← GENERATED (output of generate:iana-timezones, see §5)
shared/lib/enum.ts
shared/lib/safe-url.ts
shared/lib/localized-string.ts
shared/lib/locale-tag.ts
frontend/lib/i18n/index.ts
frontend/lib/auth/index.ts
frontend/lib/auth/requireRoleForPage.ts
frontend/components/siteFooter/index.ts
frontend/views/auth/index.ts
frontend/views/admin/index.ts
backend/db/introspection/index.ts
backend/db/introspection/catalog-queries.ts
backend/db/introspection/constraint-queries.ts
backend/db/introspection/types.ts
backend/db/introspection/table-queries.ts
backend/lib/db/index.ts
shared/lib/timezone/index.ts
shared/lib/locale/excluded-ui-countries.ts
frontend/views/admin/users/index.ts
frontend/providers/theme/presets/index.ts
backend/graphql/pothos/parents/index.ts
backend/graphql/pothos/billing/index.ts
```

Notes: 15 of 38 are `index.ts` barrels (mostly legacy `next-intl` era: `shared/i18n/*`, `shared/types/*`, `frontend/*/index.ts`). `frontend/graphql/test/AGENTS.md` and root `AGENTS.md` document `test/scripts/run-test.ts` as the mandated AI test runner — do not delete; register as knip **entry** in Phase 2.

### 1.2 Unused dependencies (82)

```
@aws-sdk/client-ses            @aws-sdk/client-sesv2          @dnd-kit/core
@dnd-kit/sortable              @dnd-kit/utilities             @escape.tech/graphql-armor-block-field-suggestions
@google-cloud/secret-manager   @google-cloud/storage          @hookform/resolvers
@mui/x-date-pickers            @newrelic/browser-agent        @pdf-lib/fontkit
@pdfme/common                  @pdfme/schemas                 @pdfme/ui
@pothos/plugin-add-graphql     @pothos/plugin-dataloader      @pothos/plugin-directives
@pothos/plugin-drizzle         @pothos/plugin-errors          @pothos/plugin-simple-objects
@pothos/plugin-tracing         @react-email/editor            @sparticuz/chromium
@types/google-libphonenumber   @types/moment-hijri            @types/qrcode
@types/react-color             @types/validator               @types/webfontloader
@typescript-eslint/eslint-plugin   @typescript-eslint/parser  @vercel/analytics
@vercel/blob                   @vercel/functions              @vercel/speed-insights
@xyflow/react                  @yaacovcr/transform            apollo-server-errors
bullmq                         card-validator                  cron-parser
crypto-hash                    dataloader                     date-fns
firebase-admin                 form-data                      framer-motion
google-libphonenumber          graphql-constraint-directive   graphql-depth-limit
html-to-image                  isomorphic-dompurify           libphonenumber-js
lucide-react                   mailgun.js                     material-ui-popup-state
mermaid                        moment-hijri                   mui-tel-input
newrelic                       nodemailer                     opentype.js
pdf-lib                        pg-boss                        postmark
puppeteer                      qrcode                         react-color
react-dropzone                 react-email                    react-leaflet
react-zoom-pan-pinch           resend                         tsconfig-paths
twilio                         use-debounce                   uuid
validator                      webfontloader                  xlsx-js-style
zustand
```

Config-string / non-import references already known (Phase 1.2 must verify each before removal):
- `newrelic` — `next.config.ts` `serverExternalPackages: ["newrelic"]` + `newrelic.cjs` agent config + `docs/observability/new-relic-integration.md` (Vercel `NODE_OPTIONS=-r` wiring). Likely **retained**.
- `@newrelic/browser-agent` — same docs describe browser-agent wiring; verify how it's loaded (no source import found by knip).
- Pothos plugins (add-graphql, dataloader, directives, drizzle, errors, simple-objects, tracing) — `backend/graphql/pothos/builder.ts` comment says "intentionally NOT loaded here — they are added where the features that need them live", but repo-wide grep finds **no imports anywhere** → plausibly truly unused (verify in Phase 1.2).
- `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` — check `eslint.config.mjs` plugin-string references before removing.

### 1.3 Unused devDependencies (35)

```
@faker-js/faker                        @graphql-codegen/gql-tag-operations
@graphql-codegen/import-types-preset   @graphql-codegen/typescript
@next/bundle-analyzer                  @open-draft/deferred-promise
@open-draft/logger                     @open-draft/until
@smithy/fetch-http-handler             @storybook/addon-onboarding
@storybook/addon-themes                @tailwindcss/postcss
@testing-library/jest-dom              @types/bcryptjs
@types/card-validator                  @types/graphql-depth-limit
@types/leaflet                         @types/newrelic
@types/nodemailer                      @types/opentype.js
@typescript/native-preview             @typescript/typescript6
autoprefixer                           cldr-core
cldr-dates-full                        cldr-localenames-full
glob                                   jest
mockdate                               postcss
svg-to-ico                             tailwindcss
ts-jest                                ts-morph
ts-node
```

Known false-positive risks (see §5):
- `cldr-core`, `cldr-dates-full`, `cldr-localenames-full` — **used by file path** (not import) from `scripts/iana-timezone-generator/paths.ts` (`node_modules/cldr-*/...json`). Do NOT remove.
- `@typescript/native-preview` / `@typescript/typescript6` — referenced by `next.config.ts` comment + `scripts/ts6-eslint-patch.cjs`; verify the tsgo/TS6 shim wiring before removal (tsgo script runs `tsgo -b --noEmit`; `@typescript/native-preview` provides the `tsgo` binary? — verify in Phase 1.2).
- `@storybook/addon-onboarding`, `@storybook/addon-themes` — check `.storybook/main.ts` addons list (currently NOT listed there → plausibly unused; addon strings are the reference surface).
- `jest`, `ts-jest`, `@types/jest` — no `jest.config.*` at repo root; Storybook uses Vitest; plausibly dead.
- `svg-to-ico` — superseded by `sharp` + `to-ico` in `scripts/generator/generate-icons.ts` (`to-ico` itself is NOT flagged → in use).
- `@graphql-codegen/typescript`, `@graphql-codegen/import-types-preset`, `@graphql-codegen/gql-tag-operations` — plugin-name strings in `codegen.ts` are the reference surface to check.

### 1.4 Unlisted dependencies (3)

- `@graphql-codegen/typed-document-node` — referenced as plugin string `"typed-document-node"` in `codegen.ts` (knip flags the resolved name; not present in package.json devDeps)
- `eslint-plugin-react-hooks` — imported in `eslint.config.mjs:9`
- `csstype` — imported in `frontend/providers/theme/types.ts:2`

### 1.5 Unused exports (90)

`file :: symbol(:line)`:

```
backend/lib/env.ts :: resolveEnvConfig:316
shared/locale/server-cookies.ts :: setLocaleCookie:15
backend/db/index.ts :: getPool:110
backend/db/index.ts :: getClient:285
shared/lib/timezone/excluded-iana-timezones.ts :: EXCLUDED_IANA_TIMEZONES:4
frontend/views/admin/audit/audit-trail-filters.ts :: NO_FILTERS:75
frontend/views/admin/audit/audit-trail-filters.ts :: parseUtcDayEndExclusive:135
backend/services/notifications/notification-engine.service.ts :: NOTIFICATION_INBOX_MAX_PAGE_LIMIT:33
backend/services/billing/wallet.service.ts :: WALLET_LEDGER_PAGE_LIMIT:51
test/helpers/index.ts :: getTestServerPortCandidates:6
test/helpers/index.ts :: killListenersOnPort:7
test/helpers/index.ts :: PROTECTED_APP_PORTS:8
test/helpers/index.ts :: TEST_SERVER_PORT:9
test/helpers/index.ts :: isPgliteProvider:11
backend/graphql/graphqlErrorsFinalizer.ts :: OPERATION_NAME_MAX_LENGTH:141
frontend/providers/apollo/utils/link-factories.ts :: createSuccessHandler:44
test/ui/components/TestWrapper.tsx :: TestWrapper:44
frontend/providers/theme/theme.ts :: appTheme:119
frontend/lib/i18n/format-date.ts :: shortNumericDateMask:71
backend/enum/users/admin-user-governance-filter.enum.ts :: isAdminUserGovernanceFilter:47
backend/graphql/pothos/shared/scalar.pothos.ts :: DateTimeScalar:28
backend/db/seeds/billing/index.ts :: INITIAL_DEMO_PLANS:1
frontend/hooks/auth/useAuthToken.ts :: useAuthToken:4
shared/locale/namespaces/define-namespace.ts :: getNamespaceId:15
frontend/views/teacher/wallet/teacherWalletShared.ts :: WALLET_TYPE_NAME:11
frontend/views/teacher/wallet/teacherWalletShared.ts :: WITHDRAWAL_AMOUNT_PATTERN:18
frontend/views/auth/register/registerFormUtils.ts :: REGISTER_FIELD_PATHS:30
shared/locale/client/use-translation.ts :: useTranslation:8
frontend/views/parent/handshake/OutgoingSectionStates.tsx :: CANCEL_TOAST_AUTOHIDE_MS:23
frontend/views/parent/handshake/OutgoingSectionStates.parts.tsx :: OutgoingSkeletonList:37
backend/services/notifications/notification-engine.publish.ts :: publishAfterCommit:23
backend/services/shared/user-provisioning.helpers.ts :: generateHandshakeCode:43
shared/locale/localeContext.tsx :: useLocaleContext:12
test/workflows/helpers/journey-fixture-registry.ts :: JOURNEY_TRACKED_TABLE_DELETE_ORDER:67
test/workflows/helpers/session-cast.ts :: buildStudentWithTrial:217
test/workflows/helpers/session-cast.ts :: buildStudentWithPaidLane:231
test/workflows/helpers/session-cast.ts :: buildStudentWithBoth:247
test/workflows/helpers/session-cast.ts :: buildZeroBalanceStudent:263
test/workflows/helpers/session-cast.ts :: buildSecondStudent:276
test/workflows/helpers/session-cast.ts :: buildCertifiedTeacher:289
test/workflows/helpers/session-cast.ts :: buildSecondCertifiedTeacher:301
test/workflows/helpers/session-cast.ts :: buildTeacherApplicant:314
test/workflows/helpers/session-cast.ts :: buildParent:327
test/workflows/helpers/session-cast.ts :: buildAdmin:340
backend/services/admin/user-management.helpers.ts :: truncateSafely:114
frontend/providers/localeContext.ts :: LocaleContext:5
frontend/providers/localeContext.ts :: useLocaleContext:8
frontend/views/admin/users/utils/adminUsersDirectory.helpers.ts :: hasDirectoryFilters:97
frontend/providers/theme/LtrScope.tsx :: LtrScope:18
backend/lib/errors/error-masking/error-masking-readers.ts :: RAW_ERROR_HOP:104
frontend/hooks/connectivity/useApolloConnectivityHelpers.ts :: getReconnectionDelay:12
frontend/hooks/connectivity/useMutationWrapper.ts :: useMutationWrapper:21
frontend/utils/errorUtils.ts :: getGraphQLErrorMessage:10
frontend/utils/errorUtils.ts :: isAbortError:43
frontend/utils/errorUtils.ts :: serializeApolloError:81
backend/enum/shared/recitation-reading.enum.ts :: isRecitationReading:17
backend/enum/shared/recitation-reading.enum.ts :: RECITATION_READINGS:18
backend/enum/shared/recitation-reading.enum.ts :: RecitationReading:19
frontend/views/student/sessions/sessionListCacheEviction.ts :: filterSessionReferenceOutOfList:31
frontend/views/teacher/sessions/teacherSessionCacheArms.ts :: evictSessionFromTeacherLists:49
frontend/views/student/sessions/sessionRowSlotBook.ts :: addInFlightSlot:18
frontend/views/student/sessions/sessionRowSlotBook.ts :: removeInFlightSlot:29
test/ui/components/helpers/containerSuiteScaffold.tsx :: expectSnackbar:102
test/ui/components/helpers/containerSuiteScaffold.tsx :: EM_DASH_PLACEHOLDER:157
frontend/components/ui/graphqlErrorSurface/GraphQLErrorToastItem.tsx :: TOAST_AUTOHIDE_MS:13
backend/graphql/pothos/shared/userFieldHelpers.ts :: resolveUserRole:51
backend/graphql/pothos/shared/userFieldHelpers.ts :: resolveNullableUserGender:65
backend/graphql/pothos/billing/wallet.pothos.ts :: TeacherTransactionPothosObject:86
frontend/views/admin/users/hooks/governance-actions-helpers.ts :: alertSeverity:31
backend/graphql/pothos/admin/admin-user.pothos.ts :: AdminUserListItemPothosObject:62
backend/graphql/pothos/admin/admin-user.pothos.ts :: AdminTeacherSnapshotPothosObject:169
backend/graphql/pothos/admin/admin-user.pothos.ts :: AdminStudentSnapshotPothosObject:185
backend/graphql/pothos/admin/admin-user.pothos.ts :: AdminParentSnapshotPothosObject:211
backend/graphql/pothos/admin/audit-trail.pothos.ts :: AdminAuditLogEntryPothosObject:33
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsUsersPothosObject:57
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsSessionsPothosObject:72
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsCurrencyRevenuePothosObject:94
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsRevenuePothosObject:110
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsSubscriptionsPothosObject:128
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsTeachersPothosObject:147
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsRatingsPothosObject:163
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsHealthPothosObject:179
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsSessionTrendPointPothosObject:194
backend/graphql/pothos/admin/platform-analytics.pothos.ts :: PlatformAnalyticsRevenueTrendPointPothosObject:209
frontend/hooks/locale/useLanguageSwitch.ts :: useLanguageSwitch:7
frontend/hooks/locale/useLocaleSwitchSuccess.ts :: useLocaleSwitchSuccess:20
shared/i18n/routing.ts :: defaultLocale:4
shared/i18n/routing.ts :: locales:4
shared/i18n/routing.ts :: routing:12
shared/i18n/routing.ts :: redirect:23
```

⚠️ **Pothos objects false-positive class:** the 16 `*PothosObject` exports (admin-user, audit-trail, platform-analytics, wallet) are Pothos object refs registered **by side effect** when the module evaluates (the export exists only for the type-level ref chaining). knip cannot see schema registration. Per plan Phase 3.2 these are likely "drop `export` keyword, keep symbol" candidates — NOT deletions. Verify per-symbol how the ref is consumed (builder pattern chaining in same file).

### 1.6 Unused exported types (87)

`file :: type(:line)`:

```
frontend/providers/theme/types.ts :: TonalPalette:4
frontend/providers/theme/types.ts :: M3ColorSiblings:28
frontend/providers/theme/types.ts :: M3ColorSiblingsOptions:39
frontend/providers/theme/types.ts :: ColorFamily:50
frontend/providers/theme/types.ts :: ColorFamilyOptions:57
frontend/providers/theme/types.ts :: M3BaseScheme:64
frontend/providers/theme/types.ts :: M3BaseSchemeOptions:86
backend/db/index.ts :: PoolClient:344
test/workflows/helpers/journey-fixture-registry.ts :: JourneyTrackedTable:79
test/workflows/helpers/session-cast.ts :: StudentLaneProfile:67
test/workflows/helpers/session-cast.ts :: PaidSessionLane:79
test/workflows/helpers/session-cast.ts :: StudentCastMember:82
test/workflows/helpers/session-cast.ts :: TeacherCastMember:89
test/workflows/helpers/session-cast.ts :: ApplicantCastMember:100
test/workflows/helpers/session-cast.ts :: ParentCastMember:107
test/workflows/helpers/session-cast.ts :: AdminCastMember:114
frontend/providers/localeContext.ts :: LocaleContextValue:6
backend/lib/errors/error-masking/error-masking-readers.ts :: GraphQLPathSegment:15
shared/i18n/routing.ts :: RoutingConfig:6
shared/i18n/routing.ts :: RedirectOptions:18
backend/lib/logger.ts :: Logger:103
frontend/providers/apollo/error-link.map.ts :: GraphQLErrorActionKind:135
frontend/providers/apollo/error-link.map.ts :: GraphQLErrorNoticeKind:148
frontend/providers/apollo/error-link.map.ts :: GraphQLErrorActionTone:156
frontend/context/AuthContext.ts :: AuthCredentials:19
backend/types/contracts/session-completion-escrow.contract.types.ts :: EscrowReleaseReason:59
backend/types/contracts/session-notification.contract.types.ts :: SessionEventNotificationEntityRef:32
backend/types/contracts/teacher-availability.contract.types.ts :: TeacherMatchingLanguagesInput:25
backend/types/contracts/contract-error-codes.constants.ts :: ContractErrorCode:13
backend/types/students/student.types.ts :: StudentInsertType:5
test/workflows/helpers/admin-governance-cast.ts :: GovernanceAdminActor:107
test/workflows/helpers/admin-governance-cast.ts :: GovernanceRegisteredActor:118
test/workflows/helpers/admin-governance-cast.ts :: GovernanceTeacherActor:131
test/workflows/helpers/journey-actor-fixtures.ts :: JourneyFixtureSnapshot:71
test/workflows/helpers/journey-actor-fixtures.ts :: JourneyActorFixture:79
test/workflows/helpers/journey-fixtures.ts :: JourneySideEffectCountsType:100
test/workflows/helpers/journey-fixtures.ts :: JourneyResidueCountsType:106
shared/locale/namespaces/translation.ts :: InferNamespaceLabels:3
shared/locale/types/errors/labels.ts :: PlanCatalogErrorsLabels:8
shared/locale/types/dashboard/index.ts :: DashboardGettingStartedTips:165
frontend/views/admin/users/dialogs/CreateUserDialog.tsx :: CreateUserDialogInput:47
frontend/views/admin/users/dialogs/DeleteConfirmDialog.tsx :: AdminUserDeleteTarget:32
frontend/views/admin/users/dialogs/EditUserDialog.tsx :: AdminUserEditTarget:38
frontend/views/admin/users/dialogs/EditUserDialog.tsx :: AdminEditUserPatchInput:48
backend/types/teachers/evaluation.types.ts :: EvaluationInsertType:4
backend/types/billing/teacher-transaction.types.ts :: TeacherTransactionInsertType:4
backend/types/billing/wallet.types.ts :: WalletInsertType:5
backend/types/teachers/teacher.types.ts :: TeacherInsertType:4
backend/db/repo/admin/admin-user-row-types.ts :: RawUserRole:23
backend/db/repo/admin/admin-user-row-types.ts :: RawGender:29
frontend/views/dashboard/nav/navItems.ts :: NavLabelKey:59
frontend/hooks/notifications/use-notification-mark-actions.ts :: MarkNotificationReadInput:83
frontend/hooks/notifications/use-notification-realtime.ts :: RealtimeNotificationToast:47
frontend/lib/logger.ts :: Logger:133
backend/db/seeds/lib/seed-config.ts :: SeedProfile:1
backend/types/auth/auth.types.ts :: LoginSubmitInput:39
backend/types/auth/auth.types.ts :: AuthTokensReturnType:51
backend/types/auth/auth.types.ts :: AuthUserReturnType:64
backend/types/auth/auth.types.ts :: LoginPayloadReturnType:72
backend/types/billing/student-payment.types.ts :: StudentPaymentInsertType:4
backend/types/billing/student-subscription.types.ts :: StudentSubscriptionSelectType:3
backend/types/billing/student-subscription.types.ts :: StudentSubscriptionInsertType:4
backend/types/billing/subscription.types.ts :: SubscriptionInsertType:4
backend/types/classes/home-work.types.ts :: HomeWorkSelectType:3
backend/types/classes/home-work.types.ts :: HomeWorkInsertType:4
backend/types/classes/lesson.types.ts :: LessonSelectType:3
backend/types/classes/lesson.types.ts :: LessonInsertType:4
backend/types/classes/progress.types.ts :: ProgressSelectType:3
backend/types/classes/progress.types.ts :: ProgressInsertType:4
backend/types/classes/recitation.types.ts :: RecitationSelectType:3
backend/types/classes/recitation.types.ts :: RecitationInsertType:4
backend/types/classes/report.types.ts :: ReportInsertType:4
backend/types/errors/api-error.types.ts :: ApiSuccessEnvelopeReturnType:99
backend/types/errors/api-error.types.ts :: GraphQLErrorExtensionsType:116
backend/types/gateway/gateway-context.types.ts :: GatewayRequestMetadata:28
backend/types/parents/parent.types.ts :: ParentInsertType:4
backend/types/parents/parent-link-request.types.ts :: ParentLinkRequestInsertType:11
backend/types/teachers/applicant.types.ts :: ApplicantInsertType:11
backend/types/teachers/teacher-verification.types.ts :: TeacherVerificationSelectType:3
backend/types/teachers/teacher-verification.types.ts :: TeacherVerificationInsertType:4
backend/types/users/admin.types.ts :: AdminInsertType:4
backend/db/repo/parents/parent-link-request.repository.ts :: RawLinkStatus:54
backend/db/repo/parents/parent-link-request-reminder.repository.ts :: ExpiryReminderClaimRow:24
backend/enum/shared/surah-juz-ref.enum.ts :: SurahJuzRef:8
frontend/views/student/sessions/studentSessionInFlightSlots.ts :: RowActionKind:21
frontend/views/admin/plans/hooks/usePlanForm.ts :: PlanFormErrors:27
frontend/views/admin/users/hooks/useAdminUsersDirectory.ts :: DirectoryUserListItem:40
```

⚠️ `*InsertType` / `*SelectType` types derive from Drizzle `InferInsertModel`/`InferSelectModel` — they mirror DB schema and may be consumed via `satisfies`/generic inference (plan's known blind spot). Verify before deleting.

### 1.7 Unused enum members (4)

```
Refunded  (PaymentStatus)        backend/enum/billing/payment-status.enum.ts:9
Student   (RegisterPublicRole)   backend/enum/users/register-public-role.enum.ts:12
Teacher   (RegisterPublicRole)   backend/enum/users/register-public-role.enum.ts:13
Parent    (RegisterPublicRole)   backend/enum/users/register-public-role.enum.ts:14
```

⚠️ **DB/GraphQL-schema-backed enums** — `RegisterPublicRole` members may be consumed as string literals in registration input mapping / GraphQL enum registration (plan §Phase 3 blind-spot rule). `PaymentStatus.Refunded` likely maps to a DB enum value (check `backend/db/schema` before touching).

### 1.8 Unused namespace members (2)

```
getMe            (AuthService)               backend/services/auth/auth.service.ts:220
validateReading  (RecitationCatalogService)  backend/services/shared/recitation-catalog.service.ts:53
```

⚠️ Plan blind spot: class members consumed via destructured dynamic import / generic factory — verify `X.member` receiver patterns before deleting.

### 1.9 Duplicate exports (2) — Phase 1.1

```
getPool | getDrizzleDbPool    backend/db/index.ts                 (function exported under 2 names)
isPidRunning | isPidAlive     scripts/lib/process-lock-helpers.ts (function exported under 2 names)
```

### 1.10 Configuration hints (19) — Phase 1.3

"Remove from ignore" (knip measured: the rule suppressed **zero** issues in this baseline):

| Identifier | Location | Meaning |
|---|---|---|
| `**/.*/**` | knip.config.ts ignore | matches no reported issue |
| `storage/**` | knip.config.ts ignore | matches no reported issue |
| `**/*.d.ts` | knip.config.ts ignore | matches no reported issue |
| `backend/enum/shared/country.enum.ts` | knip.config.ts ignore | **suppresses nothing** (246 documented false positives no longer occur) |
| `backend/enum/permissions/permission.enum.ts` | knip.config.ts ignore | suppresses nothing (81 documented FPs gone) |
| `shared/locale/namespaces/index.ts` | knip.config.ts ignore | suppresses nothing |
| `backend/types/meeting/index.ts` | knip.config.ts ignore | suppresses nothing |
| `backend/services/communication/channels/whatsapp/cloud-api/index.ts` | knip.config.ts ignore | suppresses nothing |
| `frontend/lib/payment-method.ts` | knip.config.ts ignore | suppresses nothing |
| `copilot` | knip.config.ts ignoreBinaries | no `copilot` binary reported |

"Refine entry pattern (no matches)" (files don't exist):

| Pattern | Note |
|---|---|
| `app/**/loading.tsx` | no loading.tsx anywhere in app/ |
| `app/**/error.tsx` | none (biome.json still has an `app/**/error.tsx` override — dead override) |
| `app/**/template.tsx` | none |
| `app/**/actions.ts` | none (Server Actions not used) |
| `test/ui/e2e-preload.ts` | file deleted; stale entry |
| `test/integration/preload/live-comm-preload.ts` | file deleted — **but package.json `test:live-comm` still passes `--preload ./test/integration/preload/live-comm-preload.ts` → script is BROKEN** |
| `test/integration/preload/live-fx-preload.ts` | file deleted — **`test:live-fx` script likewise BROKEN** |

Extension hints (informational): `.mdx` and `.css` — "Compiled extension excluded by project (imports not followed)" (project globs are .ts/.tsx only).

⚠️ Hint semantics (verified in knip source, `IssueCollector.addIssue`/`addFileIssues` + `reporters/util/configuration-hints.js`): a "Remove from ignore" hint fires iff the pattern matched zero reported issues in this run. Per plan Phase 1.3, still prove by remove-and-re-run before deleting curated ignores (a suppressed issue marks the pattern "used"; no hint = nothing suppressed *currently*).

---

## 2. Execution surfaces map (T0.3) — files invoked BY PATH STRING, not imports

### 2.1 package.json scripts (direct `bun [run] <file>` — knip resolves these via core script analysis)

| File | Invoked by | Evidence (script line) |
|---|---|---|
| `scripts/safe-dev.ts` | `dev:safe` | `NEXT_DIST_DIR=.next-dev bun scripts/safe-dev.ts` |
| `scripts/build/generate-vercel-config.ts` | `prebuild` | `bun run scripts/build/generate-vercel-config.ts` |
| `scripts/lib/run-locked-cmd.ts` | 20+ scripts | e.g. `bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit` |
| `scripts/restore-next-env-dts.ts` | `tsgo` | `bun run scripts/restore-next-env-dts.ts && …` |
| `scripts/iana-timezone-generator/cli.ts` | `generate:iana-timezones` | `bun run scripts/iana-timezone-generator/cli.ts` |
| `scripts/generator/generate-jwt-secrets.ts` | `generate:jwt-secrets` | `bun run scripts/generator/generate-jwt-secrets.ts` |
| `scripts/generator/generate-gql-schema.ts` | `generate:gqlSchema` | `bun run scripts/generator/generate-gql-schema.ts` |
| `scripts/lint-service.ts` | `lint`, `lint:type-aware`, `lint:fix` | `bun run scripts/lint-service.ts` |
| `scripts/quality-gate.ts` | `quality-gate`, `quality-gate:fresh` | `bun run scripts/quality-gate.ts` |
| `scripts/dbActions/cli-entry.ts` | `db`, `db:sqlite*`, `db:push` | `bun --no-env-file run scripts/dbActions/cli-entry.ts` |
| `scripts/cron-worker.ts` | `cron:worker` | `bun run scripts/cron-worker.ts` |
| `scripts/ops/sweep-expired-link-requests.ts` | `ops:sweep-link-requests` | `bun run scripts/ops/sweep-expired-link-requests.ts` |
| `scripts/ops/remind-expiring-link-requests.ts` | `ops:remind-link-requests` | `bun run scripts/ops/remind-expiring-link-requests.ts` |
| `scripts/start-notification-ws.ts` | `ws` | `bun run scripts/start-notification-ws.ts` |
| `scripts/validation/validate-mermaid.ts` | `validate:mermaid` | `bun run scripts/validation/validate-mermaid.ts` |
| `test/scripts/run-db-tests-parallel.ts` | `test:db`, `test:db:sqlite` | `bun --env-file=.env.test test/scripts/run-db-tests-parallel.ts` |
| `test/scripts/run-services-tests-parallel.ts` | `test:services`, `test:services:sqlite` | `bun … test/scripts/run-services-tests-parallel.ts` |
| `test/scripts/run-integration-tests-parallel.ts` | `test:integration` | `bun … test/scripts/run-integration-tests-parallel.ts` |
| `test/scripts/kill-test-servers.ts` | `test:ui:kill` | `bun run test/scripts/kill-test-servers.ts` |
| `test/scripts/build-test.ts` | `build:test` | `bun run scripts/lib/run-locked-cmd.ts build:test bun run test/scripts/build-test.ts` ← **wrapper arg — knip CANNOT see it** (flagged unused) |
| `test/scripts/run-server-tests.ts` | `test:graphql`, `test:graphql:coverage`, `test:graphql:sqlite`, `test:ui:e2e` | `… run-locked-cmd.ts test:graphql bun run test/scripts/run-server-tests.ts` ← **wrapper arg — knip CANNOT see it** (flagged unused) |
| `drizzle.config.sqlite.ts` | `db:sqlite:generate` | `bunx drizzle-kit generate --config=drizzle.config.sqlite.ts` |

### 2.2 Bun test `--preload` flags (package.json scripts)

| File | Evidence |
|---|---|
| `test/ui/test-env.ts` | `test:ui:components`, `test:ui:components:coverage`, `test:ui:static` — `--preload ./test/ui/test-env.ts` (also knip.config.ts entry) |
| `test/ui/components/happydom-preload.ts` | `test:ui:components*` — `--preload ./test/ui/components/happydom-preload.ts` (also knip entry) |
| `test/ui/components/translation-preload.ts` | `test:ui:components*` — `--preload ./test/ui/components/translation-preload.ts` (**NOT in knip.config.ts entry list** — not flagged only because tests `await import("@/test/ui/components/translation-preload")`; still path-invoked) |
| `test/ui/components/next-dynamic-mock.ts` | `test:ui:components*` — `--preload ./test/ui/components/next-dynamic-mock.ts` (also knip entry) |
| `test/integration/preload/live-fx-preload.ts` | `test:live-fx` — `--preload ./test/integration/preload/live-fx-preload.ts` — **FILE DOES NOT EXIST (script broken)** |
| `test/integration/preload/live-comm-preload.ts` | `test:live-comm` — same — **FILE DOES NOT EXIST (script broken)** |

### 2.3 bunfig.toml `[test]` global preloads (auto-resolved by knip's bun plugin — NOT flagged, listed for completeness)

```
./test/scripts/test-runner-guard.ts
./backend/db/test/logger-mock.ts
./backend/db/test/ensure-env.ts
./test/preload/graphql-interop.ts
./test/preload/apollo-dev-flag.ts
```

### 2.4 AGENTS.md / docs-documented AI commands (path-invoked, invisible to knip unless under `scripts/**` entry glob)

| File | Evidence |
|---|---|
| `test/scripts/run-test.ts` | root AGENTS.md §Essential Commands (`bun run test/scripts/run-test.ts <path>`), `frontend/graphql/test/AGENTS.md`, `backend/ws/AGENTS.md`, `test/workflows/AGENTS.md` — **knip-flagged unused → FALSE POSITIVE** |
| `scripts/health/sub-loop.ts` | root AGENTS.md (`bun run scripts/health/sub-loop.ts <file> --lifecycle <stage>`) — covered by `scripts/**` entry |
| `scripts/lint-service.ts` (CLI `-f` mode) | root AGENTS.md (`bun run scripts/lint-service.ts -f <file> --id <id>`) |
| `scripts/pglite-bootstrap.ts` | file header `bun run scripts/pglite-bootstrap.ts`; used for sandbox bootstrap — covered by `scripts/**` entry |
| `scripts/browser-login.ts` | `test/ui/AGENTS.md:143-144` + VLM shell scripts — covered by entry |
| `scripts/generator/generate-icons.ts` | manual CLI (`process.argv[2]`) — covered by entry |
| `scripts/vlm-*.{ts,sh}` | sandbox VLM verification (oxlint-ignored) — covered by entry |

### 2.5 CI workflows (`.github/workflows/`)

| Workflow | Invokes |
|---|---|
| `ci.yml` (quality job) | `bun tsgo`, `bun run oxlint`, `bun biome:check`, `bun run lint`, `bun run check:duplicates`, `bun run generate:gqlSchema && bun codegen` (codegen drift check), `git diff --exit-code` |
| `ci.yml` (tests-db) | `bun run db migrate`, `bun run test:db` |
| `ci.yml` (tests-services) | `bun run db migrate`, `bun run db seed`, `bun run test:services` |
| `ci.yml` (tests-graphql) | `bun run db migrate`, `bun run db seed`, `bun run test:graphql` |
| `pr-review.yml` | external action only (no repo script paths) |

### 2.6 Docker / containers

No root `Dockerfile` / `docker-compose.yml`. `.devcontainer/{Dockerfile,docker-compose.yml,devcontainer.json}` exist (base image + postgres service, no repo TS paths). `Caddyfile` is sandbox networking only.

### 2.7 Tool configs that load files by path/glob

| Config | Paths/globs it consumes |
|---|---|
| `knip.config.ts` | entry: `app/**/{page,layout,route,loading,error,template,actions}.*` (4 have no matches), `scripts/**/*.ts`, `backend/db/scripts/**/*.ts`, `backend/db/seeds/index.ts`, GraphQL side-effect entries, preload entries (3 stale) |
| `.storybook/main.ts` | stories glob `../frontend/stories/**/*.stories.@(js|jsx|mjs|ts|tsx)`; staticDirs `../public`; vite alias `@` → repo root |
| `.storybook/preview.tsx` | imports `./msw-handlers`, `./StoryWrapper`, `./storybook-fonts.css`, `@/app/index.css` (knip storybook plugin resolves these) |
| `drizzle.config.ts` | schema `./backend/db/schema/index.ts`; out `./backend/drizzle` |
| `drizzle.config.sqlite.ts` | schema `./backend/db/schema/index.ts`; out `./backend/drizzle-sqlite` (dir absent; created on first sqlite generate) |
| `codegen.ts` | schema `./frontend/graphql/generated/schema.graphql`; documents `./frontend/graphql/sharedDocuments/**/*.ts` + `./frontend/views/**/*.documents.ts`; output `./frontend/graphql/generated/gql/graphql.ts` |
| `graphql.config.yml` | schema `frontend/graphql/generated/schema.graphql`; documents `frontend/graphql/sharedDocuments/**/*.{ts,tsx}` |
| `apollo.config.json` | `localSchemaFile: ./frontend/graphql/generated/schema.graphql`; includes `./frontend/**/*.ts` |
| `eslint.config.mjs` | imports `./scripts/eslint-rules/index.mjs` (custom plugin: `no-hardcoded-colors.mjs`, `no-hardcoded-strings.mjs` + `.helpers.mjs`/`.constants.mjs`); references `scripts/oxlint-categorize.ts` in a files[] override — **file does not exist (phantom)** |
| `oxlint.config.mts` | ignorePatterns list `scripts/vlm-*`, `scripts/pglite-bootstrap.ts`, `scripts/ts6-eslint-patch.cjs`, `debug-eslint.js`, `shared/locale/**/*.js` |
| `biome.json` | files includes `**`, `.storybook/**`; overrides reference `app/**/error.tsx` (no matches), `frontend/lib/theme-detection.ts` |
| `.dependency-cruiser.js` | `check:deps` (depcruise); tsConfig `tsconfig.json`; excludes mirrors tsconfig |
| `.jscpd.json` | `check:duplicates` (jscpd); ignore list (no TS loads) |
| `cspell.config.yaml` | imports `@cspell/dict-ar/cspell-ext.json` (justifies `@cspell/dict-ar` dep) |
| `newrelic.cjs` | New Relic agent config (loaded via require by the agent; `next.config.ts` serverExternalPackages includes `"newrelic"`) |
| `bunfig.toml` | `[test]` preloads (see §2.3) |
| `opencode.json` | instructions `.github/copilot-instructions.md` + `.github/instructions/**` — **dirs/files do not exist (phantom refs)** |
| `.coderabbit.yaml` | path_filters only (review exclusions) |

### 2.8 ORM / DB convention surfaces

| Path | Consumed by |
|---|---|
| `backend/drizzle/<timestamp>_<name>/migration.sql` | `scripts/pglite-bootstrap.ts` (hardcodes `/home/z/my-project/backend/drizzle`), `scripts/dbActions/dialect.ts` (`./backend/drizzle`), `backend/db/scripts/runDrizzleMigrations.ts`, drizzle-kit migrate |
| `backend/db/migration/1-extensions.sql` | `scripts/pglite-bootstrap.ts`, `scripts/dbActions/ensureExtensions.ts`, `cleanGenerate.ts` |
| `backend/db/migration/2-functions.sql`, `3-immutability-triggers.sql` (+ `-sqlite.sql` variants) | `scripts/pglite-bootstrap.ts`, `scripts/dbActions/cleanGenerate.ts` (combines `backend/db/migration/*`) |
| `backend/db/migration/rollback-down.sql` | manual DB ops (docs/DATABASE_MIGRATIONS.md) |
| `backend/db/schema/index.ts` | drizzle configs (schema entry) |
| `backend/db/seeds/index.ts` | knip entry; `bun run db seed` → `scripts/dbActions/*` → `backend/db/scripts/drizzleSeed.ts` |
| `backend/db/scripts/*.ts` (7 files) | knip entry; invoked from `scripts/dbActions/actions.ts` |
| `backend/ws/*` | `scripts/start-notification-ws.ts` (`ws` script) — notification WebSocket sidecar |
| `frontend/graphql/generated/schema.graphql` | output of `generate:gqlSchema`; input to `codegen`/apollo/graphql configs; knip-ignored `**/generated/**` |

### 2.9 GraphQL side-effect registration roots (knip entries — not path-invoked but import-invisible)

`backend/graphql/gqlSchema.definitions.ts`, `backend/graphql/pothos/index.ts`, `backend/graphql/query/index.ts`, `backend/graphql/mutation/index.ts` — Pothos types register by side-effect (`import "@/backend/graphql/pothos"`); `gqlSchema.ts` wires `import "@/backend/graphql/mutation"`.

**Surfaces summary: ~45 distinct path-invoked files/config targets** (22 package.json script paths, 6 CLI preloads, 5 bunfig preloads, 7 doc-documented command paths, plus tool-config glob surfaces).

---

## 3. tsconfig.json analysis (T0.4)

**`include`:**
- `.storybook/**/*.{ts,tsx}` (explicit)
- `next-env.d.ts`, `**/*.d.ts`
- `**/*.ts`, `**/*.tsx` — **the entire repo**: app/, backend/, frontend/, shared/, scripts/, test/, root configs (next.config.ts, knip.config.ts, codegen.ts, drizzle.config*.ts, oxlint.config.mts is .mts — not matched by *.ts glob… note .mjs/.mts files are NOT in the root project)
- `.next{,-dev}/types/**`, `.next-test-{dev,prod}/types/**` — Next.js generated route types for every dist-dir variant

**`exclude`:**
- Dot-dirs: `ai/**`, `.agents`, `.cursor`, `.git`, `.github`, `.husky`, `.kiro`, `.next*`, `.playwright-mcp`, `.scannerwork`, `.stakpak`, `.vercel`, `.vscode` (`.storybook` is re-included explicitly)
- Build outputs: `node_modules`, `dist`, `out`, `build`, `storybook-static`
- Source subtrees: `Kottaby` (legacy clone — **dir does not exist in this tree**), `frontend/graphql/generated` (generated code), `**/unRefactored_tests` (dir does not exist), `skills` (sandbox)

**Key findings:**
1. **Tests, stories, and scripts are NOT excluded** — they are full members of the project graph (`**/*.{ts,tsx}` + explicit `.storybook/**`). The plan's Phase 5 worry ("tests/stories excluded → knip and type-aware linters partly blind") **does not apply**: `tsgo -b --noEmit` type-checks test/story/script files, so dangling imports after Phase 2 deletions WILL be caught by the type-checker. Phase 5's tsconfig contingency (add `test/**` to include) should not be needed.
2. `frontend/graphql/generated` is excluded from the ROOT file set (still type-checked transitively when imported) — generated GraphQL types live outside knip (`**/generated/**` ignore) and outside the root tsgo program, but codegen drift is CI-enforced (`generate:gqlSchema && codegen && git diff --exit-code`).
3. `ai/**`, `.github/**`, `.husky/**` are excluded from type-checking — plan/task markdown and CI YAML are never type-checked (expected). Markdown/doc drift in those trees is invisible to tsgo.
4. `.mjs`/`.mts`/`.cjs` files (eslint.config.mjs, oxlint.config.mts, scripts/eslint-rules/*.mjs, newrelic.cjs, scripts/ts6-eslint-patch.cjs, parse-eslint.js, debug-eslint.js) are **outside** the tsconfig project — knip also excludes them (project globs are `*.{ts,tsx}` only). Consequence: the custom ESLint plugin files under `scripts/eslint-rules/` are invisible to both knip and tsgo — but they're only reachable via the eslint.config.mjs import, so no false-positive risk (knip doesn't flag them either).
5. `.storybook/tsconfig.json` is a SEPARATE project (paths `@/*` → `../*`) that includes `.storybook/**` + `frontend/stories/**` + `frontend/styles.d.ts` — stories are type-checked twice (root + storybook project).
6. No tsconfig `references` — single root project; `tsgo -b --noEmit` treats it as one solution.
7. `types: ["bun"]`, `paths: {"@/*": ["./*"]}`, `allowImportingTsExtensions: true`, `noEmit: true`, strict + `noUnusedLocals` + `noUnusedParameters`.

**Implications for later phases:**
- Deleting a file that only tests/stories/scripts import → tsgo error surfaces immediately (good safety net).
- Files referenced ONLY from excluded trees (`ai/`, `.github/`, docs) have no compiler guard — the Phase 2 "grep for path-minus-extension across configs/docs" step remains mandatory.
- `knip --use-tsconfig-files` is NOT used; knip's own project globs mirror tsconfig coverage plus `.storybook/**`.

---

## 4. Findings already suppressed by existing knip.config.ts ignores

Actively suppressing (no "Remove from ignore" hint fired — these rules match real reported issues):
- `**/generated/**` — generated code
- `!.storybook/**` negation + `frontend/stories/**` ignore — Storybook stories
- `shared/constants/iana-timezone.enum.ts` — 441 enumMember false positives (auto-generated IANA catalog; consumed via `Object.values()` + codegen `@/shared/constants/iana-timezone.enum#IanaTimezone`)
- `ignoreBinaries: ["copilot"]` — hmm: knip hints "Remove from ignoreBinaries" → currently suppresses NOTHING (see §1.10; verify in Phase 1.3 before removing — it's documented as child_process.spawn of an external CLI)
- `ignoreDependencies: ["lint-staged", "jscpd", "@cspell/dict-ar", "@cspell/eslint-plugin"]` — no hints fired for these → each currently suppresses a real finding (lint-staged config missing since `.husky/pre-commit` is empty; jscpd is the `check:duplicates` binary; @cspell/dict-ar is the cspell dict import; @cspell/eslint-plugin presumably referenced in eslint config as plugin string)

Currently suppressing NOTHING (knip "Remove from ignore" hints — candidates for Phase 1.3 cleanup, after re-run proof):
`**/.*/**`, `storage/**`, `**/*.d.ts`, `backend/enum/shared/country.enum.ts`, `backend/enum/permissions/permission.enum.ts`, `shared/locale/namespaces/index.ts`, `backend/types/meeting/index.ts`, `backend/services/communication/channels/whatsapp/cloud-api/index.ts`, `frontend/lib/payment-method.ts`, `copilot` (binaries)

> Nuance: the curated comments on country/permission enums claim 246/81 false positives, but today's baseline reports ZERO issues for those files, so the ignores mask nothing. Safe path for Phase 1.3: remove one rule → re-run knip → confirm zero new findings → keep removal; if new findings appear, restore the rule (the FP class returned).

Stale entry patterns (match nothing): `app/**/loading.tsx`, `app/**/error.tsx`, `app/**/template.tsx`, `app/**/actions.ts`, `test/ui/e2e-preload.ts`, `test/integration/preload/live-comm-preload.ts`, `test/integration/preload/live-fx-preload.ts`.

---

## 5. Carry-forward knowledge & blind-spot watchlist

### Categories safe to START with (lowest false-positive risk)
1. **Duplicate exports (2)** — mechanical, Phase 1.1: `getPool|getDrizzleDbPool` (backend/db/index.ts — NOTE: `getPool` is ALSO flagged as unused export; check which alias consumers use first), `isPidRunning|isPidAlive` (scripts/lib/process-lock-helpers.ts).
2. **Config hints (19)** — Phase 1.3: remove provably-empty ignore rules + stale entry patterns (after remove-and-re-run proof); fix the two BROKEN scripts (`test:live-fx`, `test:live-comm` reference deleted preloads — decide: remove scripts or restore preloads; restoring files is out of knip's purview).
3. **Unused devDependencies** — after verifying the known false-positive classes below.

### Known knip blind spots (protect in Phases 2–3)
1. **Path-invoked files (3 flagged false positives — must be registered as knip ENTRIES, not deleted):**
   - `test/scripts/run-server-tests.ts` — inside `run-locked-cmd.ts` wrapper args (knip can't see nested commands)
   - `test/scripts/build-test.ts` — same wrapper pattern
   - `test/scripts/run-test.ts` — AGENTS.md-documented AI runner only
2. **Generated files (3 flagged):** `shared/constants/iana-timezones.ts`, `iana-timezone-labels.ts`, `iana-timezone-territories.ts` — outputs of `scripts/iana-timezone-generator/cli.ts` (paths.ts hardcodes the 3 output paths). Deleting them breaks `generate:iana-timezones` idempotency (regen recreates them). Phase 2 decision: retain as generated artifacts (documented ignore) or make the generator emit into a `generated/` dir (bigger change — likely ignore).
3. **node_modules file-access devDeps (3 flagged false positives):** `cldr-core`, `cldr-dates-full`, `cldr-localenames-full` — read via absolute path by the IANA generator, never imported.
4. **Pothos object refs (16 flagged exports):** `*PothosObject` exports register schema types by side-effect; export exists for builder-chaining. Prefer "drop `export`, keep symbol" over deletion (plan Phase 3.1 rule).
5. **DB/GraphQL-backed enums (4 flagged members):** `PaymentStatus.Refunded`, `RegisterPublicRole.{Student,Teacher,Parent}` — verify DB enum values + GraphQL registration + string-literal consumers before touching.
6. **Class namespace members (2):** `AuthService.getMe`, `RecitationCatalogService.validateReading` — check destructured dynamic imports / generic-factory consumers.
7. **Drizzle `*InsertType`/`*SelectType` types (bulk of backend/types findings):** may be consumed via `satisfies`, generic inference, or by schema-repo factories — verify `X.member` and type-position usage before deleting.
8. **Config-string-referenced deps:** `newrelic` (next.config.ts + newrelic.cjs + docs), `@newrelic/browser-agent`, `@types/newrelic`, `@typescript-eslint/{eslint-plugin,parser}` (eslint config), `@graphql-codegen/*` presets (codegen.ts plugin strings), `@storybook/addon-*` (main.ts addon strings), `@typescript/native-preview` + `@typescript/typescript6` (TS6 shim — `scripts/ts6-eslint-patch.cjs`, next.config.ts comment, postinstall `rm -rf node_modules/*/node_modules/typescript`).
9. **`translation-preload.ts`** is path-invoked (`--preload` in test:ui:components) but not a knip entry — currently unflagged because tests dynamically import it; if those dynamic imports get cleaned up, add it to knip entries.
10. **Shell wrapper blindness (systemic):** ANY file invoked as an argument inside `run-locked-cmd.ts <label> <command…>` is invisible to knip. Current victims: run-server-tests.ts, build-test.ts. When adding entries, prefer `entry` over `ignore` (plan rule).
11. **Phantom references (not knip findings, but config debt):** `eslint.config.mjs` files[] references non-existent `scripts/oxlint-categorize.ts`; `opencode.json` references non-existent `.github/copilot-instructions.md` + `.github/instructions/**`; root AGENTS.md references `.github/instructions/*.instructions.md` + `.github/CODE_REVIEW_CHECKLIST.md` (absent); `biome.json` override for `app/**/error.tsx` matches nothing. tsconfig excludes `Kottaby` + `**/unRefactored_tests` (dirs absent).
12. **Sandbox runtime constraint:** knip MUST run under Bun (`bun node_modules/knip/bin/knip-bun.js`) — Node crashes with `RangeError: Array buffer allocation failed` (oxc-parser raw transfer wants a ~6.4 GB ArrayBuffer; host has 4.1 GB / no swap). Also: JSON reporter omits configuration hints — always run the default reporter too when hints matter.
13. **Storybook surfaces:** `frontend/stories/**` ignored wholesale (stories glob only); `.storybook/{preview,manager,StoryWrapper,msw-handlers}` resolve via the storybook plugin; `.storybook/shims/node-process.ts` has NO references found anywhere (grep clean across configs) — but its docstring claims a Vite shim role; Phase 2 must search vite alias history/intent before deleting (it is the one .storybook file with a path-reference risk profile of zero).
14. `frontend/graphql/generated/` (schema.graphql + gql/graphql.ts) is generated output — regenerate via `generate:gqlSchema` + `codegen`, never hand-edit; excluded from knip + tsconfig roots.

### Suggested phase sequencing (unchanged from plan, informed by this data)
- Phase 1.1 duplicates (2) → 1.2 dependencies (82+35, minus false-positive classes) → 1.3 config hints (19)
- Phase 2 files (38: 35 actionable after removing 3 path-invoked FPs; 3 generated need an ignore decision)
- Phase 3 exports (90) / types (87) / members (6) — biggest volume in `backend/types` (Drizzle type pairs), `test/workflows/helpers` (journey cast builders — check for dynamic use), `frontend/providers/theme/types.ts` (M3 theme type surface)
- Phase 4 second-order re-run until knip exits 0 (currently exits 1)
