"""Тестовая база SQLite (отчёт §6.4.2, таблица 26): хранит сущности прототипа
и рантайм-результаты работы менеджера (отправленные сообщения, заметки,
обратная связь, история ассистента — FR8/FR9).

Сущности хранятся «как есть» (полезная нагрузка — JSON в том же camelCase, что и
во фронтенде) плюс несколько проиндексированных ключевых колонок для выборок.
Это соответствует составу данных источников банка (MDM/СХК/OCRM/DWH/EQ-АБС/VOC),
имитируемых тестовой базой.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any, Optional

from .config import DB_PATH, SEED_PATH

# Таблица -> проиндексированные колонки (имя_колонки, ключ_в_JSON).
_SCHEMA: dict[str, list[tuple[str, str]]] = {
    "managers": [("id", "id")],
    "products": [("id", "id")],
    "clients": [("id", "id"), ("manager_id", "managerId")],
    "client_products": [("client_id", "clientId"), ("product_id", "productId")],
    "conversations": [("id", "id"), ("client_id", "clientId")],
    "messages": [
        ("id", "id"),
        ("conversation_id", "conversationId"),
        ("sender", "sender"),
        ("sent_at", "sentAtIso"),
    ],
    "insights": [("conversation_id", "conversationId")],
    "tasks": [
        ("id", "id"),
        ("client_id", "clientId"),
        ("conversation_id", "conversationId"),
        ("status", "status"),
    ],
    "crm_notes": [("id", "id"), ("client_id", "clientId")],
    "follow_ups": [("id", "id"), ("client_id", "clientId")],
    "feedback": [
        ("id", "id"),
        ("recommendation_id", "recommendationId"),
        ("manager_id", "managerId"),
        ("client_id", "clientId"),
    ],
    # История диалогового ассистента по кейсу (FR9): workItemId -> turns(JSON).
    "assistant_chats": [("work_item_id", "workItemId")],
}

# Таблица -> ключ массива в seed.json (для первичного наполнения).
_SEED_KEY: dict[str, str] = {
    "managers": "managers",
    "products": "products",
    "clients": "clients",
    "client_products": "clientProducts",
    "conversations": "conversations",
    "messages": "messages",
    "insights": "insights",
    "tasks": "tasks",
    "crm_notes": "crmNotes",
    "follow_ups": "followUps",
    "feedback": "feedback",
}

_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None


def _connect() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
    return _conn


def _create_tables(conn: sqlite3.Connection) -> None:
    for table, cols in _SCHEMA.items():
        col_defs = ", ".join(f"{name} TEXT" for name, _ in cols)
        conn.execute(
            f"CREATE TABLE IF NOT EXISTS {table} "
            f"(pk INTEGER PRIMARY KEY AUTOINCREMENT, {col_defs}, payload TEXT NOT NULL)"
        )
        for name, _ in cols:
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_{name} ON {table}({name})")


def _insert(conn: sqlite3.Connection, table: str, row: dict[str, Any]) -> None:
    cols = _SCHEMA[table]
    names = [name for name, _ in cols] + ["payload"]
    values = [row.get(json_key) for _, json_key in cols] + [json.dumps(row, ensure_ascii=False)]
    placeholders = ", ".join("?" for _ in names)
    conn.execute(f"INSERT INTO {table} ({', '.join(names)}) VALUES ({placeholders})", values)


def init_db(force_reseed: bool = False) -> None:
    """Создаёт таблицы и при необходимости наполняет их из seed.json."""
    with _lock:
        conn = _connect()
        _create_tables(conn)
        if force_reseed:
            # Рантайм-таблица истории ассистента не входит в seed — чистим явно.
            conn.execute("DELETE FROM assistant_chats")
        with open(SEED_PATH, encoding="utf-8") as f:
            seed = json.load(f)
        for table, seed_key in _SEED_KEY.items():
            count = conn.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()["c"]
            if force_reseed:
                conn.execute(f"DELETE FROM {table}")
                count = 0
            if count == 0:
                for row in seed.get(seed_key, []):
                    _insert(conn, table, row)
        conn.commit()


# --- Чтение -----------------------------------------------------------------

def _rows(table: str, where: str = "", params: tuple = (), order: str = "") -> list[dict[str, Any]]:
    conn = _connect()
    sql = f"SELECT payload FROM {table}"
    if where:
        sql += f" WHERE {where}"
    if order:
        sql += f" ORDER BY {order}"
    # Единое соединение SQLite используется из пула потоков FastAPI — сериализуем
    # доступ к курсору (и чтения, и записи), иначе параллельные запросы фронтенда
    # (очередь + справочники одновременно) гонятся за состоянием курсора.
    with _lock:
        rows = conn.execute(sql, params).fetchall()
    return [json.loads(r["payload"]) for r in rows]


def _one(table: str, where: str, params: tuple) -> Optional[dict[str, Any]]:
    rows = _rows(table, where, params)
    return rows[0] if rows else None


def get_managers() -> list[dict[str, Any]]:
    return _rows("managers")


def get_manager(manager_id: str) -> Optional[dict[str, Any]]:
    return _one("managers", "id = ?", (manager_id,))


def get_products() -> list[dict[str, Any]]:
    return _rows("products")


def get_product(product_id: str) -> Optional[dict[str, Any]]:
    return _one("products", "id = ?", (product_id,))


def get_clients() -> list[dict[str, Any]]:
    return _rows("clients")


def get_clients_by_manager(manager_id: str) -> list[dict[str, Any]]:
    return _rows("clients", "manager_id = ?", (manager_id,))


def get_client(client_id: str) -> Optional[dict[str, Any]]:
    return _one("clients", "id = ?", (client_id,))


def get_client_products(client_id: str) -> list[dict[str, Any]]:
    return _rows("client_products", "client_id = ?", (client_id,))


def get_conversations_by_client(client_id: str) -> list[dict[str, Any]]:
    return _rows("conversations", "client_id = ?", (client_id,))


def get_conversation(conversation_id: str) -> Optional[dict[str, Any]]:
    return _one("conversations", "id = ?", (conversation_id,))


def get_messages(conversation_id: str) -> list[dict[str, Any]]:
    # Хронологический порядок (как messagesByConversation во фронтенде).
    return _rows("messages", "conversation_id = ?", (conversation_id,), order="sent_at ASC, pk ASC")


def get_insight(conversation_id: str) -> Optional[dict[str, Any]]:
    return _one("insights", "conversation_id = ?", (conversation_id,))


def get_tasks_by_client(client_id: str) -> list[dict[str, Any]]:
    return _rows("tasks", "client_id = ?", (client_id,))


def get_task(task_id: str) -> Optional[dict[str, Any]]:
    return _one("tasks", "id = ?", (task_id,))


def get_crm_notes_by_client(client_id: str) -> list[dict[str, Any]]:
    return _rows("crm_notes", "client_id = ?", (client_id,))


def get_feedback() -> list[dict[str, Any]]:
    return _rows("feedback")


def get_chat(work_item_id: str) -> list[dict[str, Any]]:
    row = _one("assistant_chats", "work_item_id = ?", (work_item_id,))
    return row["turns"] if row else []


# --- Запись (рантайм-результаты работы менеджера) ---------------------------

def add_message(message: dict[str, Any]) -> None:
    with _lock:
        conn = _connect()
        _insert(conn, "messages", message)
        conn.commit()


def add_crm_note(note: dict[str, Any]) -> None:
    with _lock:
        conn = _connect()
        _insert(conn, "crm_notes", note)
        conn.commit()


def add_feedback(event: dict[str, Any]) -> None:
    with _lock:
        conn = _connect()
        _insert(conn, "feedback", event)
        conn.commit()


def set_chat(work_item_id: str, turns: list[dict[str, Any]]) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM assistant_chats WHERE work_item_id = ?", (work_item_id,))
        _insert(conn, "assistant_chats", {"workItemId": work_item_id, "turns": turns})
        conn.commit()


def counts() -> dict[str, int]:
    conn = _connect()
    with _lock:
        return {t: conn.execute(f"SELECT COUNT(*) AS c FROM {t}").fetchone()["c"] for t in _SCHEMA}
