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
