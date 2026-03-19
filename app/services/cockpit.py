from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..db import SQLiteStorage, utc_now
from ..models import (
    ChannelType,
    Client,
    CockpitSection,
    CockpitStats,
    Conversation,
    GeneratedArtifact,
    GeneratedArtifactType,
    ManagerCockpit,
    RecommendationStatus,
    Task,
    TaskStatus,
    WorkItem,
    WorkItemFactorBreakdown,
    WorkItemType,
)
from .dialogs import CHURN_SCORE, DialogPriorityService


class ManagerCockpitService:
    def __init__(self, dialog_service: DialogPriorityService | None = None) -> None:
        self.dialog_service = dialog_service or DialogPriorityService()

    def build_manager_cockpit(
        self,
        storage: SQLiteStorage,
        manager_id: str,
        now: datetime | None = None,
    ) -> ManagerCockpit:
        reference_now = now or utc_now()
        clients = storage.list_clients(manager_id=manager_id)
        tasks = storage.list_tasks(manager_id=manager_id)
        products_by_id = {product.id: product for product in storage.list_products()}

        clients_by_id = {client.id: client for client in clients}
        client_conversations = {client.id: storage.list_client_conversations(client.id) for client in clients}
        latest_conversations = {
            client.id: (client_conversations[client.id][0] if client_conversations[client.id] else None)
            for client in clients
        }
        conversations_by_id = {
            conversation.id: conversation
            for conversations in client_conversations.values()
            for conversation in conversations
        }
        task_items: list[WorkItem] = []
        communication_items: list[WorkItem] = []
        opportunity_items: list[WorkItem] = []

        for task in tasks:
            client = clients_by_id.get(task.client_id)
            if client is None:
                continue
            task_items.append(
                self._build_task_item(
                    client=client,
                    task=task,
                    conversation=conversations_by_id.get(task.linked_conversation_id) or latest_conversations.get(client.id),
                    product_name=products_by_id.get(task.product_code).name if task.product_code in products_by_id else None,
                    now=reference_now,
                )
            )

        for client in clients:
            conversation = latest_conversations.get(client.id)
            recommendation = self.dialog_service.build_recommendation(client=client, conversation=conversation, now=reference_now)
            if recommendation is not None:
                communication_items.append(
                    self._build_communication_item(
                        client=client,
                        conversation=conversation,
                        recommendation=recommendation,
                        product_name=products_by_id.get(conversation.insights.mentioned_product_codes[0]).name
                        if conversation and conversation.insights and conversation.insights.mentioned_product_codes
                        and conversation.insights.mentioned_product_codes[0] in products_by_id
                        else None,
                        now=reference_now,
                    )
                )

                opportunity = self._build_opportunity_item(
                    client=client,
                    conversation=conversation,
                    recommendation=recommendation,
                    product_name=products_by_id.get(conversation.insights.mentioned_product_codes[0]).name
                    if conversation and conversation.insights and conversation.insights.mentioned_product_codes
                    and conversation.insights.mentioned_product_codes[0] in products_by_id
                    else None,
                    now=reference_now,
                )
                if opportunity is not None:
                    opportunity_items.append(opportunity)

        work_queue = sorted(
            [*task_items, *communication_items, *opportunity_items],
            key=lambda item: (
                item.priority_score,
                self._priority_due_order(item.due_at, reference_now),
                self._item_type_bias(item.item_type),
            ),
            reverse=True,
        )

        status_map = storage.get_recommendation_status_map(
            manager_id=manager_id,
            recommendation_ids=[item.recommendation_id for item in work_queue],
        )
        work_queue = [item.model_copy(update={"recommendation_status": status_map.get(item.recommendation_id, RecommendationStatus.pending)}) for item in work_queue]

        task_items = [item for item in work_queue if item.item_type == WorkItemType.task]
        communication_items = [item for item in work_queue if item.item_type == WorkItemType.communication]
        opportunity_items = [item for item in work_queue if item.item_type == WorkItemType.opportunity]

        sections = [
            CockpitSection(
                id="daily-plan",
                title="План на сегодня",
                subtitle="Задачи менеджера с понятной бизнес-целью и сроком.",
                item_type=WorkItemType.task,
                items=task_items,
            ),
            CockpitSection(
                id="urgent-communications",
                title="Срочные коммуникации",
                subtitle="Клиенты, которым нужно ответить или вернуться с follow-up.",
                item_type=WorkItemType.communication,
                items=communication_items,
            ),
            CockpitSection(
                id="product-opportunities",
                title="Коммерческие возможности",
                subtitle="Opportunity-слой: где есть шанс перевести клиента к следующему шагу.",
                item_type=WorkItemType.opportunity,
                items=opportunity_items,
            ),
        ]

        stats = CockpitStats(
            actionable_items=len(work_queue),
            urgent_items=sum(1 for item in work_queue if item.priority_score >= 80),
            due_today_items=sum(1 for item in work_queue if item.due_at and item.due_at.date() <= reference_now.date()),
            opportunity_items=len(opportunity_items),
            clients_in_focus=len({item.client_id for item in work_queue[:5]}),
        )

        return ManagerCockpit(
            manager_id=manager_id,
            generated_at=reference_now,
            stats=stats,
            focus_item=work_queue[0] if work_queue else None,
            sections=sections,
            work_queue=work_queue,
        )

    def build_client_artifacts(
        self,
        client: Client,
        crm_notes,
    ) -> list[GeneratedArtifact]:
        artifacts: list[GeneratedArtifact] = []
        if client.ai_summary_text and client.ai_summary_generated_at:
            artifacts.append(
                GeneratedArtifact(
                    id=f"artifact:summary:{client.id}",
                    artifact_type=GeneratedArtifactType.summary,
                    client_id=client.id,
                    title="AI summary контакта",
                    summary=client.ai_summary_text,
                    created_at=client.ai_summary_generated_at,
                )
            )

        for note in crm_notes:
            artifacts.append(
                GeneratedArtifact(
                    id=f"artifact:crm:{note.id}",
                    artifact_type=GeneratedArtifactType.crm_note,
                    client_id=client.id,
                    title="CRM-заметка",
                    summary=note.summary_text or note.note_text,
                    created_at=note.created_at,
                    source_conversation_id=note.source_conversation_id,
                    source_task_id=note.task_id,
                )
            )

        return artifacts

    def _build_task_item(
        self,
        *,
        client: Client,
        task: Task,
        conversation: Conversation | None,
        product_name: str | None,
        now: datetime,
    ) -> WorkItem:
        urgency = self._task_urgency(task, now)
        client_value = self._client_value(client)
        engagement = self._engagement_signal(conversation)
        commercial_potential = self._task_commercial_signal(task=task, client=client, conversation=conversation)
        churn_risk = CHURN_SCORE.get(client.churn_risk, 0.2)
        ai_context = self._ai_context_signal(conversation=conversation, task=task, client=client)

        score = round(
            (
                0.30 * urgency
                + 0.20 * client_value
                + 0.10 * engagement
                + 0.20 * commercial_potential
                + 0.10 * churn_risk
                + 0.10 * ai_context
            )
            * 100
        )
        breakdown = WorkItemFactorBreakdown(
            urgency=round(urgency, 2),
            client_value=round(client_value, 2),
            engagement=round(engagement, 2),
            commercial_potential=round(commercial_potential, 2),
            churn_risk=round(churn_risk, 2),
            ai_context=round(ai_context, 2),
        )

        return WorkItem(
            id=f"task:{task.id}",
            item_type=WorkItemType.task,
            client_id=client.id,
            client_name=client.full_name,
            title=task.title,
            summary=task.description,
            priority_score=score,
            priority_label=self._priority_label(score),
            why=self._build_task_reasons(task=task, client=client, conversation=conversation, breakdown=breakdown, now=now),
            next_best_action=self._task_next_action(task=task, conversation=conversation),
            expected_benefit=self._task_expected_benefit(task),
            factor_breakdown=breakdown,
            recommendation_id=f"rec:task:{task.id}",
            ai_context_note=self._build_ai_context_note(conversation=conversation, task=task),
            due_at=task.due_at,
            created_at=task.created_at,
            channel=task.channel,
            task_id=task.id,
            task_status=task.status,
            task_type=task.task_type,
            business_goal=task.business_goal,
            conversation_id=task.linked_conversation_id,
            source_system=task.source_system,
            product_code=task.product_code,
            product_name=product_name,
            client_churn_risk=client.churn_risk,
        )

    def _build_communication_item(
        self,
        *,
        client: Client,
        conversation: Conversation | None,
        recommendation,
        product_name: str | None,
        now: datetime,
    ) -> WorkItem:
        assert conversation is not None
        ai_context = self._ai_context_signal(conversation=conversation, task=None, client=client)
        score = round(
            (
                0.28 * recommendation.factor_breakdown.t_wait
                + 0.22 * recommendation.factor_breakdown.c_value
                + 0.20 * recommendation.factor_breakdown.u_comm
                + 0.18 * recommendation.factor_breakdown.p_sale
                + 0.07 * recommendation.factor_breakdown.r_churn
                + 0.05 * ai_context
            )
            * 100
        )
        breakdown = WorkItemFactorBreakdown(
            urgency=round(recommendation.factor_breakdown.t_wait, 2),
            client_value=round(recommendation.factor_breakdown.c_value, 2),
            engagement=round(recommendation.factor_breakdown.u_comm, 2),
            commercial_potential=round(recommendation.factor_breakdown.p_sale, 2),
            churn_risk=round(recommendation.factor_breakdown.r_churn, 2),
            ai_context=round(ai_context, 2),
        )

        return WorkItem(
            id=f"comm:{conversation.id}",
            item_type=WorkItemType.communication,
            client_id=client.id,
            client_name=client.full_name,
            title=conversation.topic,
            summary=recommendation.last_message_preview,
            priority_score=score,
            priority_label=self._priority_label(score),
            why=recommendation.why,
            next_best_action=recommendation.next_best_action,
            expected_benefit=self._communication_expected_benefit(conversation, recommendation),
            factor_breakdown=breakdown,
            recommendation_id=f"rec:communication:{conversation.id}",
            ai_context_note=self._build_ai_context_note(conversation=conversation, task=None),
            due_at=conversation.insights.next_contact_due_at if conversation.insights else client.next_contact_due_at,
            created_at=conversation.started_at,
            channel=conversation.channel,
            conversation_id=conversation.id,
            source_system="dialog_engine",
            product_code=(conversation.insights.mentioned_product_codes[0] if conversation.insights and conversation.insights.mentioned_product_codes else None),
            product_name=product_name,
            client_churn_risk=client.churn_risk,
        )

    def _build_opportunity_item(
        self,
        *,
        client: Client,
        conversation: Conversation | None,
        recommendation,
        product_name: str | None,
        now: datetime,
    ) -> WorkItem | None:
        if conversation is None:
            return None

        insights = conversation.insights
        if recommendation.factor_breakdown.p_sale < 0.55 and client.cash_balance < 800_000 and not (insights and insights.interest_tags):
            return None

        urgency = 0.85 if recommendation.factor_breakdown.t_wait >= 0.8 else 0.55
        client_value = self._client_value(client)
        engagement = min(1.0, recommendation.factor_breakdown.u_comm + (0.15 if insights and insights.interest_tags else 0.0))
        commercial_potential = min(1.0, recommendation.factor_breakdown.p_sale + 0.20)
        churn_risk = recommendation.factor_breakdown.r_churn
        ai_context = self._ai_context_signal(conversation=conversation, task=None, client=client)
        score = round(
            (
                0.18 * urgency
                + 0.24 * client_value
                + 0.15 * engagement
                + 0.28 * commercial_potential
                + 0.05 * churn_risk
                + 0.10 * ai_context
            )
            * 100
        )
        breakdown = WorkItemFactorBreakdown(
            urgency=round(urgency, 2),
            client_value=round(client_value, 2),
            engagement=round(engagement, 2),
            commercial_potential=round(commercial_potential, 2),
            churn_risk=round(churn_risk, 2),
            ai_context=round(ai_context, 2),
        )
        opportunity_title = self._opportunity_title(conversation)

        return WorkItem(
            id=f"opportunity:{client.id}:{conversation.id}",
            item_type=WorkItemType.opportunity,
            client_id=client.id,
            client_name=client.full_name,
            title=opportunity_title,
            summary=self._opportunity_summary(client=client, conversation=conversation),
            priority_score=score,
            priority_label=self._priority_label(score),
            why=self._build_opportunity_reasons(client=client, conversation=conversation, breakdown=breakdown),
            next_best_action="Подготовить персонализированное предложение и согласовать следующий шаг",
            expected_benefit="Перевести интерес клиента в конкретный follow-up с продуктовым оффером.",
            factor_breakdown=breakdown,
            recommendation_id=f"rec:opportunity:{client.id}:{conversation.id}",
            ai_context_note=self._build_ai_context_note(conversation=conversation, task=None),
            due_at=conversation.insights.next_contact_due_at if conversation.insights else client.next_contact_due_at,
            created_at=now,
            channel=conversation.channel,
            conversation_id=conversation.id,
            source_system="opportunity_engine",
            product_code=(conversation.insights.mentioned_product_codes[0] if conversation.insights and conversation.insights.mentioned_product_codes else None),
            product_name=product_name,
            client_churn_risk=client.churn_risk,
        )

    @staticmethod
    def _priority_due_order(value: datetime | None, now: datetime) -> float:
        if value is None:
            return -999999.0
        return -(value - now).total_seconds()

    @staticmethod
    def _item_type_bias(item_type: WorkItemType) -> int:
        order = {
            WorkItemType.task: 3,
            WorkItemType.communication: 2,
            WorkItemType.opportunity: 1,
        }
        return order[item_type]

    @staticmethod
    def _priority_label(score: int) -> str:
        if score >= 85:
            return "urgent"
        if score >= 70:
            return "high"
        if score >= 45:
            return "medium"
        return "low"

    def _task_urgency(self, task: Task, now: datetime) -> float:
        if task.status == TaskStatus.done:
            return 0.1
        if task.due_at <= now:
            return 1.0
        if task.due_at <= now + timedelta(hours=4):
            return 0.95
        if task.due_at <= now + timedelta(hours=24):
            return 0.85
        if task.due_at <= now + timedelta(hours=72):
            return 0.6
        return 0.35

    def _client_value(self, client: Client) -> float:
        portfolio_signal = self._portfolio_signal(client.portfolio_value)
        cash_signal = self._cash_signal(client.cash_balance)
        return 0.65 * portfolio_signal + 0.35 * cash_signal

    @staticmethod
    def _portfolio_signal(portfolio_value: float) -> float:
        if portfolio_value < 8_000_000:
            return 0.25
        if portfolio_value <= 15_000_000:
            return 0.5
        if portfolio_value <= 30_000_000:
            return 0.8
        return 1.0

    @staticmethod
    def _cash_signal(cash_balance: float) -> float:
        if cash_balance < 300_000:
            return 0.2
        if cash_balance < 1_000_000:
            return 0.45
        if cash_balance < 3_000_000:
            return 0.75
        return 1.0

    @staticmethod
    def _engagement_signal(conversation: Conversation | None) -> float:
        if conversation is None or conversation.insights is None:
            return 0.3
        insights = conversation.insights
        if insights.responsiveness_pattern == "speed_sensitive":
            return 1.0
        if insights.responsiveness_pattern == "high":
            return 0.8
        if insights.responsiveness_pattern == "medium":
            return 0.55
        if insights.interest_tags:
            return 0.6
        return 0.3

    def _task_commercial_signal(
        self,
        *,
        task: Task,
        client: Client,
        conversation: Conversation | None,
    ) -> float:
        score = 0.3
        if task.task_type in {"portfolio_review", "offer_follow_up", "product_pitch", "renewal"}:
            score += 0.25
        if task.product_code:
            held_products = {item.product_id for item in client.products}
            if task.product_code not in held_products:
                score += 0.2
        if conversation and conversation.insights and conversation.insights.interest_tags:
            score += 0.15
        if task.business_goal and "retention" in task.business_goal.lower():
            score += 0.05
        return min(score, 1.0)

    @staticmethod
    def _ai_context_signal(
        *,
        conversation: Conversation | None,
        task: Task | None,
        client: Client,
    ) -> float:
        score = 0.2
        if client.ai_summary_text:
            score += 0.1
        if conversation and conversation.insights:
            insights = conversation.insights
            if insights.action_hints:
                score += 0.2
            if insights.objection_tags:
                score += 0.15
            if insights.interest_tags:
                score += 0.15
        if task and task.business_goal:
            score += 0.1
        return min(score, 1.0)

    def _build_task_reasons(
        self,
        *,
        task: Task,
        client: Client,
        conversation: Conversation | None,
        breakdown: WorkItemFactorBreakdown,
        now: datetime,
    ) -> list[str]:
        reasons: list[str] = []
        if task.due_at <= now + timedelta(hours=24):
            reasons.append("Задача должна быть отработана в ближайшие 24 часа")
        if task.business_goal:
            reasons.append(f"Бизнес-цель: {task.business_goal}")
        if breakdown.client_value >= 0.75:
            reasons.append("Высокая ценность клиента по портфелю и ликвидности")
        if conversation and conversation.insights and conversation.insights.action_hints:
            reasons.append("Есть контекстные подсказки по формату следующего шага")
        if client.churn_risk == "high":
            reasons.append("Нельзя откладывать из-за риска оттока")
        return reasons[:4]

    @staticmethod
    def _task_next_action(task: Task, conversation: Conversation | None) -> str:
        if conversation and conversation.insights and conversation.insights.preferred_follow_up_channel == ChannelType.call:
            return "Подготовить звонок и зафиксировать короткий оффер"
        if task.channel == ChannelType.chat:
            return "Закрыть задачу коротким персонализированным сообщением"
        if task.channel == ChannelType.meeting:
            return "Подтвердить встречу и отправить agenda"
        return "Подготовить следующий контакт по задаче"

    @staticmethod
    def _task_expected_benefit(task: Task) -> str:
        if task.business_goal:
            return f"Продвинуть клиента к цели: {task.business_goal.lower()}."
        return "Закрыть операционный шаг без потери темпа по клиенту."

    @staticmethod
    def _communication_expected_benefit(conversation: Conversation, recommendation) -> str:
        if conversation.insights and conversation.insights.next_contact_reason:
            return f"Сохранить темп общения и закрыть следующий шаг: {conversation.insights.next_contact_reason.lower()}."
        if recommendation.factor_breakdown.p_sale >= 0.6:
            return "Удержать окно интереса и перевести разговор к продуктовому предложению."
        return "Не потерять коммуникацию и закрепить следующий контакт."

    def _opportunity_title(self, conversation: Conversation) -> str:
        insights = conversation.insights
        if insights and insights.interest_tags:
            return f"Opportunity: {insights.interest_tags[0]}"
        if insights and insights.mentioned_product_codes:
            return f"Opportunity: продукт {insights.mentioned_product_codes[0]}"
        return "Opportunity: следующий продуктовый шаг"

    @staticmethod
    def _opportunity_summary(client: Client, conversation: Conversation) -> str:
        insights = conversation.insights
        tags = ", ".join(insights.interest_tags) if insights and insights.interest_tags else "интерес не размечен"
        return (
            f"У клиента {client.full_name} есть свободная ликвидность {client.cash_balance:,.0f} "
            f"и сигнал интереса: {tags}."
        ).replace(",", " ")

    @staticmethod
    def _build_opportunity_reasons(
        *,
        client: Client,
        conversation: Conversation,
        breakdown: WorkItemFactorBreakdown,
    ) -> list[str]:
        reasons: list[str] = []
        if client.cash_balance >= 1_000_000:
            reasons.append("Есть свободный остаток для нового продуктового шага")
        if conversation.insights and conversation.insights.interest_tags:
            reasons.append("В коммуникации уже звучит интерес к теме")
        if breakdown.commercial_potential >= 0.8:
            reasons.append("Высокий коммерческий потенциал opportunity")
        if conversation.insights and conversation.insights.action_hints:
            reasons.append("Есть подсказка по формату подачи предложения")
        return reasons[:4]

    @staticmethod
    def _build_ai_context_note(conversation: Conversation | None, task: Task | None) -> str | None:
        notes: list[str] = []
        if conversation and conversation.insights:
            insights = conversation.insights
            if insights.action_hints:
                notes.append(f"Action hints: {', '.join(insights.action_hints)}")
            if insights.objection_tags:
                notes.append(f"Objections: {', '.join(insights.objection_tags)}")
            if insights.preferred_follow_up_format:
                notes.append(f"Preferred format: {insights.preferred_follow_up_format}")
        if task and task.business_goal:
            notes.append(f"Task goal: {task.business_goal}")
        return "; ".join(notes) if notes else None
