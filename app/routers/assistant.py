from __future__ import annotations

from functools import partial

from fastapi import APIRouter, HTTPException, Query, Request

from ..cases import log_activity
from ..models import (
    AssistantApplyRequest,
    AssistantChatRequest,
    AssistantScopeKind,
    AssistantThreadCreateRequest,
)
from ..router_support import get_runtime

router = APIRouter()


@router.get("/assistant/threads")
async def list_assistant_threads(
    request: Request,
    manager_id: str = Query(default="m1"),
    scope_kind: AssistantScopeKind | None = Query(default=None),
    client_id: str | None = Query(default=None),
    work_item_id: str | None = Query(default=None),
):
    runtime = get_runtime(request)
    return {
        "items": runtime.assistant_service.list_threads(
            runtime.storage,
            manager_id,
            scope_kind=scope_kind,
            client_id=client_id,
            work_item_id=work_item_id,
        )
    }


@router.post("/assistant/threads")
async def create_assistant_thread(request: Request, payload: AssistantThreadCreateRequest):
    runtime = get_runtime(request)
    thread = runtime.assistant_service.create_thread(
        runtime.storage,
        manager_id=payload.manager_id,
        scope_kind=payload.scope_kind,
        client_id=payload.client_id,
        work_item_id=payload.work_item_id,
        interaction_id=payload.interaction_id,
        task_kind=payload.task_kind,
        selected_client_id=payload.selected_client_id,
        title=payload.title,
    )
    return {"thread": thread}


@router.get("/assistant/threads/{thread_id}")
async def get_assistant_thread(request: Request, thread_id: str):
    runtime = get_runtime(request)
    detail = runtime.assistant_service.get_thread_detail(runtime.storage, thread_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Assistant thread not found")
    return detail


@router.post("/assistant/chat")
async def assistant_chat(request: Request, payload: AssistantChatRequest):
    runtime = get_runtime(request)
    try:
        return runtime.assistant_service.chat(
            storage=runtime.storage,
            provider=runtime.ai_provider,
            kb_service=runtime.assistant_kb_service,
            dialog_service=runtime.dialog_service,
            ai_summary_service=runtime.ai_summary_service,
            ai_script_service=runtime.ai_script_service,
            propensity_service=runtime.propensity_service,
            objection_service=runtime.objection_service,
            manager_id=payload.manager_id,
            thread_id=payload.thread_id,
            task_kind=payload.task_kind,
            message=payload.message,
            selected_client_id=payload.selected_client_id,
            selected_work_item_id=payload.selected_work_item_id,
            selected_interaction_id=payload.selected_interaction_id,
            task_input=payload.task_input,
            cockpit_service=runtime.cockpit_service,
            log_activity=partial(log_activity, runtime),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/assistant/apply")
async def assistant_apply(request: Request, payload: AssistantApplyRequest):
    runtime = get_runtime(request)
    try:
        return runtime.assistant_service.apply(
            storage=runtime.storage,
            manager_id=payload.manager_id,
            thread_id=payload.thread_id,
            task_kind=payload.task_kind,
            selected_client_id=payload.selected_client_id,
            selected_work_item_id=payload.selected_work_item_id,
            selected_interaction_id=payload.selected_interaction_id,
            selected_choice=payload.selected_choice,
            cockpit_service=runtime.cockpit_service,
            log_activity=partial(log_activity, runtime),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
