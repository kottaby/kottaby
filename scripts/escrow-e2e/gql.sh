#!/usr/bin/env bash
# Cross-user escrow E2E — GraphQL call helper (acts as a named actor).
# Usage: gql.sh <session> <mutation-or-query-json-payload-file-or-stdin>
# Reads the Bearer token saved by escrow-login.sh for that session.
set -eu
SESSION="$1"; PAYLOAD="$2"
K=/home/z/my-project
TOKEN=$(cat "$K/scripts/escrow-e2e/.token-${SESSION}")
EXTRA=()
# createSession requires an idempotency key header; harmless elsewhere.
if [ -n "${IDEMPOTENCY_KEY:-}" ]; then EXTRA=(-H "X-Idempotency-Key: $IDEMPOTENCY_KEY"); fi
curl -s -X POST http://127.0.0.1:3000/api/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${EXTRA[@]}" \
  -d @"$PAYLOAD" --max-time 60
