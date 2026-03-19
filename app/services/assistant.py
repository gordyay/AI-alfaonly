from __future__ import annotations

from uuid import uuid4

from ..ai.base import AIProvider, AIProviderError
from ..db import SQLiteStorage, utc_now
from ..models import (
    AssistantActionResult,
    AssistantChatResponse,
    AssistantCitation,
    AssistantMessageActionPayload,
    AssistantMessageRecord,
    AssistantMessageRole,
    AssistantThread,
    AssistantThreadDetail,
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
        selected_client_id: str | None = None,
        title: str | None = None,
    ) -> AssistantThread:
        now = utc_now()
        thread = AssistantThread(
            id=str(uuid4()),
            manager_id=manager_id,
            title=title or "Новый диалог",
            last_selected_client_id=selected_client_id,
            memory_summary=None,
            created_at=now,
            updated_at=now,
        )
        return storage.create_assistant_thread(thread)

    def list_threads(self, storage: SQLiteStorage, manager_id: str) -> list[AssistantThread]:
        return storage.list_assistant_threads(manager_id)

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
        message: str,
        selected_client_id: str | None = None,
        selected_work_item_id: str | None = None,
        cockpit_service: ManagerCockpitService | None = None,
        log_activity,
    ) -> AssistantChatResponse:
        thread = storage.get_assistant_thread(thread_id)
        if thread is None or thread.manager_id != manager_id:
            raise ValueError("Assistant thread not found")

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

        if selected_client_id:
            storage.update_assistant_thread(
                thread.id,
                last_selected_client_id=selected_client_id,
                updated_at=now,
            )

        try:
            if self._is_summary_or_crm_action(message):
                assistant_message, action_result = self._run_summary_action(
                    storage=storage,
                    provider=provider,
                    ai_summary_service=ai_summary_service,
                    dialog_service=dialog_service,
                    kb_service=kb_service,
                    manager_id=manager_id,
                    thread_id=thread.id,
                    selected_client_id=selected_client_id,
                    selected_work_item_id=selected_work_item_id,
                    cockpit_service=cockpit_service,
                    log_activity=log_activity,
                )
            elif self._is_script_request(message):
                assistant_message, action_result = self._run_script_action(
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
                    cockpit_service=cockpit_service,
                    instruction=message,
                    log_activity=log_activity,
                )
            elif self._is_objection_request(message):
                assistant_message, action_result = self._run_objection_action(
                    storage=storage,
                    provider=provider,
                    objection_service=objection_service,
                    manager_id=manager_id,
                    thread_id=thread.id,
                    selected_client_id=selected_client_id,
                    selected_work_item_id=selected_work_item_id,
                    cockpit_service=cockpit_service,
                    objection_text=message,
                    log_activity=log_activity,
                )
            else:
                assistant_message, action_result = self._run_knowledge_chat(
                    storage=storage,
                    provider=provider,
                    kb_service=kb_service,
                    manager_id=manager_id,
                    thread_id=thread.id,
                    message=message,
                    selected_client_id=selected_client_id,
                )
        except AIProviderError as exc:
            conversation_id = None
            recommendation_id = None
            if selected_client_id:
                _, work_item, conversation = self._resolve_case_scope(
                    storage=storage,
                    cockpit_service=cockpit_service,
                    manager_id=manager_id,
                    client_id=selected_client_id,
                    selected_work_item_id=selected_work_item_id,
                )
                recommendation_id = work_item.recommendation_id if work_item else None
                conversation_id = conversation.id if conversation else None
                if self._is_summary_or_crm_action(message):
                    log_activity(
                        recommendation_type="mini_summary",
                        client_id=selected_client_id,
                        recommendation_id=recommendation_id,
                        conversation_id=conversation_id,
                        manager_id=manager_id,
                        action="generation_failed",
                        payload_excerpt=str(exc),
                    )
                    log_activity(
                        recommendation_type="crm_note_draft",
                        client_id=selected_client_id,
                        recommendation_id=recommendation_id,
                        conversation_id=conversation_id,
                        manager_id=manager_id,
                        action="generation_failed",
                        payload_excerpt=str(exc),
                    )
                elif self._is_script_request(message):
                    log_activity(
                        recommendation_type="sales_script",
                        client_id=selected_client_id,
                        recommendation_id=recommendation_id,
                        conversation_id=conversation_id,
                        manager_id=manager_id,
                        action="generation_failed",
                        payload_excerpt=str(exc),
                    )
                elif self._is_objection_request(message):
                    log_activity(
                        recommendation_type="objection_workflow",
                        client_id=selected_client_id,
                        recommendation_id=recommendation_id,
                        conversation_id=conversation_id,
                        manager_id=manager_id,
                        action="generation_failed",
                        payload_excerpt=str(exc),
                    )
            assistant_message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread.id,
                role=AssistantMessageRole.assistant,
                content=str(exc),
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            action_result = None

        storage.add_assistant_message(assistant_message)

        if thread.title == "Новый диалог":
            storage.update_assistant_thread(
                thread.id,
                title=self._derive_thread_title(message, selected_client_id, storage),
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
            thread=refreshed_thread,
            assistant_message=assistant_message,
            citations=assistant_message.citations,
            used_context=assistant_message.used_context,
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
        cockpit_service: ManagerCockpitService | None,
        log_activity,
    ) -> tuple[AssistantMessageRecord, AssistantActionResult | None]:
        if not selected_client_id:
            message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content="Чтобы подготовить сводку или CRM-заметку, сначала откройте нужного клиента в основном окне.",
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            return message, None

        client, work_item, conversation = self._resolve_case_scope(
            storage=storage,
            cockpit_service=cockpit_service,
            manager_id=manager_id,
            client_id=selected_client_id,
            selected_work_item_id=selected_work_item_id,
        )
        if client is None:
            message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content="Не удалось найти выбранного клиента. Откройте диалог еще раз и повторите запрос.",
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            return message, None

        if conversation is None:
            message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content="У выбранного кейса нет привязанной коммуникации, поэтому собрать сводку сейчас нельзя.",
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            return message, None

        recommendation = dialog_service.build_recommendation(client=client, conversation=conversation)
        result = ai_summary_service.summarize_dialog(
            provider=provider,
            client=client,
            conversation=conversation,
            recommendation=recommendation,
        )
        storage.update_client_ai_summary(
            client_id=client.id,
            summary_text=result.draft.contact_summary,
            generated_at=result.generated_at,
        )
        kb_service.rebuild_manager_snapshots(storage, dialog_service, manager_id)
        log_activity(
            recommendation_type="mini_summary",
            client_id=client.id,
            recommendation_id=work_item.recommendation_id if work_item else None,
            conversation_id=conversation.id,
            manager_id=manager_id,
            action="generated",
            payload_excerpt=result.draft.contact_summary,
        )
        log_activity(
            recommendation_type="crm_note_draft",
            client_id=client.id,
            recommendation_id=work_item.recommendation_id if work_item else None,
            conversation_id=conversation.id,
            manager_id=manager_id,
            action="generated",
            payload_excerpt=result.draft.crm_note_draft,
        )

        used_context = self._build_client_used_context(storage, manager_id, client.id)
        assistant_message = AssistantMessageRecord(
            id=str(uuid4()),
            thread_id=thread_id,
            role=AssistantMessageRole.assistant,
            content=(
                f"Собрал сводку и черновик CRM-заметки по клиенту {client.full_name}. "
                f"Краткая сводка: {result.draft.contact_summary}"
            ),
            citations=used_context[:2],
            used_context=used_context,
            created_at=utc_now(),
        )
        action_result = AssistantActionResult(
            action_type="summary_crm_draft",
            client_id=client.id,
            conversation_id=conversation.id,
            draft=result.draft,
            note="Черновик подготовлен и доступен в основном интерфейсе.",
        )
        return assistant_message, action_result

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
        cockpit_service: ManagerCockpitService | None,
        instruction: str,
        log_activity,
    ) -> tuple[AssistantMessageRecord, AssistantActionResult | None]:
        if not selected_client_id:
            message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content="Чтобы подготовить скрипт продажи, сначала откройте нужного клиента в основном окне.",
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            return message, None

        client, work_item, conversation = self._resolve_case_scope(
            storage=storage,
            cockpit_service=cockpit_service,
            manager_id=manager_id,
            client_id=selected_client_id,
            selected_work_item_id=selected_work_item_id,
        )
        if client is None:
            message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content="Не удалось найти выбранного клиента. Откройте диалог еще раз и повторите запрос.",
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            return message, None

        if conversation is None:
            message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content="У выбранного кейса нет привязанной коммуникации, поэтому собрать скрипт сейчас нельзя.",
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            return message, None

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
            product_propensities=product_propensity.items,
            objection_workflow=objection_workflow.draft,
        )
        log_activity(
            recommendation_type="sales_script",
            client_id=client.id,
            recommendation_id=work_item.recommendation_id if work_item else None,
            conversation_id=conversation.id,
            manager_id=manager_id,
            action="generated",
            payload_excerpt=result.draft.ready_script,
        )

        used_context = self._build_client_used_context(storage, manager_id, client.id)
        assistant_message = AssistantMessageRecord(
            id=str(uuid4()),
            thread_id=thread_id,
            role=AssistantMessageRole.assistant,
            content=f"Подготовил скрипт продажи по клиенту {client.full_name}.",
            citations=used_context[:2],
            used_context=used_context,
            action_payload=AssistantMessageActionPayload(
                action_type="sales_script",
                sales_script_draft=result.draft,
            ),
            created_at=utc_now(),
        )
        action_result = AssistantActionResult(
            action_type="sales_script",
            client_id=client.id,
            conversation_id=conversation.id,
            sales_script_draft=result.draft,
            note="Скрипт сохранен в истории ассистента.",
        )
        return assistant_message, action_result

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
        cockpit_service: ManagerCockpitService | None,
        objection_text: str,
        log_activity,
    ) -> tuple[AssistantMessageRecord, AssistantActionResult | None]:
        if not selected_client_id:
            message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content="Чтобы отработать возражение, сначала откройте клиента в основном окне.",
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            return message, None

        client, work_item, conversation = self._resolve_case_scope(
            storage=storage,
            cockpit_service=cockpit_service,
            manager_id=manager_id,
            client_id=selected_client_id,
            selected_work_item_id=selected_work_item_id,
        )
        if client is None:
            message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content="Не удалось найти выбранного клиента. Откройте его заново и повторите запрос.",
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            return message, None

        if conversation is None:
            message = AssistantMessageRecord(
                id=str(uuid4()),
                thread_id=thread_id,
                role=AssistantMessageRole.assistant,
                content="У выбранного кейса нет привязанной коммуникации, поэтому разбор возражения сейчас собрать нельзя.",
                citations=[],
                used_context=[],
                created_at=utc_now(),
            )
            return message, None

        result = objection_service.build_workflow(
            provider=provider,
            client=client,
            conversation=conversation,
            objection_text=objection_text,
        )
        log_activity(
            recommendation_type="objection_workflow",
            client_id=client.id,
            recommendation_id=work_item.recommendation_id if work_item else None,
            conversation_id=conversation.id,
            manager_id=manager_id,
            action="generated",
            payload_excerpt=result.draft.analysis.objection_label,
        )

        used_context = self._build_client_used_context(storage, manager_id, client.id)
        assistant_message = AssistantMessageRecord(
            id=str(uuid4()),
            thread_id=thread_id,
            role=AssistantMessageRole.assistant,
            content=f"Собрал разбор возражения по клиенту {client.full_name}.",
            citations=used_context[:2],
            used_context=used_context,
            action_payload=AssistantMessageActionPayload(
                action_type="objection_workflow",
                objection_workflow_draft=result.draft,
            ),
            created_at=utc_now(),
        )
        action_result = AssistantActionResult(
            action_type="objection_workflow",
            client_id=client.id,
            conversation_id=conversation.id,
            objection_workflow_draft=result.draft,
            note="Варианты отработки сохранены в истории ассистента.",
        )
        return assistant_message, action_result

    @staticmethod
    def _resolve_case_scope(
        *,
        storage: SQLiteStorage,
        cockpit_service: ManagerCockpitService | None,
        manager_id: str,
        client_id: str,
        selected_work_item_id: str | None,
    ):
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
            next((item for item in conversations if item.id == work_item.conversation_id), None)
            if work_item and work_item.conversation_id
            else None
        )
        return client, work_item, conversation

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
    ) -> tuple[AssistantMessageRecord, AssistantActionResult | None]:
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
                "available_actions": [
                    "Сделай сводку диалога",
                    "Собери CRM-заметку",
                    "Подготовь скрипт продажи",
                    "Как отработать возражение?",
                    "Сделай мягкий follow-up",
                    "Как ответить клиенту?",
                    "Что важно по клиенту?",
                    "Какие клиенты сейчас самые приоритетные?",
                ],
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
    def _is_summary_or_crm_action(message: str) -> bool:
        lowered = message.lower()
        return any(
            token in lowered
            for token in [
                "сделай сводку",
                "сводку диалога",
                "crm",
                "crm-замет",
                "crm замет",
                "заметку",
            ]
        )

    @staticmethod
    def _is_script_request(message: str) -> bool:
        lowered = message.lower()
        return any(
            token in lowered
            for token in [
                "скрипт",
                "как ответить",
                "сформулируй ответ",
                "продающий ответ",
                "follow-up",
                "follow up",
                "сообщение клиенту",
                "оффер",
                "мягкий follow",
            ]
        )

    @staticmethod
    def _is_objection_request(message: str) -> bool:
        lowered = message.lower()
        return any(
            token in lowered
            for token in [
                "возражен",
                "как отработать",
                "сомнен",
                "дорого",
                "не сейчас",
                "слишком риск",
                "что не говорить",
            ]
        )

    @staticmethod
    def _derive_thread_title(message: str, selected_client_id: str | None, storage: SQLiteStorage) -> str:
        if selected_client_id:
            client = storage.get_client(selected_client_id)
            if client is not None:
                return client.full_name
        compact = " ".join(message.split())
        return compact[:48] + ("…" if len(compact) > 48 else "")

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
