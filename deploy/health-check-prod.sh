#!/usr/bin/env bash
# health-check-prod.sh <max_attempts> <sleep_seconds>
#
# Validates the PUBLIC HTTPS endpoint after traffic cutover.
# Also checks the /api/v1/health/ready endpoint which verifies DB connectivity.
# A "live" check (is the process up?) is not enough post-cutover —
# we need "ready" (can it actually serve requests with full dependencies?).

set -euo pipefail

MAX="${1:-30}"
SLEEP="${2:-5}"
HOST="${PROD_HOST:-https://bestpurchasestore.com}"

echo "  Prod health check: $HOST/api/v1/health/ready"

for i in $(seq 1 "$MAX"); do
  STATUS=$(curl -sf --max-time 10 \
    -o /dev/null \
    -w "%{http_code}" \
    "${HOST}/api/v1/health/ready" 2>/dev/null || echo "000")

  if [ "$STATUS" = "200" ]; then
    echo "  ✅ Production endpoint healthy (attempt $i/$MAX)"
    exit 0
  fi

  echo "  ⏳ Attempt $i/$MAX — HTTP $STATUS — retrying in ${SLEEP}s..."
  sleep "$SLEEP"
done

echo "  ❌ Production health check failed after $((MAX * SLEEP))s"
exit 1
