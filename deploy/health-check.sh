#!/usr/bin/env bash
# health-check.sh <internal_port> <max_attempts> <sleep_seconds>
#
# Polls the health endpoint on the idle slot's INTERNAL port.
# This runs before traffic is shifted, so it uses the container's
# direct port (not the public HTTPS endpoint).
#
# WHY internal port: we want to verify the NEW container is healthy,
# not the currently-live slot which is already serving traffic.

set -euo pipefail

PORT="${1:?Usage: health-check.sh <port> <max_attempts> <sleep_seconds>}"
MAX="${2:-60}"
SLEEP="${3:-5}"

echo "  Health check: http://127.0.0.1:${PORT}/api/v1/health/live"
echo "  Max attempts: $MAX, interval: ${SLEEP}s"

for i in $(seq 1 "$MAX"); do
  STATUS=$(curl -sf --max-time 5 \
    -o /dev/null \
    -w "%{http_code}" \
    "http://127.0.0.1:${PORT}/api/v1/health/live" 2>/dev/null || echo "000")

  if [ "$STATUS" = "200" ]; then
    echo "  ✅ Healthy (attempt $i/$MAX)"
    exit 0
  fi

  echo "  ⏳ Attempt $i/$MAX — HTTP $STATUS — retrying in ${SLEEP}s..."
  sleep "$SLEEP"
done

echo "  ❌ Health check timed out after $((MAX * SLEEP))s"
exit 1
