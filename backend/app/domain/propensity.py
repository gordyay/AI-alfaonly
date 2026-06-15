"""Оценка склонности клиента к покупке продукта (отчёт §6.3) — порт propensity.ts.
Пять факторов: соответствие продукта, поведенческий сигнал, платёжеспособность,
глубина отношений, пробел в портфеле. Итог — честная сумма пяти факторов."""

from __future__ import annotations

from typing import Any

from .clock import js_round
from .prioritization import priority_level
from .tags import tag_label

RISK_RU: dict[str, str] = {
    "conservative": "консервативный",
    "moderate": "умеренный",
    "aggressive": "агрессивный",
}

PROPENSITY_WEIGHTS: dict[str, float] = {
    "product_fit": 0.25,
    "behavioral_signal": 0.25,
    "payment_capacity": 0.20,
    "relationship_depth": 0.15,
    "portfolio_gap": 0.15,
}

PROPENSITY_LABEL: dict[str, str] = {
    "product_fit": "Соответствие продукта",
    "behavioral_signal": "Поведенческий сигнал",
    "payment_capacity": "Платёжеспособность",
    "relationship_depth": "Глубина отношений",
    "portfolio_gap": "Пробел в портфеле",
}

_CATEGORY_TAG: dict[str, list[str]] = {
    "investment": ["investments", "investment-intent", "growth"],
    "brokerage": ["fx", "brokerage", "growth", "investment-intent"],
    "deposits": ["liquidity", "deposit", "wealth", "retention"],
    "cards": ["premium-card", "travel", "service"],
    "insurance": ["insurance", "travel", "family"],
}

_CATEGORY_TOPICS: dict[str, list[str]] = {
    "investment": ["investments", "portfolio_growth", "growth", "capital_preservation"],
    "brokerage": ["fx", "brokerage", "growth"],
    "deposits": ["liquidity", "deposit", "capital_protection", "capital_preservation", "bond_alternative"],
    "cards": ["premium_card", "travel", "service", "cashback"],
    "insurance": ["insurance", "travel", "family"],
}


def _risk_fit(client: dict[str, Any], product: dict[str, Any]) -> int:
    a = client["riskAppetite"]
    r = product["riskLevel"]
    if a == "aggressive":
        return 92 if r == "high" else 70 if r == "medium" else 45
    if a == "conservative":
        return 92 if r == "low" else 60 if r == "medium" else 32
    return 84 if r == "medium" else 72 if r == "low" else 60


def _score_product_fit(client: dict[str, Any], product: dict[str, Any]) -> tuple[int, str]:
    score = _risk_fit(client, product)
    match_tags = [t for t in _CATEGORY_TAG[product["category"]] if t in client.get("tags", [])]
    if match_tags:
        score = min(100, score + 8 * len(match_tags))
    risk_ru = RISK_RU[client["riskAppetite"]]
    if match_tags:
        labels = ", ".join(tag_label(t) for t in match_tags)
        reason = f"Продукт совпадает с профилем ({risk_ru} риск, интересы: {labels})"
    else:
        reason = f"Соответствие риск-профилю клиента ({risk_ru})"
    return js_round(score), reason


def _score_payment_capacity(client: dict[str, Any], product: dict[str, Any]) -> tuple[int, str]:
    if product["category"] in ("deposits", "investment", "brokerage"):
        lb = client["liquidBalance"]
        if lb >= 5_000_000:
            return 96, "Высокая свободная ликвидность для размещения"
        if lb >= 2_000_000:
            return 82, "Достаточная свободная ликвидность для размещения"
        if lb >= 1_000_000:
            return 66, "Умеренная свободная ликвидность"
        if lb >= 500_000:
            return 50, "Ограниченная свободная ликвидность"
        return 34, "Свободной ликвидности мало — крупное размещение маловероятно"
    aum = client["aum"]
    if aum >= 20_000_000:
        return 88, "Высокая платёжеспособность по объёму активов"
    if aum >= 8_000_000:
        return 72, "Умеренная платёжеспособность по объёму активов"
    return 56, "Платёжеспособность по объёму активов ограничена"


def _score_behavioral_signal(
    product: dict[str, Any],
    relevant_product_codes: list[str],
    interest_topics: list[str],
) -> tuple[int, str]:
    if product["id"] in relevant_product_codes:
        return 88, "Клиент сам поднимал тему этого продукта в диалогах"
    overlap = [t for t in _CATEGORY_TOPICS[product["category"]] if t in interest_topics]
    if len(overlap) >= 2:
        return 72, "В диалогах есть устойчивый интерес к теме продукта"
    if len(overlap) == 1:
        return 58, "В диалогах встречалась смежная тема"
    return 28, "Прямых сигналов интереса к продукту пока нет"


def _score_relationship_depth(owned_count: int) -> tuple[int, str]:
    if owned_count >= 3:
        return 90, "Глубокие отношения: 3+ активных продукта"
    if owned_count == 2:
        return 70, "Двусторонние отношения: 2 активных продукта"
    if owned_count == 1:
        return 50, "Один активный продукт — есть пространство для развития"
    return 30, "Новый клиент без активных продуктов"


def _score_portfolio_gap(
    product: dict[str, Any],
    owned_product_ids: list[str],
    owned_categories: list[str],
) -> tuple[int, str]:
    if product["id"] in owned_product_ids:
        return 25, "Продукт уже есть — возможен только апсейл"
    if product["category"] in owned_categories:
        return 62, "Категория уже знакома клиенту, но конкретного продукта нет"
    return 92, "Явный пробел: категория ещё не закрыта"


def compute_propensity(
    client: dict[str, Any],
    product: dict[str, Any],
    owned_product_ids: list[str],
    owned_categories: list[str],
    relevant_product_codes: list[str],
    interest_topics: list[str],
) -> dict[str, Any]:
    fit = _score_product_fit(client, product)
    beh = _score_behavioral_signal(product, relevant_product_codes, interest_topics)
    cap = _score_payment_capacity(client, product)
    depth = _score_relationship_depth(len(owned_product_ids))
    gap = _score_portfolio_gap(product, owned_product_ids, owned_categories)

    raw = [
        ("product_fit", *fit),
        ("behavioral_signal", *beh),
        ("payment_capacity", *cap),
        ("relationship_depth", *depth),
        ("portfolio_gap", *gap),
    ]

    factors: list[dict[str, Any]] = []
    for key, score, reason in raw:
        weight = PROPENSITY_WEIGHTS[key]
        factors.append(
            {
                "key": key,
                "label": PROPENSITY_LABEL[key],
                "score": score,
                "weight": weight,
                "contribution": js_round(score * weight * 10) / 10,
                "reason": reason,
            }
        )

    total = js_round(sum(f["contribution"] for f in factors))
    reasons = [
        f["reason"]
        for f in sorted(factors, key=lambda f: f["contribution"], reverse=True)[:3]
    ]

    tags = client.get("tags", [])
    silent = any(t in ("churn-risk", "silent", "silent-client", "negative-tone") for t in tags)
    retention_first = client["churnRisk"] == "high" and silent

    return {
        "clientId": client["id"],
        "productId": product["id"],
        "total": total,
        "level": priority_level(total),
        "factors": factors,
        "reasons": reasons,
        "retentionFirst": retention_first,
    }
