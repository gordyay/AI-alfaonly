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
    assert 'Alfa Only Manager Cockpit' in response.text


@pytest.mark.anyio
async def test_clients_list(client: AsyncClient):
    response = await client.get('/clients?manager_id=m1')
    assert response.status_code == 200
    body = response.json()
    assert len(body['items']) >= 1


@pytest.mark.anyio
async def test_tasks_list_returns_seeded_manager_tasks(client: AsyncClient):
    response = await client.get('/tasks?manager_id=m1')
    assert response.status_code == 200
    items = response.json()['items']
    assert len(items) >= 3
    assert {'business_goal', 'linked_conversation_id', 'task_type', 'status'}.issubset(items[0].keys())


@pytest.mark.anyio
async def test_cockpit_returns_unified_work_queue(client: AsyncClient):
    response = await client.get('/cockpit?manager_id=m1')
    assert response.status_code == 200
    body = response.json()
    assert body['manager_id'] == 'm1'
    assert body['focus_item'] is not None
    assert body['sections']
    assert {'actionable_items', 'urgent_items', 'due_today_items', 'opportunity_items', 'clients_in_focus'}.issubset(
        body['stats'].keys()
    )
    item_types = {item['item_type'] for item in body['work_queue']}
    assert {'task', 'communication', 'opportunity'}.issubset(item_types)
    first_item = body['work_queue'][0]
    assert {'expected_benefit', 'recommendation_status', 'factor_breakdown'}.issubset(first_item.keys())
    assert {'urgency', 'client_value', 'engagement', 'commercial_potential', 'churn_risk', 'ai_context'}.issubset(
        first_item['factor_breakdown'].keys()
    )


@pytest.mark.anyio
async def test_client_propensity_endpoint_returns_ranked_products(client: AsyncClient):
    response = await client.get('/client/c1/propensity')
    assert response.status_code == 200
    body = response.json()
    assert body['client_id'] == 'c1'
    assert len(body['items']) >= 3
    assert {'product_name', 'score', 'fit_label', 'reasons', 'data_gaps', 'factors'}.issubset(body['items'][0].keys())


@pytest.mark.anyio
async def test_product_plan_endpoint_returns_clients_for_product(client: AsyncClient):
    response = await client.get('/propensity/clients?manager_id=m1&product_id=p3')
    assert response.status_code == 200
    body = response.json()
    assert body['manager_id'] == 'm1'
    assert body['product_id'] == 'p3'
    assert body['items']


@pytest.mark.anyio
async def test_objection_workflow_endpoint_returns_playbook(client: AsyncClient):
    response = await client.post(
        '/ai/objection-workflow',
        json={
            'client_id': 'c2',
            'conversation_id': 'conv2',
            'manager_id': 'm1',
            'objection_text': 'Не хочу избыточный риск',
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body['draft']['analysis']['objection_type'] in {'risk', 'other'}
    assert len(body['draft']['handling_options']) >= 2
    assert body['draft']['what_not_to_say']


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
    assert body['work_items']
    assert body['generated_artifacts'] is not None
    assert body['product_propensity']['items']
    assert body['objection_workflow']['draft']['handling_options']
    assert 'recommendation_feedback' in body
    assert 'activity_log' in body
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
async def test_client_detail_can_be_scoped_to_specific_work_item(client: AsyncClient):
    investment_case = await client.get('/client/c1?work_item_id=task:task-2')
    assert investment_case.status_code == 200
    investment_body = investment_case.json()
    assert investment_body['selected_work_item_id'] == 'task:task-2'
    assert investment_body['selected_conversation_id'] == 'conv1'

    service_case = await client.get('/client/c1?work_item_id=task:task-9')
    assert service_case.status_code == 200
    service_body = service_case.json()
    assert service_body['selected_work_item_id'] == 'task:task-9'
    assert service_body['selected_conversation_id'] == 'conv1b'
    assert service_body['selected_conversation_id'] != investment_body['selected_conversation_id']


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
        'recommendation_id': 'rec:communication:conv1',
        'manager_id': 'm1',
        'recommendation_type': 'manager_work_item',
        'client_id': 'c1',
        'conversation_id': 'conv1',
        'decision': 'accepted',
        'comment': 'Ок',
    }
    response = await client.post('/feedback', json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body['feedback']['decision'] == 'accepted'

    detail_response = await client.get('/client/c1?work_item_id=task:task-2')
    detail = detail_response.json()
    assert any(item['recommendation_id'] == 'rec:communication:conv1' for item in detail['recommendation_feedback'])
    assert any(item['action'] == 'decision_recorded' for item in detail['activity_log'])


@pytest.mark.anyio
async def test_crm_note_can_close_feedback_loop(client: AsyncClient):
    payload = {
        'client_id': 'c1',
        'manager_id': 'm1',
        'recommendation_id': 'rec:communication:conv1',
        'recommendation_decision': 'edited',
        'decision_comment': 'Нужен более мягкий follow-up, чем в базовой рекомендации.',
        'note_text': 'Подготовить более мягкий follow-up и вернуться с кратким сравнением.',
        'outcome': 'follow_up',
        'source_conversation_id': 'conv1',
    }
    response = await client.post('/crm-note', json=payload)
    assert response.status_code == 200
    created = response.json()['crm_note']
    assert created['recommendation_id'] == 'rec:communication:conv1'
    assert created['recommendation_decision'] == 'edited'

    detail_response = await client.get('/client/c1?work_item_id=task:task-2')
    detail = detail_response.json()
    assert any(item['recommendation_id'] == 'rec:communication:conv1' for item in detail['recommendation_feedback'])
    assert detail['crm_notes'][0]['recommendation_id'] == 'rec:communication:conv1'


@pytest.mark.anyio
async def test_supervisor_dashboard_returns_metrics(client: AsyncClient):
    feedback_response = await client.post(
        '/feedback',
        json={
            'recommendation_id': 'rec:communication:conv1',
            'manager_id': 'm1',
            'recommendation_type': 'manager_work_item',
            'client_id': 'c1',
            'conversation_id': 'conv1',
            'decision': 'accepted',
            'comment': 'Беру в работу.',
        },
    )
    assert feedback_response.status_code == 200

    response = await client.get('/supervisor/dashboard?manager_id=m1')
    assert response.status_code == 200
    body = response.json()
    assert body['manager_id'] == 'm1'
    assert len(body['cards']) >= 4
    assert 'decision_breakdown' in body
    assert 'recent_decisions' in body
