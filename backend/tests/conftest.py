"""Общая настройка тестов: изолированная временная база SQLite + клиент API.
Перед каждым тестом база пересоздаётся из seed (детерминированность),
ИИ-провайдер — детерминированный (заглушка вместо внешней LLM, как в §6.5)."""

from __future__ import annotations

import os
import pathlib
import tempfile

os.environ["ALFA_DB_PATH"] = str(pathlib.Path(tempfile.gettempdir()) / "alfa_only_test.db")
os.environ["ALFA_AI_PROVIDER"] = "deterministic"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db as _db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def db():
    _db.init_db(force_reseed=True)
    return _db


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c
