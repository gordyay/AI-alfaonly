from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .models import (
    ActivityLogEntry,
    CRMNote,
    CaseDetailResponse,
    CaseInteraction,
    CaseTimelineEvent,
    ChannelType,
    CockpitSection,
    CockpitStats,
    Conversation,
    GeneratedArtifact,
    ManagerCockpit,
    RecommendationStatus,
    WorkItem,
)
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
    case_id: str | None = None,
    source_interaction_id: str | None = None,
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
        case_id=case_id or client_id,
        source_interaction_id=source_interaction_id or conversation_id,
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
            work_item.case_id and note.case_id == work_item.case_id,
            work_item.recommendation_id and note.recommendation_id == work_item.recommendation_id,
            work_item.source_interaction_id and note.source_interaction_id == work_item.source_interaction_id,
            work_item.conversation_id and note.source_conversation_id == work_item.conversation_id,
            work_item.task_id and note.task_id == work_item.task_id,
        )
    )


def _unique_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _case_summary(item: WorkItem, total_items: int) -> str:
    if total_items <= 1:
        return item.summary
    return f"{item.summary} Еще сигналов в кейсе: {total_items - 1}."


def build_case_queue(runtime: AppRuntime, manager_id: str) -> ManagerCockpit:
    legacy_cockpit = runtime.cockpit_service.build_manager_cockpit(storage=runtime.storage, manager_id=manager_id)
    grouped: dict[str, list[WorkItem]] = {}
    for item in legacy_cockpit.work_queue:
        grouped.setdefault(item.client_id, []).append(item)

    case_items: list[WorkItem] = []
    for client_id, items in grouped.items():
        lead_item = items[0]
        due_candidates = [item.due_at for item in items if item.due_at]
        reasons = _unique_preserving_order([reason for item in items for reason in item.why])[:4]
        case_items.append(
            lead_item.model_copy(
                update={
                    "id": f"case:{client_id}",
                    "title": lead_item.title,
                    "summary": _case_summary(lead_item, len(items)),
                    "why": reasons or lead_item.why,
                    "recommendation_id": f"rec:case:{client_id}",
                    "recommendation_type": "case_work_item",
                    "due_at": min(due_candidates) if due_candidates else lead_item.due_at,
                    "case_id": client_id,
                    "source_interaction_id": lead_item.source_interaction_id or lead_item.conversation_id,
                    "conversation_id": lead_item.conversation_id,
                }
            )
        )

    case_items.sort(
        key=lambda item: (
            item.priority_score,
            item.due_at.isoformat() if item.due_at else "",
        ),
        reverse=True,
    )

    status_map = runtime.storage.get_recommendation_status_map(
        manager_id=manager_id,
        recommendation_ids=[item.recommendation_id for item in case_items],
    )
    case_items = [
        item.model_copy(update={"recommendation_status": status_map.get(item.recommendation_id, RecommendationStatus.pending)})
        for item in case_items
    ]

    sections: list[CockpitSection] = []
    section_definitions = {
        "task": ("daily-plan", "План дня", "Кейсы, где основной драйвер сейчас задача."),
        "communication": ("urgent-communications", "Кейсы в коммуникации", "Кейсы, где критичен возврат в контакт."),
        "opportunity": ("product-opportunities", "Коммерческие возможности", "Кейсы с сильным продуктовым следующим шагом."),
    }
    for item_type, (section_id, title, subtitle) in section_definitions.items():
        section_items = [item for item in case_items if item.item_type == item_type]
        if not section_items:
            continue
        sections.append(
            CockpitSection(
                id=section_id,
                title=title,
                subtitle=subtitle,
                item_type=item_type,
                items=section_items,
            )
        )
    stats = CockpitStats(
        actionable_items=len(case_items),
        urgent_items=sum(1 for item in case_items if item.priority_score >= 80),
        due_today_items=sum(
            1 for item in case_items if item.due_at and item.due_at.date() <= legacy_cockpit.generated_at.date()
        ),
        opportunity_items=sum(1 for item in case_items if item.item_type == "opportunity"),
        clients_in_focus=len(case_items[:5]),
    )
    return ManagerCockpit(
        manager_id=manager_id,
        generated_at=legacy_cockpit.generated_at,
        stats=stats,
        focus_item=case_items[0] if case_items else None,
        sections=sections,
        work_queue=case_items,
    )


def _build_interaction_summary(conversation: Conversation) -> str:
    if conversation.channel == ChannelType.chat:
        return conversation.messages[-1].text if conversation.messages else conversation.topic

    transcript = " ".join(message.text for message in conversation.messages[-2:]).strip()
    if transcript:
        return transcript[:280]
    if conversation.insights and conversation.insights.next_contact_reason:
        return conversation.insights.next_contact_reason
    return conversation.topic


def _build_interaction_next_step(conversation: Conversation, work_items: list[WorkItem]) -> str | None:
    related = next(
        (
            item
            for item in work_items
            if item.source_interaction_id == conversation.id or item.conversation_id == conversation.id
        ),
        None,
    )
    if related and related.next_best_action:
        return related.next_best_action
    if conversation.insights and conversation.insights.next_contact_reason:
        return conversation.insights.next_contact_reason
    return None


def build_case_interactions(client_id: str, conversations: list[Conversation], work_items: list[WorkItem]) -> list[CaseInteraction]:
    interactions: list[CaseInteraction] = []
    for conversation in conversations:
        last_activity_at = (
            conversation.messages[-1].created_at if conversation.messages else conversation.started_at
        )
        is_text_based = conversation.channel in {ChannelType.chat, ChannelType.email}
        interactions.append(
            CaseInteraction(
                id=conversation.id,
                case_id=client_id,
                client_id=client_id,
                channel=conversation.channel,
                title=conversation.topic,
                started_at=conversation.started_at,
                summary=_build_interaction_summary(conversation),
                next_step=_build_interaction_next_step(conversation, work_items),
                is_text_based=is_text_based,
                message_count=len(conversation.messages),
                last_activity_at=last_activity_at,
                messages=conversation.messages if is_text_based else [],
                insights=conversation.insights,
            )
        )
    interactions.sort(key=lambda item: item.last_activity_at or item.started_at, reverse=True)
    return interactions


def build_case_timeline(client_id: str, interactions: list[CaseInteraction]) -> list[CaseTimelineEvent]:
    timeline: list[CaseTimelineEvent] = []
    for interaction in interactions:
        if interaction.is_text_based and interaction.messages:
            for message in interaction.messages:
                timeline.append(
                    CaseTimelineEvent(
                        id=f"timeline:{message.id}",
                        case_id=client_id,
                        interaction_id=interaction.id,
                        channel=interaction.channel,
                        event_type="chat_message",
                        created_at=message.created_at,
                        title=interaction.title,
                        text=message.text,
                        sender=message.sender,
                        is_outbound=message.sender == "manager",
                    )
                )
        else:
            timeline.append(
                CaseTimelineEvent(
                    id=f"timeline:{interaction.id}",
                    case_id=client_id,
                    interaction_id=interaction.id,
                    channel=interaction.channel,
                    event_type="interaction",
                    created_at=interaction.last_activity_at or interaction.started_at,
                    title=interaction.title,
                    text=interaction.summary,
                    is_outbound=False,
                )
            )
    timeline.sort(key=lambda item: item.created_at, reverse=True)
    return timeline


def resolve_case_work_item(
    runtime: AppRuntime,
    *,
    client_id: str,
    manager_id: str,
    work_item_id: str | None = None,
    recommendation_id: str | None = None,
    conversation_id: str | None = None,
) -> Any | None:
    cockpit = build_case_queue(runtime, manager_id)
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
) -> CaseDetailResponse:
    cockpit = build_case_queue(runtime, manager_id)
    client_work_items = [item for item in cockpit.work_queue if item.client_id == client_id]
    selected_work_item = (
        next((item for item in client_work_items if item.id == work_item_id), None)
        if work_item_id
        else None
    ) or (client_work_items[0] if client_work_items else None)
    client = runtime.storage.get_client(client_id)
    if client is None:
        raise ValueError(f"Client {client_id} not found")
    conversations = runtime.storage.list_client_conversations(client_id)
    interactions = build_case_interactions(client_id, conversations, client_work_items)
    selected_interaction = (
        next(
            (
                interaction
                for interaction in interactions
                if interaction.id
                == (
                    selected_work_item.source_interaction_id
                    or selected_work_item.conversation_id
                    if selected_work_item
                    else None
                )
            ),
            None,
        )
        if selected_work_item
        else None
    ) or next((interaction for interaction in interactions if interaction.is_text_based), None) or (interactions[0] if interactions else None)

    crm_notes = runtime.storage.list_client_crm_notes(client_id)
    case_crm_notes = [note.model_copy(update={"case_id": client_id, "source_interaction_id": note.source_interaction_id or note.source_conversation_id}) for note in crm_notes]
    feedback = runtime.storage.list_feedback(manager_id=manager_id, client_id=client_id, limit=20)
    feedback = [
        item.model_copy(update={"case_id": client_id, "source_interaction_id": item.source_interaction_id or item.conversation_id})
        for item in feedback
    ]
    activity_log = runtime.storage.list_client_activity_logs(client_id)
    activity_log = [
        entry.model_copy(update={"case_id": client_id, "source_interaction_id": entry.source_interaction_id or entry.conversation_id})
        for entry in activity_log
    ]
    follow_ups = runtime.storage.list_client_follow_ups(client_id)

    saved_ai_draft = next(
        (
            revision.draft
            for revision in runtime.storage.list_crm_draft_revisions(
                client_id=client_id,
                recommendation_id=None,
                conversation_id=selected_interaction.id if selected_interaction else None,
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
        recommendation_id=None,
        conversation_id=None,
    )
    script_history = [
        item.model_copy(update={"case_id": client_id, "source_interaction_id": item.source_interaction_id or item.conversation_id})
        for item in script_history
    ]
    objection_history = runtime.storage.list_objection_workflows(
        client_id=client_id,
        recommendation_id=None,
        conversation_id=None,
    )
    objection_history = [
        item.model_copy(update={"case_id": client_id, "source_interaction_id": item.source_interaction_id or item.conversation_id})
        for item in objection_history
    ]
    crm_draft_history = runtime.storage.list_crm_draft_revisions(
        client_id=client_id,
        recommendation_id=None,
        conversation_id=None,
    )
    crm_draft_history = [
        item.model_copy(update={"case_id": client_id, "source_interaction_id": item.source_interaction_id or item.conversation_id})
        for item in crm_draft_history
    ]

    latest_objection = objection_history[0] if objection_history else None
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
                conversation=next((item for item in conversations if item.id == selected_interaction.id), None) if selected_interaction else None,
            )
            if selected_interaction is not None
            else None
        )
    )
    generated_artifacts = [
        artifact.model_copy(
            update={
                "case_id": client_id,
                "source_interaction_id": artifact.source_interaction_id or artifact.source_conversation_id,
            }
        )
        for artifact in runtime.cockpit_service.build_client_artifacts(
            client,
            case_crm_notes,
            script_history=script_history,
            objection_history=objection_history,
        )
    ]

    return CaseDetailResponse(
        client=client,
        case_id=client_id,
        tasks=runtime.storage.list_client_tasks(client_id),
        interactions=interactions,
        timeline=build_case_timeline(client_id, interactions),
        selected_work_item_id=selected_work_item.id if selected_work_item else None,
        selected_interaction_id=selected_interaction.id if selected_interaction else None,
        work_items=client_work_items,
        product_propensity=runtime.propensity_service.build_client_propensity(storage=runtime.storage, client=client),
        objection_workflow=objection_workflow,
        crm_notes=case_crm_notes,
        follow_ups=follow_ups,
        recommendation_feedback=feedback,
        activity_log=activity_log,
        generated_artifacts=generated_artifacts,
        saved_ai_draft=saved_ai_draft,
        script_history=script_history,
        objection_history=objection_history,
        crm_draft_history=crm_draft_history,
    )
