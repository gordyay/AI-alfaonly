"""Действия менеджера (FR8/FR6/FR9/FR11): отправка, обратная связь, заметка,
история ассистента — с проверкой персистентности и влияния на «обработано»."""


def _first_unhandled(client, with_conversation=False):
    items = client.get("/api/queue?managerId=m1").json()["items"]
    for i in items:
        if i["handled"]:
            continue
        if with_conversation and not i["conversationId"]:
            continue
        return i
    raise AssertionError("нет подходящего необработанного кейса")


def test_send_marks_handled_and_appends_message(client):
    item = _first_unhandled(client, with_conversation=True)
    wid = item["id"]
    before = len(client.get(f"/api/cases/{wid}").json()["context"]["messages"])
    r = client.post(f"/api/cases/{wid}/send", json={"text": "Здравствуйте, на связи."})
    assert r.status_code == 200 and r.json()["ok"] is True
    detail = client.get(f"/api/cases/{wid}").json()
    assert len(detail["context"]["messages"]) == before + 1
    assert detail["handled"] is True


def test_feedback_marks_handled(client):
    item = _first_unhandled(client)
    client.post(
        "/api/feedback",
        json={"recommendationId": item["recommendationId"], "decision": "accepted", "label": "t", "managerId": "m1"},
    )
    items = client.get("/api/queue?managerId=m1").json()["items"]
    assert next(i for i in items if i["id"] == item["id"])["handled"] is True


def test_feedback_increases_supervisor_usage(client):
    before = client.get("/api/supervisor").json()["decided"]
    # task-18 нет в сид-обратной связи → новое решение
    client.post(
        "/api/feedback",
        json={"recommendationId": "rec:task:task-18", "decision": "accepted", "label": "t", "managerId": "m1"},
    )
    after = client.get("/api/supervisor").json()["decided"]
    assert after == before + 1


def test_crm_draft_rejection_not_counted_in_metrics(client):
    before = client.get("/api/supervisor").json()["decided"]
    client.post(
        "/api/feedback",
        json={
            "recommendationId": "rec:task:task-18:crm-draft",
            "decision": "rejected",
            "label": "t",
            "kind": "crm_draft",
            "managerId": "m1",
        },
    )
    after = client.get("/api/supervisor").json()["decided"]
    assert after == before  # отклонение черновика CRM не входит в метрики решений


def test_note_persists(client):
    wid = client.get("/api/queue?managerId=m1").json()["items"][0]["id"]
    d = client.get(f"/api/cases/{wid}").json()
    before = len(d["notes"])
    client.post(
        "/api/notes",
        json={
            "clientId": d["item"]["clientId"],
            "text": "Договорились вернуться через неделю.",
            "channel": "chat",
            "nextContactIso": "2026-06-23T09:00:00+03:00",
        },
    )
    after = len(client.get(f"/api/cases/{wid}").json()["notes"])
    assert after == before + 1


def test_chat_history_persists_with_sources(client):
    wid = client.get("/api/queue?managerId=m1").json()["items"][0]["id"]
    r = client.post(f"/api/cases/{wid}/chat", json={"question": "что предложить этому клиенту?"})
    assert len(r.json()["turns"]) == 2
    detail = client.get(f"/api/cases/{wid}").json()
    assert len(detail["chatHistory"]) == 2
    assert detail["chatHistory"][1]["role"] == "assistant"
    assert detail["chatHistory"][1]["sources"]


def test_saved_decision_reflected_in_detail(client):
    item = _first_unhandled(client)
    client.post(
        "/api/feedback",
        json={"recommendationId": item["recommendationId"], "decision": "edited", "comment": "мягче", "label": "t", "managerId": "m1"},
    )
    assert client.get(f"/api/cases/{item['id']}").json()["savedDecision"] == "edited"
