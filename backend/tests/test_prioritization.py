"""Приоритизация §6.2: корректность шкал, уровней, округления и ПАРИТЕТ с
фронтендом (известные итоговые баллы)."""

import pytest

from app.domain.clock import js_round
from app.domain.prioritization import (
    PRIORITY_WEIGHTS,
    build_value_scale,
    compute_priority,
    priority_level,
)
from app.domain.workqueue import build_work_queue


def test_weights_sum_to_one():
    assert round(sum(PRIORITY_WEIGHTS.values()), 6) == 1.0


@pytest.mark.parametrize(
    "score,level",
    [(100, "high"), (70, "high"), (69, "medium"), (40, "medium"), (39, "low"), (0, "low")],
)
def test_priority_levels(score, level):
    assert priority_level(score) == level


@pytest.mark.parametrize("x,expected", [(2.5, 3), (2.4, 2), (0.5, 1), (99.5, 100), (3.0, 3), (0.49, 0)])
def test_js_round_half_up(x, expected):
    # JS Math.round округляет .5 вверх — критично для паритета баллов.
    assert js_round(x) == expected


def test_queue_parity_m1(db):
    q = build_work_queue("m1")
    assert len(q) == 13
    totals = [i["priority"]["total"] for i in q]
    # Очередь отсортирована по убыванию; топ-6 совпадает с фронтендом.
    assert totals[:6] == [76, 76, 76, 74, 73, 63]


def test_queue_parity_m2(db):
    q = build_work_queue("m2")
    assert len(q) == 7
    assert q[0]["priority"]["total"] == 80


def test_high_priority_count_m1(db):
    q = build_work_queue("m1")
    highs = [i for i in q if i["priority"]["level"] == "high"]
    assert len(highs) == 5


def test_value_scale_monotonic(db):
    clients = db.get_clients_by_manager("m1")
    scale = build_value_scale(clients)
    assert scale["q1"] <= scale["median"] <= scale["q3"]


def test_total_equals_sum_of_contributions(db):
    q = build_work_queue("m1")
    for item in q:
        factors = item["priority"]["factors"]
        assert item["priority"]["total"] == js_round(sum(f["contribution"] for f in factors))
        assert len(factors) == 5


def test_reasons_are_top_contributors(db):
    q = build_work_queue("m1")
    item = q[0]
    factors = sorted(item["priority"]["factors"], key=lambda f: f["contribution"], reverse=True)
    top_nonzero = [f["reason"] for f in factors if f["score"] > 0][:3]
    assert item["priority"]["reasons"] == top_nonzero


def test_force_majeure_urgency():
    # Форс-мажор в тексте обращения даёт максимум срочности.
    client = {"aum": 1, "churnRisk": "low", "liquidBalance": 0, "tags": [], "note": "x"}
    scale = {"q1": 0, "median": 0, "q3": 0}
    p = compute_priority(
        client=client, insight=None, task=None, value_scale=scale,
        waiting_minutes=0, due_at_iso="2999-01-01T00:00:00+00:00",
        last_incoming_text="Заблокировали карту, возможно мошенники!",
    )
    urgency = next(f for f in p["factors"] if f["key"] == "urgency")
    assert urgency["score"] == 100
