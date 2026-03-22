from __future__ import annotations

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .ai.base import AIProvider
from .config import AppSettings
from .routers import ai, assistant, cases, client, cockpit, crm, supervisor, system
from .runtime import build_runtime


def create_app(
    db_path: str | None = None,
    ai_provider: AIProvider | None = None,
    settings: AppSettings | None = None,
) -> FastAPI:
    runtime = build_runtime(db_path=db_path, ai_provider=ai_provider, settings=settings)
    app = FastAPI(title=runtime.settings.title, version=runtime.settings.version)
    app.state.runtime = runtime

    if runtime.frontend_status.static_mounted:
        app.mount("/static", StaticFiles(directory=runtime.settings.static_dir), name="static")

    app.include_router(system.router)
    app.include_router(cases.router)
    app.include_router(cockpit.router)
    app.include_router(client.router)
    app.include_router(assistant.router)
    app.include_router(ai.router)
    app.include_router(crm.router)
    app.include_router(supervisor.router)
    return app


app = create_app()
