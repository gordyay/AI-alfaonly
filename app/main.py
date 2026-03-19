from __future__ import annotations

from datetime import datetime, UTC
from pathlib import Path
from uuid import uuid4

from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from .config import AppSettings
from .models import (
    ActivityLogEntry,
    AssistantChatRequest,
    AssistantThreadCreateRequest,
    CRMDraftRevision,
    CreateCRMNoteRequest,
    CRMNote,
    FeedbackDecision,
    FeedbackRequest,
    GenerateScriptRequest,
    ObjectionSelectionRequest,
    ObjectionWorkflowRecord,
    ObjectionWorkflowRequest,
    ScriptGenerationRecord,
    ScriptSelectionRequest,
    SummarizeDialogRequest,
    TaskStatus,
)
from .ai import GroqProvider
from .ai.base import AIProvider, AIProviderError
from .db import SQLiteStorage
from .services import (
    AIScriptService,
    AISummaryService,
    AssistantKnowledgeService,
    AssistantService,
    DialogPriorityService,
    ManagerCockpitService,
    ObjectionWorkflowService,
    ProductPropensityService,
    SupervisorDashboardService,
)

STATIC_DIR = Path(__file__).resolve().parent / "static"


def create_app(
    db_path: str | None = None,
    ai_provider: AIProvider | None = None,
    settings: AppSettings | None = None,
) -> FastAPI:
    app_settings = settings or AppSettings.from_env(db_path=db_path, static_dir=STATIC_DIR)
    app = FastAPI(title=app_settings.title, version=app_settings.version)
    storage = SQLiteStorage(db_path=app_settings.db_path)
    dialog_service = DialogPriorityService()
    cockpit_service = ManagerCockpitService(dialog_service=dialog_service)
    propensity_service = ProductPropensityService()
    objection_service = ObjectionWorkflowService()
    supervisor_service = SupervisorDashboardService(cockpit_service=cockpit_service)
    ai_summary_service = AISummaryService()
    ai_script_service = AIScriptService()
    assistant_kb_service = AssistantKnowledgeService()
    assistant_service = AssistantService()
    groq_provider = ai_provider or GroqProvider.from_env()
    assistant_kb_service.ensure_snapshots(storage, dialog_service)
    app.state.storage = storage
    app.state.dialog_service = dialog_service
    app.state.cockpit_service = cockpit_service
    app.state.propensity_service = propensity_service
    app.state.objection_service = objection_service
    app.state.supervisor_service = supervisor_service
    app.state.ai_summary_service = ai_summary_service
    app.state.ai_script_service = ai_script_service
    app.state.assistant_kb_service = assistant_kb_service
    app.state.assistant_service = assistant_service
    app.state.ai_provider = groq_provider
    app.state.settings = app_settings
    app.mount("/static", StaticFiles(directory=app_settings.static_dir), name="static")

    def log_activity(
        *,
        recommendation_type: str,
        client_id: str,
        manager_id: str,
        action: str,
        recommendation_id: str | None = None,
        conversation_id: str | None = None,
        decision: str | None = None,
        payload_excerpt: str | None = None,
        context_snapshot: str | None = None,
    ) -> None:
        excerpt = None
        if payload_excerpt:
            excerpt = " ".join(payload_excerpt.split())
            excerpt = excerpt[:240]
        context = None
        if context_snapshot:
            context = " ".join(context_snapshot.split())
            context = context[:320]
        storage.add_activity_log(
            ActivityLogEntry(
                id=str(uuid4()),
                recommendation_type=recommendation_type,
                client_id=client_id,
                recommendation_id=recommendation_id,
                conversation_id=conversation_id,
                manager_id=manager_id,
                action=action,
                decision=decision,
                payload_excerpt=excerpt,
                context_snapshot=context,
                created_at=datetime.now(UTC),
            )
        )

    def work_item_matches_note(work_item, note: CRMNote) -> bool:
        return any(
            (
                work_item.recommendation_id and note.recommendation_id == work_item.recommendation_id,
                work_item.conversation_id and note.source_conversation_id == work_item.conversation_id,
                work_item.task_id and note.task_id == work_item.task_id,
            )
        )

    def resolve_case_work_item(
        *,
        client_id: str,
        manager_id: str,
        work_item_id: str | None = None,
        recommendation_id: str | None = None,
        conversation_id: str | None = None,
    ):
        cockpit = cockpit_service.build_manager_cockpit(storage=storage, manager_id=manager_id)
        client_items = [item for item in cockpit.work_queue if item.client_id == client_id]
        if work_item_id:
            matched = next((item for item in client_items if item.id == work_item_id), None)
            if matched is not None:
                return matched
        if recommendation_id:
            matched = next((item for item in client_items if item.recommendation_id == recommendation_id), None)
            if matched is not None:
                return matched
        if conversation_id:
            matched = next((item for item in client_items if item.conversation_id == conversation_id), None)
            if matched is not None:
                return matched
        return client_items[0] if client_items else None

    def compute_draft_changed_fields(
        *,
        ai_draft,
        note_text: str,
        summary_text: str | None,
        outcome: str,
        follow_up_date: datetime | None,
        follow_up_reason: str | None,
    ) -> list[str]:
        changed_fields: list[str] = []
        if ai_draft.crm_note_draft != note_text:
            changed_fields.append("crm_note_draft")
        if (ai_draft.contact_summary or None) != (summary_text or None):
            changed_fields.append("contact_summary")
        if ai_draft.outcome.value != outcome:
            changed_fields.append("outcome")
        ai_follow_up = ai_draft.follow_up_date.isoformat() if ai_draft.follow_up_date else None
        note_follow_up = follow_up_date.isoformat() if follow_up_date else None
        if ai_follow_up != note_follow_up:
            changed_fields.append("follow_up_date")
        if (ai_draft.follow_up_reason or None) != (follow_up_reason or None):
            changed_fields.append("follow_up_reason")
        return changed_fields

    def build_case_view(client_id: str, manager_id: str, work_item_id: str | None = None) -> dict:
        cockpit = cockpit_service.build_manager_cockpit(storage=storage, manager_id=manager_id)
        client_work_items = [item for item in cockpit.work_queue if item.client_id == client_id]
        selected_work_item = (
            next((item for item in client_work_items if item.id == work_item_id), None)
            if work_item_id
            else None
        ) or (client_work_items[0] if client_work_items else None)
        conversations = storage.list_client_conversations(client_id)
        selected_conversation = (
            next(
                (conversation for conversation in conversations if conversation.id == selected_work_item.conversation_id),
                None,
            )
            if selected_work_item and selected_work_item.conversation_id
            else None
        )

        crm_notes = storage.list_client_crm_notes(client_id)
        case_crm_notes = (
            [note for note in crm_notes if work_item_matches_note(selected_work_item, note)]
            if selected_work_item
            else crm_notes
        )
        feedback = storage.list_feedback(manager_id=manager_id, client_id=client_id, limit=20)
        if selected_work_item is not None:
            feedback = [
                item
                for item in feedback
                if item.recommendation_id == selected_work_item.recommendation_id
                or (selected_work_item.conversation_id and item.conversation_id == selected_work_item.conversation_id)
            ]
        activity_log = storage.list_client_activity_logs(client_id)
        if selected_work_item is not None:
            activity_log = [
                entry
                for entry in activity_log
                if entry.recommendation_id == selected_work_item.recommendation_id
                or (selected_work_item.conversation_id and entry.conversation_id == selected_work_item.conversation_id)
            ]
        follow_ups = storage.list_client_follow_ups(client_id)
        if case_crm_notes:
            case_note_ids = {note.id for note in case_crm_notes}
            follow_ups = [item for item in follow_ups if item.crm_note_id in case_note_ids]
        elif selected_work_item is not None:
            follow_ups = []

        saved_ai_draft = next(
            (
                revision.draft
                for revision in storage.list_crm_draft_revisions(
                    client_id=client_id,
                    recommendation_id=selected_work_item.recommendation_id if selected_work_item else None,
                    conversation_id=selected_conversation.id if selected_conversation else None,
                )
                if revision.stage == "ai_generated"
            ),
            next(
                (
                    note.ai_draft_payload
                    for note in case_crm_notes
                    if note.ai_generated and note.ai_draft_payload is not None
                ),
                None,
            ),
        )
        script_history = storage.list_script_generations(
            client_id=client_id,
            recommendation_id=selected_work_item.recommendation_id if selected_work_item else None,
            conversation_id=selected_conversation.id if selected_conversation else None,
        )
        objection_history = storage.list_objection_workflows(
            client_id=client_id,
            recommendation_id=selected_work_item.recommendation_id if selected_work_item else None,
            conversation_id=selected_conversation.id if selected_conversation else None,
        )
        crm_draft_history = storage.list_crm_draft_revisions(
            client_id=client_id,
            recommendation_id=selected_work_item.recommendation_id if selected_work_item else None,
            conversation_id=selected_conversation.id if selected_conversation else None,
        )
        return {
            "cockpit": cockpit,
            "work_items": client_work_items,
            "selected_work_item": selected_work_item,
            "conversations": conversations,
            "selected_conversation": selected_conversation,
            "crm_notes": case_crm_notes,
            "feedback": feedback,
            "activity_log": activity_log,
            "follow_ups": follow_ups,
            "saved_ai_draft": saved_ai_draft,
            "script_history": script_history,
            "objection_history": objection_history,
            "crm_draft_history": crm_draft_history,
        }

    @app.get("/", include_in_schema=False)
    async def index():
        return HTMLResponse((app_settings.static_dir / "index.html").read_text(encoding="utf-8"))

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "stage": app_settings.stage_label,
            "storage": "sqlite",
            "version": app_settings.version,
            "feature_flags": app_settings.features.as_dict(),
        }

    @app.get("/cockpit")
    async def get_cockpit(manager_id: str = Query(default="m1")):
        return cockpit_service.build_manager_cockpit(storage=storage, manager_id=manager_id)

    @app.get("/propensity/clients")
    async def get_product_plan(manager_id: str = Query(default="m1"), product_id: str = Query(...)):
        return propensity_service.build_product_plan(storage=storage, manager_id=manager_id, product_id=product_id)

    @app.get("/supervisor/dashboard")
    async def get_supervisor_dashboard(manager_id: str = Query(default="m1")):
        if not app_settings.features.supervisor_dashboard:
            raise HTTPException(status_code=404, detail="Supervisor dashboard is disabled")
        return supervisor_service.build_dashboard(storage=storage, manager_id=manager_id)

    @app.get("/client/{client_id}/propensity")
    async def get_client_propensity(client_id: str):
        client = storage.get_client(client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        return propensity_service.build_client_propensity(storage=storage, client=client)

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
    async def get_client(client_id: str, work_item_id: str | None = Query(default=None)):
        client = storage.get_client(client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")

        case_view = build_case_view(client_id, client.manager_id, work_item_id=work_item_id)
        selected_work_item = case_view["selected_work_item"]
        if work_item_id and selected_work_item is None:
            raise HTTPException(status_code=404, detail="Work item not found for client")

        conversations = case_view["conversations"]
        selected_conversation = case_view["selected_conversation"]
        propensity = propensity_service.build_client_propensity(storage=storage, client=client)
        latest_objection = case_view["objection_history"][0] if case_view["objection_history"] else None
        objection_workflow = (
            {
                "draft": latest_objection.draft,
                "model_name": "stored_case_artifact",
                "generated_at": latest_objection.created_at,
                "artifact_id": latest_objection.id,
            }
            if latest_objection is not None
            else (
                objection_service.build_workflow(
                    provider=app.state.ai_provider,
                    client=client,
                    conversation=selected_conversation,
                )
                if selected_conversation is not None
                else None
            )
        )

        return {
            "client": client,
            "tasks": storage.list_client_tasks(client_id),
            "conversations": conversations,
            "selected_work_item_id": selected_work_item.id if selected_work_item else None,
            "selected_conversation_id": selected_conversation.id if selected_conversation else None,
            "dialog_recommendation": dialog_service.build_recommendation(client=client, conversation=selected_conversation),
            "work_items": case_view["work_items"],
            "product_propensity": propensity,
            "objection_workflow": objection_workflow,
            "crm_notes": case_view["crm_notes"],
            "follow_ups": case_view["follow_ups"],
            "recommendation_feedback": case_view["feedback"],
            "activity_log": case_view["activity_log"],
            "generated_artifacts": cockpit_service.build_client_artifacts(
                client,
                case_view["crm_notes"],
                script_history=case_view["script_history"],
                objection_history=case_view["objection_history"],
            ),
            "saved_ai_draft": case_view["saved_ai_draft"],
            "script_history": case_view["script_history"],
            "objection_history": case_view["objection_history"],
            "crm_draft_history": case_view["crm_draft_history"],
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
                propensity_service=propensity_service,
                objection_service=objection_service,
                manager_id=payload.manager_id,
                thread_id=payload.thread_id,
                message=payload.message,
                selected_client_id=payload.selected_client_id,
                selected_work_item_id=payload.selected_work_item_id,
                cockpit_service=cockpit_service,
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
        work_item = resolve_case_work_item(
            client_id=client.id,
            manager_id=payload.manager_id,
            recommendation_id=payload.recommendation_id,
            conversation_id=payload.conversation_id,
        )
        recommendation_id = (
            payload.recommendation_id
            or (work_item.recommendation_id if work_item else None)
            or f"rec:communication:{payload.conversation_id}"
        )
        crm_notes = storage.list_client_crm_notes(client.id)
        propensity = propensity_service.build_client_propensity(storage=storage, client=client)
        objection_workflow = objection_service.build_workflow(
            provider=app.state.ai_provider,
            client=client,
            conversation=conversation,
        )

        try:
            result = ai_script_service.generate_script(
                provider=app.state.ai_provider,
                client=client,
                conversation=conversation,
                recommendation=recommendation,
                crm_notes=crm_notes,
                instruction=payload.instruction,
                contact_goal=payload.contact_goal or (work_item.next_best_action if work_item else None),
                product_propensities=propensity.items,
                objection_workflow=objection_workflow.draft,
            )
            artifact = storage.add_script_generation(
                ScriptGenerationRecord(
                    id=str(uuid4()),
                    client_id=payload.client_id,
                    manager_id=payload.manager_id,
                    recommendation_id=recommendation_id,
                    conversation_id=payload.conversation_id,
                    contact_goal=result.draft.contact_goal or payload.contact_goal,
                    draft=result.draft,
                    created_at=result.generated_at,
                )
            )
            log_activity(
                recommendation_type="sales_script",
                client_id=payload.client_id,
                recommendation_id=recommendation_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="script_generated",
                payload_excerpt=result.draft.ready_script,
                context_snapshot=" | ".join(result.draft.grounding_facts),
            )
            return result.model_copy(update={"artifact_id": artifact.id})
        except AIProviderError as exc:
            log_activity(
                recommendation_type="sales_script",
                client_id=payload.client_id,
                recommendation_id=recommendation_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="generation_failed",
                payload_excerpt=str(exc),
            )
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/ai/script-selection")
    async def select_script_variant(payload: ScriptSelectionRequest):
        record = storage.get_script_generation(payload.artifact_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Script artifact not found")
        if record.manager_id != payload.manager_id:
            raise HTTPException(status_code=403, detail="Artifact belongs to another manager")

        selected_text = payload.selected_text
        if selected_text is None:
            if payload.variant_label == "main":
                selected_text = record.draft.ready_script
            else:
                variant = next(
                    (item for item in record.draft.alternatives if item.label == payload.variant_label),
                    None,
                )
                selected_text = variant.ready_script if variant else None

        updated = storage.update_script_selection(
            artifact_id=payload.artifact_id,
            variant_label=payload.variant_label,
            selected_text=selected_text,
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="Script artifact not found")

        log_activity(
            recommendation_type="sales_script",
            client_id=updated.client_id,
            recommendation_id=updated.recommendation_id,
            conversation_id=updated.conversation_id,
            manager_id=payload.manager_id,
            action="script_variant_selected",
            payload_excerpt=payload.variant_label,
            context_snapshot=selected_text,
        )
        return {"artifact": updated}

    @app.post("/ai/objection-workflow")
    async def generate_objection_workflow(payload: ObjectionWorkflowRequest):
        client = storage.get_client(payload.client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")

        conversations = storage.list_client_conversations(payload.client_id)
        conversation = next((item for item in conversations if item.id == payload.conversation_id), None)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        work_item = resolve_case_work_item(
            client_id=client.id,
            manager_id=payload.manager_id,
            recommendation_id=payload.recommendation_id,
            conversation_id=payload.conversation_id,
        )
        recommendation_id = (
            payload.recommendation_id
            or (work_item.recommendation_id if work_item else None)
            or f"rec:communication:{payload.conversation_id}"
        )
        try:
            result = objection_service.build_workflow(
                provider=app.state.ai_provider,
                client=client,
                conversation=conversation,
                objection_text=payload.objection_text,
            )
            artifact = storage.add_objection_workflow(
                ObjectionWorkflowRecord(
                    id=str(uuid4()),
                    client_id=payload.client_id,
                    manager_id=payload.manager_id,
                    recommendation_id=recommendation_id,
                    conversation_id=payload.conversation_id,
                    draft=result.draft,
                    created_at=result.generated_at,
                )
            )
            log_activity(
                recommendation_type="objection_workflow",
                client_id=payload.client_id,
                recommendation_id=recommendation_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="objection_generated",
                payload_excerpt=result.draft.analysis.objection_label,
                context_snapshot=" | ".join(result.draft.grounding_facts),
            )
            return result.model_copy(update={"artifact_id": artifact.id})
        except AIProviderError as exc:
            log_activity(
                recommendation_type="objection_workflow",
                client_id=payload.client_id,
                recommendation_id=recommendation_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="generation_failed",
                payload_excerpt=str(exc),
            )
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/ai/objection-selection")
    async def select_objection_option(payload: ObjectionSelectionRequest):
        record = storage.get_objection_workflow(payload.artifact_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Objection artifact not found")
        if record.manager_id != payload.manager_id:
            raise HTTPException(status_code=403, detail="Artifact belongs to another manager")

        selected_response = payload.selected_response
        if selected_response is None:
            option = next(
                (item for item in record.draft.handling_options if item.title == payload.option_title),
                None,
            )
            selected_response = option.response if option else None

        updated = storage.update_objection_selection(
            artifact_id=payload.artifact_id,
            option_title=payload.option_title,
            selected_response=selected_response,
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="Objection artifact not found")

        log_activity(
            recommendation_type="objection_workflow",
            client_id=updated.client_id,
            recommendation_id=updated.recommendation_id,
            conversation_id=updated.conversation_id,
            manager_id=payload.manager_id,
            action="objection_option_selected",
            payload_excerpt=payload.option_title,
            context_snapshot=selected_response,
        )
        return {"artifact": updated}

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
        work_item = resolve_case_work_item(
            client_id=client.id,
            manager_id=payload.manager_id,
            recommendation_id=payload.recommendation_id,
            conversation_id=payload.conversation_id,
        )
        recommendation_id = (
            payload.recommendation_id
            or (work_item.recommendation_id if work_item else None)
            or f"rec:communication:{payload.conversation_id}"
        )

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
            storage.add_crm_draft_revision(
                CRMDraftRevision(
                    id=str(uuid4()),
                    client_id=payload.client_id,
                    manager_id=payload.manager_id,
                    recommendation_id=recommendation_id,
                    conversation_id=payload.conversation_id,
                    stage="ai_generated",
                    draft=result.draft,
                    created_at=result.generated_at,
                )
            )
            assistant_kb_service.rebuild_manager_snapshots(storage, dialog_service, client.manager_id)
            log_activity(
                recommendation_type="mini_summary",
                client_id=payload.client_id,
                recommendation_id=recommendation_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="summary_generated",
                payload_excerpt=result.draft.contact_summary,
                context_snapshot=" | ".join(result.draft.grounding_facts),
            )
            log_activity(
                recommendation_type="crm_note_draft",
                client_id=payload.client_id,
                recommendation_id=recommendation_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="crm_draft_generated",
                payload_excerpt=result.draft.crm_note_draft,
                context_snapshot=" | ".join(result.draft.grounding_facts),
            )
            return result
        except AIProviderError as exc:
            log_activity(
                recommendation_type="mini_summary",
                client_id=payload.client_id,
                recommendation_id=recommendation_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="generation_failed",
                payload_excerpt=str(exc),
            )
            log_activity(
                recommendation_type="crm_note_draft",
                client_id=payload.client_id,
                recommendation_id=recommendation_id,
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
            recommendation_id=payload.recommendation_id,
            recommendation_decision=payload.recommendation_decision,
            decision_comment=payload.decision_comment,
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
        if payload.ai_draft_payload is not None:
            storage.add_crm_draft_revision(
                CRMDraftRevision(
                    id=str(uuid4()),
                    client_id=payload.client_id,
                    manager_id=payload.manager_id,
                    recommendation_id=payload.recommendation_id,
                    conversation_id=payload.source_conversation_id,
                    stage="manager_finalized",
                    changed_fields=compute_draft_changed_fields(
                        ai_draft=payload.ai_draft_payload,
                        note_text=payload.note_text,
                        summary_text=payload.summary_text,
                        outcome=payload.outcome,
                        follow_up_date=payload.follow_up_date,
                        follow_up_reason=payload.follow_up_reason,
                    ),
                    draft=payload.ai_draft_payload,
                    final_note_text=payload.note_text,
                    created_at=created.created_at,
                )
            )
        if payload.recommendation_id and payload.recommendation_decision is not None:
            feedback, inserted = storage.add_feedback(
                FeedbackRequest(
                    recommendation_id=payload.recommendation_id,
                    manager_id=payload.manager_id,
                    recommendation_type="manager_work_item",
                    client_id=payload.client_id,
                    conversation_id=payload.source_conversation_id,
                    decision=payload.recommendation_decision,
                    comment=payload.decision_comment or "Решение зафиксировано вместе с CRM-заметкой.",
                    selected_variant=payload.note_text[:240],
                )
            )
            if inserted:
                log_activity(
                    recommendation_type="manager_work_item_feedback",
                    client_id=payload.client_id,
                    recommendation_id=payload.recommendation_id,
                    conversation_id=payload.source_conversation_id,
                    manager_id=payload.manager_id,
                    action="feedback_saved",
                    decision=feedback.decision.value,
                    payload_excerpt=feedback.comment or payload.summary_text or payload.note_text,
                    context_snapshot=payload.note_text[:240],
                )
        assistant_kb_service.rebuild_manager_snapshots(storage, dialog_service, created.manager_id)
        log_activity(
            recommendation_type="crm_note",
            client_id=payload.client_id,
            recommendation_id=payload.recommendation_id,
            conversation_id=payload.source_conversation_id,
            manager_id=payload.manager_id,
            action="crm_note_saved",
            decision=(payload.recommendation_decision.value if payload.recommendation_decision else None),
            payload_excerpt=payload.summary_text or payload.note_text,
            context_snapshot=(payload.follow_up_reason or payload.decision_comment),
        )
        return {"crm_note": created}

    @app.post("/feedback")
    async def feedback(payload: FeedbackRequest):
        created, inserted = storage.add_feedback(payload)
        if payload.client_id and inserted:
            log_activity(
                recommendation_type=payload.recommendation_type,
                client_id=payload.client_id,
                recommendation_id=payload.recommendation_id,
                conversation_id=payload.conversation_id,
                manager_id=payload.manager_id,
                action="feedback_saved",
                decision=payload.decision.value,
                payload_excerpt=payload.comment,
                context_snapshot=payload.selected_variant,
            )
        if inserted:
            assistant_kb_service.rebuild_manager_snapshots(storage, dialog_service, payload.manager_id)
        return {"feedback": created, "created": inserted}

    return app


app = create_app()
