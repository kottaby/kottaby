#!/usr/bin/env bash
# Phase 7 — prototype-vs-implementation comparisons (structure only).
# z-ai vision with EXACTLY two images: prototype first, implementation second.
set -u
cd /home/z/my-project
P=ai/plans/sprint_2/fee_escrow_and_teacher_wallet_crediting-crediting/prototype
S=scratch/screenshots
OUT=scratch/screenshots/comparisons
mkdir -p "$OUT"

CONTRACT='You are a prototype-comparison inspector. You will see EXACTLY TWO images in order: (1) the PROTOTYPE mockup, (2) the IMPLEMENTATION screenshot. Compare STRUCTURE ONLY - layout, hierarchy, density, control choices, content coverage. NEVER compare colors (prototypes use arbitrary Tailwind values). Prototype content is FAKE - never treat its names/amounts as facts. The implementation is judged on ITS SPEC SCOPE: richer prototype ideas beyond the implemented scope are recorded as user-decision candidates, never counted as implementation defects. Output EXACTLY:
=== <proto> vs <impl> ===
Prototype structure: 3-6 bullets
Implementation structure: 3-6 bullets
Better: PROTOTYPE | IMPLEMENTATION | TIE
Why: 2-4 sentences grounded in what was seen
Previously missing, now present: <list or none>
Still missing vs prototype: <list or none>
Score impl structure 0-10 + "what a 10 needs"'

compare() { # <proto-file> <impl-file> <title> <scope>
  local NAME="${1%.png}"
  [ -s "$OUT/$NAME.txt" ] && { echo "SKIP $1"; return 0; }
  z-ai vision -p "$CONTRACT

Comparison: $3
Implementation spec scope: $4" -i "$P/$1" -i "$S/$2" -o "/tmp/vlm-cmp-$NAME.json" >/dev/null 2>&1
  python3 -c "
import json
try:
    d=json.load(open('/tmp/vlm-cmp-$NAME.json'))
    c=d['choices'][0]['message']['content'] if isinstance(d,dict) and 'choices' in d else str(d)
    open('$OUT/$NAME.txt','w').write('=== $1 vs $2 ===\n'+c)
    print(c[:180].replace(chr(10),' | '))
except Exception as e:
    print('VLM ERROR $1:', e)
"
}

compare "teacher-wallet-summary-default-desktop.png" "06-wallet-credited-desktop.png" "Teacher Wallet summary (balance card, withdraw CTA, earning ledger rows)" "Teacher self-service wallet: balance card (verbatim decimal string + currency), request-withdrawal CTA (withdrawal dialog belongs to another ticket), transaction ledger list with type avatar, signed amount, status chip, description-date line"
compare "teacher-wallet-ledger-empty-desktop.png" "04-wallet-empty-desktop.png" "Teacher Wallet EMPTY state (zero balance, empty ledger, disabled withdraw CTA in prototype)" "Wallet lazy-ensure: fresh teacher sees zero balance, empty ledger list, enabled-with-dialog withdraw CTA (disable-at-zero is a product decision recorded by the loop)"
compare "teacher-wallet-default-mobile.png" "06-wallet-credited-mobile.png" "Teacher Wallet mobile (hero balance card, withdraw button, compact earning rows)" "Same wallet scope at mobile 390px: balance card, withdraw CTA, compact ledger rows"
compare "admin-dispute-queue-default-desktop.png" "08-admin-governance-desktop.png" "Admin Session Governance (filter bar, session directory with escrow states, dispute queue emphasis)" "Admin session-governance directory: filter bar (status select/search), paginated directory over ALL sessions with lifecycle + escrow state columns; dispute RESOLUTION flows live in row actions"
compare "teacher-sessions-escrow-badges-default-desktop.png" "03-teacher-escrow-desktop.png" "Teacher Sessions page with escrow badges on session rows" "Teacher sessions list: rows with intent, status chip, fee (held escrow marker), deadline/created meta, confirm/decline lifecycle CTAs"
compare "student-confirm-settle-default-mobile.png" "05-student-completed-mobile.png" "Student confirm-settle state (mobile): awaiting confirmation + confirm CTA with consequence explainer" "Student session row in completed state: awaiting-student-confirmation pill, CONFIRM COMPLETION CTA whose consequence explainer is a hover/focus tooltip (confirming releases the held fee to the teacher); no modal by spec"

echo "COMPARISONS DONE"
