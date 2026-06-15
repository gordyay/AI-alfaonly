"""Программный интерфейс (REST API): статусы, формы ответов, валидация."""

import pytest


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["aiProvider"] == "deterministic"


def test_managers(client):
    r = client.get("/api/managers")
    assert r.status_code == 200
    assert len(r.json()["managers"]) == 2


def test_clients_and_products(client):
    assert len(client.get("/api/clients").json()["clients"]) == 15
    assert len(client.get("/api/products").json()["products"]) == 5


@pytest.mark.parametrize("manager,count", [("m1", 13), ("m2", 7)])
def test_queue(client, manager, count):
    r = client.get(f"/api/queue?managerId={manager}")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == count
    assert all("handled" in i for i in items)
    # очередь отсортирована по убыванию приоритета
    totals = [i["priority"]["total"] for i in items]
    assert totals == sorted(totals, reverse=True)


def test_queue_handled_flags(client):
    items = client.get("/api/queue?managerId=m1").json()["items"]
    assert sum(1 for i in items if i["handled"]) == 4  # 4 кейса с сид-обратной связью


def test_case_detail_shape(client):
    wid = client.get("/api/queue?managerId=m1").json()["items"][0]["id"]
    d = client.get(f"/api/cases/{wid}").json()
    for key in ("item", "context", "propensities", "notes", "savedDecision", "chatHistory", "handled"):
        assert key in d
    assert len(d["propensities"]) == 5
    ctx = d["context"]
    for key in ("client", "messages", "relevantProducts", "ownedProducts", "nextBestAction"):
        assert key in ctx


def test_case_404(client):
    assert client.get("/api/cases/wi:nonexistent").status_code == 404


def test_ai_reply(client):
    wid = client.get("/api/queue?managerId=m1").json()["items"][0]["id"]
    r = client.post(f"/api/cases/{wid}/reply-draft")
    assert r.status_code == 200
    body = r.json()
    assert body["text"] and body["rationale"] and body["sources"]


def test_ai_script_variants(client):
    wid = client.get("/api/queue?managerId=m1").json()["items"][0]["id"]
    r = client.post(f"/api/cases/{wid}/script", json={"goal": "предложить размещение"})
    assert r.status_code == 200
    labels = [v["label"] for v in r.json()["variants"]]
    assert labels[:3] == ["Структурный", "Мягкий", "Короткий"]


def test_ai_script_instruction_adds_variant(client):
    wid = client.get("/api/queue?managerId=m1").json()["items"][0]["id"]
    r = client.post(f"/api/cases/{wid}/script", json={"goal": "x", "instruction": "сделай короче"})
    labels = [v["label"] for v in r.json()["variants"]]
    assert "По вашей правке" in labels


@pytest.mark.parametrize("text,expected", [("это слишком дорого", "цена/комиссии"), ("я опасаюсь риска", "риск")])
def test_ai_objection_type(client, text, expected):
    wid = client.get("/api/queue?managerId=m1").json()["items"][0]["id"]
    r = client.post(f"/api/cases/{wid}/objection", json={"text": text})
    assert r.json()["objectionType"] == expected


def test_ai_objection_empty_rejected(client):
    wid = client.get("/api/queue?managerId=m1").json()["items"][0]["id"]
    assert client.post(f"/api/cases/{wid}/objection", json={"text": ""}).status_code == 422


def test_ai_summary(client):
    wid = client.get("/api/queue?managerId=m1").json()["items"][0]["id"]
    r = client.post(f"/api/cases/{wid}/summary")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"] and body["crmDraft"] and body["nextStep"]


def test_invalid_decision_rejected(client):
    # Literal-перечисление: посторонний decision не принимается (целостность метрик).
    r = client.post(
        "/api/feedback",
        json={"recommendationId": "rec:task:task-1", "decision": "maybe", "label": "t", "managerId": "m1"},
    )
    assert r.status_code == 422


def test_oversized_note_rejected(client):
    cid = client.get("/api/clients").json()["clients"][0]["id"]
    r = client.post(
        "/api/notes",
        json={"clientId": cid, "text": "A" * 5000, "channel": "chat", "nextContactIso": "2026-06-17T09:00:00+03:00"},
    )
    assert r.status_code == 422  # max_length=4000


def test_products_ranking(client):
    pid = client.get("/api/products").json()["products"][0]["id"]
    ranked = client.get(f"/api/products/{pid}/ranking?managerId=m1").json()["ranked"]
    assert ranked[0]["score"]["total"] == 77


def test_supervisor_seed_metrics(client):
    m = client.get("/api/supervisor").json()
    assert m["totalRecommendations"] == 20  # m1(13) + m2(7)
    assert m["decided"] == 7
    assert m["usageRate"] == 35
    assert len(m["byManager"]) == 2
