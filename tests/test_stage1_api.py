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
async def test_client_card_found(client: AsyncClient):
    response = await client.get('/client/c1')
    assert response.status_code == 200
    body = response.json()
    assert body['client']['id'] == 'c1'


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
