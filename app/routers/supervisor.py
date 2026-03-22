from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from ..cases import log_activity
from ..models import FeedbackRequest
from ..router_support import get_runtime

router = APIRouter()


@router.get("/supervisor/dashboard")
async def get_supervisor_dashboard(request: Request, manager_id: str = Query(default="m1")):
    runtime = get_runtime(request)
    if not runtime.settings.features.supervisor_dashboard:
        raise HTTPException(status_code=404, detail="Supervisor dashboard is disabled")
    return runtime.supervisor_service.build_dashboard(storage=runtime.storage, manager_id=manager_id)


@router.post("/feedback")
async def feedback(request: Request, payload: FeedbackRequest):
    runtime = get_runtime(request)
    created, inserted = runtime.storage.add_feedback(payload)
    if payload.client_id and inserted:
        log_activity(
            runtime,
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
        runtime.assistant_kb_service.rebuild_manager_snapshots(
            runtime.storage,
            runtime.dialog_service,
            payload.manager_id,
        )
    return {"feedback": created, "created": inserted}
