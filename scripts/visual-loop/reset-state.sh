#!/usr/bin/env bash
# Reset escrow-visual state by RECREATING the PGlite database.
#
# Why not DELETE FROM: settlement (dual confirmation) inserts an immutable
# `teacher_transaction` row; the immutable-delete trigger rejects any later
# `DELETE FROM teacher_transaction` with `teacher_transaction is immutable`,
# so delete-based resets break on the second lifecycle run. Recreating the
# data dir is the only clean reset.
#
# ONLY run while the server is STOPPED (pglite data dir is exclusive).
set -u
cd /home/z/my-project

rm -rf db/pglite

bun --env-file=.env run scripts/visual-loop/pglite-bootstrap.ts migrate \
  && bun --env-file=.env run scripts/visual-loop/pglite-bootstrap.ts seed \
  && bun run scripts/visual-loop/pglite-sql.ts "SELECT (SELECT COUNT(*) FROM session) AS sessions, (SELECT COUNT(*) FROM wallet) AS wallets, (SELECT balance_trial FROM students WHERE id=4) AS trial"
