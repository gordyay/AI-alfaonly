from __future__ import annotations

from uuid import uuid4

from ..ai.base import AIProvider, AIProviderError
from ..db import SQLiteStorage, utc_now
from ..models import (
    AssistantActionResult,
    AssistantApplyResponse,
    AssistantChatResponse,
    AssistantCitation,
    AssistantMessageActionPayload,
    AssistantMessageRecord,
    AssistantMessageRole,
    AssistantPreview,
    AssistantPreviewChoice,
    AssistantScopeKind,
    AssistantTaskKind,
    AssistantThread,
    AssistantThreadDetail,
    ObjectionWorkflowRecord,
    ScriptGenerationRecord,
)
from .ai_script import AIScriptService
from .ai_summary import AISummaryService
from .assistant_kb import AssistantKnowledgeService
from .cockpit import ManagerCockpitService
from .dialogs import DialogPriorityService
from .objections import ObjectionWorkflowService
from .propensity import ProductPropensityService


THREAD_MEMORY_TRIGGER = 12
THREAD_RECENT_MESSAGES = 6


class AssistantService:
    def create_thread(
        self,
        storage: SQLiteStorage,
        *,
        manager_id: str,
        scope_kind: AssistantScopeKind = AssistantScopeKind.global_scope,
        client_id: str | None = None,
        work_item_id: str | None = None,
        interaction_id: str | None = None,
        task_kind: AssistantTaskKind | None = None,
        selected_client_id: str | None = None,
        title: str | None = None,
    ) -> AssistantThread:
        if scope_kind == AssistantScopeKind.case and task_kind is not None:
            existing = storage.find_assistant_thread(
                manager_id=manager_id,
                scope_kind=scope_kind,
                client_id=client_id,
                work_item_id=work_item_id,
                task_kind=task_kind,
            )
            if existing is not None:
                return existing

        now = utc_now()
        thread = AssistantThread(
            id=str(uuid4()),
            manager_id=manager_id,
            title=title or "Новая сессия",
            scope_kind=scope_kind,
            client_id=client_id,
            work_item_id=work_item_id,
            interaction_id=interaction_id,
            task_kind=task_kind,
            last_selected_client_id=selected_client_id or client_id,
            memory_summary=None,
            created_at=now,
            updated_at=now,
        )
        return storage.create_assistant_thread(thread)

    def list_threads(
        self,
        storage: SQLiteStorage,
        manager_id: str,
        *,
        scope_kind: AssistantScopeKind | None = None,
        client_id: str | None = None,
        work_item_id: str | None = None,
    ) -> list[AssistantThread]:
        return storage.list_assistant_threads(
            manager_id,
            scope_kind=scope_kind,
            client_id=client_id,
            work_item_id=work_item_id,
        )

    def get_thread_detail(self, storage: SQLiteStorage, thread_id: str) -> AssistantThreadDetail | None:
        thread = storage.get_assistant_thread(thread_id)
        if thread is None:
            return None
        return AssistantThreadDetail(thread=thread, messages=storage.list_assistant_messages(thread_id))

    def chat(
        self,
        *,
        storage: SQLiteStorage,
        provider: AIProvider,
        kb_service: AssistantKnowledgeService,
        dialog_service: DialogPriorityService,
        ai_summary_service: AISummaryService,
        ai_script_service: AIScriptService,
        propensity_service: ProductPropensityService,
        objection_service: ObjectionWorkflowService,
        manager_id: str,
        thread_id: str,
        task_kind: AssistantTaskKind,
        message: str,
        selected_client_id: str | None = None,
        selected_work_item_id: str | None = None,
        selected_interaction_id: str | None = None,
        task_input: str | None = None,
        cockpit_service: ManagerCockpitService | None = None,
        log_activity=None,
    ) -> AssistantChatResponse:
        thread = storage.get_assistant_thread(thread_id)
        if thread is None or thread.manager_id != manager_id:
            raise ValueError("Assistant session not found")

        now = utc_now()
        user_message = AssistantMessageRecord(
            id=str(uuid4()),
            thread_id=thread.id,
            role=AssistantMessageRole.user,
            content=message,
            citations=[],
            used_context=[],
            created_at=now,
        )
        storage.add_assistant_message(user_message)

        if selected_client_id or selected_work_item_id or selected_interaction_id or task_kind != thread.task_kind:
            storage.update_assistant_thread(
                thread.id,
                client_id=selected_client_id,
                work_item_id=selected_work_item_id,
                interaction_id=selected_interaction_id,
                task_kind=task_kind,
                last_selected_client_id=selected_client_id,
                updated_at=now,
            )

        preview: AssistantPreview | None = None
        action_result: AssistantActionResult | None = None
        try:
            if task_kind == AssistantTaskKind.summary_crm:
                assistant_message, preview = self._run_summary_action(
                    storage=storage,
                    provider=provider,
                    ai_summary_service=ai_summary_service,
                    dialog_service=dialog_service,
                    kb_service=kb_service,
                    manager_id=manager_id,
                    thread_id=thread.id,
                    selected_client_id=selected_client_id,
                    selected_work_item_id=selected_work_item_id,
                    selected_interaction_id=selected_interaction_id,
                    cockpit_service=cockpit_service,
                    log_activity=log_activity,
                )
            elif task_kind == AssistantTaskKind.sales_script:
                assistant_message, preview = self._run_script_action(
                    storage=storage,
                    provider=provider,
                    ai_script_service=ai_script_service,
                    dialog_service=dialog_service,
                    propensity_service=propensity_service,
                    objection_service=objection_service,
                    manager_id=manager_id,
                    thread_id=thread.id,
                    selected_client_id=selected_client_id,
                    selected_work_item_id=selected_work_item_id,
                    selected_interaction_id=selected_interaction_id,
                    cockpit_service=cockpit_service,
                    instruction=task_input or message,
                    log_activity=log_activity,
                )
            elif task_kind == AssistantTaskKind.objection_workflow:
                assistant_message, preview = self._run_objection_action(
                    storage=storage,
                    provider=provider,
                    objection_service=objection_service,
                    manager_id=manager_id,
                    thread_id=thread.id,
                    selected_client_id=selected_client_id,
                    selected_work_item_id=selected_work_item_id,
                    selected_interaction_id=selected_interaction_id,
                    cockpit_service=cockpit_service,
                    objection_text=task_input or message,
                    log_activity=log_activity,
                )
            elif task_kind == AssistantTaskKind.reply_draft:
                assistant_message, preview = self._run_reply_draft_action(
                    storage=storage,
                    provider=provider,
                    ai_script_service=ai_script_service,
                    dialog_service=dialog_service,
                    propensity_service=propensity_service,
                    objection_service=objection_service,
                    manager_id=manager_id,
                    thread_id=thread.id,
                    selected_client_id=selected_client_id,
                    selected_work_item_id=selected_work_item_id,
                    selected_interaction_id=selected_interaction_id,
                    cockpit_service=cockpit_service,
                    instruction=task_input or message,
                    log_activity=log_activity,
                )
            else:
                assistant_message, preview = self._run_knowledge_chat(
                    storage=storage,
                    provider=provider,
                    kb_service=kb_service,
                    manager_id=manager_id,
                    thread_id=thread.id,
                    message=message,
                    selected_client_id=selected_client_id,
                    task_kind=task_kind,
                )
        except AIProviderError as exc:
            assistant_message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread.id,
                role=AssistantMessageRole.assistant,
                content=str(exc),
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )

        storage.add_assistant_message(assistant_message)

        if thread.title == "Новая сессия":
            storage.update_assistant_thread(
                thread.id,
                title=self._derive_thread_title(thread, task_kind, selected_client_id, storage),
                updated_at=assistant_message.created_at,
            )

        if storage.count_assistant_messages(thread.id) > THREAD_MEMORY_TRIGGER:
            recent_messages = storage.list_assistant_messages(thread.id)[-THREAD_RECENT_MESSAGES:]
            storage.update_assistant_thread(
                thread.id,
                memory_summary=self._build_memory_summary(recent_messages),
                updated_at=assistant_message.created_at,
            )

        refreshed_thread = storage.get_assistant_thread(thread.id)
        assert refreshed_thread is not None
        return AssistantChatResponse(
            session=refreshed_thread,
            assistant_message=assistant_message,
            citations=assistant_message.citations,
            used_context=assistant_message.used_context,
            preview=preview,
            action_result=action_result,
        )

    def apply(
        self,
        *,
        storage: SQLiteStorage,
        manager_id: str,
        thread_id: str,
        task_kind: AssistantTaskKind,
        selected_client_id: str | None = None,
        selected_work_item_id: str | None = None,
        selected_interaction_id: str | None = None,
        selected_choice: str | None = None,
        cockpit_service: ManagerCockpitService | None = None,
        log_activity=None,
    ) -> AssistantApplyResponse:
        thread = storage.get_assistant_thread(thread_id)
        if thread is None or thread.manager_id != manager_id:
            raise ValueError("Assistant session not found")

        payload = self._get_latest_action_payload(storage, thread_id, task_kind)
        if payload is None:
            raise ValueError("No assistant preview available to apply")

        target_tab: str | None = None
        message = "Результат применен."
        action_result: AssistantActionResult | None = None

        client, work_item, conversation = self._resolve_case_scope(
            storage=storage,
            cockpit_service=cockpit_service,
            manager_id=manager_id,
            client_id=selected_client_id or thread.client_id,
            selected_work_item_id=selected_work_item_id or thread.work_item_id,
            selected_interaction_id=selected_interaction_id or thread.interaction_id,
        )

        if task_kind == AssistantTaskKind.summary_crm:
            if payload.summary_draft is None:
                raise ValueError("Summary draft is not available")
            target_tab = "crm"
            message = "Черновик перенесен в CRM."
            action_result = AssistantActionResult(
                action_type="summary_crm_draft",
                task_kind=task_kind,
                client_id=client.id if client else selected_client_id,
                conversation_id=conversation.id if conversation else None,
                case_id=client.id if client else None,
                source_interaction_id=conversation.id if conversation else None,
                draft=payload.summary_draft,
                note="Проверьте и сохраните черновик в CRM.",
            )
        elif task_kind == AssistantTaskKind.reply_draft:
            if not payload.reply_draft_text:
                raise ValueError("Reply draft is not available")
            target_tab = "overview"
            message = "Черновик ответа перенесен в кейс."
            action_result = AssistantActionResult(
                action_type="reply_draft",
                task_kind=task_kind,
                client_id=client.id if client else selected_client_id,
                conversation_id=conversation.id if conversation else None,
                case_id=client.id if client else None,
                source_interaction_id=conversation.id if conversation else None,
                reply_draft_text=payload.reply_draft_text,
                note="Проверьте текст перед отправкой клиенту.",
            )
        elif task_kind == AssistantTaskKind.sales_script:
            if payload.sales_script_draft is None:
                raise ValueError("Sales script is not available")
            if not client:
                raise ValueError("Client context is missing")
            selected_variant_label, selected_text = self._resolve_script_selection(payload, selected_choice)
            artifact = storage.add_script_generation(
                ScriptGenerationRecord(
                    id=str(uuid4()),
                    client_id=client.id,
                    manager_id=manager_id,
                    recommendation_id=work_item.recommendation_id if work_item else None,
                    conversation_id=conversation.id if conversation else None,
                    case_id=client.id,
                    source_interaction_id=conversation.id if conversation else None,
                    contact_goal=payload.sales_script_draft.contact_goal,
                    selected_variant_label=selected_variant_label,
                    selected_text=selected_text,
                    draft=payload.sales_script_draft,
                    created_at=utc_now(),
                    selected_at=utc_now(),
                )
            )
            if log_activity is not None:
                log_activity(
                    recommendation_type="sales_script",
                    client_id=client.id,
                    recommendation_id=work_item.recommendation_id if work_item else None,
                    conversation_id=conversation.id if conversation else None,
                    case_id=client.id,
                    source_interaction_id=conversation.id if conversation else None,
                    manager_id=manager_id,
                    action="assistant_script_applied",
                    payload_excerpt=selected_variant_label,
                    context_snapshot=selected_text,
                )
            target_tab = "actions"
            message = "Скрипт сохранен в историю кейса."
            action_result = AssistantActionResult(
                action_type="sales_script",
                task_kind=task_kind,
                client_id=client.id,
                conversation_id=conversation.id if conversation else None,
                case_id=client.id,
                source_interaction_id=conversation.id if conversation else None,
                sales_script_draft=artifact.draft,
                note=f"Выбран вариант: {selected_variant_label}",
            )
        elif task_kind == AssistantTaskKind.objection_workflow:
            if payload.objection_workflow_draft is None:
                raise ValueError("Objection workflow is not available")
            if not client:
                raise ValueError("Client context is missing")
            selected_title, selected_response = self._resolve_objection_selection(payload, selected_choice)
            artifact = storage.add_objection_workflow(
                ObjectionWorkflowRecord(
                    id=str(uuid4()),
                    client_id=client.id,
                    manager_id=manager_id,
                    recommendation_id=work_item.recommendation_id if work_item else None,
                    conversation_id=conversation.id if conversation else None,
                    case_id=client.id,
                    source_interaction_id=conversation.id if conversation else None,
                    selected_option_title=selected_title,
                    selected_response=selected_response,
                    draft=payload.objection_workflow_draft,
                    created_at=utc_now(),
                    selected_at=utc_now(),
                )
            )
            if log_activity is not None:
                log_activity(
                    recommendation_type="objection_workflow",
                    client_id=client.id,
                    recommendation_id=work_item.recommendation_id if work_item else None,
                    conversation_id=conversation.id if conversation else None,
                    case_id=client.id,
                    source_interaction_id=conversation.id if conversation else None,
                    manager_id=manager_id,
                    action="assistant_objection_applied",
                    payload_excerpt=selected_title,
                    context_snapshot=selected_response,
                )
            target_tab = "actions"
            message = "Ответ на возражение сохранен в кейс."
            action_result = AssistantActionResult(
                action_type="objection_workflow",
                task_kind=task_kind,
                client_id=client.id,
                conversation_id=conversation.id if conversation else None,
                case_id=client.id,
                source_interaction_id=conversation.id if conversation else None,
                objection_workflow_draft=artifact.draft,
                note=f"Выбран ответ: {selected_title}",
            )
        else:
            raise ValueError("This assistant task does not support apply")

        self._record_tool_message(storage, thread_id, message)
        refreshed_thread = storage.get_assistant_thread(thread_id)
        assert refreshed_thread is not None
        return AssistantApplyResponse(
            session=refreshed_thread,
            applied=True,
            task_kind=task_kind,
            target_tab=target_tab,
            message=message,
            action_result=action_result,
        )

    def _run_summary_action(
        self,
        *,
        storage: SQLiteStorage,
        provider: AIProvider,
        ai_summary_service: AISummaryService,
        dialog_service: DialogPriorityService,
        kb_service: AssistantKnowledgeService,
        manager_id: str,
        thread_id: str,
        selected_client_id: str | None,
        selected_work_item_id: str | None,
        selected_interaction_id: str | None,
        cockpit_service: ManagerCockpitService | None,
        log_activity,
    ) -> tuple[AssistantMessageRecord, AssistantPreview]:
        if not selected_client_id:
            return self._build_blocking_message(
                thread_id,
                "Чтобы подготовить сводку, сначала откройте нужный кейс.",
                AssistantTaskKind.summary_crm,
            )

        client, work_item, conversation = self._resolve_case_scope(
            storage=storage,
            cockpit_service=cockpit_service,
            manager_id=manager_id,
            client_id=selected_client_id,
            selected_work_item_id=selected_work_item_id,
            selected_interaction_id=selected_interaction_id,
        )
        if client is None:
            return self._build_blocking_message(thread_id, "Не удалось найти выбранного клиента.", AssistantTaskKind.summary_crm)
        if conversation is None:
            return self._build_blocking_message(
                thread_id,
                "У кейса нет коммуникации, поэтому собрать сводку сейчас нельзя.",
                AssistantTaskKind.summary_crm,
            )

        recommendation = dialog_service.build_recommendation(client=client, conversation=conversation)
        result = ai_summary_service.summarize_dialog(
            provider=provider,
            client=client,
            conversation=conversation,
            recommendation=recommendation,
        )
        if log_activity is not None:
            log_activity(
                recommendation_type="assistant_summary_preview",
                client_id=client.id,
                recommendation_id=work_item.recommendation_id if work_item else None,
                conversation_id=conversation.id,
                case_id=client.id,
                source_interaction_id=conversation.id,
                manager_id=manager_id,
                action="assistant_preview_generated",
                payload_excerpt=result.draft.contact_summary,
                context_snapshot=" | ".join(result.draft.grounding_facts),
            )

        used_context = self._build_client_used_context(storage, manager_id, client.id)
        assistant_message = AssistantMessageRecord(
            id=str(uuid4()),
            thread_id=thread_id,
            role=AssistantMessageRole.assistant,
            content=f"Подготовил сводку и CRM-черновик по клиенту {client.full_name}.",
            citations=used_context[:2],
            used_context=used_context,
            action_payload=AssistantMessageActionPayload(
                action_type="summary_crm",
                summary_draft=result.draft,
            ),
            created_at=utc_now(),
        )
        preview = AssistantPreview(
            task_kind=AssistantTaskKind.summary_crm,
            title="Сводка и CRM-черновик",
            summary=result.draft.contact_summary,
            target_tab="crm",
            can_apply=True,
            payload={
                "outcome": result.draft.outcome,
                "follow_up_required": result.draft.follow_up_required,
            },
        )
        return assistant_message, preview

    def _run_script_action(
        self,
        *,
        storage: SQLiteStorage,
        provider: AIProvider,
        ai_script_service: AIScriptService,
        dialog_service: DialogPriorityService,
        propensity_service: ProductPropensityService,
        objection_service: ObjectionWorkflowService,
        manager_id: str,
        thread_id: str,
        selected_client_id: str | None,
        selected_work_item_id: str | None,
        selected_interaction_id: str | None,
        cockpit_service: ManagerCockpitService | None,
        instruction: str,
        log_activity,
    ) -> tuple[AssistantMessageRecord, AssistantPreview]:
        if not selected_client_id:
            return self._build_blocking_message(
                thread_id,
                "Чтобы подготовить скрипт, сначала откройте кейс.",
                AssistantTaskKind.sales_script,
            )

        client, work_item, conversation = self._resolve_case_scope(
            storage=storage,
            cockpit_service=cockpit_service,
            manager_id=manager_id,
            client_id=selected_client_id,
            selected_work_item_id=selected_work_item_id,
            selected_interaction_id=selected_interaction_id,
        )
        if client is None:
            return self._build_blocking_message(thread_id, "Не удалось найти выбранного клиента.", AssistantTaskKind.sales_script)
        if conversation is None:
            return self._build_blocking_message(
                thread_id,
                "У кейса нет коммуникации, поэтому собрать скрипт сейчас нельзя.",
                AssistantTaskKind.sales_script,
            )

        recommendation = dialog_service.build_recommendation(client=client, conversation=conversation)
        crm_notes = storage.list_client_crm_notes(client.id)
        product_propensity = propensity_service.build_client_propensity(storage=storage, client=client)
        objection_workflow = objection_service.build_workflow(
            provider=provider,
            client=client,
            conversation=conversation,
        )
        result = ai_script_service.generate_script(
            provider=provider,
            client=client,
            conversation=conversation,
            recommendation=recommendation,
            crm_notes=crm_notes,
            instruction=instruction,
            contact_goal=work_item.next_best_action if work_item else None,
            product_propensities=product_propensity.items,
            objection_workflow=objection_workflow.draft,
        )
        if log_activity is not None:
            log_activity(
                recommendation_type="assistant_sales_script_preview",
                client_id=client.id,
                recommendation_id=work_item.recommendation_id if work_item else None,
                conversation_id=conversation.id,
                case_id=client.id,
                source_interaction_id=conversation.id,
                manager_id=manager_id,
                action="assistant_preview_generated",
                payload_excerpt=result.draft.ready_script,
                context_snapshot=" | ".join(result.draft.grounding_facts),
            )

        used_context = self._build_client_used_context(storage, manager_id, client.id)
        assistant_message = AssistantMessageRecord(
            id=str(uuid4()),
            thread_id=thread_id,
            role=AssistantMessageRole.assistant,
            content=f"Подготовил варианты скрипта по клиенту {client.full_name}.",
            citations=used_context[:2],
            used_context=used_context,
            action_payload=AssistantMessageActionPayload(
                action_type="sales_script",
                sales_script_draft=result.draft,
            ),
            created_at=utc_now(),
        )
        choices = [
            AssistantPreviewChoice(id="main", title="Основной вариант", text=result.draft.ready_script),
            *[
                AssistantPreviewChoice(
                    id=variant.label,
                    title=variant.label,
                    text=variant.ready_script,
                    helper_text=" · ".join([item for item in [variant.style, variant.tactic] if item]) or None,
                )
                for variant in result.draft.alternatives
            ],
        ]
        preview = AssistantPreview(
            task_kind=AssistantTaskKind.sales_script,
            title="Скрипт контакта",
            summary=result.draft.ready_script,
            target_tab="actions",
            can_apply=True,
            requires_choice=True,
            choices=choices,
            payload={"contact_goal": result.draft.contact_goal},
        )
        return assistant_message, preview

    def _run_objection_action(
        self,
        *,
        storage: SQLiteStorage,
        provider: AIProvider,
        objection_service: ObjectionWorkflowService,
        manager_id: str,
        thread_id: str,
        selected_client_id: str | None,
        selected_work_item_id: str | None,
        selected_interaction_id: str | None,
        cockpit_service: ManagerCockpitService | None,
        objection_text: str,
        log_activity,
    ) -> tuple[AssistantMessageRecord, AssistantPreview]:
        if not selected_client_id:
            return self._build_blocking_message(
                thread_id,
                "Чтобы разобрать возражение, сначала откройте кейс.",
                AssistantTaskKind.objection_workflow,
            )

        client, work_item, conversation = self._resolve_case_scope(
            storage=storage,
            cockpit_service=cockpit_service,
            manager_id=manager_id,
            client_id=selected_client_id,
            selected_work_item_id=selected_work_item_id,
            selected_interaction_id=selected_interaction_id,
        )
        if client is None:
            return self._build_blocking_message(
                thread_id,
                "Не удалось найти выбранного клиента.",
                AssistantTaskKind.objection_workflow,
            )
        if conversation is None:
            return self._build_blocking_message(
                thread_id,
                "У кейса нет коммуникации, поэтому разбор возражения сейчас недоступен.",
                AssistantTaskKind.objection_workflow,
            )

        result = objection_service.build_workflow(
            provider=provider,
            client=client,
            conversation=conversation,
            objection_text=objection_text,
        )
        if log_activity is not None:
            log_activity(
                recommendation_type="assistant_objection_preview",
                client_id=client.id,
                recommendation_id=work_item.recommendation_id if work_item else None,
                conversation_id=conversation.id,
                case_id=client.id,
                source_interaction_id=conversation.id,
                manager_id=manager_id,
                action="assistant_preview_generated",
                payload_excerpt=result.draft.analysis.objection_label,
                context_snapshot=" | ".join(result.draft.grounding_facts),
            )

        used_context = self._build_client_used_context(storage, manager_id, client.id)
        assistant_message = AssistantMessageRecord(
            id=str(uuid4()),
            thread_id=thread_id,
            role=AssistantMessageRole.assistant,
            content=f"Подготовил варианты ответа на возражение по клиенту {client.full_name}.",
            citations=used_context[:2],
            used_context=used_context,
            action_payload=AssistantMessageActionPayload(
                action_type="objection_workflow",
                objection_workflow_draft=result.draft,
            ),
            created_at=utc_now(),
        )
        preview = AssistantPreview(
            task_kind=AssistantTaskKind.objection_workflow,
            title=result.draft.analysis.objection_label,
            summary=result.draft.next_step,
            target_tab="actions",
            can_apply=True,
            requires_choice=True,
            choices=[
                AssistantPreviewChoice(
                    id=option.title,
                    title=option.title,
                    text=option.response,
                    helper_text=option.rationale,
                )
                for option in result.draft.handling_options
            ],
            payload={"confidence": round(result.draft.analysis.confidence * 100)},
        )
        return assistant_message, preview

    def _run_reply_draft_action(
        self,
        *,
        storage: SQLiteStorage,
        provider: AIProvider,
        ai_script_service: AIScriptService,
        dialog_service: DialogPriorityService,
        propensity_service: ProductPropensityService,
        objection_service: ObjectionWorkflowService,
        manager_id: str,
        thread_id: str,
        selected_client_id: str | None,
        selected_work_item_id: str | None,
        selected_interaction_id: str | None,
        cockpit_service: ManagerCockpitService | None,
        instruction: str,
        log_activity,
    ) -> tuple[AssistantMessageRecord, AssistantPreview]:
        if not selected_client_id:
            return self._build_blocking_message(
                thread_id,
                "Чтобы подготовить ответ, сначала откройте кейс.",
                AssistantTaskKind.reply_draft,
            )

        client, work_item, conversation = self._resolve_case_scope(
            storage=storage,
            cockpit_service=cockpit_service,
            manager_id=manager_id,
            client_id=selected_client_id,
            selected_work_item_id=selected_work_item_id,
            selected_interaction_id=selected_interaction_id,
        )
        if client is None:
            return self._build_blocking_message(thread_id, "Не удалось найти выбранного клиента.", AssistantTaskKind.reply_draft)
        if conversation is None:
            return self._build_blocking_message(
                thread_id,
                "У кейса нет текстовой коммуникации, поэтому ответ подготовить нельзя.",
                AssistantTaskKind.reply_draft,
            )

        recommendation = dialog_service.build_recommendation(client=client, conversation=conversation)
        crm_notes = storage.list_client_crm_notes(client.id)
        product_propensity = propensity_service.build_client_propensity(storage=storage, client=client)
        objection_workflow = objection_service.build_workflow(
            provider=provider,
            client=client,
            conversation=conversation,
        )
        result = ai_script_service.generate_script(
            provider=provider,
            client=client,
            conversation=conversation,
            recommendation=recommendation,
            crm_notes=crm_notes,
            instruction=instruction,
            contact_goal=work_item.next_best_action if work_item else None,
            product_propensities=product_propensity.items,
            objection_workflow=objection_workflow.draft,
        )
        reply_text = result.draft.follow_up_message or result.draft.ready_script
        if log_activity is not None:
            log_activity(
                recommendation_type="assistant_reply_preview",
                client_id=client.id,
                recommendation_id=work_item.recommendation_id if work_item else None,
                conversation_id=conversation.id,
                case_id=client.id,
                source_interaction_id=conversation.id,
                manager_id=manager_id,
                action="assistant_preview_generated",
                payload_excerpt=reply_text,
                context_snapshot=" | ".join(result.draft.grounding_facts),
            )

        used_context = self._build_client_used_context(storage, manager_id, client.id)
        assistant_message = AssistantMessageRecord(
            id=str(uuid4()),
            thread_id=thread_id,
            role=AssistantMessageRole.assistant,
            content=f"Подготовил черновик ответа клиенту {client.full_name}.",
            citations=used_context[:2],
            used_context=used_context,
            action_payload=AssistantMessageActionPayload(
                action_type="reply_draft",
                reply_draft_text=reply_text,
            ),
            created_at=utc_now(),
        )
        preview = AssistantPreview(
            task_kind=AssistantTaskKind.reply_draft,
            title="Черновик ответа клиенту",
            summary=reply_text,
            target_tab="overview",
            can_apply=True,
        )
        return assistant_message, preview

    def _run_knowledge_chat(
        self,
        *,
        storage: SQLiteStorage,
        provider: AIProvider,
        kb_service: AssistantKnowledgeService,
        manager_id: str,
        thread_id: str,
        message: str,
        selected_client_id: str | None,
        task_kind: AssistantTaskKind,
    ) -> tuple[AssistantMessageRecord, AssistantPreview | None]:
        selected_citations = kb_service.retrieve_snapshots(
            storage=storage,
            manager_id=manager_id,
            query=message,
            selected_client_id=selected_client_id,
        )
        snapshots = kb_service.resolve_snapshot_context(storage, manager_id, selected_citations)
        prompt_knowledge = kb_service.build_prompt_knowledge_from_snapshots(snapshots)
        citation_map = {
            prompt_item["ref_id"]: AssistantCitation(
                snapshot_id=prompt_item["snapshot_id"],
                title=prompt_item["title"],
                snapshot_type=snapshot.snapshot_type,
                client_id=snapshot.client_id,
                excerpt=self._build_excerpt(snapshot.content_text),
            )
            for prompt_item, snapshot in zip(prompt_knowledge, snapshots, strict=False)
        }
        recent_messages = storage.list_assistant_messages(thread_id)[-THREAD_RECENT_MESSAGES:]
        current_client = storage.get_client(selected_client_id) if selected_client_id else None
        llm_response = provider.assistant_chat(
            {
                "scope": {
                    "manager_id": manager_id,
                    "selected_client_id": selected_client_id,
                    "selected_client_name": current_client.full_name if current_client else None,
                    "task_kind": task_kind.value,
                },
                "thread": {
                    "memory_summary": storage.get_assistant_thread(thread_id).memory_summary if storage.get_assistant_thread(thread_id) else None,
                    "recent_messages": [
                        {"role": item.role.value, "content": item.content}
                        for item in recent_messages
                    ],
                },
                "knowledge": prompt_knowledge,
                "user_message": message,
                "available_actions": self._available_actions(task_kind),
            }
        )
        citations = [citation_map[ref_id] for ref_id in llm_response.citations if ref_id in citation_map]
        used_context = list(citation_map.values())
        assistant_message = AssistantMessageRecord(
            id=str(uuid4()),
            thread_id=thread_id,
            role=AssistantMessageRole.assistant,
            content=llm_response.answer,
            citations=citations,
            used_context=used_context,
            created_at=utc_now(),
        )
        return assistant_message, None

    @staticmethod
    def _available_actions(task_kind: AssistantTaskKind) -> list[str]:
        if task_kind == AssistantTaskKind.client_qa:
            return [
                "Что важно по клиенту?",
                "Какой следующий шаг по кейсу?",
                "На что обратить внимание перед контактом?",
            ]
        return [
            "Сделай сводку диалога",
            "Подготовь CRM-заметку",
            "Подготовь скрипт продажи",
            "Как отработать возражение?",
            "Как ответить клиенту?",
        ]

    @staticmethod
    def _build_blocking_message(
        thread_id: str,
        text: str,
        task_kind: AssistantTaskKind,
    ) -> tuple[AssistantMessageRecord, AssistantPreview]:
        return (
            AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content=text,
                citations=[],
                used_context=[],
                created_at=utc_now(),
            ),
            AssistantPreview(
                task_kind=task_kind,
                title="Нужен контекст кейса",
                summary=text,
                can_apply=False,
            ),
        )

    @staticmethod
    def _resolve_case_scope(
        *,
        storage: SQLiteStorage,
        cockpit_service: ManagerCockpitService | None,
        manager_id: str,
        client_id: str | None,
        selected_work_item_id: str | None,
        selected_interaction_id: str | None,
    ):
        if not client_id:
            return None, None, None

        client = storage.get_client(client_id)
        if client is None:
            return None, None, None

        work_item = None
        if cockpit_service is not None:
            cockpit = cockpit_service.build_manager_cockpit(storage=storage, manager_id=manager_id)
            client_items = [item for item in cockpit.work_queue if item.client_id == client_id]
            work_item = (
                next((item for item in client_items if item.id == selected_work_item_id), None)
                if selected_work_item_id
                else None
            ) or (client_items[0] if client_items else None)

        conversations = storage.list_client_conversations(client_id)
        conversation = (
            next((item for item in conversations if item.id == selected_interaction_id), None)
            if selected_interaction_id
            else None
        )
        if conversation is None and work_item and work_item.conversation_id:
            conversation = next((item for item in conversations if item.id == work_item.conversation_id), None)
        if conversation is None:
            conversation = next((item for item in conversations if item.channel.value == "chat"), None) or (
                conversations[0] if conversations else None
            )
        return client, work_item, conversation

    @staticmethod
    def _resolve_script_selection(
        payload: AssistantMessageActionPayload,
        selected_choice: str | None,
    ) -> tuple[str, str]:
        if payload.sales_script_draft is None:
            raise ValueError("Sales script is not available")
        if not selected_choice:
            raise ValueError("Choose a script variant before apply")
        if selected_choice == "main":
            return selected_choice, payload.sales_script_draft.ready_script
        variant = next(
            (item for item in payload.sales_script_draft.alternatives if item.label == selected_choice),
            None,
        )
        if variant is None:
            raise ValueError("Script variant not found")
        return selected_choice, variant.ready_script

    @staticmethod
    def _resolve_objection_selection(
        payload: AssistantMessageActionPayload,
        selected_choice: str | None,
    ) -> tuple[str, str]:
        if payload.objection_workflow_draft is None:
            raise ValueError("Objection workflow is not available")
        if not selected_choice:
            raise ValueError("Choose an objection response before apply")
        option = next(
            (item for item in payload.objection_workflow_draft.handling_options if item.title == selected_choice),
            None,
        )
        if option is None:
            raise ValueError("Objection response not found")
        return option.title, option.response

    @staticmethod
    def _get_latest_action_payload(
        storage: SQLiteStorage,
        thread_id: str,
        task_kind: AssistantTaskKind,
    ) -> AssistantMessageActionPayload | None:
        messages = storage.list_assistant_messages(thread_id)
        for message in reversed(messages):
            if message.role != AssistantMessageRole.assistant or message.action_payload is None:
                continue
            if message.action_payload.action_type == task_kind.value:
                return message.action_payload
        return None

    @staticmethod
    def _record_tool_message(storage: SQLiteStorage, thread_id: str, content: str) -> None:
        storage.add_assistant_message(
            AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.tool,
                content=content,
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
        )

    def _derive_thread_title(
        self,
        thread: AssistantThread,
        task_kind: AssistantTaskKind,
        selected_client_id: str | None,
        storage: SQLiteStorage,
    ) -> str:
        client_id = selected_client_id or thread.client_id or thread.last_selected_client_id
        if client_id:
            client = storage.get_client(client_id)
            if client is not None:
                return f"{self._task_label(task_kind)}: {client.full_name}"
        return self._task_label(task_kind)

    @staticmethod
    def _task_label(task_kind: AssistantTaskKind) -> str:
        labels = {
            AssistantTaskKind.summary_crm: "CRM",
            AssistantTaskKind.sales_script: "Скрипт",
            AssistantTaskKind.objection_workflow: "Возражение",
            AssistantTaskKind.reply_draft: "Ответ",
            AssistantTaskKind.client_qa: "По кейсу",
            AssistantTaskKind.general_qa: "Общий AI",
        }
        return labels[task_kind]

    @staticmethod
    def _build_memory_summary(messages: list[AssistantMessageRecord]) -> str:
        parts = []
        for message in messages[-THREAD_RECENT_MESSAGES:]:
            prefix = "Пользователь" if message.role == AssistantMessageRole.user else "Ассистент"
            parts.append(f"{prefix}: {' '.join(message.content.split())[:120]}")
        return " | ".join(parts)

    @staticmethod
    def _build_excerpt(content: str) -> str:
        compact = " ".join(content.split())
        return compact[:180] + ("…" if len(compact) > 180 else "")

    @staticmethod
    def _build_client_used_context(
        storage: SQLiteStorage,
        manager_id: str,
        client_id: str,
    ) -> list[AssistantCitation]:
        snapshots = storage.list_assistant_snapshots(manager_id=manager_id, client_id=client_id)[:4]
        return [
            AssistantCitation(
                snapshot_id=snapshot.id,
                title=snapshot.title,
                snapshot_type=snapshot.snapshot_type,
                client_id=snapshot.client_id,
                excerpt=AssistantService._build_excerpt(snapshot.content_text),
            )
            for snapshot in snapshots
        ]
