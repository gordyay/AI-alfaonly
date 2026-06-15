"""Рабочее пространство кейса: полный контекст, ИИ-функции (черновик ответа,
сценарий, разбор возражения, сводка, ассистент) и действия менеджера
(отправка ответа, обратная связь FR8, заметка CRM FR6)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import db
from ..ai import get_provider
from ..domain.context import build_ai_context, score_client_products
from ..domain.workqueue import is_work_item_handled
from ..schemas import (
    ChatRequest,
    FeedbackRequest,
    NoteRequest,
    ObjectionRequest,
    ScriptRequest,
    SendRequest,
)
from ._common import new_id, now_iso, resolve_work_item

router = APIRouter(tags=["cases"])


def _require(work_item_id: str) -> dict:
    item = resolve_work_item(work_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="work item not found")
    return item


@router.get("/cases/{work_item_id}")
def case_detail(work_item_id: str) -> dict:
    item = _require(work_item_id)
    ctx = build_ai_context(item)
    client = ctx["client"]
    notes = sorted(
        db.get_crm_notes_by_client(client["id"]),
        key=lambda n: n["createdAtIso"],
        reverse=True,
    )
    decisions = sorted(
        (f for f in db.get_feedback() if f["recommendationId"] == item["recommendationId"]),
        key=lambda f: f["createdAtIso"],
        reverse=True,
    )
    return {
        "item": item,
        "context": ctx,
        "propensities": score_client_products(client["id"]),
        "notes": notes,
        "savedDecision": decisions[0]["decision"] if decisions else None,
        "chatHistory": db.get_chat(work_item_id),
        "handled": is_work_item_handled(item, client["managerId"]),
    }


# --- ИИ-функции -------------------------------------------------------------

@router.post("/cases/{work_item_id}/reply-draft")
def reply_draft(work_item_id: str) -> dict:
    return get_provider().generate_reply(build_ai_context(_require(work_item_id)))


@router.post("/cases/{work_item_id}/script")
def script(work_item_id: str, body: ScriptRequest) -> dict:
    ctx = build_ai_context(_require(work_item_id))
    return get_provider().generate_script(ctx, body.goal, body.instruction)


@router.post("/cases/{work_item_id}/objection")
def objection(work_item_id: str, body: ObjectionRequest) -> dict:
    ctx = build_ai_context(_require(work_item_id))
    return get_provider().generate_objection(ctx, body.text)


@router.post("/cases/{work_item_id}/summary")
def summary(work_item_id: str) -> dict:
    return get_provider().generate_summary(build_ai_context(_require(work_item_id)))


@router.post("/cases/{work_item_id}/chat")
def chat(work_item_id: str, body: ChatRequest) -> dict:
    ctx = build_ai_context(_require(work_item_id))
    answer = get_provider().answer_question(ctx, body.question)
    turns = [*db.get_chat(work_item_id), {"role": "manager", "text": body.question}, answer]
    db.set_chat(work_item_id, turns)
    return {"turns": turns, "answer": answer}


# --- Действия менеджера (только после подтверждения, FR11) ------------------

@router.post("/cases/{work_item_id}/send")
def send(work_item_id: str, body: SendRequest) -> dict:
    item = _require(work_item_id)
    conv_id = item.get("conversationId")
    if not conv_id:
        return {"ok": True, "messages": []}
    message = {
        "id": new_id("rt-msg"),
        "conversationId": conv_id,
        "sender": "manager",
        "text": body.text,
        "sentAtIso": now_iso(),
    }
    db.add_message(message)
    return {"ok": True, "message": message, "messages": db.get_messages(conv_id)}


@router.post("/feedback")
def feedback(body: FeedbackRequest) -> dict:
    event = {
        "id": new_id("rt-fb"),
        "recommendationId": body.recommendationId,
        "managerId": body.managerId,
        "kind": body.kind,
        "clientId": body.clientId,
        "conversationId": body.conversationId,
        "decision": body.decision,
        "comment": body.comment,
        "label": body.label,
        "createdAtIso": now_iso(),
    }
    db.add_feedback(event)
    return {"ok": True, "event": event}


@router.post("/notes")
def save_note(body: NoteRequest) -> dict:
    note = {
        "id": new_id("rt-note"),
        "clientId": body.clientId,
        "managerId": body.managerId,
        "taskId": body.taskId,
        "text": body.text,
        "outcome": body.outcome,
        "channel": body.channel,
        "nextContactIso": body.nextContactIso,
        "createdAtIso": now_iso(),
    }
    db.add_crm_note(note)
    return {"ok": True, "note": note}
