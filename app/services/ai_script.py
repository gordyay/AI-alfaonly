from __future__ import annotations

from typing import Any

from ..ai.base import AIProvider
from ..models import (
    Client,
    Conversation,
    CRMNote,
    DialogRecommendation,
    GenerateScriptResponse,
    ObjectionWorkflowDraft,
    ProductPropensityItem,
)


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
        contact_goal: str | None = None,
        product_propensities: list[ProductPropensityItem] | None = None,
        objection_workflow: ObjectionWorkflowDraft | None = None,
    ) -> dict[str, Any]:
        messages = conversation.messages[-MAX_CONTEXT_MESSAGES:]
        recent_crm_notes = crm_notes[:MAX_CRM_NOTES]
        top_propensities = (product_propensities or [])[:3]
        mode = self._resolve_mode(instruction)

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
            "propensity_rankings": [item.model_dump(mode="json") for item in top_propensities],
            "objection_workflow": objection_workflow.model_dump(mode="json") if objection_workflow else None,
            "script_job": {
                "mode": mode,
                "contact_goal": contact_goal
                or (recommendation.next_best_action if recommendation else "Поддержать следующий осмысленный шаг"),
                "focus_product": top_propensities[0].product_name if top_propensities else None,
                "preferred_tone": self._resolve_tone(conversation),
            },
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
        contact_goal: str | None = None,
        product_propensities: list[ProductPropensityItem] | None = None,
        objection_workflow: ObjectionWorkflowDraft | None = None,
    ) -> GenerateScriptResponse:
        context = self.build_context(
            client=client,
            conversation=conversation,
            recommendation=recommendation,
            crm_notes=crm_notes,
            instruction=instruction,
            contact_goal=contact_goal,
            product_propensities=product_propensities,
            objection_workflow=objection_workflow,
        )
        response = provider.generate_script(context)
        response.draft = response.draft.model_copy(
            update={
                "grounding_facts": self._grounding_facts(
                    client=client,
                    conversation=conversation,
                    recommendation=recommendation,
                    product_propensities=product_propensities,
                    objection_workflow=objection_workflow,
                ),
                "data_gaps": self._data_gaps(
                    client=client,
                    conversation=conversation,
                    product_propensities=product_propensities,
                ),
            }
        )
        return response

    @staticmethod
    def _resolve_mode(instruction: str | None) -> str:
        lowered = (instruction or "").lower()
        if any(token in lowered for token in ["альтернатив", "другой вариант", "еще вариант", "другую версию"]):
            return "alternative_variant"
        if any(token in lowered for token in ["follow-up", "follow up", "followup", "догон", "мягкий follow"]):
            return "follow_up"
        return "primary"

    @staticmethod
    def _resolve_tone(conversation: Conversation) -> str:
        if conversation.insights and "avoid_pressure" in (conversation.insights.action_hints or []):
            return "soft"
        if conversation.channel.value == "chat":
            return "concise_personal"
        return "consultative"

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
        product_propensities: list[ProductPropensityItem] | None,
        objection_workflow: ObjectionWorkflowDraft | None,
    ) -> list[str]:
        facts = [
            f"Клиент {client.full_name}, риск {client.risk_profile}, свободный остаток {int(client.cash_balance):,} RUB.".replace(",", " "),
            f"Канал контакта: {conversation.channel.value}, тон: {self._resolve_tone(conversation)}.",
        ]
        if recommendation is not None:
            facts.append(f"Next best action: {recommendation.next_best_action}")
        if product_propensities:
            facts.append(f"Топ-продукт по propensity: {product_propensities[0].product_name}")
        if objection_workflow is not None:
            facts.append(f"Текущее возражение: {objection_workflow.analysis.objection_label}")
        return facts[:5]

    def _data_gaps(
        self,
        *,
        client: Client,
        conversation: Conversation,
        product_propensities: list[ProductPropensityItem] | None,
    ) -> list[str]:
        gaps: list[str] = []
        if not client.ai_summary_text:
            gaps.append("Нет свежего AI summary по клиенту, поэтому скрипт опирается на raw dialogue context.")
        if not product_propensities:
            gaps.append("Не рассчитан product propensity, продуктовый фокус выбран эвристически.")
        if not conversation.insights or not conversation.insights.action_hints:
            gaps.append("Нет action hints в conversation insights, тональность выбрана по общему правилу.")
        return gaps
