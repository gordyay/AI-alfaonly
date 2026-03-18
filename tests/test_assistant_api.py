from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.ai.base import AIProvider
from app.db import SQLiteStorage
from app.main import create_app
from app.models import (
    AISummaryDraft,
    AISummaryOutcome,
    AssistantLLMResponse,
    ChannelType,
    GenerateScriptResponse,
    ObjectionAnalysis,
    ObjectionType,
    SalesScriptDraft,
    SalesScriptVariant,
    SummarizeDialogResponse,
)
from app.seed_data import seed_mvp_data


def build_summary_response() -> SummarizeDialogResponse:
    return SummarizeDialogResponse(
        draft=AISummaryDraft(
            contact_summary="Клиент ждет короткую выжимку и следующую точку контакта.",
            key_points=[
                "Нужна короткая и деловая подача.",
                "Важно вернуться с персонализированным тезисом.",
            ],
            outcome=AISummaryOutcome.follow_up,
            crm_note_draft="Подготовить краткую выжимку по диалогу и вернуться к клиенту с персональным предложением.",
            follow_up_required=True,
            follow_up_date=datetime(2026, 3, 18, 12, 30, tzinfo=UTC),
            follow_up_reason="Вернуться с краткой выжимкой и следующим шагом.",
            data_gaps=[],
        ),
        model_name="fake-stage5",
        generated_at=datetime(2026, 3, 18, 9, 0, tzinfo=UTC),
    )


def build_script_response() -> GenerateScriptResponse:
    return GenerateScriptResponse(
        draft=SalesScriptDraft(
            manager_talking_points=[
                "Начать с контекста клиента и его интереса к ликвидности.",
                "Подчеркнуть, что предложение персонализировано и без избыточного давления.",
                "Предложить короткий следующий шаг с понятной выгодой.",
            ],
            ready_script=(
                "Иван, подготовил короткий вариант размещения с акцентом на ликвидность и спокойный риск-профиль. "
                "Если удобно, пришлю компактное сравнение и дальше выберем оптимальный сценарий без лишней нагрузки по времени."
            ),
            channel=ChannelType.chat,
            contact_goal="Поддержать интерес клиента и согласовать follow-up",
            product_name="Премиальный вклад",
            tone="soft",
            follow_up_message="Если удобно, пришлю отдельно совсем короткое сравнение двух сценариев.",
            next_step="После отправки сравнения предложить удобное окно для короткого контакта.",
            alternatives=[
                SalesScriptVariant(
                    label="Более короткий",
                    manager_talking_points=["Сразу перейти к сути."],
                    ready_script="Иван, подготовил краткое сравнение двух спокойных сценариев размещения.",
                )
            ],
        ),
        model_name="fake-script-stage6",
        generated_at=datetime(2026, 3, 18, 10, 0, tzinfo=UTC),
    )


def build_objection_analysis() -> ObjectionAnalysis:
    return ObjectionAnalysis(
        objection_type=ObjectionType.risk,
        objection_label="Риск и сохранность капитала",
        confidence=0.8,
        evidence=["высокий риск"],
        customer_intent="Клиент хочет сначала зафиксировать границы по риску.",
    )


class FakeAssistantProvider(AIProvider):
    def __init__(self) -> None:
        self.summary_response = build_summary_response()
        self.script_response = build_script_response()
        self.summary_contexts: list[dict] = []
        self.script_contexts: list[dict] = []
        self.assistant_contexts: list[dict] = []
        self.objection_contexts: list[dict] = []

    def generate_script(self, context: dict) -> GenerateScriptResponse:
        self.script_contexts.append(context)
        return self.script_response

    def summarize_dialog(self, context: dict) -> SummarizeDialogResponse:
        self.summary_contexts.append(context)
        return self.summary_response

    def assistant_chat(self, context: dict) -> AssistantLLMResponse:
        self.assistant_contexts.append(context)
        knowledge = context.get("knowledge", [])
        citations = [knowledge[0]["ref_id"]] if knowledge else []
        selected_name = context.get("scope", {}).get("selected_client_name")
        answer = (
            f"По клиенту {selected_name} сейчас важны ликвидность, тон коммуникации и ближайший следующий контакт."
            if selected_name
            else "Сейчас в фокусе самые приоритетные клиенты менеджера и ближайшие точки контакта."
        )
        return AssistantLLMResponse(
            answer=answer,
            citations=citations,
            suggested_actions=["Сделай сводку диалога", "Собери CRM-заметку"],
            requires_client_context=False,
            action_type=None,
        )

    def classify_objection(self, context: dict) -> ObjectionAnalysis:
        self.objection_contexts.append(context)
        return build_objection_analysis()


@dataclass
class AssistantTestEnv:
    client: AsyncClient
    provider: FakeAssistantProvider
    db_path: str


@pytest.fixture
async def assistant_env(tmp_path):
    db_path = tmp_path / "stage5-assistant.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    provider = FakeAssistantProvider()
    app = create_app(db_path=db_path, ai_provider=provider)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield AssistantTestEnv(client=async_client, provider=provider, db_path=str(db_path))


@pytest.mark.anyio
async def test_empty_assistant_threads_are_not_returned_in_history(assistant_env: AssistantTestEnv):
    create_response = await assistant_env.client.post(
        "/assistant/threads",
        json={"manager_id": "m1", "selected_client_id": "c1", "title": "Иван Петров"},
    )

    assert create_response.status_code == 200
    thread = create_response.json()["thread"]
    assert thread["manager_id"] == "m1"
    assert thread["last_selected_client_id"] == "c1"

    list_response = await assistant_env.client.get("/assistant/threads?manager_id=m1")
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    assert all(item["id"] != thread["id"] for item in items)

    detail_response = await assistant_env.client.get(f"/assistant/threads/{thread['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["thread"]["id"] == thread["id"]
    assert detail_response.json()["messages"] == []


@pytest.mark.anyio
async def test_assistant_chat_persists_history_and_uses_selected_client_context(assistant_env: AssistantTestEnv):
    thread_response = await assistant_env.client.post(
        "/assistant/threads",
        json={"manager_id": "m1", "selected_client_id": "c1"},
    )
    thread_id = thread_response.json()["thread"]["id"]

    chat_response = await assistant_env.client.post(
        "/assistant/chat",
        json={
            "manager_id": "m1",
            "thread_id": thread_id,
            "message": "Что важно по клиенту?",
            "selected_client_id": "c1",
        },
    )

    assert chat_response.status_code == 200
    body = chat_response.json()
    assert body["assistant_message"]["content"].startswith("По клиенту")
    assert body["citations"]
    assert assistant_env.provider.assistant_contexts
    assert assistant_env.provider.assistant_contexts[0]["scope"]["selected_client_id"] == "c1"
    assert assistant_env.provider.assistant_contexts[0]["scope"]["selected_client_name"] == "Иван Петров"

    detail_response = await assistant_env.client.get(f"/assistant/threads/{thread_id}")
    assert detail_response.status_code == 200
    messages = detail_response.json()["messages"]
    assert len(messages) == 2
    assert [message["role"] for message in messages] == ["user", "assistant"]


@pytest.mark.anyio
async def test_assistant_chat_summary_action_updates_client_summary(assistant_env: AssistantTestEnv):
    thread_response = await assistant_env.client.post(
        "/assistant/threads",
        json={"manager_id": "m1", "selected_client_id": "c1"},
    )
    thread_id = thread_response.json()["thread"]["id"]

    chat_response = await assistant_env.client.post(
        "/assistant/chat",
        json={
            "manager_id": "m1",
            "thread_id": thread_id,
            "message": "Сделай сводку диалога и CRM-заметку",
            "selected_client_id": "c1",
        },
    )

    assert chat_response.status_code == 200
    body = chat_response.json()
    assert body["action_result"]["action_type"] == "summary_crm_draft"
    assert body["action_result"]["draft"]["contact_summary"] == build_summary_response().draft.contact_summary
    assert assistant_env.provider.summary_contexts

    client_detail = await assistant_env.client.get("/client/c1")
    assert client_detail.status_code == 200
    assert client_detail.json()["client"]["ai_summary_text"] == build_summary_response().draft.contact_summary


@pytest.mark.anyio
async def test_assistant_chat_requests_client_context_for_summary_actions(assistant_env: AssistantTestEnv):
    thread_response = await assistant_env.client.post("/assistant/threads", json={"manager_id": "m1"})
    thread_id = thread_response.json()["thread"]["id"]

    chat_response = await assistant_env.client.post(
        "/assistant/chat",
        json={
            "manager_id": "m1",
            "thread_id": thread_id,
            "message": "Собери CRM-заметку",
        },
    )

    assert chat_response.status_code == 200
    body = chat_response.json()
    assert body["assistant_message"]["content"].startswith("Чтобы подготовить сводку")
    assert body["action_result"] is None


@pytest.mark.anyio
async def test_assistant_chat_script_action_returns_persisted_script_payload(assistant_env: AssistantTestEnv):
    thread_response = await assistant_env.client.post(
        "/assistant/threads",
        json={"manager_id": "m1", "selected_client_id": "c1"},
    )
    thread_id = thread_response.json()["thread"]["id"]

    chat_response = await assistant_env.client.post(
        "/assistant/chat",
        json={
            "manager_id": "m1",
            "thread_id": thread_id,
            "message": "Подготовь скрипт продажи без давления",
            "selected_client_id": "c1",
        },
    )

    assert chat_response.status_code == 200
    body = chat_response.json()
    assert body["action_result"]["action_type"] == "sales_script"
    assert body["action_result"]["sales_script_draft"]["channel"] == "chat"
    assert body["action_result"]["sales_script_draft"]["follow_up_message"]
    assert body["action_result"]["sales_script_draft"]["alternatives"]
    assert assistant_env.provider.script_contexts
    assert assistant_env.provider.script_contexts[0]["instruction"] == "Подготовь скрипт продажи без давления"
    assert assistant_env.provider.script_contexts[0]["propensity_rankings"]
    assert assistant_env.provider.script_contexts[0]["objection_workflow"]

    detail_response = await assistant_env.client.get(f"/assistant/threads/{thread_id}")
    assert detail_response.status_code == 200
    messages = detail_response.json()["messages"]
    assistant_message = messages[-1]
    assert assistant_message["action_payload"]["action_type"] == "sales_script"
    assert assistant_message["action_payload"]["sales_script_draft"]["ready_script"].startswith("Иван")


@pytest.mark.anyio
async def test_assistant_chat_objection_action_returns_workflow_payload(assistant_env: AssistantTestEnv):
    thread_response = await assistant_env.client.post(
        "/assistant/threads",
        json={"manager_id": "m1", "selected_client_id": "c2"},
    )
    thread_id = thread_response.json()["thread"]["id"]

    chat_response = await assistant_env.client.post(
        "/assistant/chat",
        json={
            "manager_id": "m1",
            "thread_id": thread_id,
            "message": "Как отработать возражение по риску?",
            "selected_client_id": "c2",
        },
    )

    assert chat_response.status_code == 200
    body = chat_response.json()
    assert body["action_result"]["action_type"] == "objection_workflow"
    assert body["action_result"]["objection_workflow_draft"]["analysis"]["objection_type"] == "risk"
    assert assistant_env.provider.objection_contexts

    detail_response = await assistant_env.client.get(f"/assistant/threads/{thread_id}")
    assistant_message = detail_response.json()["messages"][-1]
    assert assistant_message["action_payload"]["action_type"] == "objection_workflow"
    assert assistant_message["action_payload"]["objection_workflow_draft"]["handling_options"]


@pytest.mark.anyio
async def test_assistant_chat_requests_client_context_for_script_actions(assistant_env: AssistantTestEnv):
    thread_response = await assistant_env.client.post("/assistant/threads", json={"manager_id": "m1"})
    thread_id = thread_response.json()["thread"]["id"]

    chat_response = await assistant_env.client.post(
        "/assistant/chat",
        json={
            "manager_id": "m1",
            "thread_id": thread_id,
            "message": "Как ответить клиенту с продающим оффером?",
        },
    )

    assert chat_response.status_code == 200
    body = chat_response.json()
    assert body["assistant_message"]["content"].startswith("Чтобы подготовить скрипт продажи")
    assert body["action_result"] is None


@pytest.mark.anyio
async def test_assistant_snapshots_exist_and_do_not_leak_other_manager_context(assistant_env: AssistantTestEnv):
    storage = SQLiteStorage(db_path=assistant_env.db_path)
    assert storage.count_assistant_snapshots(manager_id="m1") > 0
    assert storage.count_assistant_snapshots(manager_id="m2") > 0

    thread_response = await assistant_env.client.post("/assistant/threads", json={"manager_id": "m1"})
    thread_id = thread_response.json()["thread"]["id"]

    chat_response = await assistant_env.client.post(
        "/assistant/chat",
        json={
            "manager_id": "m1",
            "thread_id": thread_id,
            "message": "Что сейчас происходит у Марии Кузнецовой?",
        },
    )

    assert chat_response.status_code == 200
    knowledge = assistant_env.provider.assistant_contexts[-1]["knowledge"]
    snapshot_ids = [item["snapshot_id"] for item in knowledge]
    assert all("client:c4:" not in snapshot_id for snapshot_id in snapshot_ids)
