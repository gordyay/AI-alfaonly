import pytest
from httpx import ASGITransport, AsyncClient

from app.db import SQLiteStorage
from app.main import create_app
from app.seed_data import seed_mvp_data


@pytest.fixture
async def client(tmp_path):
    db_path = tmp_path / "stage1-test.sqlite3"
    storage = SQLiteStorage(db_path=db_path)
    seed_mvp_data(storage)
    app = create_app(db_path=db_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


@pytest.mark.anyio
async def test_health(client: AsyncClient):
    response = await client.get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert body['storage'] == 'sqlite'


@pytest.mark.anyio
async def test_frontend_index(client: AsyncClient):
    response = await client.get('/')
    assert response.status_code == 200
    assert 'Alfa Only Assistant MVP' in response.text


@pytest.mark.anyio
async def test_clients_list(client: AsyncClient):
    response = await client.get('/clients?manager_id=m1')
    assert response.status_code == 200
    body = response.json()
    assert len(body['items']) >= 1


@pytest.mark.anyio
async def test_dialogs_feed(client: AsyncClient):
    response = await client.get('/dialogs?manager_id=m1')
    assert response.status_code == 200
    body = response.json()
    assert len(body['items']) >= 1
    first_item = body['items'][0]
    assert set(
        [
            'client_id',
            'conversation_id',
            'client_name',
            'last_message_preview',
            'last_message_at',
            'mini_summary',
            'priority_score',
            'priority_label',
            'why',
            'next_best_action',
            'factor_breakdown',
        ]
    ).issubset(first_item.keys())
    scores = [item['priority_score'] for item in body['items']]
    assert scores == sorted(scores, reverse=True)
    assert first_item['why']
    assert first_item['next_best_action']
    assert set(['t_wait', 'c_value', 'u_comm', 'p_sale', 'r_churn']).issubset(first_item['factor_breakdown'].keys())


@pytest.mark.anyio
async def test_dialogs_feed_can_sort_by_last_message(client: AsyncClient):
    response = await client.get('/dialogs?manager_id=m1&sort_by=last_message')
    assert response.status_code == 200
    items = response.json()['items']
    assert len(items) >= 2
    last_message_timestamps = [item['last_message_at'] for item in items]
    assert last_message_timestamps == sorted(last_message_timestamps, reverse=True)


@pytest.mark.anyio
async def test_client_card_found(client: AsyncClient):
    response = await client.get('/client/c1')
    assert response.status_code == 200
    body = response.json()
    assert body['client']['id'] == 'c1'
    assert body['dialog_recommendation'] is not None
    assert body['dialog_recommendation']['client_id'] == 'c1'
    assert body['conversations']
    conversation = body['conversations'][0]
    assert len(conversation['messages']) >= 7
    assert 'insights' in conversation
    assert conversation['insights'] is not None
    assert set(
        [
            'tone_label',
            'urgency_label',
            'responsiveness_pattern',
            'client_response_avg_minutes',
            'manager_response_avg_minutes',
            'next_contact_due_at',
            'next_contact_reason',
            'preferred_follow_up_channel',
            'preferred_follow_up_format',
            'interest_tags',
            'objection_tags',
            'mentioned_product_codes',
            'action_hints',
        ]
    ).issubset(conversation['insights'].keys())
    assert conversation['insights']['next_contact_due_at'] is not None
    assert conversation['insights']['objection_tags']


@pytest.mark.anyio
async def test_seeded_conversation_signals(client: AsyncClient):
    speed_sensitive_found = False
    next_contact_found = False
    objection_tags_found = False

    response = await client.get('/clients?manager_id=m1')
    assert response.status_code == 200
    clients = response.json()['items']

    for client_item in clients:
        detail_response = await client.get(f"/client/{client_item['id']}")
        assert detail_response.status_code == 200
        detail = detail_response.json()
        for conversation in detail['conversations']:
            insights = conversation.get('insights') or {}
            if insights.get('responsiveness_pattern') == 'speed_sensitive':
                speed_sensitive_found = True
            if insights.get('next_contact_due_at'):
                next_contact_found = True
            if insights.get('objection_tags'):
                objection_tags_found = True

    assert speed_sensitive_found is True
    assert next_contact_found is True
    assert objection_tags_found is True


@pytest.mark.anyio
async def test_create_crm_note(client: AsyncClient):
    payload = {
        'client_id': 'c1',
        'note_text': 'Клиент заинтересован, договорились вернуться с оффером.',
        'outcome': 'follow_up',
    }
    response = await client.post('/crm-note', json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body['crm_note']['client_id'] == 'c1'


@pytest.mark.anyio
async def test_feedback(client: AsyncClient):
    payload = {
        'recommendation_id': 'rec-1',
        'manager_id': 'm1',
        'decision': 'accepted',
        'comment': 'Ок',
    }
    response = await client.post('/feedback', json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body['feedback']['decision'] == 'accepted'
