# Alfa Only Assistant

Учебный MVP AI-ассистента для персонального менеджера Alfa Only.  
Проект собран вокруг одного основного сценария: менеджер открывает daily cockpit, выбирает кейс, получает explainable recommendation, фиксирует решение, готовит CRM-артефакт и закрывает feedback loop.

## Что внутри

- FastAPI backend.
- React + TypeScript + Vite frontend.
- SQLite storage с seeded demo-данными.
- AI-слой для summary, CRM draft, sales scripts и objection workflow.
- Supervisor dashboard для adoption и impact-метрик.
- Playwright smoke/e2e для demo-critical user path.

## Основной сценарий

1. Менеджер открывает cockpit и видит единую очередь задач, коммуникаций и opportunity.
2. Выбирает work item и получает клиентский контекст, объяснение приоритета и `next best action`.
3. При необходимости использует copilot для summary, CRM note, script generation или objection handling.
4. Фиксирует решение по рекомендации: `accepted`, `revised` или `rejected`.
5. Сохраняет CRM-заметку и оставляет trace в audit trail.
6. Supervisor panel показывает, как используется AI и где теряется adoption.

## Интерфейс

SPA состоит из трех рабочих колонок:

- слева: queue manager cockpit с поиском и фильтрацией;
- по центру: focus panel по выбранному кейсу;
- справа: assistant panel с историей и quick actions.

Над focus panel есть `JourneyBar`, который держит основной путь в одном месте:

- выбрать кейс;
- зафиксировать решение;
- подготовить артефакт;
- закрыть feedback loop.

## Возможности

### Cockpit

- `GET /cockpit`
- unified queue с explainable prioritization
- `expected_benefit`
- `recommendation_status`
- manager-first daily plan

### Client workspace

- карточка клиента, диалоги, CRM notes и follow-ups
- generated artifacts
- activity log
- recommendation feedback history

### Product propensity

- `GET /client/{id}/propensity`
- `GET /propensity/clients?manager_id=...&product_id=...`
- ranking продуктов
- причины, data gaps и next best action

### AI copilot

- summary диалога
- CRM draft
- sales scripts
- objection workflow
- free-text assistant chat

Ассистент использует только внутренний контекст системы: профиль клиента, портфель, conversation insights, рекомендации, CRM notes и manager-level snapshots.

### Feedback loop и supervisor view

- решение менеджера по рекомендации
- комментарий к решению
- связка recommendation -> CRM note -> activity log
- supervisor dashboard с adoption/usage/coverage метриками

## Архитектура

### Backend

- [app/main.py](/Users/arkadiystena/pet-projects/Курсач-альфа/ai-prototype/app/main.py) поднимает FastAPI-приложение и HTTP API.
- [app/config.py](/Users/arkadiystena/pet-projects/Курсач-альфа/ai-prototype/app/config.py) хранит `AppSettings` и `FeatureFlags`.
- [app/db.py](/Users/arkadiystena/pet-projects/Курсач-альфа/ai-prototype/app/db.py) отвечает за SQLite storage.
- `app/services/*` содержит orchestration-слой: cockpit, propensity, assistant, objections, supervisor.

### Frontend

- [frontend/src/App.tsx](/Users/arkadiystena/pet-projects/Курсач-альфа/ai-prototype/frontend/src/App.tsx) собирает основной workspace.
- `frontend/src/components/*` содержит отдельные UI-блоки.
- production build публикуется в `app/static/` и отдается FastAPI.

### Конфигурация

Приложение читает настройки из env:

- `APP_DB_PATH`
- `APP_TITLE`
- `APP_VERSION`
- `APP_STAGE_LABEL`
- `FEATURE_SUPERVISOR_DASHBOARD`
- `FEATURE_ASSISTANT_PANEL`
- `FEATURE_FEEDBACK_LOOP`
- `FEATURE_PROPENSITY_MODULE`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GROQ_FAST_MODEL`

`GET /health` возвращает:

- `status`
- `stage`
- `storage`
- `version`
- `feature_flags`

## Быстрый старт

### Вариант через Makefile

```bash
make bootstrap
make frontend-install
make frontend-build
make run
```

### Ручной запуск

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
python3 scripts/reset_db.py
npm run build
uvicorn app.main:app --reload
```

После запуска:

- app: `http://127.0.0.1:8000/`
- swagger: `http://127.0.0.1:8000/docs`

### Frontend dev server

```bash
make frontend-dev
```

## Переменные окружения

Минимальный пример:

```bash
export GROQ_API_KEY=replace_with_your_groq_key
export GROQ_MODEL=llama-3.1-8b-instant
export GROQ_FAST_MODEL=llama-3.1-8b-instant
export FEATURE_SUPERVISOR_DASHBOARD=true
export FEATURE_ASSISTANT_PANEL=true
export FEATURE_FEEDBACK_LOOP=true
export FEATURE_PROPENSITY_MODULE=true
uvicorn app.main:app --reload
```

Вариант через `.env`:

```bash
cp .env.example .env
set -a
source .env
set +a
uvicorn app.main:app --reload
```

## Основные API

- `GET /health`
- `GET /cockpit?manager_id=...`
- `GET /tasks?manager_id=...&status=...`
- `GET /clients?manager_id=...`
- `GET /dialogs?manager_id=...&sort_by=priority|last_message`
- `GET /client/{client_id}`
- `GET /client/{client_id}/activity-log`
- `GET /client/{client_id}/propensity`
- `GET /propensity/clients?manager_id=...&product_id=...`
- `GET /supervisor/dashboard?manager_id=...`
- `GET /assistant/threads?manager_id=...`
- `POST /assistant/threads`
- `GET /assistant/threads/{thread_id}`
- `POST /assistant/chat`
- `POST /ai/summarize-dialog`
- `POST /ai/generate-script`
- `POST /ai/objection-workflow`
- `POST /crm-note`
- `POST /feedback`

## Тесты

Быстрые проверки:

```bash
make test
npm run build
python3 -m compileall app
```

Smoke/e2e:

```bash
make test-e2e
```

Полный прогон:

```bash
make test-all
```

`make test-all` запускает:

1. `pytest -q`
2. `npm run build`
3. `npm run test:e2e`

Playwright поднимает отдельный seeded server через [scripts/run_e2e_server.sh](/Users/arkadiystena/pet-projects/Курсач-альфа/ai-prototype/scripts/run_e2e_server.sh) на изолированном порту, поэтому тесты не зависят от локально запущенного `uvicorn`.

## Ограничения текущей версии

- Knowledge base построена только на внутренних данных приложения.
- Внешние документы и file upload не подключены.
- Vector search / RAG отдельным стором не используются.
- Feature flags сейчас управляют runtime-поведением, а не отдельными сборками UI.

## Структура проекта

```text
app/
  ai/
  services/
  static/
frontend/
  src/
scripts/
tests/
```

## Локальная разработка

- seeded data пересобираются через `python3 scripts/reset_db.py`;
- backend и frontend можно разрабатывать независимо;
- production-like фронтенд всегда собирается в `app/static/`;
- если меняется demo-flow, нужно обновлять Playwright smoke в `tests/e2e/`.
