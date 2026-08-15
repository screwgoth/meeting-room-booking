#!/usr/bin/env bash
# app.sh — one-touch control for the Meeting Room Booking stack (app + database)
# in Docker. Wraps docker compose so you don't have to remember the flags.
#
#   ./app.sh start     Build (if needed) and start app + database in the background
#   ./app.sh stop      Stop and remove the containers (KEEPS the database volume)
#   ./app.sh restart   stop + start
#   ./app.sh purge      Stop and DELETE everything — containers, volumes, images
#   ./app.sh rebuild   Force a from-scratch image rebuild, then start
#   ./app.sh logs       Tail logs (Ctrl-C to stop following)
#   ./app.sh status     Show container + health status
#   ./app.sh seed       Re-run the idempotent DB seed inside the app container
#   ./app.sh psql       Open a psql shell into the database
set -euo pipefail

cd "$(dirname "$0")"

# --- Resolve the compose command (v2 plugin vs legacy binary) ----------------
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "ERROR: Docker Compose not found. Install Docker Desktop or the compose plugin." >&2
  exit 1
fi

APP_PORT="${APP_PORT:-3000}"

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

start() {
  echo "==> Building images (cached) and starting the stack..."
  "${COMPOSE[@]}" up -d --build
  echo
  echo "✅ Up. App:  http://localhost:${APP_PORT}"
  echo "   Seed logins → admin / admin1234   ·   alice / user1234"
  echo "   Follow logs: ./app.sh logs"
}

stop() {
  echo "==> Stopping the stack (database volume preserved)..."
  "${COMPOSE[@]}" down
  echo "✅ Stopped."
}

purge() {
  echo "!! This DELETES the database volume and locally-built images."
  printf "   Type 'purge' to confirm: "
  read -r confirm
  if [ "$confirm" != "purge" ]; then
    echo "Aborted."
    exit 1
  fi
  "${COMPOSE[@]}" down --volumes --rmi local --remove-orphans
  echo "✅ Purged. Next start is a clean slate."
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; start ;;
  rebuild) "${COMPOSE[@]}" build --no-cache && start ;;
  purge)   purge ;;
  logs)    "${COMPOSE[@]}" logs -f --tail=120 ;;
  status)  "${COMPOSE[@]}" ps ;;
  seed)    "${COMPOSE[@]}" exec app tsx scripts/seed.ts ;;
  psql)    "${COMPOSE[@]}" exec db psql -U mrb -d mrb ;;
  ""|-h|--help|help) usage 0 ;;
  *) echo "Unknown command: $1" >&2; usage 1 ;;
esac
