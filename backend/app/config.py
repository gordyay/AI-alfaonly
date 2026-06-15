"""Конфигурация бэкенда. Все параметры — через переменные окружения, со
значениями по умолчанию для воспроизводимого локального запуска (NFR6)."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SEED_PATH = BASE_DIR / "seed" / "seed.json"
DB_PATH = Path(os.environ.get("ALFA_DB_PATH", str(BASE_DIR.parent / "alfa_only.db")))

# Демо-«сейчас»: фиксированная точка отсчёта времени, как DEMO_NOW во фронтенде
# (воспроизводимые «X часов назад» и сроки независимо от даты запуска).
DEMO_NOW_ISO = os.environ.get("ALFA_DEMO_NOW", "2026-06-16T09:40:00+03:00")

# Выбор ИИ-провайдера: "deterministic" (по умолчанию, без ключей) | "groq".
AI_PROVIDER = os.environ.get("ALFA_AI_PROVIDER", "deterministic")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

# Источники, которым фронтенд (React-SPA) разрешён доступ к API.
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALFA_CORS_ORIGINS",
        "http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5173,http://localhost:5173",
    ).split(",")
    if o.strip()
]
