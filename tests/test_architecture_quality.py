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


def test_seed_data_contains_richer_demo_distribution(tmp_path):
    db_path = tmp_path / "seed-richness.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)

    clients_m1 = storage.list_clients(manager_id="m1")
    clients_m2 = storage.list_clients(manager_id="m2")
    tasks_m1 = storage.list_tasks(manager_id="m1")
    tasks_m2 = storage.list_tasks(manager_id="m2")

    assert len(clients_m1) >= 7
    assert len(clients_m2) >= 6
    assert len(tasks_m1) >= 9
    assert len(tasks_m2) >= 7

    c1_conversations = storage.list_client_conversations("c1")
    c8_conversations = storage.list_client_conversations("c8")
    c11_conversations = storage.list_client_conversations("c11")

    assert len(c1_conversations) >= 2
    assert len(c8_conversations) >= 2
    assert c11_conversations[0].insights is None
    assert any(client.churn_risk == "high" for client in clients_m1 + clients_m2)


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
