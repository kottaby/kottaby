# Draft Academy — Planning & Delivery Index

> **Source of truth:** `docs/specs/`, `backend/db/schema/`, `docs/scenarios/user-story-map.md`
> **Mission:** 3-developer engineering management & production delivery plan

---

## 📂 Planning Hierarchy

```
docs/planning/
├── README.md                  ← You are here
├── ROADMAP.md                 — Milestones M0–M4, Gantt chart, critical path, release gates
├── TEAM_ALLOCATION.md         — Dev 1/2/3 stream ownership, interface contracts, branching
├── MILESTONE_PLAN.md             — Milestone 0–4 breakdown, capacity, DoD, dependency matrix
├── TICKETS.md                 — 69 tracer-bullet tickets with acceptance criteria
└── PRODUCTION_READINESS.md    — Security, financial safety, launch checklist
```

---

## 📋 Document Guide

| Document | Purpose | Key Contents |
|---|---|---|
| **[ROADMAP.md](ROADMAP.md)** | Milestone-level delivery plan | 5 milestones (M0–M4), Mermaid Gantt chart, critical path, release gates, risk register |
| **[TEAM_ALLOCATION.md](TEAM_ALLOCATION.md)** | Team structure & ownership | 3 vertical streams, 6 cross-stream interface contracts, branching strategy, PR review protocol, RACI matrix |
| **[MILESTONE_PLAN.md](MILESTONE_PLAN.md)** | Milestone-by-milestone execution plan | 5 milestones (S0–S4), milestone backlogs, story points, DoD, dependency graphs, velocity tracking |
| **[TICKETS.md](TICKETS.md)** | Granular work items | 69 tracer-bullet tickets, Fibonacci story points, Gherkin acceptance criteria, test scenarios, decision traceability |
| **[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)** | Launch gate criteria | Data integrity, financial safeguards, real-time reliability, security, state machine invariants, 33-decision verification, sign-off |

---

## 👥 The 3-Developer Vertical Streams

| Stream | Developer | Domain | Milestone 0 | Milestone 1 | Milestone 2 | Milestone 3 | Milestone 4 |
|---|---|---|---|---|---|---|---|
| **Student & Parent Experience** | Dev 1 | Registration, subscriptions, quotas, parent portal, curriculum | Schema, registration, recitation, trial | Plans, subscriptions, balances, expiry | Tajweed curriculum, progress | Parent handshake, monitoring portal | E2E integration tests |
| **Teacher Lifecycle & Certification** | Dev 2 | Applicants, evaluation loop, cooldown, availability, reports, homework | Auth, RBAC, shared types | Applicant registration, 5-session loop, scoring, cooldown | Availability, in-session lock, reports, homework | Student ratings, re-evaluation, academic tracking | Security hardening, invariant tests |
| **Matching, Escrow & Admin** | Dev 3 | Matching, notifications, escrow, wallet, admin governance, audit | CI/CD, error handling, API gateway | Session lifecycle, state machine, report infra | Matching algorithm, notifications, dual-confirmation, escrow, wallet | Admin CRUD, audit logs, cold-start, direct onboarding, disputes | Load testing, DR, financial safety, launch |

---

## 🗺️ Milestone Summary

| Milestone | Milestone | Theme | Release Gate |
|---|---|---|---|
| **M0** | Milestone 0 | Foundation: schema, auth, CI/CD | Schema validates, auth works, CI/CD green |
| **M1** | Milestone 1 | Core Domain MVP: subscriptions, verification, sessions | Student subscribes & books; applicant completes evaluation |
| **M2** | Milestone 2 | Matching, notifications, escrow | Student browses, requests, completes with escrow; notifications fire |
| **M3** | Milestone 3 | Parent portal, admin governance | Parent links & monitors; admin governs with audit logging |
| **M4** | Milestone 4 | Integration, security, launch | All production readiness criteria met |

---

## 📊 Key Metrics

| Metric | Value |
|---|---|
| Total milestones | 5 (Milestone 0–4) |
| Milestone cadence | 2 weeks |
| Total duration | 10 weeks |
| Total tickets | 69 |
| Total story points | 292 |
| Developers | 3 |
| Vertical streams | 3 |
| Cross-stream interface contracts | 6 |
| Resolved decisions incorporated | 33/33 (100%) |
| Database tables | 22 |
| Database enums | 13 |
| State machine invariants | 50+ |
| Production readiness criteria | 80+ |

---

## ✅ Decision Coverage

All 33 resolved decisions from `docs/specs/open-decisions-and-gaps.md` are incorporated:

| Category | Count | Status |
|---|---|---|
| Schema Gaps (A.1–A.10) | 10 | ✅ All incorporated |
| Business Rules (B.1–B.18) | 18 | ✅ All incorporated |
| Cross-Cutting (C.1–C.5) | 5 | ✅ All incorporated |
| **Total** | **33** | **✅ 100% Covered** |

See the [Decision Coverage table in TICKETS.md](TICKETS.md#decision-coverage) for the full mapping of each decision to its primary ticket(s).

---

## 🔄 Validation Requirements

| Artifact | Validator | Command |
|---|---|---|
| `docs/planning/ROADMAP.md` (Gantt chart) | Mermaid | `bun run scripts/validation/validate-mermaid.ts docs/planning/ROADMAP.md` |
| `docs/planning/MILESTONE_PLAN.md` (dependency graphs) | Mermaid | `bun run scripts/validation/validate-mermaid.ts docs/planning/MILESTONE_PLAN.md` |
| All other `.mmd` / `.md` files with Mermaid | Mermaid | `bun run scripts/validation/validate-mermaid.ts <file>` |

---

## 🔗 Cross-References

| Source | Reference |
|---|---|
| `docs/specs/open-decisions-and-gaps.md` | 33 resolved decisions — ground truth for all planning |
| `docs/specs/functional-requirements.md` | 11 FR categories — mapped to tickets |
| `docs/specs/state-machine-invariants.md` | 10 state machines — acceptance criteria source |
| `docs/scenarios/user-story-map.md` | 9 activities, 60+ tasks — ticket breakdown source |
| `backend/db/schema/` | Drizzle schema — schema ground truth |
| `docs/domain/GLOSSARY.md` | Ubiquitous language — ticket vocabulary |
| `docs/architecture/` | C4 diagrams — system architecture reference |
| `docs/workflows/` | Workflow sequence diagrams — process reference |

---

## 📖 How to Use This Planning Suite

1. **Start with ROADMAP.md** — understand the milestone-level plan, critical path, and release gates.
2. **Review TEAM_ALLOCATION.md** — understand which developer owns which domain and the interface contracts between streams.
3. **Dive into MILESTONE_PLAN.md** — see the milestone-by-milestone breakdown with story points and dependencies.
4. **Work tickets from TICKETS.md** — each ticket is a tracer-bullet vertical slice with acceptance criteria and test scenarios.
5. **Check PRODUCTION_READINESS.md** — verify all launch criteria before going live.

### Working a Ticket

1. Find a ticket with all blockers completed (the "frontier")
2. Read the acceptance criteria and test scenarios
3. Implement the vertical slice (schema → API → UI → tests)
4. Verify all acceptance criteria pass
5. Create a PR targeting `develop`
6. Get cross-stream review if the ticket touches an interface contract
7. Merge when CI is green and review is approved

---

## 🎯 Milestone Goals at a Glance

| Milestone | Goal | Key Deliverable |
|---|---|---|
| **Milestone 0** | Foundation | Schema migrated, auth working, CI/CD green |
| **Milestone 1** | Core Domain MVP | Student subscribes & books; applicant completes evaluation loop |
| **Milestone 2** | Matching & Escrow | Student browses, requests, completes with escrow; notifications fire |
| **Milestone 3** | Parent & Admin | Parent links & monitors child; admin governs with audit logging |
| **Milestone 4** | Integration & Launch | All E2E tests pass, security hardened, production launch approved |
