# Deferred Items Ledger

**Feature:** `dev3-024-disaster-recovery-backup-verification`
**Plan Directory:** `ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification`
**Created:** `2026-09-05`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D-001 | Neon managed-backup (PITR) console configuration & screenshot evidence | 6.2 (RPO/RTO doc) | Operator runbook execution outside repo | 📅 Forward | DEV3-026 launch-checklist gate | Neon PITR retention is configured in the Neon console, not in code; this repo ships the verification scripts + documented procedure only. DEV3-026 checklists 7.1–7.5 consume the evidence. |
| D-002 | CI workflow job that runs `restore-verify` on a schedule against an anonymized staging dump | 5.3 (restore-verify script) | DevOps CI hardening (post-launch) | 📅 Forward | — | Daily automated restore drill is desirable but requires CI secrets for a scratch Postgres; recorded as forward work, non-blocking for this plan (manual + scripted drill ships here). |
| D-003 | Off-site (second-region / object-storage) upload of backup artifacts | 4.1 (backup script) | Post-launch infrastructure ticket | 📅 Forward | — | Script writes to local `backups/` with manifest; shipping to S3/GCS requires credential provisioning outside repo scope. The manifest format is designed so an uploader can be added without changing the producer. |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan

---

## Usage Guidelines

### When to Add a Deferred Item
Add a row when: (1) a task discovers work belonging to a different task/phase; (2) a technical constraint forces splitting work; (3) a dependency blocks immediate completion; (4) a reviewer/outcome uncovers post-launch follow-up.

**Format:**
```
| D<next-id> | <Brief description> | <source-task> | <target-task or owning ticket> | <status> | <verifier> | <rationale> |
```

### When to Update Status
- **To 🔄 In Progress:** target task starts the item.
- **To ⚠️ Partial:** partially resolved; note remainder.
- **To ✅ Done:** resolved AND verified (cite outcome file or commit).
- **📅 Forward** rows are exempt from the ❌ gate ONLY when an owning ticket/owner is named; they are re-checked at the 7.2 sweep.

### Referencing in Outcome Files
- On deferral: "Deferred X (see deferred-items.md D-n)".
- On resolution: "Resolved deferred item D-n (see ledger)".

## Enforcement

The final gate (Task 8.2) MUST verify the ledger is clean:

```bash
grep -c "❌\|⚠️" ai/plans/sprint_4/dev3-024-disaster-recovery-backup-verification/deferred-items.md
# Expected: 0 unresolved ❌/⚠️ rows. Any hit blocks plan completion.
```

## Common Deferred-Item Patterns (this plan)

- **Operator console evidence (D-001):** Neon PITR retention is configured outside the repo; the runbook documents, the console action is operator-side. Verified at drill time and re-checked by DEV3-026 §7.4/7.5 sign-off.
- **CI scheduling (D-002):** daily/scheduled `restore-verify` needs CI secrets for a scratch Postgres — deliberate post-launch infra work; the scripts were designed (manifest/report artifacts) so the CI job is a thin wrapper.
- **Off-site upload (D-003):** run-directory layout is uploader-ready; adding an S3/GCS push step requires credential provisioning outside repo scope.

## Escalation Row (reserved)

If the Phase-8 review disputes the specs §Journeys N/A ruling, a row `D-004 journey test for ops flow` is added here with target `test/workflows/ops/` before any test is written — never silently.
