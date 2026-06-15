"""Методика приоритизации (отчёт §6.2) — порт prioritization.ts.

  Приоритет = 0.25·Ожидание + 0.30·Ценность + 0.20·Срочность
            + 0.15·Потенциал + 0.10·Риск оттока

Каждый фактор 0–100 по фиксированным шкалам Таблицы 21. Веса экспертные.
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional

from .clock import DEMO_NOW_MS, js_round, parse_ms

PRIORITY_WEIGHTS: dict[str, float] = {
    "waiting": 0.25,
    "value": 0.30,
    "urgency": 0.20,
    "potential": 0.15,
    "churn": 0.10,
}

FACTOR_LABEL: dict[str, str] = {
    "waiting": "Ожидание",
    "value": "Ценность клиента",
    "urgency": "Срочность",
    "potential": "Потенциал шага",
    "churn": "Риск оттока",
}


def priority_level(total: float) -> str:
    if total >= 70:
        return "high"
    if total >= 40:
        return "medium"
    return "low"


# --- Фактор «Ценность клиента»: квартили портфеля менеджера ------------------

def _percentile(sorted_asc: list[float], p: float) -> float:
    if not sorted_asc:
        return 0.0
    idx = (len(sorted_asc) - 1) * p
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return sorted_asc[lo]
    return sorted_asc[lo] + (sorted_asc[hi] - sorted_asc[lo]) * (idx - lo)


def build_value_scale(manager_clients: list[dict[str, Any]]) -> dict[str, float]:
    aums = sorted(c["aum"] for c in manager_clients)
    return {
        "q1": _percentile(aums, 0.25),
        "median": _percentile(aums, 0.5),
        "q3": _percentile(aums, 0.75),
    }


def _score_value(client: dict[str, Any], scale: dict[str, float]) -> tuple[int, str]:
    aum = client["aum"]
    if aum >= scale["q3"]:
        return 100, "Верхний квартиль портфеля — один из самых ценных клиентов менеджера"
    if aum >= scale["median"]:
        return 75, "Выше медианы портфеля по объёму активов"
    if aum >= scale["q1"]:
        return 50, "Средняя ценность в портфеле менеджера"
    return 25, "Нижний квартиль портфеля по объёму активов"


# --- Фактор «Ожидание» ------------------------------------------------------

def _score_waiting(waiting_minutes: int, due_at_iso: str) -> tuple[int, str]:
    overdue = parse_ms(due_at_iso) < DEMO_NOW_MS
    if waiting_minutes < 30:
        score, reason = 10, "Обращение поступило недавно"
    elif waiting_minutes < 120:
        score, reason = 40, "Клиент ждёт от 30 минут до 2 часов"
    elif waiting_minutes < 240:
        score, reason = 70, "Клиент ждёт более 2 часов"
    else:
        score, reason = 100, "Клиент ждёт более 4 часов — нельзя оставлять в конце очереди"
    if overdue:
        score, reason = 100, "Срок контакта уже наступил или просрочен"
    return score, reason


# --- Фактор «Срочность» -----------------------------------------------------

_FORCE_MAJEURE = re.compile(r"блокиров|мошенн|форс-?мажор|украл|взлом", re.IGNORECASE)


def _score_urgency(
    insight: Optional[dict[str, Any]],
    task: Optional[dict[str, Any]],
    last_incoming_text: Optional[str],
) -> tuple[int, str]:
    if last_incoming_text and _FORCE_MAJEURE.search(last_incoming_text):
        return 100, "Форс-мажор: требует немедленной реакции"
    if insight:
        if insight["sentiment"] == "negative" or insight["urgency"] == "critical":
            return 80, "Жалоба или выраженный негатив клиента"
        if insight["urgency"] == "high" or insight["buyingSignal"] == "speed_sensitive":
            return 50, "Чувствительный к скорости продуктовый разговор"
    if task and task["intent"] == "service_recovery":
        return 80, "Восстановление сервиса после сбоя"
    if task and task["intent"] in (
        "product_pitch",
        "offer_follow_up",
        "portfolio_review",
        "investment_plan",
        "liquidity_follow_up",
    ):
        return 50, "Продуктовый вопрос или активная сделка"
    return 20, "Типовое сервисное обращение"


# --- Фактор «Потенциал следующего шага» -------------------------------------

def _score_potential(insight: Optional[dict[str, Any]], client: dict[str, Any]) -> tuple[int, str]:
    if insight:
        if insight["buyingSignal"] == "high":
            return 85, "Явный интерес к продукту или открытая сделка"
        if insight["sentiment"] == "interested" and insight["buyingSignal"] == "medium":
            return 70, "Выраженный интерес к продуктовой теме"
        if insight["buyingSignal"] in ("medium", "speed_sensitive"):
            return 40, "Косвенный интерес, есть продуктовый запрос"
        if insight["buyingSignal"] == "low":
            return 40, "Слабый сигнал интереса"
    if client["liquidBalance"] > 3_000_000:
        return 40, "Крупная свободная ликвидность — потенциал для размещения"
    return 10, "Явных сигналов к покупке пока нет"


# --- Фактор «Риск оттока» ---------------------------------------------------

def _score_churn(client: dict[str, Any], insight: Optional[dict[str, Any]]) -> tuple[int, str]:
    tags = client.get("tags", [])
    silent = "churn-risk" in tags or "silent" in tags or "silent-client" in tags
    if client["churnRisk"] == "high" and (
        (insight and insight["sentiment"] == "negative") or silent
    ):
        return 100, "Прямые сигналы оттока: негатив или молчание при высоком риске"
    if (
        client["churnRisk"] in ("high", "medium")
        or (insight and insight["sentiment"] == "tense")
    ):
        return 50, "Косвенные сигналы: снижение активности или напряжение в диалоге"
    return 0, "Сигналов оттока нет"


# --- Сборка приоритета ------------------------------------------------------

def compute_priority(
    client: dict[str, Any],
    insight: Optional[dict[str, Any]],
    task: Optional[dict[str, Any]],
    value_scale: dict[str, float],
    waiting_minutes: int,
    due_at_iso: str,
    last_incoming_text: Optional[str],
) -> dict[str, Any]:
    waiting = _score_waiting(waiting_minutes, due_at_iso)
    value = _score_value(client, value_scale)
    urgency = _score_urgency(insight, task, last_incoming_text)
    potential = _score_potential(insight, client)
    churn = _score_churn(client, insight)

    raw = [
        ("waiting", *waiting),
        ("value", *value),
        ("urgency", *urgency),
        ("potential", *potential),
        ("churn", *churn),
    ]

    factors: list[dict[str, Any]] = []
    for key, score, reason in raw:
        weight = PRIORITY_WEIGHTS[key]
        factors.append(
            {
                "key": key,
                "label": FACTOR_LABEL[key],
                "score": score,
                "weight": weight,
                "contribution": js_round(score * weight * 10) / 10,
                "reason": reason,
            }
        )

    total = js_round(sum(f["contribution"] for f in factors))

    # Топ-причины: 2–3 фактора с наибольшим вкладом, кроме нулевых.
    reasons = [
        f["reason"]
        for f in sorted(
            (f for f in factors if f["score"] > 0),
            key=lambda f: f["contribution"],
            reverse=True,
        )[:3]
    ]

    data_gaps: list[str] = []
    if not client.get("note"):
        data_gaps.append("Профиль клиента заполнен частично")
    if not insight:
        data_gaps.append("Нет анализа последнего диалога")

    return {
        "total": total,
        "level": priority_level(total),
        "factors": factors,
        "reasons": reasons,
        "dataGaps": data_gaps,
    }
