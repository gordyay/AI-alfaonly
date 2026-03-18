#!/usr/bin/env bash
set -euo pipefail

export APP_DB_PATH="${APP_DB_PATH:-app/data/e2e.sqlite3}"
export PORT="${PORT:-8000}"

rm -f "$APP_DB_PATH"
APP_DB_PATH="$APP_DB_PATH" python3 scripts/reset_db.py >/dev/null
APP_DB_PATH="$APP_DB_PATH" python3 -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
