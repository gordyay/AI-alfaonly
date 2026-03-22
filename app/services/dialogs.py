from __future__ import annotations

from datetime import datetime, timedelta

from ..db import SQLiteStorage, utc_now
from ..models import Client, Conversation, DialogFactorBreakdown, DialogFeedItem, DialogRecommendation


URGENCY_SCORE = {
    "low": 0.2,
    "normal": 0.5,
    "high": 0.8,
    "critical": 1.0,
}

TONE_SCORE = {
    "neutral": 0.2,
    "interested": 0.5,
    "tense": 0.8,
    "negative": 1.0,
}

RESPONSIVENESS_SCORE = {
    "low": 0.3,
    "medium": 0.5,
    "high": 0.8,
    "speed_sensitive": 1.0,
}

ACTIVITY_SCORE = {
    "low": 0.2,
    "medium": 0.5,
    "high": 0.8,
    "speed_sensitive": 1.0,
}

CHURN_SCORE = {
    "low": 0.2,
    "medium": 0.6,
    "high": 0.9,
}


class DialogPriorityService:
    def list_manager_dialogs(
        self,
        storage: SQLiteStorage,
        manager_id: str | None = None,
        sort_by: str = "priority",
        now: datetime | None = None,
    ) -> list[DialogFeedItem]:
        reference_now = now or utc_now()
        items: list[DialogFeedItem] = []
        clients = storage.list_clients(manager_id=manager_id)
        latest_conversations = storage.list_latest_conversations([client.id for client in clients])

        for client in clients:
            latest_conversation = latest_conversations.get(client.id)
            if latest_conversation is None:
                continue

            recommendation = self.build_recommendation(
                client=client,
                conversation=latest_conversation,
                now=reference_now,
            )
            items.append(DialogFeedItem.model_validate(recommendation.model_dump()))

        if sort_by == "last_message":
            return sorted(items, key=lambda item: item.last_message_at or datetime.min.replace(tzinfo=utc_now().tzinfo), reverse=True)

        return sorted(items, key=lambda item: item.priority_score, reverse=True)

    def build_recommendation(
        self,
        client: Client,
        conversation: Conversation | None,
        now: datetime | None = None,
    ) -> DialogRecommendation | None:
        if conversation is None:
            return None

        reference_now = now or utc_now()
        breakdown = self._compute_factor_breakdown(client, conversation, reference_now)
        raw_score = (
            0.25 * breakdown.t_wait
            + 0.30 * breakdown.c_value
            + 0.20 * breakdown.u_comm
            + 0.15 * breakdown.p_sale
            + 0.10 * breakdown.r_churn
        )
        priority_score = round(raw_score * 100)
        priority_label = self._priority_label(priority_score)
        why = self._build_why(client, conversation, breakdown)
        next_best_action = self._build_next_best_action(conversation, breakdown)
        last_message = conversation.messages[-1] if conversation.messages else None

        return DialogRecommendation(
            client_id=client.id,
            conversation_id=conversation.id,
            client_name=client.full_name,
            last_message_preview=self._build_last_message_preview(last_message.text if last_message else None, last_message.sender if last_message else None),
            last_message_at=last_message.created_at if last_message else None,
            mini_summary=client.ai_summary_text or client.notes_summary or "Краткий контекст клиента пока не заполнен.",
            priority_score=priority_score,
            priority_label=priority_label,
            why=why,
            next_best_action=next_best_action,
            factor_breakdown=breakdown,
        )

    def _compute_factor_breakdown(
        self,
        client: Client,
        conversation: Conversation,
        now: datetime,
    ) -> DialogFactorBreakdown:
        insights = conversation.insights
        t_wait = self._compute_t_wait(client, conversation, now)
        c_value = self._compute_c_value(client.portfolio_value, insights.responsiveness_pattern if insights else None)
        u_comm = self._compute_u_comm(
            urgency_label=insights.urgency_label if insights else None,
            tone_label=insights.tone_label if insights else None,
            responsiveness_pattern=insights.responsiveness_pattern if insights else None,
        )
        p_sale = self._compute_p_sale(client, conversation)
        r_churn = CHURN_SCORE.get(client.churn_risk, 0.2)

        return DialogFactorBreakdown(
            t_wait=round(t_wait, 2),
            c_value=round(c_value, 2),
            u_comm=round(u_comm, 2),
            p_sale=round(p_sale, 2),
            r_churn=round(r_churn, 2),
        )

    def _compute_t_wait(self, client: Client, conversation: Conversation, now: datetime) -> float:
        insights = conversation.insights
        target_dt = insights.next_contact_due_at if insights and insights.next_contact_due_at else client.next_contact_due_at

        if target_dt:
            if target_dt <= now + timedelta(hours=2):
                return 1.0
            if target_dt <= now + timedelta(hours=24):
                return 0.8
            if target_dt <= now + timedelta(hours=72):
                return 0.5
            return 0.2

        last_client_message = next((message for message in reversed(conversation.messages) if message.sender == "client"), None)
        if not last_client_message:
            return 0.2

        if last_client_message.created_at >= now - timedelta(hours=2):
            return 1.0
        if last_client_message.created_at >= now - timedelta(hours=24):
            return 0.8
        if last_client_message.created_at >= now - timedelta(hours=72):
            return 0.5
        return 0.2

    def _compute_c_value(self, portfolio_value: float, responsiveness_pattern: str | None) -> float:
        return 0.6 * self._portfolio_score(portfolio_value) + 0.4 * self._activity_score(responsiveness_pattern)

    def _compute_u_comm(
        self,
        urgency_label: str | None,
        tone_label: str | None,
        responsiveness_pattern: str | None,
    ) -> float:
        urgency_score = URGENCY_SCORE.get(urgency_label or "low", 0.2)
        tone_score = TONE_SCORE.get(tone_label or "neutral", 0.2)
        responsiveness_score = RESPONSIVENESS_SCORE.get(responsiveness_pattern or "low", 0.3)
        return 0.5 * urgency_score + 0.3 * tone_score + 0.2 * responsiveness_score

    def _compute_p_sale(self, client: Client, conversation: Conversation) -> float:
        insights = conversation.insights
        score = 0.2

        if client.cash_balance >= 1_000_000:
            score += 0.25

        if insights and insights.interest_tags:
            score += 0.20

        held_product_ids = {product.product_id for product in client.products}
        if insights and any(product_code not in held_product_ids for product_code in insights.mentioned_product_codes):
            score += 0.20

        if insights and insights.preferred_follow_up_format in {"comparison", "detailed"}:
            score += 0.15

        return min(score, 1.0)

    def _build_why(
        self,
        client: Client,
        conversation: Conversation,
        breakdown: DialogFactorBreakdown,
    ) -> list[str]:
        insights = conversation.insights
        reasons: list[str] = []

        if breakdown.t_wait >= 0.8:
            reasons.append("Назначен контакт в ближайшие 24 часа")
        if insights and insights.responsiveness_pattern == "speed_sensitive":
            reasons.append("Клиент чувствителен к скорости ответа")
        if client.cash_balance >= 1_000_000:
            reasons.append("Высокий свободный остаток на счете")
        if insights and insights.interest_tags:
            reasons.append("Есть явный интерес к продукту")
        if client.churn_risk == "high":
            reasons.append("Есть повышенный риск потери клиента")

        if not reasons:
            reasons.append("Диалог находится в активной работе")
        if len(reasons) == 1:
            reasons.append("Есть потенциал для следующего шага")

        return reasons[:4]

    def _build_next_best_action(self, conversation: Conversation, breakdown: DialogFactorBreakdown) -> str:
        insights = conversation.insights
        if insights and insights.preferred_follow_up_channel and insights.preferred_follow_up_channel.value == "call" and breakdown.t_wait >= 0.8:
            return "Подготовить звонок"
        if insights and insights.preferred_follow_up_format == "comparison":
            return "Отправить короткое сравнение"
        if insights and "avoid_pressure" in insights.action_hints:
            return "Сделать мягкий follow-up"
        if insights and "keep_message_short" in insights.action_hints:
            return "Отправить короткое сообщение"
        return "Ответить в чате с персонализированным тезисом"

    @staticmethod
    def _priority_label(priority_score: int) -> str:
        if priority_score >= 85:
            return "urgent"
        if priority_score >= 70:
            return "high"
        if priority_score >= 45:
            return "medium"
        return "low"

    @staticmethod
    def _build_last_message_preview(text: str | None, sender: str | None) -> str:
        if not text:
            return "Нет недавних сообщений"
        prefix = "Вы" if sender == "manager" else "Клиент"
        preview = f"{prefix}: {text}"
        return preview if len(preview) <= 120 else f"{preview[:117]}..."

    @staticmethod
    def _portfolio_score(portfolio_value: float) -> float:
        if portfolio_value < 8_000_000:
            return 0.2
        if portfolio_value <= 15_000_000:
            return 0.5
        if portfolio_value <= 30_000_000:
            return 0.8
        return 1.0

    @staticmethod
    def _activity_score(responsiveness_pattern: str | None) -> float:
        return ACTIVITY_SCORE.get(responsiveness_pattern or "low", 0.2)
