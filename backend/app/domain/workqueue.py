"""Сборка приоритизированной очереди кейсов менеджера (UC-01, FR1) — порт
workqueue.ts. Каждая незавершённая задача/коммуникация превращается в WorkItem
с рассчитанным приоритетом, объяснением и следующим лучшим действием."""

from __future__ import annotations

from typing import Any, Optional

from .. import db
from .clock import minutes_since, parse_ms
from .prioritization import build_value_scale, compute_priority

IMPACT_BY_INTENT: dict[str, str] = {
    "service_recovery": "Снижение оттока и восстановление доверия",
    "retention_follow_up": "Удержание клиента и ликвидности в банке",
    "product_pitch": "Шаг к продаже премиум-продукта",
    "offer_follow_up": "Перевод интереса в конкретное предложение",
    "investment_plan": "Конвертация интереса к инвестициям в сделку",
    "liquidity_follow_up": "Размещение свободной ликвидности",
    "portfolio_review": "Развитие и защита портфеля клиента",
    "meeting_conversion": "Перевод интереса в очную встречу",
    "service_follow_up": "Поддержание качества премиального сервиса",
    "discovery_follow_up": "Прояснение профиля до предложения",
}


def _last_incoming(messages: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    for m in reversed(messages):
        if m["sender"] == "client":
            return m
    return None


def build_work_item(task: dict[str, Any], value_scale: dict[str, float]) -> Optional[dict[str, Any]]:
    client = db.get_client(task["clientId"])
    if not client:
        return None

    conv_id = task.get("conversationId")
    insight = db.get_insight(conv_id) if conv_id else None
    messages = db.get_messages(conv_id) if conv_id else []
    incoming = _last_incoming(messages) if conv_id else None
    newest = messages[-1] if messages else None
    has_incoming = newest is not None and newest["sender"] == "client"

    waiting_minutes = max(minutes_since(task["createdAtIso"]), (insight or {}).get("waitingMinutes", 0))

    priority = compute_priority(
        client=client,
        insight=insight,
        task=task,
        value_scale=value_scale,
        waiting_minutes=waiting_minutes,
        due_at_iso=task["dueAtIso"],
        last_incoming_text=incoming["text"] if incoming else None,
    )

    next_best_action = (insight or {}).get("recommendedAction") or task.get("goal") or task["title"]
    summary = incoming["text"] if (has_incoming and incoming) else task["description"]

    return {
        "id": f"wi:{task['id']}",
        "kind": "communication" if has_incoming else "task",
        "clientId": client["id"],
        "taskId": task["id"],
        "conversationId": task.get("conversationId"),
        "title": task["title"],
        "summary": summary,
        "channel": task["channel"],
        "productCode": task.get("productCode"),
        "dueAtIso": task["dueAtIso"],
        "createdAtIso": task["createdAtIso"],
        "hasIncoming": has_incoming,
        "lastIncomingText": incoming["text"] if incoming else None,
        "priority": priority,
        "nextBestAction": next_best_action,
        "expectedImpact": IMPACT_BY_INTENT[task["intent"]],
        "recommendationId": f"rec:task:{task['id']}",
    }


def build_work_queue(manager_id: str) -> list[dict[str, Any]]:
    manager_clients = db.get_clients_by_manager(manager_id)
    value_scale = build_value_scale(manager_clients)

    items: list[dict[str, Any]] = []
    for client in manager_clients:
        for task in db.get_tasks_by_client(client["id"]):
            if task["status"] == "done":
                continue
            item = build_work_item(task, value_scale)
            if item:
                items.append(item)

    # По убыванию приоритета; при равенстве — раньше тот, кто дольше ждёт.
    items.sort(key=lambda i: (-i["priority"]["total"], parse_ms(i["createdAtIso"])))
    return items


def is_work_item_handled(item: dict[str, Any], manager_id: str) -> bool:
    """Кейс «обработан»: есть отправленный в рантайме ответ или решение менеджера.

    Отправленные в рантайме сообщения имеют id с префиксом 'rt-' (как во
    фронтенде sentMessages); сид-сообщения менеджера обработкой не считаются.
    Решение по рекомендации засчитывается любое (в т.ч. сид-обратная связь).
    """
    conv_id = item.get("conversationId")
    replied = bool(conv_id) and any(
        m["id"].startswith("rt-") for m in db.get_messages(conv_id)
    )
    decided = any(
        f["recommendationId"] == item["recommendationId"] and f["managerId"] == manager_id
        for f in db.get_feedback()
    )
    return replied or decided


def build_all_recommendations() -> list[dict[str, Any]]:
    """Все рекомендации обоих менеджеров — для панели руководителя (UC-07)."""
    refs: list[dict[str, Any]] = []
    for manager in db.get_managers():
        for item in build_work_queue(manager["id"]):
            refs.append(
                {
                    "recommendationId": item["recommendationId"],
                    "level": item["priority"]["level"],
                    "managerId": manager["id"],
                }
            )
    return refs
