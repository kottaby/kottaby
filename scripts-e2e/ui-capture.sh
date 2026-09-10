#!/usr/bin/env bash
# UI-audit capture: screenshot one page at three viewports.
# Usage: ui-capture.sh <url-path> <slug> [waits]
set -u
OUT=/home/z/my-project/download/ui-audit
URL="http://127.0.0.1:3000$1"
SLUG="$2"
W="${3:-2}"
FAILS=0

for vp in "390 844 mobile" "768 1024 tablet" "1440 900 desktop"; do
  set -- $vp
  W_PX="$1"; H_PX="$2"; LABEL="$3"
  agent-browser set viewport "$W_PX" "$H_PX" > /dev/null 2>&1
  agent-browser open "$URL" > /dev/null 2>&1
  agent-browser wait --load networkidle --timeout 45000 > /dev/null 2>&1
  sleep "$W"
  agent-browser screenshot "$OUT/${SLUG}-${LABEL}.png" > /dev/null 2>&1 \
    && echo "  OK  ${SLUG}-${LABEL}" \
    || { echo "  FAIL ${SLUG}-${LABEL}"; FAILS=$((FAILS + 1)); }
done

if [ "$FAILS" -gt 0 ]; then
  echo "$FAILS capture(s) failed for $SLUG"
  exit 1
fi
