#!/usr/bin/env bash
# PostgreSQL startup script for sandbox env (extracted binaries)
# Idempotent: starts the cluster if down, no-op if up
set -e
PG_BIN=/tmp/pg/extracted/usr/lib/postgresql/17/bin
PG_LIB=/tmp/pg/extracted/usr/lib/postgresql/17/lib
PG_LIB_EXEC=/tmp/pg/extracted/usr/lib/x86_64-linux-gnu
export LD_LIBRARY_PATH="$PG_LIB:$PG_LIB_EXEC:$LD_LIBRARY_PATH"

# Init the cluster if missing
if [ ! -f /tmp/pgdata/PG_VERSION ]; then
  mkdir -p /tmp/pgdata
  $PG_BIN/initdb -D /tmp/pgdata --username=postgres --auth=trust >/tmp/pg-init.log 2>&1
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "port = 5432"
    echo "unix_socket_directories = '/tmp'"
    echo "max_connections = 100"
  } >> /tmp/pgdata/postgresql.conf
fi

# Start if not already running
if ! $PG_BIN/pg_ctl -D /tmp/pgdata status >/dev/null 2>&1; then
  $PG_BIN/pg_ctl -D /tmp/pgdata -l /tmp/pg.log -w start
fi

# Wait for ready
for i in $(seq 1 30); do
  if $PG_BIN/pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Create sandbox role 'z' if missing (bun processes run as user z)
$PG_BIN/psql -h 127.0.0.1 -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='z'" | grep -q 1 || \
  $PG_BIN/psql -h 127.0.0.1 -U postgres -c "CREATE ROLE z SUPERUSER LOGIN" >/dev/null

# Create kottaby_db if missing (owned by z so drizzle push works without role errors)
$PG_BIN/psql -h 127.0.0.1 -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='kottaby_db'" | grep -q 1 || \
  $PG_BIN/createdb -h 127.0.0.1 -U postgres -O z kottaby_db

echo "postgres ready on 127.0.0.1:5432, db=kottaby_db (owner=z)"
