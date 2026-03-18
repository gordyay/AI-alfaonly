from __future__ import annotations

from typing import Any

from ..ai.base import AIProvider
from ..models import Client, Conversation, CRMNote, DialogRecommendation, GenerateScriptResponse


MAX_CONTEXT_MESSAGES = 12
MAX_MESSAGE_CHARS = 500
MAX_CONTEXT_TEXT_CHARS = 400
MAX_CRM_NOTES = 3
MAX_INSTRUCTION_CHARS = 300


class AIScriptService:
    def build_context(
        self,
        client: Client,
        conversation: Conversation,
        recommendation: DialogRecommendation | None,
        crm_notes: list[CRMNote],
        instruction: str | None,
    ) -> dict[str, Any]:
        messages = conversation.messages[-MAX_CONTEXT_MESSAGES:]
        recent_crm_notes = crm_notes[:MAX_CRM_NOTES]

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
            "crm_notes": [
                {
                    "created_at": note.created_at.isoformat(),
                    "outcome": note.outcome,
                    "note_text": self._trim_text(note.note_text, MAX_CONTEXT_TEXT_CHARS),
                    "summary_text": self._trim_text(note.summary_text, MAX_CONTEXT_TEXT_CHARS),
                    "follow_up_date": note.follow_up_date.isoformat() if note.follow_up_date else None,
                    "follow_up_reason": self._trim_text(note.follow_up_reason, MAX_CONTEXT_TEXT_CHARS),
                }
                for note in recent_crm_notes
            ],
            "instruction": self._trim_text(instruction, MAX_INSTRUCTION_CHARS),
        }

    def generate_script(
        self,
        provider: AIProvider,
        client: Client,
        conversation: Conversation,
        recommendation: DialogRecommendation | None,
        crm_notes: list[CRMNote],
        instruction: str | None,
    ) -> GenerateScriptResponse:
        context = self.build_context(
            client=client,
            conversation=conversation,
            recommendation=recommendation,
            crm_notes=crm_notes,
            instruction=instruction,
        )
        return provider.generate_script(context)

    @staticmethod
    def _trim_text(value: str | None, max_chars: int) -> str | None:
        if value is None:
            return None
        compact = " ".join(value.split())
        if len(compact) <= max_chars:
            return compact
        return f"{compact[: max_chars - 1]}…"
