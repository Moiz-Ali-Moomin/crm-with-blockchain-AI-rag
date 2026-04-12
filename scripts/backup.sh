#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CRM Manual Backup Script
#
# Usage:
#   ./scripts/backup.sh              — backup all services
#   ./scripts/backup.sh postgres     — backup Postgres only
#   ./scripts/backup.sh mongo        — backup MongoDB only
#
# Restoring Postgres:
#   gunzip -c backups/postgres/crm_TIMESTAMP.sql.gz | \
#     docker exec -i crm_postgres psql -U $POSTGRES_USER $POSTGRES_DB
#
# Restoring MongoDB:
#   docker exec crm_mongodb mongorestore \
#     --username $MONGO_USER --password $MONGO_PASSWORD \
#     --authenticationDatabase admin \
#     --gzip --archive=/tmp/crm_TIMESTAMP.archive
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Load env vars from .env in project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$ROOT_DIR/backups"
PG_DIR="$BACKUP_DIR/postgres"
MONGO_DIR="$BACKUP_DIR/mongo"
KEEP_DAYS=${BACKUP_KEEP_DAYS:-7}

mkdir -p "$PG_DIR" "$MONGO_DIR"

backup_postgres() {
  echo "[$(date -u +%FT%TZ)] Backing up Postgres..."
  docker exec crm_postgres \
    pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
    | gzip > "$PG_DIR/crm_${TIMESTAMP}.sql.gz"
  echo "[$(date -u +%FT%TZ)] Postgres backup → $PG_DIR/crm_${TIMESTAMP}.sql.gz"
  # Prune old backups
  find "$PG_DIR" -name "*.sql.gz" -mtime +"$KEEP_DAYS" -delete
}

backup_mongo() {
  echo "[$(date -u +%FT%TZ)] Backing up MongoDB..."
  docker exec crm_mongodb \
    mongodump \
      --username "${MONGO_USER}" \
      --password "${MONGO_PASSWORD}" \
      --authenticationDatabase admin \
      --db crm_logs \
      --gzip \
      --archive \
    > "$MONGO_DIR/crm_${TIMESTAMP}.archive"
  echo "[$(date -u +%FT%TZ)] MongoDB backup → $MONGO_DIR/crm_${TIMESTAMP}.archive"
  # Prune old backups
  find "$MONGO_DIR" -name "*.archive" -mtime +"$KEEP_DAYS" -delete
}

TARGET="${1:-all}"

case "$TARGET" in
  postgres) backup_postgres ;;
  mongo)    backup_mongo ;;
  all)
    backup_postgres
    backup_mongo
    ;;
  *)
    echo "Unknown target: $TARGET. Use: postgres | mongo | all"
    exit 1
    ;;
esac

echo "[$(date -u +%FT%TZ)] Backup complete."
