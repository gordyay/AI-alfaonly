from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request

from ..cases import compute_draft_changed_fields, log_activity
from ..models import CRMDraftRevision, CRMNote, CreateCRMNoteRequest, FeedbackRequest
from ..router_support import get_runtime

router = APIRouter()


@router.post("/crm-note")
async def create_crm_note(request: Request, payload: CreateCRMNoteRequest):
    runtime = get_runtime(request)
    resolved_client_id = payload.case_id or payload.client_id
    if not resolved_client_id or not runtime.storage.get_client(resolved_client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    source_interaction_id = payload.source_interaction_id or payload.source_conversation_id

    note = CRMNote(
        id=str(uuid4()),
        client_id=resolved_client_id,
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
        source_conversation_id=source_interaction_id,
        case_id=resolved_client_id,
        source_interaction_id=source_interaction_id,
        ai_generated=payload.ai_generated,
        ai_draft_payload=payload.ai_draft_payload,
        note_type=payload.note_type,
        outbound_message_text=payload.outbound_message_text,
        created_at=datetime.now(UTC),
    )
    created = runtime.storage.create_crm_note(note)
    if payload.ai_draft_payload is not None:
        runtime.storage.add_crm_draft_revision(
            CRMDraftRevision(
                id=str(uuid4()),
                client_id=resolved_client_id,
                manager_id=payload.manager_id,
                recommendation_id=payload.recommendation_id,
                conversation_id=source_interaction_id,
                case_id=resolved_client_id,
                source_interaction_id=source_interaction_id,
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
        feedback, inserted = runtime.storage.add_feedback(
            FeedbackRequest(
                recommendation_id=payload.recommendation_id,
                manager_id=payload.manager_id,
                recommendation_type="manager_work_item",
                client_id=resolved_client_id,
                conversation_id=source_interaction_id,
                case_id=resolved_client_id,
                source_interaction_id=source_interaction_id,
                decision=payload.recommendation_decision,
                comment=payload.decision_comment or "Решение зафиксировано вместе с CRM-заметкой.",
                selected_variant=payload.note_text[:240],
            )
        )
        if inserted:
            log_activity(
                runtime,
                recommendation_type="manager_work_item_feedback",
                client_id=resolved_client_id,
                recommendation_id=payload.recommendation_id,
                conversation_id=source_interaction_id,
                case_id=resolved_client_id,
                source_interaction_id=source_interaction_id,
                manager_id=payload.manager_id,
                action="feedback_saved",
                decision=feedback.decision.value,
                payload_excerpt=feedback.comment or payload.summary_text or payload.note_text,
                context_snapshot=payload.note_text[:240],
            )
    runtime.assistant_kb_service.rebuild_manager_snapshots(
        runtime.storage,
        runtime.dialog_service,
        created.manager_id,
    )
    log_activity(
        runtime,
        recommendation_type="crm_note",
        client_id=resolved_client_id,
        recommendation_id=payload.recommendation_id,
        conversation_id=source_interaction_id,
        case_id=resolved_client_id,
        source_interaction_id=source_interaction_id,
        manager_id=payload.manager_id,
        action="crm_note_saved",
        decision=(payload.recommendation_decision.value if payload.recommendation_decision else None),
        payload_excerpt=payload.summary_text or payload.note_text,
        context_snapshot=(payload.follow_up_reason or payload.decision_comment),
    )
    return {"crm_note": created}
