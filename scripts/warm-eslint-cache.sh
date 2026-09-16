#!/bin/bash
# Warm .eslintcache-type-aware in directory slices.
#
# WHY: a cold full-repo `bun run lint:type-aware` peaks at ~3.0-3.1GB ESLint RSS.
# On a 4GiB cgroup (no swap) the kernel OOM-killer SIGKILLs the ESLint child
# (see scripts/lint-service-config.ts adaptive-sizing notes). Slicing the file
# list keeps each run under the OOM line while writing entries to the SAME
# shared cache location (`.eslintcache-type-aware`), so a subsequent full-repo
# run (e.g. `bun quality-gate`) cache-hits every file and stays well under it.
#
# Ignored files (generated/**, theme/**, stories/**, …) are excluded up-front:
# passed explicitly they emit "File ignored" warnings which fail
# --max-warnings=0 (type-aware mode) even though full-repo runs never see them.
#
# Usage:  bash scripts/warm-eslint-cache.sh <batch-index> [total-batches]
#         (batch index is 0-based; default total is 8)
set -u
cd "$(dirname "$0")/.."

BATCH=${1:?batch index (0-based) required}
TOTAL=${2:-8}
LIST=/tmp/lint-files-all.txt

if [ ! -f "$LIST" ]; then
  git ls-files "*.ts" "*.tsx" | grep -vE "graphql/generated/|next-env\.d\.ts|frontend/providers/theme/|frontend/stories/|AppDataGrid\.tsx|frontend/styles\.d\.ts|frontend/types/apollo-client\.d\.ts" > "$LIST"
fi

SLICE=$(( $(wc -l < "$LIST") / TOTAL + 1 ))
START=$(( BATCH * SLICE + 1 ))
END=$(( (BATCH + 1) * SLICE ))

ARGS=()
while IFS= read -r f; do
  ARGS+=("-f" "$f")
done < <(sed -n "${START},${END}p" "$LIST")

echo "=== warm batch $BATCH/$TOTAL: lines $START-$END ==="
LINT_MAX_OLD_SPACE_MB=2867 LINT_QUEUE_CONCURRENCY=1 GOMAXPROCS=1 GOGC=25 \
  bun run scripts/lint-service.ts --type-aware "${ARGS[@]}"
STATUS=$?
echo "=== warm batch $BATCH EXIT=$STATUS ==="
exit $STATUS
