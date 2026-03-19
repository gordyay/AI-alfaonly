from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.ai.base import AIProvider, AIProviderError
from app.ai.groq import GroqProvider, GroqSettings
from app.db import SQLiteStorage
from app.main import create_app
from app.models import (
    AISummaryDraft,
    AISummaryOutcome,
    AssistantLLMResponse,
    ChannelType,
    GenerateScriptResponse,
    Message,
    ObjectionAnalysis,
    ObjectionType,
    SalesScriptDraft,
    SalesScriptVariant,
    SummarizeDialogResponse,
)
from app.seed_data import seed_mvp_data
from app.services import AIScriptService, AISummaryService, DialogPriorityService, ObjectionWorkflowService, ProductPropensityService


def build_summary_response() -> SummarizeDialogResponse:
    return SummarizeDialogResponse(
        draft=AISummaryDraft(
            contact_summary="Клиент заинтересован в сравнении консервативных инструментов и ожидает follow-up.",
            key_points=[
                "Клиент просит сфокусироваться на ликвидности и защите капитала.",
                "Договорились вернуться с кратким сравнением инструментов.",
            ],
            outcome=AISummaryOutcome.follow_up,
            crm_note_draft="Обсудили консервативные варианты размещения. Подготовить краткое сравнение и вернуться к клиенту.",
            follow_up_required=True,
            follow_up_date=datetime(2026, 3, 18, 12, 30, tzinfo=UTC),
            follow_up_reason="Отправить сравнение инструментов и подтвердить удобное окно для контакта.",
            data_gaps=["Не подтвержден точный желаемый горизонт инвестирования."],
        ),
        model_name="fake-llama-stage3",
        generated_at=datetime(2026, 3, 17, 9, 0, tzinfo=UTC),
    )


def build_script_response() -> GenerateScriptResponse:
    return GenerateScriptResponse(
        draft=SalesScriptDraft(
            manager_talking_points=[
                "Начать с интереса клиента к консервативным решениям.",
                "Подчеркнуть ликвидность и спокойный тон.",
                "Предложить короткий следующий шаг без давления.",
            ],
            ready_script=(
                "Иван, подготовил короткий вариант с фокусом на ликвидность и комфортный риск-профиль. "
                "Если удобно, пришлю компактное сравнение и вместе выберем оптимальный следующий шаг."
            ),
            channel=ChannelType.chat,
            contact_goal="Отправить компактное сравнение и закрепить следующий шаг",
            product_name="Премиальный вклад",
            tone="soft",
            follow_up_message="Если удобно, могу отдельно прислать совсем короткую рамку по двум сценариям.",
            next_step="Согласовать удобное окно для follow-up после отправки сравнения.",
            alternatives=[
                SalesScriptVariant(
                    label="Более деловой",
                    manager_talking_points=["Сразу перейти к выгоде и ликвидности."],
                    ready_script="Иван, подготовил короткое сравнение по двум спокойным сценариям размещения.",
                ),
                SalesScriptVariant(
                    label="Максимально мягкий",
                    manager_talking_points=["Не давить и предложить только один следующий шаг."],
                    ready_script="Иван, если удобно, могу прислать совсем короткую выжимку без лишних деталей.",
                ),
            ],
        ),
        model_name="fake-script-stage6",
        generated_at=datetime(2026, 3, 17, 9, 30, tzinfo=UTC),
    )


def build_objection_analysis() -> ObjectionAnalysis:
    return ObjectionAnalysis(
        objection_type=ObjectionType.risk,
        objection_label="Риск и сохранность капитала",
        confidence=0.82,
        evidence=["слишком высокий риск", "сохранность капитала"],
        customer_intent="Не принимать решение без ощущения контроля над риском.",
    )


class FakeAIProvider(AIProvider):
    def __init__(
        self,
        response: SummarizeDialogResponse | None = None,
        error: Exception | None = None,
    ) -> None:
        self.response = response or build_summary_response()
        self.script_response = build_script_response()
        self.error = error
        self.contexts: list[dict] = []
        self.script_contexts: list[dict] = []
        self.assistant_contexts: list[dict] = []
        self.objection_contexts: list[dict] = []

    def generate_script(self, context: dict) -> GenerateScriptResponse:
        self.script_contexts.append(context)
        if self.error:
            raise self.error
        return self.script_response

    def summarize_dialog(self, context: dict) -> SummarizeDialogResponse:
        self.contexts.append(context)
        if self.error:
            raise self.error
        return self.response

    def assistant_chat(self, context: dict) -> AssistantLLMResponse:
        self.assistant_contexts.append(context)
        if self.error:
            raise self.error
        return AssistantLLMResponse(
            answer="Ассистент готов помочь с текущим клиентом.",
            citations=[],
            suggested_actions=["Сделай сводку диалога"],
            requires_client_context=False,
            action_type=None,
        )

    def classify_objection(self, context: dict) -> ObjectionAnalysis:
        self.objection_contexts.append(context)
        if self.error:
            raise self.error
        return build_objection_analysis()


@dataclass
class AITestEnv:
    client: AsyncClient
    provider: FakeAIProvider


@pytest.fixture
async def ai_env(tmp_path):
    db_path = tmp_path / "stage3-test.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    provider = FakeAIProvider()
    app = create_app(db_path=db_path, ai_provider=provider)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield AITestEnv(client=async_client, provider=provider)


def test_ai_summary_service_builds_context(tmp_path):
    db_path = tmp_path / "stage3-context.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    client = storage.get_client("c1")
    assert client is not None
    conversation = next(item for item in storage.list_client_conversations("c1") if item.id == "conv1")
    recommendation = DialogPriorityService().build_recommendation(client=client, conversation=conversation)

    context = AISummaryService().build_context(client=client, conversation=conversation, recommendation=recommendation)

    assert context["client"]["id"] == "c1"
    assert context["dialog_recommendation"]["client_id"] == "c1"
    assert context["conversation"]["id"] == conversation.id
    assert len(context["conversation"]["messages"]) >= 7
    assert context["conversation"]["insights"]["tone_label"] is not None


def test_ai_summary_service_trims_message_context(tmp_path):
    db_path = tmp_path / "stage4-context.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    client = storage.get_client("c1")
    assert client is not None
    conversation = storage.list_client_conversations("c1")[0]
    conversation.messages = [
        Message(
            id=f"mx-{index}",
            conversation_id=conversation.id,
            sender="client" if index % 2 == 0 else "manager",
            text="x" * 900,
            created_at=datetime(2026, 3, 17, 9, index % 60, tzinfo=UTC),
        )
        for index in range(20)
    ]

    context = AISummaryService().build_context(client=client, conversation=conversation, recommendation=None)

    assert context["conversation"]["context_window"] == {
        "messages_before_trim": 20,
        "messages_after_trim": 12,
    }
    assert len(context["conversation"]["messages"]) == 12
    assert all(len(message["text"]) <= 500 for message in context["conversation"]["messages"])


def test_ai_script_service_builds_context(tmp_path):
    db_path = tmp_path / "stage6-script-context.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    client = storage.get_client("c1")
    assert client is not None
    conversation = next(item for item in storage.list_client_conversations("c1") if item.id == "conv1")
    recommendation = DialogPriorityService().build_recommendation(client=client, conversation=conversation)
    crm_notes = storage.list_client_crm_notes("c1")

    propensity = ProductPropensityService().build_client_propensity(storage=storage, client=client)
    objection_workflow = ObjectionWorkflowService().build_workflow(
        provider=FakeAIProvider(),
        client=client,
        conversation=conversation,
    )
    context = AIScriptService().build_context(
        client=client,
        conversation=conversation,
        recommendation=recommendation,
        crm_notes=crm_notes,
        instruction="Подготовь короткий мягкий follow-up без давления.",
        product_propensities=propensity.items,
        objection_workflow=objection_workflow.draft,
    )

    assert context["client"]["id"] == "c1"
    assert context["dialog_recommendation"]["client_id"] == "c1"
    assert context["conversation"]["id"] == conversation.id
    assert context["instruction"] == "Подготовь короткий мягкий follow-up без давления."
    assert len(context["crm_notes"]) <= 3
    assert context["propensity_rankings"]
    assert context["objection_workflow"]["analysis"]["objection_type"] == "risk"
    assert context["script_job"]["preferred_tone"] in {"soft", "consultative", "concise_personal"}


def test_product_propensity_service_ranks_products(tmp_path):
    db_path = tmp_path / "stage7-propensity-context.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    client = storage.get_client("c1")
    assert client is not None

    response = ProductPropensityService().build_client_propensity(storage=storage, client=client)

    assert response.client_id == "c1"
    assert len(response.items) >= 3
    assert response.items[0].score >= response.items[1].score
    assert {"product_fit", "affordability", "behavioral_signal", "relationship_depth", "portfolio_gap"}.issubset(
        response.items[0].factors.model_dump().keys()
    )


def test_objection_workflow_service_builds_playbook(tmp_path):
    db_path = tmp_path / "stage7-objection-context.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    client = storage.get_client("c2")
    assert client is not None
    conversation = storage.list_client_conversations("c2")[0]
    provider = FakeAIProvider()

    response = ObjectionWorkflowService().build_workflow(
        provider=provider,
        client=client,
        conversation=conversation,
        objection_text="Не хочу заходить в высокий риск.",
    )

    assert response.draft.analysis.objection_type == ObjectionType.risk
    assert len(response.draft.handling_options) >= 2
    assert response.draft.what_not_to_say


def test_groq_provider_parses_structured_script_content():
    content = json.dumps(
        {
            "manager_talking_points": ["Опора на ликвидность", "Короткий следующий шаг"],
            "ready_script": "Иван, подготовил короткое сравнение и могу отправить его сегодня.",
            "channel": "chat",
        },
        ensure_ascii=False,
    )

    draft = GroqProvider.parse_script_content(content)

    assert draft.channel == ChannelType.chat
    assert draft.ready_script.startswith("Иван")


def test_groq_provider_rejects_invalid_script_content():
    with pytest.raises(AIProviderError):
        GroqProvider.parse_script_content("not-json")


def test_groq_provider_repairs_invalid_script_json_response():
    class FakeResponse:
        def __init__(self, content: str, model: str = "llama-3.1-8b-instant") -> None:
            self.model = model
            self.choices = [type("Choice", (), {"message": type("Message", (), {"content": content})()})()]

    class FakeCompletions:
        def __init__(self, responses: list[FakeResponse]) -> None:
            self.responses = responses

        def create(self, **_: dict) -> FakeResponse:
            return self.responses.pop(0)

    fake_client = type(
        "FakeClient",
        (),
        {
            "chat": type(
                "FakeChat",
                (),
                {
                    "completions": FakeCompletions(
                        [
                            FakeResponse("not-json"),
                            FakeResponse(
                                json.dumps(
                                    {
                                        "manager_talking_points": [
                                            "Опора на интерес клиента к ликвидности.",
                                            "Мягко предложить следующий шаг.",
                                        ],
                                        "ready_script": "Иван, подготовил короткий вариант и могу отправить его сегодня.",
                                        "channel": "chat",
                                    },
                                    ensure_ascii=False,
                                )
                            ),
                        ]
                    )
                },
            )()
        },
    )()

    provider = GroqProvider(GroqSettings(api_key="test", model="llama-3.1-8b-instant"))
    provider._create_client = lambda: fake_client  # type: ignore[method-assign]

    response = provider.generate_script({"conversation": {"messages": []}})

    assert response.draft.channel == ChannelType.chat
    assert response.draft.ready_script.startswith("Иван")


def test_groq_provider_parses_structured_summary_content():
    content = json.dumps(
        {
            "contact_summary": "Клиент просит короткое сравнение продуктов и follow-up на завтра.",
            "key_points": ["Нужна краткая подача.", "Важна ликвидность."],
            "outcome": "follow_up",
            "crm_note_draft": "Подготовить короткое сравнение и вернуться к клиенту завтра.",
            "follow_up_required": True,
            "follow_up_date": "2026-03-18T12:30:00+00:00",
            "follow_up_reason": "Передать сравнение продуктов.",
            "data_gaps": [],
        },
        ensure_ascii=False,
    )

    draft = GroqProvider.parse_summary_content(content)

    assert draft.outcome == AISummaryOutcome.follow_up
    assert draft.follow_up_required is True
    assert draft.follow_up_date is not None


def test_groq_provider_rejects_invalid_summary_content():
    with pytest.raises(AIProviderError):
        GroqProvider.parse_summary_content("not-json")


def test_groq_provider_uses_json_object_mode_for_llama_models():
    provider = GroqProvider(GroqSettings(api_key="test", model="llama-3.3-70b-versatile"))

    response_format = provider.build_summary_response_format()

    assert response_format == {"type": "json_object"}


def test_groq_provider_enables_strict_json_schema_for_gpt_oss_models():
    provider = GroqProvider(GroqSettings(api_key="test", model="openai/gpt-oss-20b"))

    response_format = provider.build_summary_response_format()

    assert response_format["type"] == "json_schema"
    assert response_format["json_schema"]["strict"] is True


def test_groq_provider_repairs_invalid_json_response():
    class FakeResponse:
        def __init__(self, content: str, model: str = "llama-3.1-8b-instant") -> None:
            self.model = model
            self.choices = [type("Choice", (), {"message": type("Message", (), {"content": content})()})()]

    class FakeCompletions:
        def __init__(self, responses: list[FakeResponse]) -> None:
            self.responses = responses

        def create(self, **_: dict) -> FakeResponse:
            return self.responses.pop(0)

    fake_client = type(
        "FakeClient",
        (),
        {
            "chat": type(
                "FakeChat",
                (),
                {
                    "completions": FakeCompletions(
                        [
                            FakeResponse("not-json"),
                            FakeResponse(
                                json.dumps(
                                    {
                                        "contact_summary": "Клиент ждет короткую выжимку и возврат с материалами.",
                                        "key_points": ["Нужен короткий ответ.", "Интерес к консервативным решениям."],
                                        "outcome": "follow_up",
                                        "crm_note_draft": "Подготовить краткую выжимку и вернуться к клиенту.",
                                        "follow_up_required": True,
                                        "follow_up_date": None,
                                        "follow_up_reason": "Вернуться с краткой выжимкой.",
                                        "data_gaps": [],
                                    },
                                    ensure_ascii=False,
                                )
                            ),
                        ]
                    )
                },
            )()
        },
    )()

    provider = GroqProvider(GroqSettings(api_key="test", model="llama-3.1-8b-instant"))
    provider._create_client = lambda: fake_client  # type: ignore[method-assign]

    response = provider.summarize_dialog({"conversation": {"messages": []}})

    assert response.draft.outcome == AISummaryOutcome.follow_up
    assert response.draft.contact_summary.startswith("Клиент ждет")


def test_groq_settings_default_to_llama_instant(monkeypatch):
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    monkeypatch.delenv("GROQ_FAST_MODEL", raising=False)

    settings = GroqSettings.from_env()

    assert settings.model == "llama-3.1-8b-instant"
    assert settings.fast_model == "llama-3.1-8b-instant"


@pytest.mark.anyio
async def test_ai_summarize_dialog_returns_structured_draft(ai_env: AITestEnv):
    detail_response = await ai_env.client.get("/client/c1")
    conversation_id = detail_response.json()["conversations"][0]["id"]

    response = await ai_env.client.post(
        "/ai/summarize-dialog",
        json={"client_id": "c1", "conversation_id": conversation_id},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["draft"]["outcome"] == "follow_up"
    assert body["draft"]["grounding_facts"]
    assert body["model_name"] == "fake-llama-stage3"
    assert ai_env.provider.contexts
    assert ai_env.provider.contexts[0]["client"]["id"] == "c1"
    assert ai_env.provider.contexts[0]["conversation"]["id"] == conversation_id

    refreshed_detail = await ai_env.client.get("/client/c1")
    assert refreshed_detail.status_code == 200
    assert refreshed_detail.json()["client"]["ai_summary_text"] == body["draft"]["contact_summary"]

    activity_log_response = await ai_env.client.get("/client/c1/activity-log")
    assert activity_log_response.status_code == 200
    items = activity_log_response.json()["items"]
    assert {("mini_summary", "generated"), ("crm_note_draft", "generated")}.issubset(
        {(item["recommendation_type"], item["action"]) for item in items}
    )


@pytest.mark.anyio
async def test_ai_summarize_dialog_returns_404_for_unknown_conversation(ai_env: AITestEnv):
    response = await ai_env.client.post(
        "/ai/summarize-dialog",
        json={"client_id": "c1", "conversation_id": "missing-conversation"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found"


@pytest.mark.anyio
async def test_ai_summarize_dialog_returns_503_on_provider_error(tmp_path):
    db_path = tmp_path / "stage3-provider-error.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    provider = FakeAIProvider(error=AIProviderError("Groq временно недоступен."))
    app = create_app(db_path=db_path, ai_provider=provider)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        detail_response = await client.get("/client/c1")
        conversation_id = detail_response.json()["conversations"][0]["id"]
        response = await client.post(
            "/ai/summarize-dialog",
            json={"client_id": "c1", "conversation_id": conversation_id},
        )
        activity_log_response = await client.get("/client/c1/activity-log")

    assert response.status_code == 503
    assert response.json()["detail"] == "Groq временно недоступен."
    assert activity_log_response.status_code == 200
    assert ("mini_summary", "generation_failed") in {
        (item["recommendation_type"], item["action"]) for item in activity_log_response.json()["items"]
    }


@pytest.mark.anyio
async def test_generate_draft_then_save_crm_note_persists_ai_metadata(ai_env: AITestEnv):
    detail_response = await ai_env.client.get("/client/c1")
    detail = detail_response.json()
    conversation_id = detail["conversations"][0]["id"]

    summarize_response = await ai_env.client.post(
        "/ai/summarize-dialog",
        json={"client_id": "c1", "conversation_id": conversation_id},
    )
    assert summarize_response.status_code == 200
    draft = summarize_response.json()["draft"]

    create_response = await ai_env.client.post(
        "/crm-note",
        json={
            "client_id": "c1",
            "manager_id": "m1",
            "note_text": draft["crm_note_draft"],
            "outcome": draft["outcome"],
            "follow_up_date": draft["follow_up_date"],
            "follow_up_reason": draft["follow_up_reason"],
            "summary_text": draft["contact_summary"],
            "source_conversation_id": conversation_id,
            "ai_generated": True,
            "ai_draft_payload": draft,
        },
    )

    assert create_response.status_code == 200
    created_note = create_response.json()["crm_note"]
    assert created_note["summary_text"] == draft["contact_summary"]
    assert created_note["source_conversation_id"] == conversation_id
    assert created_note["ai_generated"] is True

    refreshed_detail = await ai_env.client.get("/client/c1?work_item_id=task:task-9")
    assert refreshed_detail.status_code == 200
    latest_note = refreshed_detail.json()["crm_notes"][0]
    assert latest_note["summary_text"] == draft["contact_summary"]
    assert latest_note["source_conversation_id"] == conversation_id
    assert latest_note["ai_generated"] is True
    assert latest_note["ai_draft_payload"]["contact_summary"] == draft["contact_summary"]
    assert refreshed_detail.json()["saved_ai_draft"]["crm_note_draft"] == draft["crm_note_draft"]

    activity_log_response = await ai_env.client.get("/client/c1/activity-log")
    assert activity_log_response.status_code == 200
    activity_pairs = {(item["recommendation_type"], item["action"]) for item in activity_log_response.json()["items"]}
    assert ("crm_note", "saved") in activity_pairs


@pytest.mark.anyio
async def test_ai_generate_script_returns_structured_draft(ai_env: AITestEnv):
    detail_response = await ai_env.client.get("/client/c1")
    conversation_id = detail_response.json()["conversations"][0]["id"]

    response = await ai_env.client.post(
        "/ai/generate-script",
        json={
            "client_id": "c1",
            "conversation_id": conversation_id,
            "instruction": "Подготовь короткий скрипт продажи без давления.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["draft"]["channel"] == "chat"
    assert body["draft"]["ready_script"].startswith("Иван")
    assert body["draft"]["grounding_facts"]
    assert ai_env.provider.script_contexts
    assert ai_env.provider.script_contexts[0]["instruction"] == "Подготовь короткий скрипт продажи без давления."

    activity_log_response = await ai_env.client.get("/client/c1/activity-log")
    assert activity_log_response.status_code == 200
    assert ("sales_script", "generated") in {
        (item["recommendation_type"], item["action"]) for item in activity_log_response.json()["items"]
    }


@pytest.mark.anyio
async def test_objection_workflow_response_contains_grounding_facts(ai_env: AITestEnv):
    detail_response = await ai_env.client.get("/client/c2")
    conversation_id = detail_response.json()["conversations"][0]["id"]

    response = await ai_env.client.post(
        "/ai/objection-workflow",
        json={
            "client_id": "c2",
            "conversation_id": conversation_id,
            "manager_id": "m1",
            "objection_text": "Меня беспокоит риск.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["draft"]["grounding_facts"]
    assert "data_gaps" in body["draft"]


@pytest.mark.anyio
async def test_ai_generate_script_returns_404_for_unknown_conversation(ai_env: AITestEnv):
    response = await ai_env.client.post(
        "/ai/generate-script",
        json={"client_id": "c1", "conversation_id": "missing-conversation"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found"
