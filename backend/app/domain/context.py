"""Сборка ограниченного контекста кейса для ИИ-функций (NFR4) и ранжирование
склонности (UC-02, FR7) — порт contextBuilders.ts + ai/context.ts.

AIContext представлен обычным dict (сущности — те же camelCase-словари, что и в
SQLite/фронтенде), чтобы порт ИИ-генераторов оставался близким к оригиналу.
"""

from __future__ import annotations

from typing import Any, Optional

from .. import db
from .propensity import compute_propensity


def client_signals(client_id: str) -> dict[str, Any]:
    """Агрегированные сигналы клиента из всех его диалогов (для склонности)."""
    convs = db.get_conversations_by_client(client_id)
    topics: list[str] = []
    product_codes: list[str] = []
    for conv in convs:
        insight = db.get_insight(conv["id"])
        if not insight:
            continue
        for t in insight.get("topics", []):
            if t not in topics:
                topics.append(t)
        for p in insight.get("productCodes", []):
            if p not in product_codes:
                product_codes.append(p)
    owned = [cp for cp in db.get_client_products(client_id) if cp["status"] == "active"]
    owned_product_ids = [cp["productId"] for cp in owned]
    owned_categories: list[str] = []
    for pid in owned_product_ids:
        product = db.get_product(pid)
        if product and product["category"] not in owned_categories:
            owned_categories.append(product["category"])
    return {
        "topics": topics,
        "productCodes": product_codes,
        "ownedProductIds": owned_product_ids,
        "ownedCategories": owned_categories,
    }


def _owned_product_views(client_id: str) -> list[dict[str, Any]]:
    owned = [cp for cp in db.get_client_products(client_id) if cp["status"] == "active"]
    views: list[dict[str, Any]] = []
    for cp in owned:
        product = db.get_product(cp["productId"])
        if product:
            views.append({"product": product, "balance": cp["balance"]})
    return views


def _resolve_relevant_products(product_codes: list[str], primary_code: Optional[str]) -> list[dict[str, Any]]:
    ordered: list[str] = []
    if primary_code:
        ordered.append(primary_code)
    for code in product_codes:
        if code not in ordered:
            ordered.append(code)
    result: list[dict[str, Any]] = []
    for code in ordered:
        product = db.get_product(code)
        if product:
            result.append(product)
    return result


def build_ai_context(item: dict[str, Any]) -> dict[str, Any]:
    """Полный контекст кейса для ИИ-функций (ограниченный контекст клиента, NFR4)."""
    client = db.get_client(item["clientId"])
    conversation = db.get_conversation(item["conversationId"]) if item.get("conversationId") else None
    messages = db.get_messages(item["conversationId"]) if item.get("conversationId") else []
    insight = db.get_insight(item["conversationId"]) if item.get("conversationId") else None
    task = db.get_task(item["taskId"]) if item.get("taskId") else None

    signals = client_signals(client["id"])
    relevant = _resolve_relevant_products(
        (insight.get("productCodes") if insight else None) or signals["productCodes"],
        item.get("productCode"),
    )

    return {
        "client": client,
        "conversation": conversation,
        "messages": messages,
        "insight": insight,
        "task": task,
        "relevantProducts": relevant,
        "ownedProducts": _owned_product_views(client["id"]),
        "nextBestAction": item["nextBestAction"],
    }


# --- Склонность к покупке (UC-02, FR7) --------------------------------------

def rank_clients_for_product(product_id: str, manager_id: str) -> list[dict[str, Any]]:
    product = db.get_product(product_id)
    if not product:
        return []
    ranked: list[dict[str, Any]] = []
    for client in db.get_clients_by_manager(manager_id):
        signals = client_signals(client["id"])
        score = compute_propensity(
            client,
            product,
            signals["ownedProductIds"],
            signals["ownedCategories"],
            signals["productCodes"],
            signals["topics"],
        )
        ranked.append({"client": client, "score": score})
    # Клиентов с приоритетом удержания опускаем вниз, не искажая саму оценку.
    ranked.sort(key=lambda r: (r["score"]["retentionFirst"], -r["score"]["total"]))
    return ranked


def score_client_products(client_id: str) -> list[dict[str, Any]]:
    client = db.get_client(client_id)
    if not client:
        return []
    signals = client_signals(client_id)
    scores = [
        compute_propensity(
            client,
            product,
            signals["ownedProductIds"],
            signals["ownedCategories"],
            signals["productCodes"],
            signals["topics"],
        )
        for product in db.get_products()
    ]
    scores.sort(key=lambda s: -s["total"])
    return scores


# --- Хелперы доступа к контексту (порт ai/context.ts) -----------------------

def last_incoming(ctx: dict[str, Any]) -> Optional[dict[str, Any]]:
    for m in reversed(ctx["messages"]):
        if m["sender"] == "client":
            return m
    return None


def has_pending_incoming(ctx: dict[str, Any]) -> bool:
    msgs = ctx["messages"]
    return bool(msgs) and msgs[-1]["sender"] == "client"


def first_name(ctx: dict[str, Any]) -> str:
    return ctx["client"]["fullName"].strip().split()[0]
