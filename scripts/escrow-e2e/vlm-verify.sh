#!/usr/bin/env bash
# VLM functional verification of escrow E2E screenshots via z-ai vision.
set -u
OUT=/home/z/my-project/download/escrow-e2e
PROMPT='You are verifying a cross-user escrow payment feature in an Arabic RTL Quran-teaching academy web app (MUI). This screenshot is one step of the flow: student books a session (fee escrowed), teacher starts+completes it, student confirms (teacher wallet credited), or a cancel refunds the held fee.
Answer in EXACTLY this format:
STEP-FACTS:
- logged_in_user: <name/email visible or unknown>
- session_state_badges: <list every status badge/chip visible in Arabic with translation>
- amounts_visible: <every EGP amount + label context>
- timestamps_visible: <list deadline/start/completion/ledger timestamps>
- notifications: <any notification text visible, verbatim + translation>
- cta_buttons: <visible action buttons>
- financial_conclusion: <one sentence: what this screenshot proves about the escrow/wallet state>
Do not invent anything not visible. If something is not visible, write "not visible".'

for shot in 01-student-a-sessions-after-booking.png 04-teacher-t-completed-awaiting-student.png 05-student-a-notification-confirm-prompt.png 07-teacher-t-wallet-credited.png 08-teacher2-isolated-empty.png 10-student-a-after-cancel-refund.png; do
  echo "=================================================="
  echo "### VLM: $shot"
  z-ai vision -p "$PROMPT" -i "$OUT/$shot" -o "/tmp/vlm-${shot%.png}.json" 2>/dev/null
  python3 -c "
import json
try:
    with open('/tmp/vlm-${shot%.png}.json') as f:
        print(json.load(f)['choices'][0]['message']['content'][:1600])
except Exception as e:
    print('VLM-ERROR:', e)
"
done
