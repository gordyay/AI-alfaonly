from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import AppSettings, FeatureFlags
from app.db import SQLiteStorage
from app.main import create_app
from app.seed_data import seed_mvp_data


def test_feature_flags_from_env_defaults_enabled():
    flags = FeatureFlags.from_env()
    assert flags.supervisor_dashboard is True
    assert flags.feedback_loop is True


def test_storage_can_fetch_latest_conversations_in_bulk(tmp_path):
    db_path = tmp_path / "bulk-latest.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)

    latest = storage.list_latest_conversations(["c1", "c2", "missing"])

    assert latest["c1"] is not None
    assert latest["c2"] is not None
    assert latest["missing"] is None
    assert latest["c1"].messages


@pytest.mark.anyio
async def test_health_returns_feature_flags(tmp_path):
    db_path = tmp_path / "settings.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    settings = AppSettings.from_env(db_path=str(db_path))
    app = create_app(db_path=str(db_path), settings=settings)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert "feature_flags" in body
    assert body["feature_flags"]["supervisor_dashboard"] is True
