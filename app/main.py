from __future__ import annotations

from datetime import datetime, UTC
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from .models import CreateCRMNoteRequest, CRMNote, FeedbackRequest, TaskStatus
from .db import SQLiteStorage

STATIC_DIR = Path(__file__).resolve().parent / "static"


def create_app(db_path: str | None = None) -> FastAPI:
    app = FastAPI(title="Alfa Only Assistant MVP - Stage 1", version="0.1.0")
    storage = SQLiteStorage(db_path=db_path)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/", include_in_schema=False)
    async def index():
        return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "stage": "stage-1-foundation", "storage": "sqlite"}

    @app.get("/tasks")
    async def get_tasks(
        manager_id: str | None = Query(default=None),
        status: TaskStatus | None = Query(default=None),
    ):
        return {"items": storage.list_tasks(manager_id=manager_id, status=status)}

    @app.get("/clients")
    async def get_clients(manager_id: str | None = Query(default=None)):
        return {"items": storage.list_clients(manager_id=manager_id)}

    @app.get("/client/{client_id}")
    async def get_client(client_id: str):
        client = storage.get_client(client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")

        return {
            "client": client,
            "tasks": storage.list_client_tasks(client_id),
            "conversations": storage.list_client_conversations(client_id),
            "crm_notes": storage.list_client_crm_notes(client_id),
            "follow_ups": storage.list_client_follow_ups(client_id),
        }

    @app.post("/crm-note")
    async def create_crm_note(payload: CreateCRMNoteRequest):
        if not storage.get_client(payload.client_id):
            raise HTTPException(status_code=404, detail="Client not found")

        note = CRMNote(
            id=str(uuid4()),
            client_id=payload.client_id,
            manager_id=payload.manager_id,
            task_id=payload.task_id,
            note_text=payload.note_text,
            outcome=payload.outcome,
            channel=payload.channel,
            follow_up_date=payload.follow_up_date,
            created_at=datetime.now(UTC),
        )
        created = storage.create_crm_note(note)
        return {"crm_note": created}

    @app.post("/feedback")
    async def feedback(payload: FeedbackRequest):
        created = storage.add_feedback(payload)
        return {"feedback": created}

    return app


app = create_app()
