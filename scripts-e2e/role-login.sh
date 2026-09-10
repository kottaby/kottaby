#!/usr/bin/env bash
# Switch the agent-browser session to a given role by performing a real
# GraphQL login with curl and installing ALL Set-Cookie values (incl. httpOnly)
# into the browser after clearing existing cookies.
# Usage: role-login.sh <admin|student|teacher|parent>
set -eu
ROLE="$1"
K=/home/z/my-project/kottaby
case "$ROLE" in
  admin)   EMAIL="admin@app.local";       PASS="adminpassword123" ;;
  student) EMAIL="student@demo.local";    PASS="Password123!" ;;
  teacher) EMAIL="teacher@demo.local";    PASS="Password123!" ;;
  parent)  EMAIL="parent@demo.local";     PASS="Password123!" ;;
  *) echo "unknown role: $ROLE"; exit 1 ;;
esac

JAR=$(mktemp)
RESP=$(curl -s -c "$JAR" -X POST http://127.0.0.1:3000/api/graphql \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { login(email: \\\"$EMAIL\\\", password: \\\"$PASS\\\") { accessToken refreshToken } }\"}" \
  --max-time 60)

echo "$RESP" | grep -q '"accessToken"' || { echo "LOGIN FAILED: $RESP" | head -c 300; exit 1; }

agent-browser cookies clear > /dev/null 2>&1 || true

# Install every cookie the server set (refresh_token, session_id, ...)
python3 - "$JAR" << 'PYEOF'
import http.cookiejar, sys, subprocess
jar = http.cookiejar.MozillaCookieJar(sys.argv[1])
jar.load(ignore_discard=True, ignore_expires=True)
cookies = list(jar)
if not cookies:
    # `curl -c` writes a valid header-only jar even when the response set NO
    # cookies — a login that authenticates without a session cookie must be
    # treated as a failure, otherwise the capture proceeds unauthenticated.
    raise RuntimeError("Login succeeded but no authentication cookies were returned")
for c in cookies:
    try:
        subprocess.run([
            "agent-browser", "cookies", "set", c.name, c.value,
            "--domain", c.domain.lstrip("."), "--path", c.path or "/",
        ], capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        if e.stderr:
            print(e.stderr.strip(), file=sys.stderr)
        raise
    print(f"  cookie set: {c.name}")
PYEOF

echo "$ROLE session ready"
rm -f "$JAR"
