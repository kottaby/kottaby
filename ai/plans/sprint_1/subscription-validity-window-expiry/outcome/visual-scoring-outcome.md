
## Post-outcome CI remediation note (PR #156)

The first CI run on this branch surfaced two latent quality debts the per-file
sub-loop cannot see (it scopes jscpd intra-file and the branch had never run CI):

1. `unicorn/consistent-function-scoping` ×5 in `session-lifecycle.booking.test.ts`
   → helpers + 2 interfaces hoisted to module scope verbatim (suite 26/26 on pglite).
2. jscpd full-repo clone (38 lines) between the two cron routes — the REQ-020
   "line-for-line mirroring" doctrine made them identical by construction.
   → superseded by the shared `createCronSweepEndpoint` factory
   (`backend/lib/gateway/cron-endpoint.ts`); envelope identity is now structural.
   Suites: expire 11/11, sweep 9/9, route-inventory 15/15, full jscpd 0 clones.
