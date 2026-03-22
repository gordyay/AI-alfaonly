from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime

from ..db import SQLiteStorage, utc_now
from ..models import (
    AssistantCitation,
    AssistantKBSnapshot,
    AssistantSnapshotType,
)
from .cockpit import ManagerCockpitService
from .dialogs import DialogPriorityService
from .propensity import ProductPropensityService


SNAPSHOT_LIMITS = {
    AssistantSnapshotType.manager_overview: 900,
    AssistantSnapshotType.client_overview: 500,
    AssistantSnapshotType.portfolio_overview: 450,
    AssistantSnapshotType.conversation_overview: 1200,
    AssistantSnapshotType.recommendation_overview: 450,
    AssistantSnapshotType.crm_overview: 600,
    AssistantSnapshotType.propensity_overview: 600,
}

RETRIEVAL_TYPE_CAPS = {
    AssistantSnapshotType.manager_overview: 1,
    AssistantSnapshotType.client_overview: 2,
    AssistantSnapshotType.portfolio_overview: 1,
    AssistantSnapshotType.conversation_overview: 1,
    AssistantSnapshotType.recommendation_overview: 1,
    AssistantSnapshotType.crm_overview: 1,
    AssistantSnapshotType.propensity_overview: 1,
}

TOTAL_CONTEXT_BUDGET = 4500
MESSAGE_PREVIEW_LIMIT = 300


class AssistantKnowledgeService:
    @staticmethod
    def _priority_label(value: str | None) -> str:
        labels = {
            "urgent": "срочно",
            "high": "высокий приоритет",
            "medium": "средний приоритет",
            "low": "низкий приоритет",
        }
        return labels.get(value or "", value or "не указан")

    def ensure_snapshots(self, storage: SQLiteStorage, dialog_service: DialogPriorityService) -> None:
        manager_ids = sorted({client.manager_id for client in storage.list_clients()})
        if not manager_ids:
            return

        if storage.count_assistant_snapshots() == 0:
            self.rebuild_all_snapshots(storage, dialog_service)

    def rebuild_all_snapshots(self, storage: SQLiteStorage, dialog_service: DialogPriorityService) -> None:
        manager_ids = sorted({client.manager_id for client in storage.list_clients()})
        for manager_id in manager_ids:
            self.rebuild_manager_snapshots(storage, dialog_service, manager_id)

    def rebuild_manager_snapshots(
        self,
        storage: SQLiteStorage,
        dialog_service: DialogPriorityService,
        manager_id: str,
    ) -> None:
        storage.delete_manager_assistant_snapshots(manager_id)
        now = utc_now()
        clients = storage.list_clients(manager_id=manager_id)
        latest_conversations = storage.list_latest_conversations([client.id for client in clients])
        dialogs = dialog_service.list_manager_dialogs(storage=storage, manager_id=manager_id)
        cockpit = ManagerCockpitService(dialog_service=dialog_service).build_manager_cockpit(storage=storage, manager_id=manager_id, now=now)
        propensity_service = ProductPropensityService()

        manager_overview = self._build_manager_overview(manager_id, cockpit)
        storage.upsert_assistant_snapshot(
            AssistantKBSnapshot(
                id=f"mgr:{manager_id}:overview",
                manager_id=manager_id,
                client_id=None,
                snapshot_type=AssistantSnapshotType.manager_overview,
                title=f"Обзор менеджера {manager_id}",
                content_text=manager_overview,
                source_updated_at=now,
                created_at=now,
                updated_at=now,
            )
        )

        for client in clients:
            conversation = latest_conversations.get(client.id)
            recommendation = dialog_service.build_recommendation(client=client, conversation=conversation) if conversation else None
            crm_notes = storage.list_client_crm_notes(client.id)[:3]
            follow_ups = storage.list_client_follow_ups(client.id)
            propensity = propensity_service.build_client_propensity(
                storage=storage,
                client=client,
                now=now,
                conversation=conversation,
            )

            snapshots = [
                AssistantKBSnapshot(
                    id=f"client:{client.id}:overview",
                    manager_id=manager_id,
                    client_id=client.id,
                    snapshot_type=AssistantSnapshotType.client_overview,
                    title=f"{client.full_name} — профиль",
                    content_text=self._build_client_overview(client),
                    source_updated_at=max(filter(None, [client.ai_summary_generated_at, client.last_contact_at]), default=now),
                    created_at=now,
                    updated_at=now,
                ),
                AssistantKBSnapshot(
                    id=f"client:{client.id}:portfolio",
                    manager_id=manager_id,
                    client_id=client.id,
                    snapshot_type=AssistantSnapshotType.portfolio_overview,
                    title=f"{client.full_name} — портфель",
                    content_text=self._build_portfolio_overview(client, recommendation),
                    source_updated_at=now,
                    created_at=now,
                    updated_at=now,
                ),
                AssistantKBSnapshot(
                    id=f"client:{client.id}:conversation",
                    manager_id=manager_id,
                    client_id=client.id,
                    snapshot_type=AssistantSnapshotType.conversation_overview,
                    title=f"{client.full_name} — диалог",
                    content_text=self._build_conversation_overview(client, conversation),
                    source_updated_at=conversation.started_at if conversation else now,
                    created_at=now,
                    updated_at=now,
                ),
                AssistantKBSnapshot(
                    id=f"client:{client.id}:recommendation",
                    manager_id=manager_id,
                    client_id=client.id,
                    snapshot_type=AssistantSnapshotType.recommendation_overview,
                    title=f"{client.full_name} — рекомендация",
                    content_text=self._build_recommendation_overview(recommendation),
                    source_updated_at=now,
                    created_at=now,
                    updated_at=now,
                ),
                AssistantKBSnapshot(
                    id=f"client:{client.id}:crm",
                    manager_id=manager_id,
                    client_id=client.id,
                    snapshot_type=AssistantSnapshotType.crm_overview,
                    title=f"{client.full_name} — CRM история",
                    content_text=self._build_crm_overview(crm_notes, follow_ups),
                    source_updated_at=crm_notes[0].created_at if crm_notes else now,
                    created_at=now,
                    updated_at=now,
                ),
                AssistantKBSnapshot(
                    id=f"client:{client.id}:propensity",
                    manager_id=manager_id,
                    client_id=client.id,
                    snapshot_type=AssistantSnapshotType.propensity_overview,
                    title=f"{client.full_name} — продуктовый фокус",
                    content_text=self._build_propensity_overview(propensity),
                    source_updated_at=now,
                    created_at=now,
                    updated_at=now,
                ),
            ]

            for snapshot in snapshots:
                storage.upsert_assistant_snapshot(snapshot)

    def retrieve_snapshots(
        self,
        storage: SQLiteStorage,
        manager_id: str,
        query: str,
        selected_client_id: str | None = None,
    ) -> list[AssistantCitation]:
        query_terms = self._tokenize(query)
        snapshots = storage.list_assistant_snapshots(manager_id=manager_id, client_id=selected_client_id)
        ranked = sorted(
            snapshots,
            key=lambda item: self._score_snapshot(item, query_terms, selected_client_id),
            reverse=True,
        )

        counts: dict[AssistantSnapshotType, int] = defaultdict(int)
        total_chars = 0
        selected: list[AssistantCitation] = []

        for snapshot in ranked:
            if counts[snapshot.snapshot_type] >= RETRIEVAL_TYPE_CAPS[snapshot.snapshot_type]:
                continue
            next_total = total_chars + len(snapshot.content_text)
            if next_total > TOTAL_CONTEXT_BUDGET:
                continue

            counts[snapshot.snapshot_type] += 1
            total_chars = next_total
            selected.append(
                AssistantCitation(
                    snapshot_id=snapshot.id,
                    title=snapshot.title,
                    snapshot_type=snapshot.snapshot_type,
                    client_id=snapshot.client_id,
                    excerpt=self._clamp(snapshot.content_text, 180),
                )
            )

        return selected

    def build_prompt_knowledge(
        self,
        storage: SQLiteStorage,
        manager_id: str,
        citations: list[AssistantCitation],
    ) -> list[dict[str, str]]:
        if not citations:
            return []

        snapshots_by_id = {
            snapshot.id: snapshot
            for snapshot in storage.list_assistant_snapshots(manager_id=manager_id)
        }
        items: list[dict[str, str]] = []
        for index, citation in enumerate(citations, start=1):
            snapshot = snapshots_by_id.get(citation.snapshot_id)
            if snapshot is None:
                continue
            items.append(
                {
                    "ref_id": f"ctx{index}",
                    "snapshot_id": snapshot.id,
                    "title": snapshot.title,
                    "snapshot_type": snapshot.snapshot_type.value,
                    "content_text": snapshot.content_text,
                }
            )
        return items

    def build_prompt_knowledge_from_snapshots(self, snapshots: list[AssistantKBSnapshot]) -> list[dict[str, str]]:
        return [
            {
                "ref_id": f"ctx{index}",
                "snapshot_id": snapshot.id,
                "title": snapshot.title,
                "snapshot_type": snapshot.snapshot_type.value,
                "content_text": snapshot.content_text,
            }
            for index, snapshot in enumerate(snapshots, start=1)
        ]

    def resolve_snapshot_context(
        self,
        storage: SQLiteStorage,
        manager_id: str,
        citations: list[AssistantCitation],
    ) -> list[AssistantKBSnapshot]:
        if not citations:
            return []
        snapshot_map = {
            snapshot.id: snapshot
            for snapshot in storage.list_assistant_snapshots(manager_id=manager_id)
        }
        return [snapshot_map[citation.snapshot_id] for citation in citations if citation.snapshot_id in snapshot_map]

    def _build_manager_overview(self, manager_id: str, cockpit) -> str:
        urgent = [item for item in cockpit.work_queue if item.priority_score >= 85][:3]
        tasks = [item for item in cockpit.work_queue if item.item_type.value == "task"][:3]
        opportunities = [item for item in cockpit.work_queue if item.item_type.value == "opportunity"][:3]
        content = (
            f"Менеджер {manager_id}. "
            f"В рабочем плане {cockpit.stats.actionable_items} элементов. "
            f"Срочные: {self._dialog_list_copy(urgent)}. "
            f"Задачи дня: {self._dialog_list_copy(tasks)}. "
            f"Коммерческие opportunity: {self._dialog_list_copy(opportunities)}."
        )
        return self._clamp(content, SNAPSHOT_LIMITS[AssistantSnapshotType.manager_overview])

    def _build_client_overview(self, client) -> str:
        content = (
            f"{client.full_name}. Сегмент {client.segment}. Город {client.city}. "
            f"Профессия: {client.occupation}. Риск-профиль: {client.risk_profile}. "
            f"Доход: {client.income_band}. Канал: {client.preferred_channel}. "
            f"Риск оттока: {client.churn_risk}. Теги: {', '.join(client.tags) or 'нет'}."
        )
        return self._clamp(content, SNAPSHOT_LIMITS[AssistantSnapshotType.client_overview])

    def _build_portfolio_overview(self, client, recommendation) -> str:
        top_products = ", ".join(
            f"{product.name} ({int(product.balance):,} {product.currency})".replace(",", " ")
            for product in client.products[:3]
        ) or "портфель не заполнен"
        content = (
            f"Портфель: {int(client.portfolio_value):,} RUB. ".replace(",", " ")
            + f"Свободный остаток: {int(client.cash_balance):,} RUB. ".replace(",", " ")
            + f"Ключевые продукты: {top_products}. "
            + f"Следующее действие: {recommendation.next_best_action if recommendation else 'не рассчитано'}."
        )
        return self._clamp(content, SNAPSHOT_LIMITS[AssistantSnapshotType.portfolio_overview])

    def _build_conversation_overview(self, client, conversation) -> str:
        if conversation is None:
            return "Активный диалог пока отсутствует."
        insights = conversation.insights
        latest_messages = "; ".join(
            f"{'Менеджер' if message.sender == 'manager' else client.full_name}: {self._clamp(' '.join(message.text.split()), MESSAGE_PREVIEW_LIMIT)}"
            for message in conversation.messages[-6:]
        )
        content = (
            f"Тема: {conversation.topic}. "
            f"Мини-сводка: {client.ai_summary_text or client.notes_summary or 'нет'}. "
            f"Срочность: {insights.urgency_label if insights else 'не указана'}. "
            f"Тон: {insights.tone_label if insights else 'не указан'}. "
            f"Паттерн отклика: {insights.responsiveness_pattern if insights else 'не указан'}. "
            f"Следующий контакт: {insights.next_contact_reason if insights and insights.next_contact_reason else 'не указан'}. "
            f"Интересы: {', '.join(insights.interest_tags) if insights and insights.interest_tags else 'нет'}. "
            f"Возражения: {', '.join(insights.objection_tags) if insights and insights.objection_tags else 'нет'}. "
            f"Последние сообщения: {latest_messages}."
        )
        return self._clamp(content, SNAPSHOT_LIMITS[AssistantSnapshotType.conversation_overview])

    def _build_recommendation_overview(self, recommendation) -> str:
        if recommendation is None:
            return "Рекомендация для диалога пока не рассчитана."
        content = (
            f"Приоритет {recommendation.priority_score} ({self._priority_label(recommendation.priority_label)}). "
            f"Почему: {', '.join(recommendation.why)}. "
            f"Следующий шаг: {recommendation.next_best_action}. "
            f"Факторы: срочность={recommendation.factor_breakdown.t_wait}, "
            f"ценность клиента={recommendation.factor_breakdown.c_value}, "
            f"вовлечённость={recommendation.factor_breakdown.u_comm}, "
            f"коммерческий потенциал={recommendation.factor_breakdown.p_sale}, "
            f"риск потери клиента={recommendation.factor_breakdown.r_churn}."
        )
        return self._clamp(content, SNAPSHOT_LIMITS[AssistantSnapshotType.recommendation_overview])

    def _build_crm_overview(self, crm_notes, follow_ups) -> str:
        notes_copy = " | ".join(
            self._clamp(
                f"{note.created_at.date()}: outcome={note.outcome}; note={note.note_text}",
                160,
            )
            for note in crm_notes[:3]
        ) or "CRM-заметок пока нет"
        follow_up = follow_ups[0] if follow_ups else None
        content = (
            f"Последние CRM-заметки: {notes_copy}. "
            f"Ближайший следующий контакт: {follow_up.due_at.isoformat() if follow_up else 'не назначен'}."
        )
        return self._clamp(content, SNAPSHOT_LIMITS[AssistantSnapshotType.crm_overview])

    def _build_propensity_overview(self, propensity) -> str:
        top_items = propensity.items[:3]
        if not top_items:
            return "Продуктовый фокус пока не рассчитан."
        content = " | ".join(
            f"{item.product_name}: приоритет={item.score}; причины={', '.join(item.reasons[:2])}; следующий шаг={item.next_best_action}"
            for item in top_items
        )
        return self._clamp(content, SNAPSHOT_LIMITS[AssistantSnapshotType.propensity_overview])

    @staticmethod
    def _dialog_list_copy(dialogs: list) -> str:
        if not dialogs:
            return "нет"
        return ", ".join(f"{dialog.client_name} ({dialog.priority_score})" for dialog in dialogs)

    @staticmethod
    def _clamp(value: str, limit: int) -> str:
        compact = " ".join(value.split())
        if len(compact) <= limit:
            return compact
        return f"{compact[: limit - 1]}…"

    @staticmethod
    def _tokenize(value: str) -> list[str]:
        return [token for token in re.findall(r"[A-Za-zА-Яа-я0-9]+", value.lower()) if len(token) > 1]

    def _score_snapshot(
        self,
        snapshot: AssistantKBSnapshot,
        query_terms: list[str],
        selected_client_id: str | None,
    ) -> tuple[int, float]:
        content = f"{snapshot.title} {snapshot.content_text}".lower()
        overlap = sum(1 for term in query_terms if term in content)
        selected_boost = 8 if selected_client_id and snapshot.client_id == selected_client_id else 0
        type_boost = 3 if snapshot.snapshot_type == AssistantSnapshotType.recommendation_overview else 0
        if snapshot.snapshot_type == AssistantSnapshotType.manager_overview:
            type_boost += 1
        recency = snapshot.updated_at.timestamp()
        return (selected_boost + type_boost + overlap, recency)
