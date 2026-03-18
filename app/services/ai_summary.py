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
        return provider.summarize_dialog(context)

    @staticmethod
    def _trim_text(value: str | None, max_chars: int) -> str | None:
        if value is None:
            return None
        compact = " ".join(value.split())
        if len(compact) <= max_chars:
            return compact
        return f"{compact[: max_chars - 1]}…"
