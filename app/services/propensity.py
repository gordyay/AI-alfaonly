from __future__ import annotations

from datetime import datetime

from ..db import SQLiteStorage, utc_now
from ..models import (
    Client,
    Product,
    ProductFitLabel,
    ProductPlanCandidate,
    ProductPlanResponse,
    ProductPropensityFactors,
    ProductPropensityItem,
    ProductPropensityResponse,
)


class ProductPropensityService:
    def build_client_propensity(
        self,
        storage: SQLiteStorage,
        client: Client,
        *,
        now: datetime | None = None,
        conversation=None,
    ) -> ProductPropensityResponse:
        reference_now = now or utc_now()
        products = storage.list_products()
        if conversation is None:
            conversations = storage.list_client_conversations(client.id)
            conversation = conversations[0] if conversations else None
        items = [self._score_product(client, product, conversation) for product in products]
        items.sort(key=lambda item: item.score, reverse=True)
        return ProductPropensityResponse(client_id=client.id, generated_at=reference_now, items=items)

    def build_product_plan(
        self,
        storage: SQLiteStorage,
        *,
        manager_id: str,
        product_id: str,
        now: datetime | None = None,
    ) -> ProductPlanResponse:
        reference_now = now or utc_now()
        product = next((item for item in storage.list_products() if item.id == product_id), None)
        if product is None:
            return ProductPlanResponse(manager_id=manager_id, product_id=product_id, generated_at=reference_now, items=[])

        candidates: list[ProductPlanCandidate] = []
        clients = storage.list_clients(manager_id=manager_id)
        latest_conversations = storage.list_latest_conversations([client.id for client in clients])
        for client in clients:
            conversation = latest_conversations.get(client.id)
            scored = self._score_product(client, product, conversation)
            if scored.fit_label == ProductFitLabel.weak and scored.score < 45:
                continue
            candidates.append(
                ProductPlanCandidate(
                    client_id=client.id,
                    client_name=client.full_name,
                    product_id=product.id,
                    product_name=product.name,
                    score=scored.score,
                    fit_label=scored.fit_label,
                    reasons=scored.reasons,
                    next_best_action=scored.next_best_action,
                )
            )

        candidates.sort(key=lambda item: item.score, reverse=True)
        return ProductPlanResponse(
            manager_id=manager_id,
            product_id=product_id,
            generated_at=reference_now,
            items=candidates,
        )

    def _score_product(self, client: Client, product: Product, conversation) -> ProductPropensityItem:
        held_products = {item.product_id for item in client.products}
        already_holds = product.id in held_products
        insights = conversation.insights if conversation else None

        product_fit = self._product_fit(client, product)
        affordability = self._affordability(client, product)
        behavioral_signal = self._behavioral_signal(product, insights)
        relationship_depth = self._relationship_depth(client, conversation)
        portfolio_gap = 0.15 if already_holds else self._portfolio_gap(client, product)

        score = round(
            (
                0.28 * product_fit
                + 0.22 * affordability
                + 0.24 * behavioral_signal
                + 0.12 * relationship_depth
                + 0.14 * portfolio_gap
            )
            * 100
        )

        reasons: list[str] = []
        data_gaps: list[str] = []

        if already_holds:
            reasons.append("Продукт уже есть в портфеле, поэтому потенциал ограничен.")
        if insights and product.id in (insights.mentioned_product_codes or []):
            reasons.append("Продукт уже звучал в текущей коммуникации.")
        if insights and any(tag in self._product_tags(product) for tag in insights.interest_tags):
            reasons.append("Есть поведенческий сигнал интереса к этой категории.")
        if client.cash_balance >= 1_000_000:
            reasons.append("Свободный остаток позволяет обсуждать новый продукт.")
        if client.notes_summary is None:
            data_gaps.append("Нет расширенного notes_summary по клиенту.")
        if not insights or not insights.interest_tags:
            data_gaps.append("Не хватает явных product-interest сигналов в последней коммуникации.")

        if not reasons:
            reasons.append("Продукт релевантен профилю клиента по базовым факторам.")

        next_action = self._next_action(product, behavioral_signal, already_holds)
        fit_label = ProductFitLabel.strong if score >= 75 else ProductFitLabel.medium if score >= 50 else ProductFitLabel.weak

        return ProductPropensityItem(
            product_id=product.id,
            product_name=product.name,
            category=product.category,
            score=score,
            fit_label=fit_label,
            reasons=reasons[:4],
            data_gaps=data_gaps[:3],
            next_best_action=next_action,
            factors=ProductPropensityFactors(
                product_fit=round(product_fit, 2),
                affordability=round(affordability, 2),
                behavioral_signal=round(behavioral_signal, 2),
                relationship_depth=round(relationship_depth, 2),
                portfolio_gap=round(portfolio_gap, 2),
            ),
            already_holds=already_holds,
        )

    @staticmethod
    def _product_tags(product: Product) -> set[str]:
        tag_map = {
            "p1": {"premium-card", "travel", "active-chat"},
            "p2": {"investments", "growth", "brokerage"},
            "p3": {"deposit", "liquidity", "retention"},
            "p4": {"insurance", "travel", "family"},
            "p5": {"fx", "brokerage", "growth"},
        }
        return tag_map.get(product.id, {product.category})

    def _product_fit(self, client: Client, product: Product) -> float:
        fit = 0.35
        if client.risk_profile == "conservative" and product.risk_level == "low":
            fit += 0.35
        elif client.risk_profile == "aggressive" and product.risk_level == "high":
            fit += 0.35
        elif client.risk_profile == "moderate":
            fit += 0.2

        if product.category in {"cards", "insurance"} and "family" in client.tags:
            fit += 0.1
        if product.category in {"investment", "brokerage"} and client.income_band in {"high", "very_high"}:
            fit += 0.15
        return min(fit, 1.0)

    @staticmethod
    def _affordability(client: Client, product: Product) -> float:
        if product.category in {"deposits", "investment", "brokerage"}:
            if client.cash_balance >= 3_000_000:
                return 1.0
            if client.cash_balance >= 1_000_000:
                return 0.8
            if client.cash_balance >= 300_000:
                return 0.5
            return 0.2
        if product.category in {"cards", "insurance"}:
            return 0.8 if client.income_band in {"high", "very_high"} else 0.5
        return 0.4

    def _behavioral_signal(self, product: Product, insights) -> float:
        if insights is None:
            return 0.2
        score = 0.2
        tags = self._product_tags(product)
        if any(tag in tags for tag in insights.interest_tags):
            score += 0.4
        if product.id in (insights.mentioned_product_codes or []):
            score += 0.25
        if insights.preferred_follow_up_format in {"comparison", "detailed"}:
            score += 0.1
        return min(score, 1.0)

    @staticmethod
    def _relationship_depth(client: Client, conversation) -> float:
        score = 0.3
        if client.last_contact_at is not None:
            score += 0.2
        if conversation and conversation.insights and conversation.insights.responsiveness_pattern in {"high", "speed_sensitive"}:
            score += 0.35
        if client.ai_summary_text:
            score += 0.15
        return min(score, 1.0)

    @staticmethod
    def _portfolio_gap(client: Client, product: Product) -> float:
        categories = {item.category for item in client.products}
        if product.category not in categories:
            return 0.9
        return 0.45

    @staticmethod
    def _next_action(product: Product, behavioral_signal: float, already_holds: bool) -> str:
        if already_holds:
            return "Не пушить новый pitch, а проверить апсейл или переупаковку текущего продукта."
        if behavioral_signal >= 0.6:
            return f"Подготовить персональное предложение по продукту «{product.name}»."
        return f"Сначала проверить интерес клиента к теме «{product.name}» коротким вопросом."
