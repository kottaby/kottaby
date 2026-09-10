#!/usr/bin/env bash
# Round-based full capture across all implemented pages, per role.
# Usage: ui-capture-all.sh <round-number>
set -u
ROUND="${1:-1}"
OUT=/home/z/my-project/download/ui-audit/round$ROUND
mkdir -p "$OUT"
export OUT
K=/home/z/my-project/kottaby

capture() {
  local path="$1" slug="$2" waits="${3:-2}"
  bash "$K/scripts-e2e/ui-capture.sh" "$path" "round$ROUND/$slug" "$waits"
}

echo "=== ROUND $ROUND — PUBLIC (no auth) ==="
agent-browser close > /dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/" > /dev/null 2>&1
sleep 3
capture "/" "01-landing" 2
capture "/login" "02-login" 1
capture "/register" "03-register" 2

echo "=== ROUND $ROUND — ADMIN ==="
cd "$K" && AGENT_BROWSER_SESSION=default bun run scripts/browser-login.ts --env-file .env.audit-admin --inject --base-url http://127.0.0.1:3000 > /dev/null 2>&1 && echo "admin logged in" || { echo "admin LOGIN FAILED"; exit 1; }
capture "/dashboard" "04-dashboard-admin" 3
capture "/admin/dashboard" "05-admin-dashboard" 3
capture "/admin/users" "06-admin-users" 3
capture "/admin/users/3" "07-admin-user-detail" 3
capture "/admin/plans" "08-admin-plans" 3
capture "/admin/analytics" "09-admin-analytics" 3
capture "/admin/broadcasts" "10-admin-broadcasts" 3
capture "/audit" "11-audit" 3
capture "/notifications" "12-notifications-admin" 2
capture "/profile" "13-profile-admin" 2

echo "=== ROUND $ROUND — STUDENT ==="
agent-browser close > /dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/login" > /dev/null 2>&1
cd "$K" && bun run scripts/browser-login.ts --env-file .env.audit-student --inject --base-url http://127.0.0.1:3000 > /dev/null 2>&1 && echo "student logged in" || { echo "student LOGIN FAILED"; exit 1; }
capture "/dashboard" "14-dashboard-student" 3
capture "/student/dashboard" "15-student-dashboard" 3
capture "/student/sessions" "16-student-sessions" 3
capture "/student/link-requests" "17-student-link-requests" 3
capture "/students" "18-students" 3
capture "/notifications" "19-notifications-student" 2
capture "/profile" "20-profile-student" 2

echo "=== ROUND $ROUND — TEACHER ==="
agent-browser close > /dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/login" > /dev/null 2>&1
cd "$K" && bun run scripts/browser-login.ts --env-file .env.audit-teacher --inject --base-url http://127.0.0.1:3000 > /dev/null 2>&1 && echo "teacher logged in" || { echo "teacher LOGIN FAILED"; exit 1; }
capture "/dashboard" "21-dashboard-teacher" 3
capture "/teacher/dashboard" "22-teacher-dashboard" 3
capture "/teacher/sessions" "23-teacher-sessions" 3
capture "/teachers" "24-teachers" 3
capture "/wallet" "25-wallet" 3
capture "/disputes" "26-disputes" 3

echo "=== ROUND $ROUND — PARENT ==="
agent-browser close > /dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/login" > /dev/null 2>&1
cd "$K" && bun run scripts/browser-login.ts --env-file .env.audit-parent --inject --base-url http://127.0.0.1:3000 > /dev/null 2>&1 && echo "parent logged in" || { echo "parent LOGIN FAILED"; exit 1; }
capture "/dashboard" "27-dashboard-parent" 3
capture "/parent/dashboard" "28-parent-dashboard" 3
capture "/parent/children" "29-parent-children" 3
capture "/parent/handshake" "30-parent-handshake" 3

echo "=== ROUND $ROUND DONE ==="
ls "$OUT" | wc -l
