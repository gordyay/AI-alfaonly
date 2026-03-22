from __future__ import annotations

import json
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .models import (
    AISummaryDraft,
    ActivityLogEntry,
    AssistantKBSnapshot,
    AssistantMessageActionPayload,
    AssistantMessageRecord,
    AssistantMessageRole,
    AssistantSnapshotType,
    AssistantThread,
    AssistantCitation,
    CRMDraftRevision,
    CRMNote,
    CRMNoteType,
    ChannelType,
    Client,
    Conversation,
    ConversationInsights,
    FeedbackDecision,
    FeedbackRequest,
    FollowUp,
    Message,
    Product,
    ProductHolding,
    ScriptGenerationRecord,
    SalesScriptDraft,
    ObjectionWorkflowDraft,
    ObjectionWorkflowRecord,
    RecommendationStatus,
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
        connection.execute("PRAGMA foreign_keys = ON")
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
                    ai_summary_text TEXT,
                    ai_summary_generated_at TEXT,
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
                    business_goal TEXT,
                    source_system TEXT NOT NULL,
                    linked_conversation_id TEXT,
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

                CREATE TABLE IF NOT EXISTS conversation_insights (
                    conversation_id TEXT PRIMARY KEY,
                    tone_label TEXT,
                    urgency_label TEXT,
                    responsiveness_pattern TEXT,
                    client_response_avg_minutes INTEGER,
                    manager_response_avg_minutes INTEGER,
                    next_contact_due_at TEXT,
                    next_contact_reason TEXT,
                    preferred_follow_up_channel TEXT,
                    preferred_follow_up_format TEXT,
                    interest_tags TEXT NOT NULL DEFAULT '',
                    objection_tags TEXT NOT NULL DEFAULT '',
                    mentioned_product_codes TEXT NOT NULL DEFAULT '',
                    action_hints TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS crm_notes (
                    id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    manager_id TEXT NOT NULL,
                    task_id TEXT,
                    recommendation_id TEXT,
                    recommendation_decision TEXT,
                    decision_comment TEXT,
                    note_text TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    channel TEXT,
                    follow_up_date TEXT,
                    summary_text TEXT,
                    source_conversation_id TEXT,
                    ai_generated INTEGER NOT NULL DEFAULT 0,
                    ai_draft_payload_json TEXT,
                    follow_up_reason TEXT,
                    note_type TEXT NOT NULL DEFAULT 'crm_summary',
                    outbound_message_text TEXT,
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
                    client_id TEXT,
                    conversation_id TEXT,
                    decision TEXT NOT NULL,
                    comment TEXT,
                    selected_variant TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS recommendation_log (
                    id TEXT PRIMARY KEY,
                    recommendation_type TEXT NOT NULL,
                    client_id TEXT NOT NULL,
                    recommendation_id TEXT,
                    conversation_id TEXT,
                    manager_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    decision TEXT,
                    payload_excerpt TEXT,
                    context_snapshot TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS script_generations (
                    id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    manager_id TEXT NOT NULL,
                    recommendation_id TEXT,
                    conversation_id TEXT,
                    contact_goal TEXT,
                    selected_variant_label TEXT,
                    selected_text TEXT,
                    draft_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    selected_at TEXT
                );

                CREATE TABLE IF NOT EXISTS objection_workflows (
                    id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    manager_id TEXT NOT NULL,
                    recommendation_id TEXT,
                    conversation_id TEXT,
                    selected_option_title TEXT,
                    selected_response TEXT,
                    draft_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    selected_at TEXT
                );

                CREATE TABLE IF NOT EXISTS crm_draft_revisions (
                    id TEXT PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    manager_id TEXT NOT NULL,
                    recommendation_id TEXT,
                    conversation_id TEXT,
                    stage TEXT NOT NULL,
                    changed_fields_json TEXT NOT NULL DEFAULT '[]',
                    draft_json TEXT NOT NULL,
                    final_note_text TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS assistant_threads (
                    id TEXT PRIMARY KEY,
                    manager_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    last_selected_client_id TEXT,
                    memory_summary TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS assistant_messages (
                    id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    citations_json TEXT NOT NULL DEFAULT '[]',
                    used_context_json TEXT NOT NULL DEFAULT '[]',
                    action_payload_json TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS assistant_kb_snapshots (
                    id TEXT PRIMARY KEY,
                    manager_id TEXT NOT NULL,
                    client_id TEXT,
                    snapshot_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content_text TEXT NOT NULL,
                    source_updated_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_clients_manager_id ON clients(manager_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_client_due_at ON tasks(client_id, due_at);
                CREATE INDEX IF NOT EXISTS idx_conversations_client_started_at ON conversations(client_id, started_at DESC);
                CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at ASC);
                CREATE INDEX IF NOT EXISTS idx_crm_notes_client_created_at ON crm_notes(client_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_feedback_manager_recommendation ON recommendation_feedback(manager_id, recommendation_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_recommendation_log_client_created_at ON recommendation_log(client_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_script_generations_client_created_at ON script_generations(client_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_objection_workflows_client_created_at ON objection_workflows(client_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_crm_draft_revisions_client_created_at ON crm_draft_revisions(client_id, created_at DESC);
                """
            )
            self._ensure_table_column(connection, "crm_notes", "summary_text", "TEXT")
            self._ensure_table_column(connection, "crm_notes", "source_conversation_id", "TEXT")
            self._ensure_table_column(connection, "crm_notes", "ai_generated", "INTEGER NOT NULL DEFAULT 0")
            self._ensure_table_column(connection, "crm_notes", "ai_draft_payload_json", "TEXT")
            self._ensure_table_column(connection, "crm_notes", "recommendation_id", "TEXT")
            self._ensure_table_column(connection, "crm_notes", "recommendation_decision", "TEXT")
            self._ensure_table_column(connection, "crm_notes", "decision_comment", "TEXT")
            self._ensure_table_column(connection, "crm_notes", "follow_up_reason", "TEXT")
            self._ensure_table_column(connection, "crm_notes", "note_type", "TEXT NOT NULL DEFAULT 'crm_summary'")
            self._ensure_table_column(connection, "crm_notes", "outbound_message_text", "TEXT")
            self._ensure_table_column(connection, "clients", "ai_summary_text", "TEXT")
            self._ensure_table_column(connection, "clients", "ai_summary_generated_at", "TEXT")
            self._ensure_table_column(connection, "tasks", "business_goal", "TEXT")
            self._ensure_table_column(connection, "tasks", "linked_conversation_id", "TEXT")
            self._ensure_table_column(connection, "assistant_messages", "action_payload_json", "TEXT")
            self._ensure_table_column(connection, "recommendation_feedback", "client_id", "TEXT")
            self._ensure_table_column(connection, "recommendation_feedback", "conversation_id", "TEXT")
            self._ensure_table_column(connection, "recommendation_feedback", "selected_variant", "TEXT")
            self._ensure_table_column(connection, "recommendation_log", "recommendation_id", "TEXT")
            self._ensure_table_column(connection, "recommendation_log", "decision", "TEXT")
            self._ensure_table_column(connection, "recommendation_log", "context_snapshot", "TEXT")
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_feedback_manager_client ON recommendation_feedback(manager_id, client_id, created_at DESC)"
            )
            connection.commit()

    def reset_all_data(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                DELETE FROM messages;
                DELETE FROM conversations;
                DELETE FROM conversation_insights;
                DELETE FROM tasks;
                DELETE FROM client_products;
                DELETE FROM products;
                DELETE FROM crm_notes;
                DELETE FROM follow_ups;
                DELETE FROM recommendation_feedback;
                DELETE FROM recommendation_log;
                DELETE FROM script_generations;
                DELETE FROM objection_workflows;
                DELETE FROM crm_draft_revisions;
                DELETE FROM assistant_messages;
                DELETE FROM assistant_threads;
                DELETE FROM assistant_kb_snapshots;
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
                    next_contact_due_at, notes_summary, ai_summary_text, ai_summary_generated_at, tags
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    def list_products(self) -> list[Product]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM products
                ORDER BY name ASC
                """
            ).fetchall()

        return [
            Product(
                id=row["id"],
                name=row["name"],
                category=row["category"],
                risk_level=row["risk_level"],
                margin_level=row["margin_level"],
                currency=row["currency"],
            )
            for row in rows
        ]

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
                    channel, priority_label, task_type, business_goal, source_system, linked_conversation_id, product_code
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    def create_message(self, message: Message) -> Message:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO messages (id, conversation_id, sender, text, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    message.id,
                    message.conversation_id,
                    message.sender,
                    message.text,
                    message.created_at.isoformat(),
                ),
            )
            connection.commit()
        return message

    def insert_conversation_insights(self, insights: list[tuple]) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO conversation_insights (
                    conversation_id, tone_label, urgency_label, responsiveness_pattern,
                    client_response_avg_minutes, manager_response_avg_minutes,
                    next_contact_due_at, next_contact_reason, preferred_follow_up_channel,
                    preferred_follow_up_format, interest_tags, objection_tags,
                    mentioned_product_codes, action_hints
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                insights,
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
        normalized_items = []
        for item in feedback_items:
            if len(item) == 7:
                normalized_items.append((*item[:4], None, None, item[4], item[5], None, item[6]))
            elif len(item) == 10:
                normalized_items.append(item)
            else:
                raise ValueError("Unexpected feedback tuple length")
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO recommendation_feedback (
                    id, recommendation_id, manager_id, recommendation_type, client_id, conversation_id, decision, comment, selected_variant, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                normalized_items,
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
            product_rows = self._load_client_product_rows(connection, [row["id"] for row in rows])

        products_by_client = self._group_client_product_rows(product_rows)
        return [self._map_client_row(row, products_by_client.get(row["id"], [])) for row in rows]

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

            product_rows = self._load_client_product_rows(connection, [client_id])

        return self._map_client_row(client_row, product_rows)

    def list_latest_conversations(self, client_ids: list[str]) -> dict[str, Conversation | None]:
        if not client_ids:
            return {}

        with self._connect() as connection:
            placeholders = ",".join("?" for _ in client_ids)
            conversation_rows = connection.execute(
                f"""
                SELECT *
                FROM conversations
                WHERE client_id IN ({placeholders})
                ORDER BY client_id ASC, started_at DESC
                """,
                client_ids,
            ).fetchall()
            latest_rows_by_client: dict[str, sqlite3.Row] = {}
            for row in conversation_rows:
                latest_rows_by_client.setdefault(row["client_id"], row)

            selected_rows = list(latest_rows_by_client.values())
            conversation_ids = [row["id"] for row in selected_rows]
            messages_by_conversation: dict[str, list[Message]] = {conversation_id: [] for conversation_id in conversation_ids}
            insights_by_conversation: dict[str, ConversationInsights | None] = {
                conversation_id: None for conversation_id in conversation_ids
            }

            if conversation_ids:
                message_placeholders = ",".join("?" for _ in conversation_ids)
                message_rows = connection.execute(
                    f"""
                    SELECT *
                    FROM messages
                    WHERE conversation_id IN ({message_placeholders})
                    ORDER BY created_at ASC
                    """,
                    conversation_ids,
                ).fetchall()
                for row in message_rows:
                    messages_by_conversation[row["conversation_id"]].append(self._map_message(row))

                insight_rows = connection.execute(
                    f"""
                    SELECT *
                    FROM conversation_insights
                    WHERE conversation_id IN ({message_placeholders})
                    """,
                    conversation_ids,
                ).fetchall()
                for row in insight_rows:
                    insights_by_conversation[row["conversation_id"]] = self._map_conversation_insights(row)

        conversations_by_client: dict[str, Conversation | None] = {client_id: None for client_id in client_ids}
        for client_id, row in latest_rows_by_client.items():
            conversations_by_client[client_id] = Conversation(
                id=row["id"],
                client_id=row["client_id"],
                channel=ChannelType(row["channel"]),
                topic=row["topic"],
                started_at=datetime.fromisoformat(row["started_at"]),
                messages=messages_by_conversation.get(row["id"], []),
                insights=insights_by_conversation.get(row["id"]),
            )
        return conversations_by_client

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
            insights_by_conversation: dict[str, ConversationInsights | None] = {conversation_id: None for conversation_id in conversation_ids}
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

                insight_rows = connection.execute(
                    f"""
                    SELECT * FROM conversation_insights
                    WHERE conversation_id IN ({placeholders})
                    """,
                    conversation_ids,
                ).fetchall()
                for row in insight_rows:
                    insights_by_conversation[row["conversation_id"]] = self._map_conversation_insights(row)

        return [
            Conversation(
                id=row["id"],
                client_id=row["client_id"],
                channel=ChannelType(row["channel"]),
                topic=row["topic"],
                started_at=datetime.fromisoformat(row["started_at"]),
                messages=messages_by_conversation.get(row["id"], []),
                insights=insights_by_conversation.get(row["id"]),
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

    def list_manager_crm_notes(self, manager_id: str) -> list[CRMNote]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM crm_notes WHERE manager_id = ? ORDER BY created_at DESC",
                (manager_id,),
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
                INSERT INTO crm_notes (
                    id, client_id, manager_id, task_id, recommendation_id, recommendation_decision, decision_comment, note_text, outcome, channel,
                    follow_up_date, summary_text, source_conversation_id, ai_generated, ai_draft_payload_json, follow_up_reason,
                    note_type, outbound_message_text, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    note.id,
                    note.client_id,
                    note.manager_id,
                    note.task_id,
                    note.recommendation_id,
                    note.recommendation_decision.value if note.recommendation_decision else None,
                    note.decision_comment,
                    note.note_text,
                    note.outcome,
                    note.channel.value if note.channel else None,
                    note.follow_up_date.isoformat() if note.follow_up_date else None,
                    note.summary_text,
                    note.source_conversation_id,
                    int(note.ai_generated),
                    note.ai_draft_payload.model_dump_json() if note.ai_draft_payload else None,
                    note.follow_up_reason,
                    note.note_type.value,
                    note.outbound_message_text,
                    note.created_at.isoformat(),
                ),
            )

            if note.follow_up_date:
                follow_up = FollowUp(
                    id=str(uuid4()),
                    client_id=note.client_id,
                    crm_note_id=note.id,
                    due_at=note.follow_up_date,
                    reason=f"Следующий контакт по заметке {note.id}",
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
                        note.follow_up_reason or follow_up.reason,
                        int(follow_up.completed),
                    ),
                )

            connection.commit()

        return note

    def add_crm_draft_revision(self, revision: CRMDraftRevision) -> CRMDraftRevision:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO crm_draft_revisions (
                    id, client_id, manager_id, recommendation_id, conversation_id, stage, changed_fields_json, draft_json, final_note_text, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    revision.id,
                    revision.client_id,
                    revision.manager_id,
                    revision.recommendation_id,
                    revision.conversation_id,
                    revision.stage,
                    json.dumps(revision.changed_fields, ensure_ascii=False),
                    revision.draft.model_dump_json(),
                    revision.final_note_text,
                    revision.created_at.isoformat(),
                ),
            )
            connection.commit()
        return revision

    def list_crm_draft_revisions(
        self,
        *,
        client_id: str,
        recommendation_id: str | None = None,
        conversation_id: str | None = None,
    ) -> list[CRMDraftRevision]:
        query = ["SELECT * FROM crm_draft_revisions WHERE client_id = ?"]
        params: list[str] = [client_id]
        if recommendation_id is not None and conversation_id is not None:
            query.append("AND (recommendation_id = ? OR conversation_id = ?)")
            params.extend([recommendation_id, conversation_id])
        elif recommendation_id is not None:
            query.append("AND recommendation_id = ?")
            params.append(recommendation_id)
        elif conversation_id is not None:
            query.append("AND conversation_id = ?")
            params.append(conversation_id)
        query.append("ORDER BY created_at DESC")
        with self._connect() as connection:
            rows = connection.execute("\n".join(query), params).fetchall()
        return [self._map_crm_draft_revision(row) for row in rows]

    def add_script_generation(self, record: ScriptGenerationRecord) -> ScriptGenerationRecord:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO script_generations (
                    id, client_id, manager_id, recommendation_id, conversation_id, contact_goal, selected_variant_label, selected_text, draft_json, created_at, selected_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.client_id,
                    record.manager_id,
                    record.recommendation_id,
                    record.conversation_id,
                    record.contact_goal,
                    record.selected_variant_label,
                    record.selected_text,
                    record.draft.model_dump_json(),
                    record.created_at.isoformat(),
                    record.selected_at.isoformat() if record.selected_at else None,
                ),
            )
            connection.commit()
        return record

    def list_script_generations(
        self,
        *,
        client_id: str,
        recommendation_id: str | None = None,
        conversation_id: str | None = None,
    ) -> list[ScriptGenerationRecord]:
        query = ["SELECT * FROM script_generations WHERE client_id = ?"]
        params: list[str] = [client_id]
        if recommendation_id is not None and conversation_id is not None:
            query.append("AND (recommendation_id = ? OR conversation_id = ?)")
            params.extend([recommendation_id, conversation_id])
        elif recommendation_id is not None:
            query.append("AND recommendation_id = ?")
            params.append(recommendation_id)
        elif conversation_id is not None:
            query.append("AND conversation_id = ?")
            params.append(conversation_id)
        query.append("ORDER BY created_at DESC")
        with self._connect() as connection:
            rows = connection.execute("\n".join(query), params).fetchall()
        return [self._map_script_generation(row) for row in rows]

    def get_script_generation(self, artifact_id: str) -> ScriptGenerationRecord | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM script_generations WHERE id = ?", (artifact_id,)).fetchone()
        return self._map_script_generation(row) if row else None

    def update_script_selection(
        self,
        *,
        artifact_id: str,
        variant_label: str,
        selected_text: str | None,
    ) -> ScriptGenerationRecord | None:
        with self._connect() as connection:
            row = connection.execute("SELECT id FROM script_generations WHERE id = ?", (artifact_id,)).fetchone()
            if row is None:
                return None
            selected_at = utc_now()
            connection.execute(
                """
                UPDATE script_generations
                SET selected_variant_label = ?, selected_text = ?, selected_at = ?
                WHERE id = ?
                """,
                (variant_label, selected_text, selected_at.isoformat(), artifact_id),
            )
            connection.commit()
        return self.get_script_generation(artifact_id)

    def add_objection_workflow(self, record: ObjectionWorkflowRecord) -> ObjectionWorkflowRecord:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO objection_workflows (
                    id, client_id, manager_id, recommendation_id, conversation_id, selected_option_title, selected_response, draft_json, created_at, selected_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.client_id,
                    record.manager_id,
                    record.recommendation_id,
                    record.conversation_id,
                    record.selected_option_title,
                    record.selected_response,
                    record.draft.model_dump_json(),
                    record.created_at.isoformat(),
                    record.selected_at.isoformat() if record.selected_at else None,
                ),
            )
            connection.commit()
        return record

    def list_objection_workflows(
        self,
        *,
        client_id: str,
        recommendation_id: str | None = None,
        conversation_id: str | None = None,
    ) -> list[ObjectionWorkflowRecord]:
        query = ["SELECT * FROM objection_workflows WHERE client_id = ?"]
        params: list[str] = [client_id]
        if recommendation_id is not None and conversation_id is not None:
            query.append("AND (recommendation_id = ? OR conversation_id = ?)")
            params.extend([recommendation_id, conversation_id])
        elif recommendation_id is not None:
            query.append("AND recommendation_id = ?")
            params.append(recommendation_id)
        elif conversation_id is not None:
            query.append("AND conversation_id = ?")
            params.append(conversation_id)
        query.append("ORDER BY created_at DESC")
        with self._connect() as connection:
            rows = connection.execute("\n".join(query), params).fetchall()
        return [self._map_objection_workflow(row) for row in rows]

    def get_objection_workflow(self, artifact_id: str) -> ObjectionWorkflowRecord | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM objection_workflows WHERE id = ?", (artifact_id,)).fetchone()
        return self._map_objection_workflow(row) if row else None

    def update_objection_selection(
        self,
        *,
        artifact_id: str,
        option_title: str,
        selected_response: str | None,
    ) -> ObjectionWorkflowRecord | None:
        with self._connect() as connection:
            row = connection.execute("SELECT id FROM objection_workflows WHERE id = ?", (artifact_id,)).fetchone()
            if row is None:
                return None
            selected_at = utc_now()
            connection.execute(
                """
                UPDATE objection_workflows
                SET selected_option_title = ?, selected_response = ?, selected_at = ?
                WHERE id = ?
                """,
                (option_title, selected_response, selected_at.isoformat(), artifact_id),
            )
            connection.commit()
        return self.get_objection_workflow(artifact_id)

    def update_client_ai_summary(self, client_id: str, summary_text: str, generated_at: datetime | None = None) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE clients
                SET ai_summary_text = ?, ai_summary_generated_at = ?
                WHERE id = ?
                """,
                (
                    summary_text,
                    (generated_at or utc_now()).isoformat(),
                    client_id,
                ),
            )
            connection.commit()

    def add_feedback(self, payload: FeedbackRequest) -> tuple[RecommendationFeedback, bool]:
        latest = self._get_latest_feedback(
            manager_id=payload.manager_id,
            recommendation_id=payload.recommendation_id,
        )
        if latest and self._feedback_payload_matches(latest, payload):
            return latest, False

        item = RecommendationFeedback(
            id=str(uuid4()),
            recommendation_id=payload.recommendation_id,
            manager_id=payload.manager_id,
            recommendation_type=payload.recommendation_type,
            client_id=payload.client_id,
            conversation_id=payload.conversation_id,
            case_id=payload.case_id,
            source_interaction_id=payload.source_interaction_id or payload.conversation_id,
            decision=payload.decision,
            comment=payload.comment,
            selected_variant=payload.selected_variant,
            created_at=utc_now(),
        )

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO recommendation_feedback (
                    id, recommendation_id, manager_id, recommendation_type, client_id, conversation_id, decision, comment, selected_variant, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item.id,
                    item.recommendation_id,
                    item.manager_id,
                    item.recommendation_type,
                    item.client_id,
                    item.conversation_id,
                    item.decision.value,
                    item.comment,
                    item.selected_variant,
                    item.created_at.isoformat(),
                ),
            )
            connection.commit()

        return item, True

    def list_feedback(
        self,
        *,
        manager_id: str | None = None,
        client_id: str | None = None,
        recommendation_id: str | None = None,
        limit: int | None = None,
    ) -> list[RecommendationFeedback]:
        query = [
            """
            SELECT *
            FROM recommendation_feedback
            WHERE 1 = 1
            """
        ]
        params: list[str | int] = []

        if manager_id is not None:
            query.append("AND manager_id = ?")
            params.append(manager_id)

        if client_id is not None:
            query.append("AND client_id = ?")
            params.append(client_id)

        if recommendation_id is not None:
            query.append("AND recommendation_id = ?")
            params.append(recommendation_id)

        query.append("ORDER BY created_at DESC")
        if limit is not None:
            query.append("LIMIT ?")
            params.append(limit)

        with self._connect() as connection:
            rows = connection.execute("\n".join(query), params).fetchall()

        return [self._map_feedback(row) for row in rows]

    def get_recommendation_status_map(
        self,
        *,
        manager_id: str,
        recommendation_ids: list[str],
    ) -> dict[str, RecommendationStatus]:
        if not recommendation_ids:
            return {}

        feedback_items = self.list_feedback(manager_id=manager_id)
        status_map: dict[str, RecommendationStatus] = {}
        allowed_ids = set(recommendation_ids)
        for item in feedback_items:
            if item.recommendation_id not in allowed_ids or item.recommendation_id in status_map:
                continue
            status_map[item.recommendation_id] = RecommendationStatus(item.decision)
        return status_map

    def add_activity_log(self, entry: ActivityLogEntry) -> ActivityLogEntry:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO recommendation_log (
                    id, recommendation_type, client_id, recommendation_id, conversation_id, manager_id, action, decision, payload_excerpt, context_snapshot, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry.id,
                    entry.recommendation_type,
                    entry.client_id,
                    entry.recommendation_id,
                    entry.conversation_id,
                    entry.manager_id,
                    entry.action,
                    entry.decision,
                    entry.payload_excerpt,
                    entry.context_snapshot,
                    entry.created_at.isoformat(),
                ),
            )
            connection.commit()

        return entry

    def list_client_activity_logs(self, client_id: str) -> list[ActivityLogEntry]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM recommendation_log
                WHERE client_id = ?
                ORDER BY created_at DESC
                """,
                (client_id,),
            ).fetchall()

        return [
            self._map_activity_log(row)
            for row in rows
        ]

    def list_manager_activity_logs(self, manager_id: str) -> list[ActivityLogEntry]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM recommendation_log
                WHERE manager_id = ?
                ORDER BY created_at DESC
                """,
                (manager_id,),
            ).fetchall()

        return [self._map_activity_log(row) for row in rows]

    def create_assistant_thread(self, thread: AssistantThread) -> AssistantThread:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO assistant_threads (
                    id, manager_id, title, last_selected_client_id, memory_summary, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    thread.id,
                    thread.manager_id,
                    thread.title,
                    thread.last_selected_client_id,
                    thread.memory_summary,
                    thread.created_at.isoformat(),
                    thread.updated_at.isoformat(),
                ),
            )
            connection.commit()

        return thread

    def list_assistant_threads(self, manager_id: str) -> list[AssistantThread]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT assistant_threads.*
                FROM assistant_threads
                WHERE manager_id = ?
                  AND EXISTS (
                    SELECT 1
                    FROM assistant_messages
                    WHERE assistant_messages.thread_id = assistant_threads.id
                  )
                ORDER BY updated_at DESC
                """,
                (manager_id,),
            ).fetchall()

        return [self._map_assistant_thread(row) for row in rows]

    def get_assistant_thread(self, thread_id: str) -> AssistantThread | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM assistant_threads
                WHERE id = ?
                """,
                (thread_id,),
            ).fetchone()

        return self._map_assistant_thread(row) if row else None

    def update_assistant_thread(
        self,
        thread_id: str,
        *,
        title: str | None = None,
        last_selected_client_id: str | None = None,
        memory_summary: str | None = None,
        updated_at: datetime | None = None,
    ) -> None:
        current = self.get_assistant_thread(thread_id)
        if current is None:
            return

        with self._connect() as connection:
            connection.execute(
                """
                UPDATE assistant_threads
                SET title = ?, last_selected_client_id = ?, memory_summary = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    title if title is not None else current.title,
                    last_selected_client_id if last_selected_client_id is not None else current.last_selected_client_id,
                    memory_summary if memory_summary is not None else current.memory_summary,
                    (updated_at or utc_now()).isoformat(),
                    thread_id,
                ),
            )
            connection.commit()

    def add_assistant_message(self, message: AssistantMessageRecord) -> AssistantMessageRecord:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO assistant_messages (
                    id, thread_id, role, content, citations_json, used_context_json, action_payload_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message.id,
                    message.thread_id,
                    message.role.value,
                    message.content,
                    json.dumps([item.model_dump(mode="json") for item in message.citations], ensure_ascii=False),
                    json.dumps([item.model_dump(mode="json") for item in message.used_context], ensure_ascii=False),
                    json.dumps(message.action_payload.model_dump(mode="json"), ensure_ascii=False)
                    if message.action_payload is not None
                    else None,
                    message.created_at.isoformat(),
                ),
            )
            connection.execute(
                """
                UPDATE assistant_threads
                SET updated_at = ?
                WHERE id = ?
                """,
                ((message.created_at or utc_now()).isoformat(), message.thread_id),
            )
            connection.commit()

        return message

    def list_assistant_messages(self, thread_id: str) -> list[AssistantMessageRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM assistant_messages
                WHERE thread_id = ?
                ORDER BY created_at ASC
                """,
                (thread_id,),
            ).fetchall()

        return [self._map_assistant_message(row) for row in rows]

    def count_assistant_messages(self, thread_id: str) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT COUNT(*) AS count FROM assistant_messages WHERE thread_id = ?",
                (thread_id,),
            ).fetchone()
        return int(row["count"]) if row else 0

    def upsert_assistant_snapshot(self, snapshot: AssistantKBSnapshot) -> AssistantKBSnapshot:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO assistant_kb_snapshots (
                    id, manager_id, client_id, snapshot_type, title, content_text, source_updated_at, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    manager_id = excluded.manager_id,
                    client_id = excluded.client_id,
                    snapshot_type = excluded.snapshot_type,
                    title = excluded.title,
                    content_text = excluded.content_text,
                    source_updated_at = excluded.source_updated_at,
                    updated_at = excluded.updated_at
                """,
                (
                    snapshot.id,
                    snapshot.manager_id,
                    snapshot.client_id,
                    snapshot.snapshot_type.value,
                    snapshot.title,
                    snapshot.content_text,
                    snapshot.source_updated_at.isoformat() if snapshot.source_updated_at else None,
                    snapshot.created_at.isoformat(),
                    snapshot.updated_at.isoformat(),
                ),
            )
            connection.commit()

        return snapshot

    def list_assistant_snapshots(
        self,
        manager_id: str,
        *,
        client_id: str | None = None,
        snapshot_type: AssistantSnapshotType | None = None,
    ) -> list[AssistantKBSnapshot]:
        query = [
            """
            SELECT *
            FROM assistant_kb_snapshots
            WHERE manager_id = ?
            """
        ]
        params: list[str] = [manager_id]

        if client_id is not None:
            query.append("AND (client_id = ? OR client_id IS NULL)")
            params.append(client_id)

        if snapshot_type is not None:
            query.append("AND snapshot_type = ?")
            params.append(snapshot_type.value)

        query.append("ORDER BY updated_at DESC")

        with self._connect() as connection:
            rows = connection.execute("\n".join(query), params).fetchall()

        return [self._map_assistant_snapshot(row) for row in rows]

    def delete_manager_assistant_snapshots(self, manager_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM assistant_kb_snapshots WHERE manager_id = ?",
                (manager_id,),
            )
            connection.commit()

    def count_assistant_snapshots(self, manager_id: str | None = None) -> int:
        query = "SELECT COUNT(*) AS count FROM assistant_kb_snapshots"
        params: tuple[str, ...] = ()
        if manager_id is not None:
            query += " WHERE manager_id = ?"
            params = (manager_id,)
        with self._connect() as connection:
            row = connection.execute(query, params).fetchone()
        return int(row["count"]) if row else 0

    def _get_latest_feedback(self, *, manager_id: str, recommendation_id: str) -> RecommendationFeedback | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM recommendation_feedback
                WHERE manager_id = ? AND recommendation_id = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (manager_id, recommendation_id),
            ).fetchone()
        return self._map_feedback(row) if row else None

    @staticmethod
    def _feedback_payload_matches(existing: RecommendationFeedback, payload: FeedbackRequest) -> bool:
        return (
            existing.recommendation_type == payload.recommendation_type
            and existing.client_id == payload.client_id
            and existing.conversation_id == payload.conversation_id
            and (existing.case_id or payload.case_id or None) == (payload.case_id or existing.case_id or None)
            and (
                (existing.source_interaction_id or existing.conversation_id or None)
                == ((payload.source_interaction_id or payload.conversation_id) or None)
            )
            and existing.decision == payload.decision
            and (existing.comment or None) == (payload.comment or None)
            and (existing.selected_variant or None) == (payload.selected_variant or None)
        )

    @staticmethod
    def _group_client_product_rows(product_rows: list[sqlite3.Row]) -> dict[str, list[sqlite3.Row]]:
        grouped: dict[str, list[sqlite3.Row]] = {}
        for row in product_rows:
            grouped.setdefault(row["client_id"], []).append(row)
        return grouped

    @staticmethod
    def _load_client_product_rows(connection: sqlite3.Connection, client_ids: list[str]) -> list[sqlite3.Row]:
        if not client_ids:
            return []
        placeholders = ",".join("?" for _ in client_ids)
        return connection.execute(
            f"""
            SELECT cp.client_id, cp.product_id, cp.status, cp.balance, cp.opened_at,
                   p.name, p.category, p.risk_level, p.margin_level, p.currency
            FROM client_products cp
            JOIN products p ON p.id = cp.product_id
            WHERE cp.client_id IN ({placeholders})
            ORDER BY cp.client_id ASC, cp.opened_at DESC
            """,
            client_ids,
        ).fetchall()

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
            business_goal=row["business_goal"] if "business_goal" in row.keys() else None,
            source_system=row["source_system"],
            linked_conversation_id=row["linked_conversation_id"] if "linked_conversation_id" in row.keys() else None,
            product_code=row["product_code"],
        )

    @classmethod
    def _map_client_row(cls, client_row: sqlite3.Row, product_rows: list[sqlite3.Row]) -> Client:
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
            last_contact_at=cls._parse_datetime(client_row["last_contact_at"]),
            next_contact_due_at=cls._parse_datetime(client_row["next_contact_due_at"]),
            notes_summary=client_row["notes_summary"],
            ai_summary_text=client_row["ai_summary_text"] if "ai_summary_text" in client_row.keys() else None,
            ai_summary_generated_at=cls._parse_datetime(client_row["ai_summary_generated_at"])
            if "ai_summary_generated_at" in client_row.keys()
            else None,
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
            recommendation_id=row["recommendation_id"] if "recommendation_id" in row.keys() else None,
            recommendation_decision=FeedbackDecision(row["recommendation_decision"])
            if "recommendation_decision" in row.keys() and row["recommendation_decision"]
            else None,
            decision_comment=row["decision_comment"] if "decision_comment" in row.keys() else None,
            note_text=row["note_text"],
            outcome=row["outcome"],
            channel=ChannelType(row["channel"]) if row["channel"] else None,
            follow_up_date=SQLiteStorage._parse_datetime(row["follow_up_date"]),
            summary_text=row["summary_text"] if "summary_text" in row.keys() else None,
            source_conversation_id=row["source_conversation_id"] if "source_conversation_id" in row.keys() else None,
            ai_generated=bool(row["ai_generated"]) if "ai_generated" in row.keys() else False,
            ai_draft_payload=AISummaryDraft.model_validate_json(row["ai_draft_payload_json"])
            if "ai_draft_payload_json" in row.keys() and row["ai_draft_payload_json"]
            else None,
            follow_up_reason=row["follow_up_reason"] if "follow_up_reason" in row.keys() else None,
            note_type=CRMNoteType(row["note_type"]) if "note_type" in row.keys() and row["note_type"] else CRMNoteType.crm_summary,
            outbound_message_text=row["outbound_message_text"] if "outbound_message_text" in row.keys() else None,
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    @staticmethod
    def _map_feedback(row: sqlite3.Row) -> RecommendationFeedback:
        return RecommendationFeedback(
            id=row["id"],
            recommendation_id=row["recommendation_id"],
            manager_id=row["manager_id"],
            recommendation_type=row["recommendation_type"],
            client_id=row["client_id"] if "client_id" in row.keys() else None,
            conversation_id=row["conversation_id"] if "conversation_id" in row.keys() else None,
            decision=FeedbackDecision(row["decision"]),
            comment=row["comment"],
            selected_variant=row["selected_variant"] if "selected_variant" in row.keys() else None,
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    @staticmethod
    def _map_activity_log(row: sqlite3.Row) -> ActivityLogEntry:
        return ActivityLogEntry(
            id=row["id"],
            recommendation_type=row["recommendation_type"],
            client_id=row["client_id"],
            recommendation_id=row["recommendation_id"] if "recommendation_id" in row.keys() else None,
            conversation_id=row["conversation_id"],
            manager_id=row["manager_id"],
            action=row["action"],
            decision=row["decision"] if "decision" in row.keys() else None,
            payload_excerpt=row["payload_excerpt"],
            context_snapshot=row["context_snapshot"] if "context_snapshot" in row.keys() else None,
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    @staticmethod
    def _map_conversation_insights(row: sqlite3.Row) -> ConversationInsights:
        return ConversationInsights(
            tone_label=row["tone_label"],
            urgency_label=row["urgency_label"],
            responsiveness_pattern=row["responsiveness_pattern"],
            client_response_avg_minutes=row["client_response_avg_minutes"],
            manager_response_avg_minutes=row["manager_response_avg_minutes"],
            next_contact_due_at=SQLiteStorage._parse_datetime(row["next_contact_due_at"]),
            next_contact_reason=row["next_contact_reason"],
            preferred_follow_up_channel=ChannelType(row["preferred_follow_up_channel"])
            if row["preferred_follow_up_channel"]
            else None,
            preferred_follow_up_format=row["preferred_follow_up_format"],
            interest_tags=SQLiteStorage._parse_pipe_list(row["interest_tags"]),
            objection_tags=SQLiteStorage._parse_pipe_list(row["objection_tags"]),
            mentioned_product_codes=SQLiteStorage._parse_pipe_list(row["mentioned_product_codes"]),
            action_hints=SQLiteStorage._parse_pipe_list(row["action_hints"]),
        )

    @staticmethod
    def _map_assistant_thread(row: sqlite3.Row) -> AssistantThread:
        return AssistantThread(
            id=row["id"],
            manager_id=row["manager_id"],
            title=row["title"],
            last_selected_client_id=row["last_selected_client_id"],
            memory_summary=row["memory_summary"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    @staticmethod
    def _map_assistant_message(row: sqlite3.Row) -> AssistantMessageRecord:
        return AssistantMessageRecord(
            id=row["id"],
            thread_id=row["thread_id"],
            role=AssistantMessageRole(row["role"]),
            content=row["content"],
            citations=[AssistantCitation.model_validate(item) for item in json.loads(row["citations_json"] or "[]")],
            used_context=[AssistantCitation.model_validate(item) for item in json.loads(row["used_context_json"] or "[]")],
            action_payload=AssistantMessageActionPayload.model_validate_json(row["action_payload_json"])
            if "action_payload_json" in row.keys() and row["action_payload_json"]
            else None,
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    @staticmethod
    def _map_assistant_snapshot(row: sqlite3.Row) -> AssistantKBSnapshot:
        return AssistantKBSnapshot(
            id=row["id"],
            manager_id=row["manager_id"],
            client_id=row["client_id"],
            snapshot_type=AssistantSnapshotType(row["snapshot_type"]),
            title=row["title"],
            content_text=row["content_text"],
            source_updated_at=SQLiteStorage._parse_datetime(row["source_updated_at"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    @staticmethod
    def _map_script_generation(row: sqlite3.Row) -> ScriptGenerationRecord:
        return ScriptGenerationRecord(
            id=row["id"],
            client_id=row["client_id"],
            manager_id=row["manager_id"],
            recommendation_id=row["recommendation_id"],
            conversation_id=row["conversation_id"],
            contact_goal=row["contact_goal"],
            selected_variant_label=row["selected_variant_label"],
            selected_text=row["selected_text"],
            draft=SalesScriptDraft.model_validate_json(row["draft_json"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            selected_at=SQLiteStorage._parse_datetime(row["selected_at"]),
        )

    @staticmethod
    def _map_objection_workflow(row: sqlite3.Row) -> ObjectionWorkflowRecord:
        return ObjectionWorkflowRecord(
            id=row["id"],
            client_id=row["client_id"],
            manager_id=row["manager_id"],
            recommendation_id=row["recommendation_id"],
            conversation_id=row["conversation_id"],
            selected_option_title=row["selected_option_title"],
            selected_response=row["selected_response"],
            draft=ObjectionWorkflowDraft.model_validate_json(row["draft_json"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            selected_at=SQLiteStorage._parse_datetime(row["selected_at"]),
        )

    @staticmethod
    def _map_crm_draft_revision(row: sqlite3.Row) -> CRMDraftRevision:
        return CRMDraftRevision(
            id=row["id"],
            client_id=row["client_id"],
            manager_id=row["manager_id"],
            recommendation_id=row["recommendation_id"],
            conversation_id=row["conversation_id"],
            stage=row["stage"],
            changed_fields=json.loads(row["changed_fields_json"] or "[]"),
            draft=AISummaryDraft.model_validate_json(row["draft_json"]),
            final_note_text=row["final_note_text"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    @staticmethod
    def _parse_datetime(value: str | None) -> datetime | None:
        if not value:
            return None
        return datetime.fromisoformat(value)

    @staticmethod
    def _parse_pipe_list(value: str | None) -> list[str]:
        if not value:
            return []
        return value.split("|")

    @staticmethod
    def _ensure_table_column(connection: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
        existing_columns = {
            row["name"]
            for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
        }
        if column_name not in existing_columns:
            connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
