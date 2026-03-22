from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request

from ..cases import build_case_view, log_activity
from ..models import CRMNote, CRMNoteType, ClientReplyRequest, ClientReplyResponse, Message
from ..router_support import get_runtime

router = APIRouter()


def _resolve_client_and_interaction(
    runtime,
    *,
    case_id: str | None = None,
    client_id: str | None = None,
    source_interaction_id: str | None = None,
    conversation_id: str | None = None,
):
    resolved_client_id = case_id or client_id
    if not resolved_client_id:
        raise HTTPException(status_code=422, detail="case_id or client_id is required")

    client = runtime.storage.get_client(resolved_client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    interaction_id = source_interaction_id or conversation_id
    interactions = runtime.storage.list_client_conversations(client.id)
    interaction = next((item for item in interactions if item.id == interaction_id), None) if interaction_id else None
    if interaction_id and not interaction:
        raise HTTPException(status_code=404, detail="Interaction not found")
    if interaction is None:
        interaction = next((item for item in interactions if item.channel.value == "chat"), None) or (
            interactions[0] if interactions else None
        )
    if interaction is None:
        raise HTTPException(status_code=404, detail="Interaction not found")

    return client, interaction


@router.get("/client/{client_id}/propensity")
async def get_client_propensity(request: Request, client_id: str):
    runtime = get_runtime(request)
    client = runtime.storage.get_client(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return runtime.propensity_service.build_client_propensity(storage=runtime.storage, client=client)


@router.get("/client/{client_id}")
async def get_client(request: Request, client_id: str, work_item_id: str | None = Query(default=None)):
    runtime = get_runtime(request)
    client = runtime.storage.get_client(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return build_case_view(runtime, client_id, client.manager_id, work_item_id=work_item_id)


async def _reply_to_client(request: Request, payload: ClientReplyRequest):
    runtime = get_runtime(request)
    client, interaction = _resolve_client_and_interaction(
        runtime,
        case_id=payload.case_id,
        client_id=payload.client_id,
        source_interaction_id=payload.source_interaction_id,
        conversation_id=payload.conversation_id,
    )

    if interaction.channel.value not in {"chat", "email"}:
        raise HTTPException(status_code=409, detail="Reply send is supported only for chat conversations")

    normalized_text = " ".join(payload.text.split())
    if not normalized_text:
        raise HTTPException(status_code=422, detail="Reply text must not be empty")

    created_at = datetime.now(UTC)
    message = runtime.storage.create_message(
        Message(
            id=str(uuid4()),
            conversation_id=interaction.id,
            sender="manager",
            text=normalized_text,
            created_at=created_at,
        )
    )
    crm_note = runtime.storage.create_crm_note(
        CRMNote(
            id=str(uuid4()),
            client_id=client.id,
            manager_id=payload.manager_id,
            recommendation_id=payload.recommendation_id,
            note_text=normalized_text,
            outcome="outbound_reply",
            channel=interaction.channel,
            summary_text="Исходящее сообщение клиенту",
            source_conversation_id=interaction.id,
            case_id=client.id,
            source_interaction_id=interaction.id,
            ai_generated=False,
            note_type=CRMNoteType.outbound_reply,
            outbound_message_text=normalized_text,
            created_at=created_at,
        )
    )
    activity_log_entry = log_activity(
        runtime,
        recommendation_type="client_reply",
        client_id=client.id,
        recommendation_id=payload.recommendation_id,
        conversation_id=interaction.id,
        case_id=client.id,
        source_interaction_id=interaction.id,
        manager_id=payload.manager_id,
        action="client_reply_sent",
        payload_excerpt=normalized_text,
        context_snapshot=f"source={payload.source.value} channel={interaction.channel.value}",
    )
    runtime.assistant_kb_service.rebuild_manager_snapshots(
        runtime.storage,
        runtime.dialog_service,
        payload.manager_id,
    )
    return ClientReplyResponse(
        message=message,
        crm_note=crm_note,
        activity_log_entry=activity_log_entry,
    )


@router.post("/client/reply")
async def reply_to_client(request: Request, payload: ClientReplyRequest):
    return await _reply_to_client(request, payload)


@router.post("/cases/{case_id}/reply")
async def reply_to_case_client(request: Request, case_id: str, payload: ClientReplyRequest):
    normalized_payload = payload.model_copy(update={"case_id": case_id, "client_id": case_id})
    return await _reply_to_client(request, normalized_payload)


@router.get("/client/{client_id}/activity-log")
async def get_client_activity_log(request: Request, client_id: str):
    runtime = get_runtime(request)
    if not runtime.storage.get_client(client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    return {"items": runtime.storage.list_client_activity_logs(client_id)}
