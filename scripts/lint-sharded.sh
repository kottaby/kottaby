#!/usr/bin/env bash
# Shard the full-repo type-aware ESLint run into directory batches so the
# peak RSS stays under the 4 GB sandbox budget (full-repo in one process
# gets OOM-killed). Results accumulate in the shared .eslintcache-type-aware
# so the final quality-gate full-repo pass goes cache-warm and light.
set -u
cd /home/z/my-project

mapfile -t FILES < <(git ls-files '*.ts' '*.tsx' | grep -v -E '^(node_modules|\.next)' | grep -v 'frontend/graphql/generated/' | grep -v '\.d\.ts$')
TOTAL=${#FILES[@]}
echo "tracked ts/tsx files: $TOTAL"

BATCH=140
i=0
batch_files=()
fail=0
for f in "${FILES[@]}"; do
  batch_files+=("$f")
  if [ "${#batch_files[@]}" -ge "$BATCH" ]; then
    i=$((i+1))
    args=()
    for bf in "${batch_files[@]}"; do args+=(-f "$bf"); done
    echo "=== batch $i (${#batch_files[@]} files) ==="
    if ! bun run scripts/lint-service.ts --type-aware "${args[@]}" --id qg-shard > "/tmp/lint-shard-$i.log" 2>&1; then
      echo "BATCH $i FAILED:"; tail -30 "/tmp/lint-shard-$i.log"; fail=1; break
    fi
    tail -2 "/tmp/lint-shard-$i.log"
    batch_files=()
  fi
done
if [ "${#batch_files[@]}" -gt 0 ] && [ "$fail" -eq 0 ]; then
  i=$((i+1))
  args=()
  for bf in "${batch_files[@]}"; do args+=(-f "$bf"); done
  echo "=== batch $i (${#batch_files[@]} files, tail) ==="
  if ! bun run scripts/lint-service.ts --type-aware "${args[@]}" --id qg-shard > "/tmp/lint-shard-$i.log" 2>&1; then
    echo "BATCH $i FAILED:"; tail -30 "/tmp/lint-shard-$i.log"; fail=1
  else
    tail -2 "/tmp/lint-shard-$i.log"
  fi
fi
echo "SHARDS_DONE fail=$fail batches=$i"
exit $fail
