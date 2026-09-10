# View Tree Layer Rules

Layer-wide frontend rules (theme palette, MUI v9 discipline, React 19 patterns, i18n) live in `frontend/AGENTS.md` — read it before working in any view tree here.

- **Admin session-governance view tree** (`frontend/views/admin/session-governance/`): single component tree (Container/Chrome/Body/Row/StatusCell/Drawer/3 dialogs/Join) with eligibility-gated kebab actions per the state matrix, the compile-time i18n namespace `adminSessionGovernance` (en/ar, RTL-safe), and a hard `maxlength` mirror of the backend cancel-reason boundary cap — see `docs/admin/admin-session-governance.md`.
