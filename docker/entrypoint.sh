#!/bin/sh
# Container entrypoint: wait for Postgres by retrying the migration, optionally
# seed, then start the API. Idempotent — safe to restart.
set -e

echo "==> Applying migrations (retries until the database is reachable)..."
ATTEMPTS=0
until tsx scripts/migrate.ts; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "!! Database not reachable after $ATTEMPTS attempts — giving up."
    exit 1
  fi
  echo "   database not ready, retry $ATTEMPTS/30..."
  sleep 2
done

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "==> Seeding baseline data (idempotent)..."
  tsx scripts/seed.ts || echo "   seed skipped/failed (continuing)."
fi

echo "==> Starting Meeting Room Booking API on ${HOST:-0.0.0.0}:${PORT:-3000}"
exec tsx src/index.ts
