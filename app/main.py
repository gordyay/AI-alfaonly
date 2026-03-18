from __future__ import annotations

from datetime import datetime, UTC
from pathlib import Path
from uuid import uuid4

from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from .models import (
    ActivityLogEntry,
    AssistantChatRequest,
    AssistantThreadCreateRequest,
    CreateCRMNoteRequest,
    CRMNote,
    FeedbackRequest,
    GenerateScriptRequest,
    SummarizeDialogRequest,
    TaskStatus,
)
from .ai import GroqProvider
from .ai.base import AIProvider, AIProviderError
from .db import SQLiteStorage
from .services import AIScriptService, AISummaryService, AssistantKnowledgeService, AssistantService, DialogPriorityService

STATIC_DIR = Path(__file__).resolve().parent / "static"


def create_app(db_path: str | None = None, ai_provider: AIProvider | None = None) -> FastAPI:
    app = FastAPI(title="Alfa Only Assistant MVP - Stage 6", version="0.6.0")
    storage = SQLiteStorage(db_path=db_path)
    dialog_service = DialogPriorityService()
    ai_summary_service = AISummaryService()
    ai_script_service = AIScriptService()
    assistant_kb_service = AssistantKnowledgeService()
    assistant_service = AssistantService()
    groq_provider = ai_provider or GroqProvider.from_env()
    assistant_kb_service.ensure_snapshots(storage, dialog_service)
    app.state.storage = storage
    app.state.dialog_service = dialog_service
    app.state.ai_summary_service = ai_summary_service
    app.state.ai_script_service = ai_script_service
    app.state.assistant_kb_service = assistant_kb_service
    app.state.assistant_service = assistant_service
    app.state.ai_provider = groq_provider
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    def log_activity(
        *,
        recommendation_type: str,
        client_id: str,
        manager_id: str,
        action: str,
        conversation_id: str | None = None,
        payload_excerpt: str | None = None,
    ) -> None:
        excerpt = None
        if payload_excerpt:
            excerpt = " ".join(payload_excerpt.split())
            excerpt = excerpt[:240]
        storage.add_activity_log(
            ActivityLogEntry(
                id=str(uuid4()),
                recommendation_type=recommendation_type,
                client_id=client_id,
                conversation_id=conversation_id,
                manager_id=manager_id,
                action=action,
                payload_excerpt=excerpt,
                created_at=datetime.now(UTC),
            )
        )

    @app.get("/", include_in_schema=False)
    async def index():
        return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "stage": "stage-6-sales-scripts", "storage": "sqlite"}

    @app.get("/tasks")
    async def get_tasks(
        manager_id: str | None = Query(default=None),
        status: TaskStatus | None = Query(default=None),
    ):
        return {"items": storage.list_tasks(manager_id=manager_id, status=status)}

    @app.get("/clients")
    async def get_clients(manager_id: str | None = Query(default=None)):
        return {"items": storage.list_clients(manager_id=manager_id)}

    @app.get("/dialogs")
    async def get_dialogs(
        manager_id: str | None = Query(default=None),
        sort_by: Literal["priority", "last_message"] = Query(default="priority"),
    ):
        return {"items": dialog_service.list_manager_dialogs(storage=storage, manager_id=manager_id, sort_by=sort_by)}

    @app.get("/client/{client_id}")
    async def get_client(client_id: str):
        client = storage.get_client(client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")

        conversations = storage.list_client_conversations(client_id)
        latest_conversation = conversations[0] if conversations else None
        crm_notes = storage.list_client_crm_notes(client_id)
        saved_ai_draft = next(
            (note.ai_draft_payload for note in crm_notes if note.ai_generated and note.ai_draft_payload is not None),
            None,
        )

        return {
            "client": client,
            "tasks": storage.list_client_tasks(client_id),
            "conversations": conversations,
            "dialog_recommendation": dialog_service.build_recommendation(client=client, conversation=latest_conversation),
            "crm_notes": crm_notes,
            "follow_ups": storage.list_client_follow_ups(client_id),
            "saved_ai_draft": saved_ai_draft,
        }

    @app.get("/client/{client_id}/activity-log")
    async def get_client_activity_log(client_id: str):
        if not storage.get_client(client_id):
            raise HTTPException(status_code=404, detail="Client not found")
        return {"items": storage.list_client_activity_logs(client_id)}

    @app.get("/assistant/threads")
    async def list_assistant_threads(manager_id: str = Query(default="m1")):
        return {"items": assistant_service.list_threads(storage, manager_id)}

    @app.post("/assistant/threads")
    async def create_assistant_thread(payload: AssistantThreadCreateRequest):
        thread = assistant_service.create_thread(
            storage,
            manager_id=payload.manager_id,
            selected_client_id=payload.selected_client_id,
            title=payload.title,
        )
        return {"thread": thread}

    @app.get("/assistant/threads/{thread_id}")
    async def get_assistant_thread(thread_id: str):
        detail = assistant_service.get_thread_detail(storage, thread_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Assistant thread not found")
        return detail

    @app.post("/assistant/chat")
    async def assistant_chat(payload: AssistantChatRequest):
        try:
            return assistant_service.chat(
                storage=storage,
                provider=app.state.ai_provider,
                kb_service=assistant_kb_service,
                dialog_service=dialog_service,
                ai_summary_service=ai_summary_service,
                ai_script_service=ai_script_service,
                manager_id=payload.manager_id,
                thread_id=payload.thread_id,
                message=payload.message,
                selected_client_id=payload.selected_client_id,
                log_activity=log_activity,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/ai/generate-script")
    async def generate_script(payload: GenerateScriptRequest):
        client = storage.get_client(payload.client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")

        conversations = storage.list_client_conversations(payload.client_id)
        conversation = next((item for item in conversations if item.id == payload.conversation_id), None)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        recommendation = dialog_service.build_recommendation(client=client, conversation=conversation)
        crm_notes = storage.list_client_crm_notes(client.id)

        try:
            result = ai_script_service.generate_script(
                provider=app.state.ai_provider,
                client=client,
                conversation=conversation,
                recommendation=recommendation,
                crm_notes=crm_notes,
                instruction=payload.instruction,
            )
            log_activity(
                recommendation_type="sales_script",
                client_id=payload.client_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="generated",
                payload_excerpt=result.draft.ready_script,
            )
            return result
        except AIProviderError as exc:
            log_activity(
                recommendation_type="sales_script",
                client_id=payload.client_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="generation_failed",
                payload_excerpt=str(exc),
            )
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/ai/summarize-dialog")
    async def summarize_dialog(payload: SummarizeDialogRequest):
        client = storage.get_client(payload.client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")

        conversations = storage.list_client_conversations(payload.client_id)
        conversation = next((item for item in conversations if item.id == payload.conversation_id), None)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        recommendation = dialog_service.build_recommendation(client=client, conversation=conversation)

        try:
            result = ai_summary_service.summarize_dialog(
                provider=app.state.ai_provider,
                client=client,
                conversation=conversation,
                recommendation=recommendation,
            )
            storage.update_client_ai_summary(
                client_id=payload.client_id,
                summary_text=result.draft.contact_summary,
                generated_at=result.generated_at,
            )
            assistant_kb_service.rebuild_manager_snapshots(storage, dialog_service, client.manager_id)
            log_activity(
                recommendation_type="mini_summary",
                client_id=payload.client_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="generated",
                payload_excerpt=result.draft.contact_summary,
            )
            log_activity(
                recommendation_type="crm_note_draft",
                client_id=payload.client_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="generated",
                payload_excerpt=result.draft.crm_note_draft,
            )
            return result
        except AIProviderError as exc:
            log_activity(
                recommendation_type="mini_summary",
                client_id=payload.client_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="generation_failed",
                payload_excerpt=str(exc),
            )
            log_activity(
                recommendation_type="crm_note_draft",
                client_id=payload.client_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="generation_failed",
                payload_excerpt=str(exc),
            )
            raise HTTPException(status_code=503, detail=str(exc)) from exc

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
            follow_up_reason=payload.follow_up_reason,
            summary_text=payload.summary_text,
            source_conversation_id=payload.source_conversation_id,
            ai_generated=payload.ai_generated,
            ai_draft_payload=payload.ai_draft_payload,
            created_at=datetime.now(UTC),
        )
        created = storage.create_crm_note(note)
        assistant_kb_service.rebuild_manager_snapshots(storage, dialog_service, created.manager_id)
        log_activity(
            recommendation_type="crm_note",
            client_id=payload.client_id,
            conversation_id=payload.source_conversation_id,
            manager_id=payload.manager_id,
            action="saved",
            payload_excerpt=payload.summary_text or payload.note_text,
        )
        return {"crm_note": created}

    @app.post("/feedback")
    async def feedback(payload: FeedbackRequest):
        created = storage.add_feedback(payload)
        return {"feedback": created}

    return app


app = create_app()
