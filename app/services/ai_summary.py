from __future__ import annotations

from typing import Any

from ..ai.base import AIProvider
from ..models import Client, Conversation, DialogRecommendation, SummarizeDialogResponse


MAX_CONTEXT_MESSAGES = 12
MAX_MESSAGE_CHARS = 500
MAX_CONTEXT_TEXT_CHARS = 400


class AISummaryService:
    def build_context(
        self,
        client: Client,
        conversation: Conversation,
        recommendation: DialogRecommendation | None,
    ) -> dict[str, Any]:
        messages = conversation.messages[-MAX_CONTEXT_MESSAGES:]
        return {
            "client": {
                "id": client.id,
                "full_name": client.full_name,
                "segment": client.segment,
                "risk_profile": client.risk_profile,
                "city": client.city,
                "preferred_channel": client.preferred_channel,
                "occupation": client.occupation,
                "income_band": client.income_band,
                "portfolio_value": client.portfolio_value,
                "cash_balance": client.cash_balance,
                "churn_risk": client.churn_risk,
                "notes_summary": self._trim_text(client.notes_summary, MAX_CONTEXT_TEXT_CHARS),
                "ai_summary_text": self._trim_text(client.ai_summary_text, MAX_CONTEXT_TEXT_CHARS),
                "tags": client.tags,
            },
            "products": [
                {
                    "product_id": product.product_id,
                    "name": product.name,
                    "category": product.category,
                    "status": product.status,
                    "balance": product.balance,
                    "risk_level": product.risk_level,
                    "margin_level": product.margin_level,
                    "currency": product.currency,
                }
                for product in client.products
            ],
            "dialog_recommendation": recommendation.model_dump(mode="json") if recommendation else None,
            "conversation": {
                "id": conversation.id,
                "channel": conversation.channel.value,
                "topic": self._trim_text(conversation.topic, MAX_CONTEXT_TEXT_CHARS),
                "started_at": conversation.started_at.isoformat(),
                "insights": conversation.insights.model_dump(mode="json") if conversation.insights else None,
                "messages": [
                    {
                        "sender": message.sender,
                        "text": self._trim_text(message.text, MAX_MESSAGE_CHARS),
                        "created_at": message.created_at.isoformat(),
                    }
                    for message in messages
                ],
                "context_window": {
                    "messages_before_trim": len(conversation.messages),
                    "messages_after_trim": len(messages),
                },
            },
        }

    def summarize_dialog(
        self,
        provider: AIProvider,
        client: Client,
        conversation: Conversation,
        recommendation: DialogRecommendation | None,
    ) -> SummarizeDialogResponse:
        context = self.build_context(client=client, conversation=conversation, recommendation=recommendation)
        response = provider.summarize_dialog(context)
        response.draft = response.draft.model_copy(
            update={
                "grounding_facts": self._grounding_facts(
                    client=client,
                    conversation=conversation,
                    recommendation=recommendation,
                ),
                "data_gaps": sorted(
                    set(
                        response.draft.data_gaps
                        + self._data_gaps(client=client, conversation=conversation)
                    )
                ),
            }
        )
        return response

    @staticmethod
    def _trim_text(value: str | None, max_chars: int) -> str | None:
        if value is None:
            return None
        compact = " ".join(value.split())
        if len(compact) <= max_chars:
            return compact
        return f"{compact[: max_chars - 1]}…"

    def _grounding_facts(
        self,
        *,
        client: Client,
        conversation: Conversation,
        recommendation: DialogRecommendation | None,
    ) -> list[str]:
        facts = [
            f"Клиент {client.full_name}, риск-профиль {client.risk_profile}, сегмент {client.segment}.",
            f"Диалог {conversation.channel.value}: {self._trim_text(conversation.topic, 80)}.",
        ]
        latest_client_message = next(
            (message for message in reversed(conversation.messages) if message.sender == "client"),
            None,
        )
        if latest_client_message is not None:
            facts.append(f"Последний сигнал клиента: {self._trim_text(latest_client_message.text, 140)}")
        if recommendation is not None and recommendation.why:
            facts.append("Причины приоритета: " + " | ".join(recommendation.why[:3]))
        return facts[:4]

    def _data_gaps(self, *, client: Client, conversation: Conversation) -> list[str]:
        gaps: list[str] = []
        if not client.notes_summary:
            gaps.append("Не хватает структурированного профиля клиента из заметок менеджера.")
        if not conversation.insights or not conversation.insights.next_contact_reason:
            gaps.append("Не зафиксирована причина следующего контакта в conversation insights.")
        if len(conversation.messages) < 3:
            gaps.append("История диалога короткая, summary опирается на ограниченный контекст.")
        return gaps
