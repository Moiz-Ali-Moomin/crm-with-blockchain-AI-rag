#!/usr/bin/env bash
# health-check.sh <container_name> <max_attempts> <sleep_seconds>
#
# Polls the health endpoint on the idle slot by running wget inside the
# container. Uses docker exec so no host port binding is required — the
# app containers use `expose` only (not `ports`), keeping them off the
# host network for security.
#
# WHY docker exec: hitting 127.0.0.1:<port> from the host would require
# the container to bind a port, which exposes it to the host network.
# docker exec runs inside the container's network namespace, so it hits
# the app directly on its internal port.

set -euo pipefail

CONTAINER="${1:?Usage: health-check.sh <container_name> <max_attempts> <sleep_seconds>}"
MAX="${2:-60}"
SLEEP="${3:-5}"

echo "  Health check: docker exec ${CONTAINER} wget /api/v1/health/live"
echo "  Max attempts: $MAX, interval: ${SLEEP}s"

for i in $(seq 1 "$MAX"); do
  # wget -q --spider exits 0 on HTTP 2xx, non-zero otherwise.
  # Works on both busybox wget (Alpine) and GNU wget.
  if docker exec "$CONTAINER" \
      wget -q --spider --timeout=5 \
      "http://127.0.0.1:3001/api/v1/health/live" 2>/dev/null; then
    echo "  ✅ Healthy (attempt $i/$MAX)"
    exit 0
  fi

  echo "  ⏳ Attempt $i/$MAX — not ready — retrying in ${SLEEP}s..."
  sleep "$SLEEP"
done

echo "  ❌ Health check timed out after $((MAX * SLEEP))s"
exit 1
