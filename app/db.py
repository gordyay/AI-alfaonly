from __future__ import annotations

import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .models import (
    CRMNote,
    ChannelType,
    Client,
    Conversation,
    FeedbackRequest,
    FollowUp,
    Message,
    ProductHolding,
    RecommendationFeedback,
    Task,
    TaskStatus,
)


DEFAULT_DB_PATH = Path(__file__).resolve().parent / "data" / "stage1.sqlite3"


def utc_now() -> datetime:
    return datetime.now(UTC)


class SQLiteStorage:
    """Простое SQLite-хранилище для MVP Stage 1."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        raw_path = db_path or os.getenv("APP_DB_PATH") or DEFAULT_DB_PATH
        self.db_path = Path(raw_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS clients (
                    id TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    segment TEXT NOT NULL,
                    risk_profile TEXT NOT NULL,
                    manager_id TEXT NOT NULL,
                    age INTEGER NOT NULL,
                    city TEXT NOT NULL,
                    preferred_channel TEXT NOT NULL,
                    family_status TEXT NOT NULL,
                    occupation TEXT NOT NULL,
                    income_band TEXT NOT NULL,
                    portfolio_value REAL NOT NULL,
                    cash_balance REAL NOT NULL,
                    churn_risk TEXT NOT NULL,
                    last_contact_at TEXT,
                    next_contact_due_at TEXT,
                    notes_summary TEXT,
                    tags TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    margin_level TEXT NOT NULL,
                    currency TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS client_products (
                    client_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    balance REAL NOT NULL,
                    opened_at TEXT NOT NULL,
                    PRIMARY KEY (client_id, product_id)
                );

                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL,
                    due_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    channel TEXT NOT NULL,
                    priority_label TEXT NOT NULL,
                    task_type TEXT NOT NULL,
                    source_system TEXT NOT NULL,
                    product_code TEXT
                );

                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    channel TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    started_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    sender TEXT NOT NULL,
                    text TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS crm_notes (
                    id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    manager_id TEXT NOT NULL,
                    task_id TEXT,
                    note_text TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    channel TEXT,
                    follow_up_date TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS follow_ups (
                    id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    crm_note_id TEXT NOT NULL,
                    due_at TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS recommendation_feedback (
                    id TEXT PRIMARY KEY,
                    recommendation_id TEXT NOT NULL,
                    manager_id TEXT NOT NULL,
                    recommendation_type TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    comment TEXT,
                    created_at TEXT NOT NULL
                );
                """
            )
            connection.commit()

    def reset_all_data(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                DELETE FROM messages;
                DELETE FROM conversations;
                DELETE FROM tasks;
                DELETE FROM client_products;
                DELETE FROM products;
                DELETE FROM crm_notes;
                DELETE FROM follow_ups;
                DELETE FROM recommendation_feedback;
                DELETE FROM clients;
                """
            )
            connection.commit()

    def insert_clients(self, clients: list[tuple]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO clients (
                    id, full_name, segment, risk_profile, manager_id, age, city,
                    preferred_channel, family_status, occupation, income_band,
                    portfolio_value, cash_balance, churn_risk, last_contact_at,
                    next_contact_due_at, notes_summary, tags
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                clients,
            )
            connection.commit()

    def insert_products(self, products: list[tuple[str, str, str, str, str, str]]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO products (id, name, category, risk_level, margin_level, currency)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                products,
            )
            connection.commit()

    def insert_client_products(self, client_products: list[tuple]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO client_products (client_id, product_id, status, balance, opened_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                client_products,
            )
            connection.commit()

    def insert_tasks(self, tasks: list[tuple]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO tasks (
                    id, client_id, title, description, status, due_at, created_at,
                    channel, priority_label, task_type, source_system, product_code
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                tasks,
            )
            connection.commit()

    def insert_conversations(self, conversations: list[tuple[str, str, str, str, str]]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO conversations (id, client_id, channel, topic, started_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                conversations,
            )
            connection.commit()

    def insert_messages(self, messages: list[tuple[str, str, str, str, str]]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO messages (id, conversation_id, sender, text, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                messages,
            )
            connection.commit()

    def insert_crm_notes(self, crm_notes: list[tuple]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO crm_notes (
                    id, client_id, manager_id, task_id, note_text, outcome, channel, follow_up_date, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                crm_notes,
            )
            connection.commit()

    def insert_follow_ups(self, follow_ups: list[tuple]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO follow_ups (id, client_id, crm_note_id, due_at, reason, completed)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                follow_ups,
            )
            connection.commit()

    def insert_feedback(self, feedback_items: list[tuple]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO recommendation_feedback (
                    id, recommendation_id, manager_id, recommendation_type, decision, comment, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                feedback_items,
            )
            connection.commit()

    def list_tasks(self, manager_id: str | None = None, status: TaskStatus | None = None) -> list[Task]:
        query = [
            """
            SELECT tasks.*
            FROM tasks
            JOIN clients ON clients.id = tasks.client_id
            WHERE 1 = 1
            """
        ]
        params: list[str] = []

        if manager_id:
            query.append("AND clients.manager_id = ?")
            params.append(manager_id)

        if status:
            query.append("AND tasks.status = ?")
            params.append(status.value)

        query.append("ORDER BY tasks.due_at ASC")

        with self._connect() as connection:
            rows = connection.execute("\n".join(query), params).fetchall()

        return [self._map_task(row) for row in rows]

    def list_clients(self, manager_id: str | None = None) -> list[Client]:
        query = ["SELECT * FROM clients WHERE 1 = 1"]
        params: list[str] = []

        if manager_id:
            query.append("AND manager_id = ?")
            params.append(manager_id)

        query.append("ORDER BY full_name ASC")

        with self._connect() as connection:
            rows = connection.execute("\n".join(query), params).fetchall()

        return [self.get_client(row["id"]) for row in rows if self.get_client(row["id"]) is not None]

    def get_client(self, client_id: str) -> Client | None:
        with self._connect() as connection:
            client_row = connection.execute(
                """
                SELECT *
                FROM clients
                WHERE id = ?
                """,
                (client_id,),
            ).fetchone()
            if not client_row:
                return None

            product_rows = connection.execute(
                """
                SELECT cp.product_id, cp.status, cp.balance, cp.opened_at, p.name, p.category, p.risk_level, p.margin_level, p.currency
                FROM client_products cp
                JOIN products p ON p.id = cp.product_id
                WHERE cp.client_id = ?
                ORDER BY cp.opened_at DESC
                """,
                (client_id,),
            ).fetchall()

        return Client(
            id=client_row["id"],
            full_name=client_row["full_name"],
            segment=client_row["segment"],
            risk_profile=client_row["risk_profile"],
            manager_id=client_row["manager_id"],
            age=client_row["age"],
            city=client_row["city"],
            preferred_channel=client_row["preferred_channel"],
            family_status=client_row["family_status"],
            occupation=client_row["occupation"],
            income_band=client_row["income_band"],
            portfolio_value=client_row["portfolio_value"],
            cash_balance=client_row["cash_balance"],
            churn_risk=client_row["churn_risk"],
            last_contact_at=self._parse_datetime(client_row["last_contact_at"]),
            next_contact_due_at=self._parse_datetime(client_row["next_contact_due_at"]),
            notes_summary=client_row["notes_summary"],
            tags=client_row["tags"].split("|") if client_row["tags"] else [],
            products=[
                ProductHolding(
                    product_id=row["product_id"],
                    name=row["name"],
                    category=row["category"],
                    status=row["status"],
                    balance=row["balance"],
                    opened_at=datetime.fromisoformat(row["opened_at"]),
                    risk_level=row["risk_level"],
                    margin_level=row["margin_level"],
                    currency=row["currency"],
                )
                for row in product_rows
            ],
        )

    def list_client_tasks(self, client_id: str) -> list[Task]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM tasks WHERE client_id = ? ORDER BY due_at ASC",
                (client_id,),
            ).fetchall()

        return [self._map_task(row) for row in rows]

    def list_client_conversations(self, client_id: str) -> list[Conversation]:
        with self._connect() as connection:
            conversation_rows = connection.execute(
                "SELECT * FROM conversations WHERE client_id = ? ORDER BY started_at DESC",
                (client_id,),
            ).fetchall()
            conversation_ids = [row["id"] for row in conversation_rows]

            messages_by_conversation: dict[str, list[Message]] = {conversation_id: [] for conversation_id in conversation_ids}
            if conversation_ids:
                placeholders = ",".join("?" for _ in conversation_ids)
                message_rows = connection.execute(
                    f"""
                    SELECT * FROM messages
                    WHERE conversation_id IN ({placeholders})
                    ORDER BY created_at ASC
                    """,
                    conversation_ids,
                ).fetchall()
                for row in message_rows:
                    messages_by_conversation[row["conversation_id"]].append(self._map_message(row))

        return [
            Conversation(
                id=row["id"],
                client_id=row["client_id"],
                channel=ChannelType(row["channel"]),
                topic=row["topic"],
                started_at=datetime.fromisoformat(row["started_at"]),
                messages=messages_by_conversation.get(row["id"], []),
            )
            for row in conversation_rows
        ]

    def list_client_crm_notes(self, client_id: str) -> list[CRMNote]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM crm_notes WHERE client_id = ? ORDER BY created_at DESC",
                (client_id,),
            ).fetchall()

        return [self._map_crm_note(row) for row in rows]

    def list_client_follow_ups(self, client_id: str) -> list[FollowUp]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM follow_ups WHERE client_id = ? ORDER BY due_at ASC",
                (client_id,),
            ).fetchall()

        return [
            FollowUp(
                id=row["id"],
                client_id=row["client_id"],
                crm_note_id=row["crm_note_id"],
                due_at=datetime.fromisoformat(row["due_at"]),
                reason=row["reason"],
                completed=bool(row["completed"]),
            )
            for row in rows
        ]

    def create_crm_note(self, note: CRMNote) -> CRMNote:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO crm_notes (id, client_id, manager_id, task_id, note_text, outcome, channel, follow_up_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    note.id,
                    note.client_id,
                    note.manager_id,
                    note.task_id,
                    note.note_text,
                    note.outcome,
                    note.channel.value if note.channel else None,
                    note.follow_up_date.isoformat() if note.follow_up_date else None,
                    note.created_at.isoformat(),
                ),
            )

            if note.follow_up_date:
                follow_up = FollowUp(
                    id=str(uuid4()),
                    client_id=note.client_id,
                    crm_note_id=note.id,
                    due_at=note.follow_up_date,
                    reason=f"Follow-up по заметке {note.id}",
                )
                connection.execute(
                    """
                    INSERT INTO follow_ups (id, client_id, crm_note_id, due_at, reason, completed)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        follow_up.id,
                        follow_up.client_id,
                        follow_up.crm_note_id,
                        follow_up.due_at.isoformat(),
                        follow_up.reason,
                        int(follow_up.completed),
                    ),
                )

            connection.commit()

        return note

    def add_feedback(self, payload: FeedbackRequest) -> RecommendationFeedback:
        item = RecommendationFeedback(
            id=str(uuid4()),
            recommendation_id=payload.recommendation_id,
            manager_id=payload.manager_id,
            recommendation_type=payload.recommendation_type,
            decision=payload.decision,
            comment=payload.comment,
            created_at=utc_now(),
        )

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO recommendation_feedback (id, recommendation_id, manager_id, recommendation_type, decision, comment, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item.id,
                    item.recommendation_id,
                    item.manager_id,
                    item.recommendation_type,
                    item.decision.value,
                    item.comment,
                    item.created_at.isoformat(),
                ),
            )
            connection.commit()

        return item

    @staticmethod
    def _map_task(row: sqlite3.Row) -> Task:
        return Task(
            id=row["id"],
            client_id=row["client_id"],
            title=row["title"],
            description=row["description"],
            status=TaskStatus(row["status"]),
            due_at=datetime.fromisoformat(row["due_at"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            channel=ChannelType(row["channel"]),
            priority_label=row["priority_label"],
            task_type=row["task_type"],
            source_system=row["source_system"],
            product_code=row["product_code"],
        )

    @staticmethod
    def _map_message(row: sqlite3.Row) -> Message:
        return Message(
            id=row["id"],
            conversation_id=row["conversation_id"],
            sender=row["sender"],
            text=row["text"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    @staticmethod
    def _map_crm_note(row: sqlite3.Row) -> CRMNote:
        return CRMNote(
            id=row["id"],
            client_id=row["client_id"],
            manager_id=row["manager_id"],
            task_id=row["task_id"],
            note_text=row["note_text"],
            outcome=row["outcome"],
            channel=ChannelType(row["channel"]) if row["channel"] else None,
            follow_up_date=SQLiteStorage._parse_datetime(row["follow_up_date"]),
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    @staticmethod
    def _parse_datetime(value: str | None) -> datetime | None:
        if not value:
            return None
        return datetime.fromisoformat(value)
