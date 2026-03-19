#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export APP_DB_PATH="${APP_DB_PATH:-app/data/demo.sqlite3}"
export PORT="${PORT:-8000}"

"$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/scripts/check_env.py" --require-static
APP_DB_PATH="$APP_DB_PATH" "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/scripts/reset_db.py"
exec "$ROOT_DIR/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port "$PORT"
