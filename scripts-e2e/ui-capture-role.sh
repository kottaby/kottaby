#!/usr/bin/env bash
# Foreground chunk capture for one role.
# Usage: ui-capture-role.sh <round> <role> [pages...]
# pages format: path:slug:waits
set -u
ROUND="$1"; ROLE="$2"; shift 2
OUT=/home/z/my-project/download/ui-audit/round$ROUND
mkdir -p "$OUT"
K=/home/z/my-project/kottaby

echo "=== login $ROLE ==="
agent-browser close > /dev/null 2>&1
agent-browser open "http://127.0.0.1:3000/login" > /dev/null 2>&1
sleep 2
cd "$K"
bash scripts-e2e/role-login.sh "$ROLE" || echo "$ROLE LOGIN FAILED"

for spec in "$@"; do
  IFS=':' read -r path slug waits <<< "$spec"
  waits="${waits:-3}"
  for vp in "390 844 mobile" "768 1024 tablet" "1440 900 desktop"; do
    set -- $vp
    agent-browser set viewport "$1" "$2" > /dev/null 2>&1
    agent-browser open "http://127.0.0.1:3000$path" > /dev/null 2>&1
    agent-browser wait --load networkidle --timeout 20000 > /dev/null 2>&1
    sleep "$waits"
    agent-browser screenshot "$OUT/$slug-$3.png" > /dev/null 2>&1 \
      && echo "  OK  $slug-$3" || echo "  FAIL $slug-$3"
  done
done
echo "=== chunk done ==="
