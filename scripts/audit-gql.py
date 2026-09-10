#!/usr/bin/env python3
"""GraphQL helper for cross-user verification.
Usage: gql.py <token_file> <query> [variables_json]
Prints raw JSON response.
"""
import json
import sys
import urllib.request

def main() -> int:
    token_file, query = sys.argv[1], sys.argv[2]
    variables = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    idem = sys.argv[4] if len(sys.argv) > 4 else None
    with open(token_file) as f:
        token = f.read().strip()
    payload = json.dumps({"query": query, "variables": variables}).encode()
    headers = {"content-type": "application/json", "authorization": f"Bearer {token}"}
    if idem:
        headers["x-idempotency-key"] = idem
    req = urllib.request.Request(
        "http://localhost:3000/api/graphql",
        data=payload,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            print(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()[:500]}")
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
