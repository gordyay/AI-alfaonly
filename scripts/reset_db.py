from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.db import DEFAULT_DB_PATH, SQLiteStorage
from app.seed_data import seed_mvp_data


def main() -> None:
    if DEFAULT_DB_PATH.exists():
        DEFAULT_DB_PATH.unlink()

    storage = SQLiteStorage()
    seed_mvp_data(storage)
    print(f"Database reset and seeded: {DEFAULT_DB_PATH}")


if __name__ == "__main__":
    main()
