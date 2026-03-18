from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.config import AppSettings
from app.db import DEFAULT_DB_PATH, SQLiteStorage
from app.seed_data import seed_mvp_data
from app.services import AssistantKnowledgeService, DialogPriorityService


def main() -> None:
    settings = AppSettings.from_env()
    db_path = Path(settings.db_path) if settings.db_path else DEFAULT_DB_PATH
    if db_path.exists():
        db_path.unlink()

    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    AssistantKnowledgeService().rebuild_all_snapshots(storage, DialogPriorityService())
    print(f"Database reset and seeded: {db_path}")


if __name__ == "__main__":
    main()
