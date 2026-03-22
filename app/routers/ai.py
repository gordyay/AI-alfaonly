from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request

from ..ai.base import AIProviderError
from ..cases import log_activity, resolve_case_work_item
from ..models import (
    CRMDraftRevision,
    GenerateScriptRequest,
    ObjectionSelectionRequest,
    ObjectionWorkflowRecord,
    ObjectionWorkflowRequest,
    ScriptGenerationRecord,
    ScriptSelectionRequest,
    SummarizeDialogRequest,
)
from ..router_support import get_runtime

router = APIRouter()


def _get_client_and_conversation(runtime, client_id: str, conversation_id: str):
    client = runtime.storage.get_client(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    conversations = runtime.storage.list_client_conversations(client_id)
    conversation = next((item for item in conversations if item.id == conversation_id), None)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return client, conversation


@router.post("/ai/generate-script")
async def generate_script(request: Request, payload: GenerateScriptRequest):
    runtime = get_runtime(request)
    client, conversation = _get_client_and_conversation(runtime, payload.client_id, payload.conversation_id)
    recommendation = runtime.dialog_service.build_recommendation(client=client, conversation=conversation)
    work_item = resolve_case_work_item(
        runtime,
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
    crm_notes = runtime.storage.list_client_crm_notes(client.id)
    propensity = runtime.propensity_service.build_client_propensity(storage=runtime.storage, client=client)
    objection_workflow = runtime.objection_service.build_workflow(
        provider=runtime.ai_provider,
        client=client,
        conversation=conversation,
    )

    try:
        result = runtime.ai_script_service.generate_script(
            provider=runtime.ai_provider,
            client=client,
            conversation=conversation,
            recommendation=recommendation,
            crm_notes=crm_notes,
            instruction=payload.instruction,
            contact_goal=payload.contact_goal or (work_item.next_best_action if work_item else None),
            product_propensities=propensity.items,
            objection_workflow=objection_workflow.draft,
        )
        artifact = runtime.storage.add_script_generation(
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
            runtime,
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
            runtime,
            recommendation_type="sales_script",
            client_id=payload.client_id,
            recommendation_id=recommendation_id,
            conversation_id=payload.conversation_id,
            manager_id=payload.manager_id,
            action="generation_failed",
            payload_excerpt=str(exc),
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/ai/script-selection")
async def select_script_variant(request: Request, payload: ScriptSelectionRequest):
    runtime = get_runtime(request)
    record = runtime.storage.get_script_generation(payload.artifact_id)
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

    updated = runtime.storage.update_script_selection(
        artifact_id=payload.artifact_id,
        variant_label=payload.variant_label,
        selected_text=selected_text,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Script artifact not found")

    log_activity(
        runtime,
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


@router.post("/ai/objection-workflow")
async def generate_objection_workflow(request: Request, payload: ObjectionWorkflowRequest):
    runtime = get_runtime(request)
    client, conversation = _get_client_and_conversation(runtime, payload.client_id, payload.conversation_id)
    work_item = resolve_case_work_item(
        runtime,
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
        result = runtime.objection_service.build_workflow(
            provider=runtime.ai_provider,
            client=client,
            conversation=conversation,
            objection_text=payload.objection_text,
        )
        artifact = runtime.storage.add_objection_workflow(
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
            runtime,
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
            runtime,
            recommendation_type="objection_workflow",
            client_id=payload.client_id,
            recommendation_id=recommendation_id,
            conversation_id=payload.conversation_id,
            manager_id=payload.manager_id,
            action="generation_failed",
            payload_excerpt=str(exc),
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/ai/objection-selection")
async def select_objection_option(request: Request, payload: ObjectionSelectionRequest):
    runtime = get_runtime(request)
    record = runtime.storage.get_objection_workflow(payload.artifact_id)
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

    updated = runtime.storage.update_objection_selection(
        artifact_id=payload.artifact_id,
        option_title=payload.option_title,
        selected_response=selected_response,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Objection artifact not found")

    log_activity(
        runtime,
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


@router.post("/ai/summarize-dialog")
async def summarize_dialog(request: Request, payload: SummarizeDialogRequest):
    runtime = get_runtime(request)
    client, conversation = _get_client_and_conversation(runtime, payload.client_id, payload.conversation_id)
    recommendation = runtime.dialog_service.build_recommendation(client=client, conversation=conversation)
    work_item = resolve_case_work_item(
        runtime,
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
        result = runtime.ai_summary_service.summarize_dialog(
            provider=runtime.ai_provider,
            client=client,
            conversation=conversation,
            recommendation=recommendation,
        )
        runtime.storage.update_client_ai_summary(
            client_id=payload.client_id,
            summary_text=result.draft.contact_summary,
            generated_at=result.generated_at,
        )
        runtime.storage.add_crm_draft_revision(
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
        runtime.assistant_kb_service.rebuild_manager_snapshots(
            runtime.storage,
            runtime.dialog_service,
            client.manager_id,
        )
        log_activity(
            runtime,
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
            runtime,
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
            runtime,
            recommendation_type="mini_summary",
            client_id=payload.client_id,
            recommendation_id=recommendation_id,
            conversation_id=payload.conversation_id,
            manager_id=payload.manager_id,
            action="generation_failed",
            payload_excerpt=str(exc),
        )
        log_activity(
            runtime,
            recommendation_type="crm_note_draft",
            client_id=payload.client_id,
            recommendation_id=recommendation_id,
            conversation_id=payload.conversation_id,
            manager_id=payload.manager_id,
            action="generation_failed",
            payload_excerpt=str(exc),
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
