"""FastAPI-приложение «ИИ-ассистент Alfa Only» (сервисный слой — «ИИ-оркестратор»
целевой архитектуры, отчёт §6.4). На старте инициализирует тестовую базу SQLite."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import CORS_ORIGINS
from .routers import cases, cockpit, system


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(
    title="Alfa Only — ИИ-ассистент персонального менеджера (API)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router, prefix="/api")
app.include_router(cockpit.router, prefix="/api")
app.include_router(cases.router, prefix="/api")
