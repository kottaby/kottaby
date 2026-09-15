#!/usr/bin/env bash
# Reset escrow-visual state: wipe sessions/wallets, restore student lanes.
# ONLY run while the server is STOPPED (pglite data dir is exclusive).
set -u
cd /home/z/my-project
bun run scripts/visual-loop/pglite-exec.ts "DELETE FROM session" \
  && bun run scripts/visual-loop/pglite-exec.ts "DELETE FROM session_request_idempotency" \
  && bun run scripts/visual-loop/pglite-exec.ts "DELETE FROM teacher_transaction" \
  && bun run scripts/visual-loop/pglite-exec.ts "DELETE FROM wallet" \
  && bun run scripts/visual-loop/pglite-exec.ts "UPDATE students SET balance_trial = 1, balance_hifz = 0, balance_tajweed = 0, balance_reviews = 0 WHERE id = 4" \
  && bun run scripts/visual-loop/pglite-sql.ts "SELECT (SELECT COUNT(*) FROM session) AS sessions, (SELECT COUNT(*) FROM wallet) AS wallets, (SELECT balance_trial FROM students WHERE id=4) AS trial"
