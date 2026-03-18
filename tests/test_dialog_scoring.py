from datetime import UTC, datetime, timedelta

from app.models import ChannelType, Client, Conversation, ConversationInsights, Message
from app.services import DialogPriorityService


def build_client(*, cash_balance: float, portfolio_value: float, churn_risk: str = "medium") -> Client:
    return Client(
        id="c-test",
        full_name="Тест Клиент",
        risk_profile="moderate",
        manager_id="m1",
        age=40,
        city="Москва",
        preferred_channel="chat",
        family_status="married",
        occupation="Предприниматель",
        income_band="high",
        portfolio_value=portfolio_value,
        cash_balance=cash_balance,
        churn_risk=churn_risk,
        notes_summary="Тестовый клиент.",
        tags=[],
        products=[],
    )


def build_conversation(
    now: datetime,
    *,
    urgency_label: str = "normal",
    tone_label: str = "neutral",
    responsiveness_pattern: str = "medium",
    next_contact_due_at: datetime | None = None,
    preferred_follow_up_channel: ChannelType | None = ChannelType.chat,
    preferred_follow_up_format: str | None = "short",
    interest_tags: list[str] | None = None,
    objection_tags: list[str] | None = None,
    mentioned_product_codes: list[str] | None = None,
    action_hints: list[str] | None = None,
) -> Conversation:
    return Conversation(
        id="conv-test",
        client_id="c-test",
        channel=ChannelType.chat,
        topic="Тестовый диалог",
        started_at=now - timedelta(hours=6),
        messages=[
            Message(
                id="m1",
                conversation_id="conv-test",
                sender="client",
                text="Нужно быстро понять варианты.",
                created_at=now - timedelta(hours=1),
            ),
            Message(
                id="m2",
                conversation_id="conv-test",
                sender="manager",
                text="Подготовлю варианты.",
                created_at=now - timedelta(minutes=40),
            ),
        ],
        insights=ConversationInsights(
            tone_label=tone_label,
            urgency_label=urgency_label,
            responsiveness_pattern=responsiveness_pattern,
            next_contact_due_at=next_contact_due_at,
            preferred_follow_up_channel=preferred_follow_up_channel,
            preferred_follow_up_format=preferred_follow_up_format,
            interest_tags=interest_tags or [],
            objection_tags=objection_tags or [],
            mentioned_product_codes=mentioned_product_codes or [],
            action_hints=action_hints or [],
        ),
    )


def test_due_contact_within_two_hours_increases_score():
    service = DialogPriorityService()
    now = datetime(2026, 3, 16, 12, 0, tzinfo=UTC)
    client = build_client(cash_balance=500_000, portfolio_value=10_000_000)

    urgent_conversation = build_conversation(now, next_contact_due_at=now + timedelta(hours=1))
    delayed_conversation = build_conversation(now, next_contact_due_at=now + timedelta(days=5))

    urgent_recommendation = service.build_recommendation(client, urgent_conversation, now=now)
    delayed_recommendation = service.build_recommendation(client, delayed_conversation, now=now)

    assert urgent_recommendation.factor_breakdown.t_wait == 1.0
    assert urgent_recommendation.priority_score > delayed_recommendation.priority_score


def test_speed_sensitive_high_urgency_is_at_least_high_priority():
    service = DialogPriorityService()
    now = datetime(2026, 3, 16, 12, 0, tzinfo=UTC)
    client = build_client(cash_balance=1_500_000, portfolio_value=28_000_000)
    conversation = build_conversation(
        now,
        urgency_label="high",
        tone_label="tense",
        responsiveness_pattern="speed_sensitive",
        next_contact_due_at=now + timedelta(hours=1),
    )

    recommendation = service.build_recommendation(client, conversation, now=now)

    assert recommendation.priority_label in {"high", "urgent"}


def test_high_cash_and_interest_raise_p_sale():
    service = DialogPriorityService()
    now = datetime(2026, 3, 16, 12, 0, tzinfo=UTC)
    client = build_client(cash_balance=2_000_000, portfolio_value=12_000_000)
    baseline_conversation = build_conversation(now, preferred_follow_up_format="short")
    sales_conversation = build_conversation(
        now,
        preferred_follow_up_format="comparison",
        interest_tags=["investments"],
        mentioned_product_codes=["p2"],
    )

    baseline = service.build_recommendation(client, baseline_conversation, now=now)
    enhanced = service.build_recommendation(client, sales_conversation, now=now)

    assert enhanced.factor_breakdown.p_sale > baseline.factor_breakdown.p_sale


def test_high_churn_with_avoid_pressure_uses_soft_follow_up():
    service = DialogPriorityService()
    now = datetime(2026, 3, 16, 12, 0, tzinfo=UTC)
    client = build_client(cash_balance=300_000, portfolio_value=6_000_000, churn_risk="high")
    conversation = build_conversation(
        now,
        preferred_follow_up_format="short",
        action_hints=["avoid_pressure"],
        objection_tags=["no_long_messages"],
    )

    recommendation = service.build_recommendation(client, conversation, now=now)

    assert recommendation.next_best_action == "Сделать мягкий follow-up"
