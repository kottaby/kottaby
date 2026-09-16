#!/usr/bin/env bash
# Cross-user escrow E2E — login helper.
# Performs a real GraphQL login with curl and installs ALL Set-Cookie values
# (incl. httpOnly) into the given named agent-browser session.
# Usage: escrow-login.sh <email> <password> <agent-browser-session>
set -u
EMAIL="$1"; PASS="$2"; SESSION="$3"
K=/home/z/my-project
mkdir -p "$K/download/escrow-e2e"

JAR=$(mktemp)
# JSON-encode the credentials so quotes/backslashes in email or password
# cannot break the outer JSON body or the GraphQL string literals.
PAYLOAD=$(python3 -c '
import json, os
query = "mutation { login(email: " + json.dumps(os.environ["LOGIN_EMAIL"]) + ", password: " + json.dumps(os.environ["LOGIN_PASS"]) + ") { accessToken refreshToken } }"
print(json.dumps({"query": query}))
')
RESP=$(LOGIN_EMAIL="$EMAIL" LOGIN_PASS="$PASS" curl -s -c "$JAR" -X POST http://127.0.0.1:3000/api/graphql \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --max-time 60) || true

if [ -z "$RESP" ]; then echo "LOGIN FAILED: empty response (server down?)"; exit 1; fi
echo "$RESP" | grep -q '"accessToken"' || { echo "LOGIN FAILED: $RESP" | head -c 400; exit 1; }
ACCESS=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['login']['accessToken'])")
echo "$ACCESS" > "$K/scripts/escrow-e2e/.token-${SESSION}"

agent-browser --session "$SESSION" cookies clear > /dev/null 2>&1 || true

python3 - "$JAR" "$SESSION" << 'PYEOF'
import http.cookiejar, sys, subprocess
jar = http.cookiejar.MozillaCookieJar(sys.argv[1])
jar.load(ignore_discard=True, ignore_expires=True)
cookies = list(jar)
if not cookies:
    raise RuntimeError("Login succeeded but no authentication cookies were returned")
for c in cookies:
    subprocess.run([
        "agent-browser", "--session", sys.argv[2], "cookies", "set", c.name, c.value,
        "--domain", c.domain.lstrip("."), "--path", c.path or "/",
    ], capture_output=True, text=True, check=True)
    print(f"  cookie set: {c.name} -> session {sys.argv[2]}")
PYEOF

echo "$EMAIL logged in (session: $SESSION)"
rm -f "$JAR"
