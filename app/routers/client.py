from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from ..cases import build_case_view
from ..router_support import get_runtime

router = APIRouter()


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

    case_view = build_case_view(runtime, client_id, client.manager_id, work_item_id=work_item_id)
    selected_work_item = case_view["selected_work_item"]
    if work_item_id and selected_work_item is None:
        raise HTTPException(status_code=404, detail="Work item not found for client")

    conversations = case_view["conversations"]
    selected_conversation = case_view["selected_conversation"]
    propensity = runtime.propensity_service.build_client_propensity(storage=runtime.storage, client=client)
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
            runtime.objection_service.build_workflow(
                provider=runtime.ai_provider,
                client=client,
                conversation=selected_conversation,
            )
            if selected_conversation is not None
            else None
        )
    )

    return {
        "client": client,
        "tasks": runtime.storage.list_client_tasks(client_id),
        "conversations": conversations,
        "selected_work_item_id": selected_work_item.id if selected_work_item else None,
        "selected_conversation_id": selected_conversation.id if selected_conversation else None,
        "dialog_recommendation": runtime.dialog_service.build_recommendation(
            client=client,
            conversation=selected_conversation,
        ),
        "work_items": case_view["work_items"],
        "product_propensity": propensity,
        "objection_workflow": objection_workflow,
        "crm_notes": case_view["crm_notes"],
        "follow_ups": case_view["follow_ups"],
        "recommendation_feedback": case_view["feedback"],
        "activity_log": case_view["activity_log"],
        "generated_artifacts": runtime.cockpit_service.build_client_artifacts(
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


@router.get("/client/{client_id}/activity-log")
async def get_client_activity_log(request: Request, client_id: str):
    runtime = get_runtime(request)
    if not runtime.storage.get_client(client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    return {"items": runtime.storage.list_client_activity_logs(client_id)}
