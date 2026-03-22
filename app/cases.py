from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .models import ActivityLogEntry, CRMNote
from .runtime import AppRuntime


def log_activity(
    runtime: AppRuntime,
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
) -> ActivityLogEntry:
    excerpt = None
    if payload_excerpt:
        excerpt = " ".join(payload_excerpt.split())
        excerpt = excerpt[:240]
    context = None
    if context_snapshot:
        context = " ".join(context_snapshot.split())
        context = context[:320]

    entry = ActivityLogEntry(
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
    runtime.storage.add_activity_log(entry)
    return entry


def work_item_matches_note(work_item: Any, note: CRMNote) -> bool:
    return any(
        (
            work_item.recommendation_id and note.recommendation_id == work_item.recommendation_id,
            work_item.conversation_id and note.source_conversation_id == work_item.conversation_id,
            work_item.task_id and note.task_id == work_item.task_id,
        )
    )


def resolve_case_work_item(
    runtime: AppRuntime,
    *,
    client_id: str,
    manager_id: str,
    work_item_id: str | None = None,
    recommendation_id: str | None = None,
    conversation_id: str | None = None,
) -> Any | None:
    cockpit = runtime.cockpit_service.build_manager_cockpit(storage=runtime.storage, manager_id=manager_id)
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
    ai_draft: Any,
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


def build_case_view(
    runtime: AppRuntime,
    client_id: str,
    manager_id: str,
    work_item_id: str | None = None,
) -> dict[str, Any]:
    cockpit = runtime.cockpit_service.build_manager_cockpit(storage=runtime.storage, manager_id=manager_id)
    client_work_items = [item for item in cockpit.work_queue if item.client_id == client_id]
    selected_work_item = (
        next((item for item in client_work_items if item.id == work_item_id), None)
        if work_item_id
        else None
    ) or (client_work_items[0] if client_work_items else None)
    conversations = runtime.storage.list_client_conversations(client_id)
    selected_conversation = (
        next(
            (conversation for conversation in conversations if conversation.id == selected_work_item.conversation_id),
            None,
        )
        if selected_work_item and selected_work_item.conversation_id
        else None
    )

    crm_notes = runtime.storage.list_client_crm_notes(client_id)
    case_crm_notes = (
        [note for note in crm_notes if work_item_matches_note(selected_work_item, note)]
        if selected_work_item
        else crm_notes
    )
    feedback = runtime.storage.list_feedback(manager_id=manager_id, client_id=client_id, limit=20)
    if selected_work_item is not None:
        feedback = [
            item
            for item in feedback
            if item.recommendation_id == selected_work_item.recommendation_id
            or (selected_work_item.conversation_id and item.conversation_id == selected_work_item.conversation_id)
        ]
    activity_log = runtime.storage.list_client_activity_logs(client_id)
    if selected_work_item is not None:
        activity_log = [
            entry
            for entry in activity_log
            if entry.recommendation_id == selected_work_item.recommendation_id
            or (selected_work_item.conversation_id and entry.conversation_id == selected_work_item.conversation_id)
        ]
    follow_ups = runtime.storage.list_client_follow_ups(client_id)
    if case_crm_notes:
        case_note_ids = {note.id for note in case_crm_notes}
        follow_ups = [item for item in follow_ups if item.crm_note_id in case_note_ids]
    elif selected_work_item is not None:
        follow_ups = []

    saved_ai_draft = next(
        (
            revision.draft
            for revision in runtime.storage.list_crm_draft_revisions(
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
    script_history = runtime.storage.list_script_generations(
        client_id=client_id,
        recommendation_id=selected_work_item.recommendation_id if selected_work_item else None,
        conversation_id=selected_conversation.id if selected_conversation else None,
    )
    objection_history = runtime.storage.list_objection_workflows(
        client_id=client_id,
        recommendation_id=selected_work_item.recommendation_id if selected_work_item else None,
        conversation_id=selected_conversation.id if selected_conversation else None,
    )
    crm_draft_history = runtime.storage.list_crm_draft_revisions(
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
