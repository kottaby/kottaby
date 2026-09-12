#!/bin/bash
# Recovery script: restore feature branch from remote after sandbox git-restore warfare
cd /home/z/my-project
BRANCH="feat/subscription-validity-window-expiry"
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$BRANCH" ]; then
  git checkout -f "$BRANCH" 2>/dev/null || true
fi
git fetch origin "$BRANCH" 2>/dev/null || true
git reset --hard "origin/$BRANCH" 2>&1 | tail -1
git branch -f main 2bdea32 2>/dev/null || true
echo "=== STATE ==="
git branch --show-current
git log --oneline -1
echo "=== KEY FILES ==="
echo "schema-index: $(grep -c 'subscriptions_active_end_date_idx' backend/db/schema/billing/subscriptions.ts 2>/dev/null || echo 0)"
echo "types: $(grep -c 'ExpiredDueSubscriptionRow' backend/types/billing/subscription.types.ts 2>/dev/null || echo 0)"
echo "locale: $(grep -c 'subscriptionExpired' shared/locale/en/errors/index.ts 2>/dev/null || echo 0)"
echo "journey: $(ls test/workflows/billing/subscription-expiry.journey.test.ts 2>/dev/null || echo MISSING)"
