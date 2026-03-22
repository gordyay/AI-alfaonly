# Alfa Only Assistant

Учебный MVP AI-ассистента для персонального менеджера Alfa Only. Прототип показывает рабочее место менеджера с explainable-приоритизацией кейсов, case-scoped AI-подсказками, CRM-контуром и supervisor-сводкой по использованию рекомендаций.

## Что показывает прототип

1. Менеджер открывает очередь кейсов на день.
2. Система ранжирует кейсы и объясняет, почему именно они важны.
3. По выбранному `work_item` менеджер получает следующий шаг, скрипт, objection workflow и CRM-черновик.
4. Решение менеджера фиксируется отдельно от сохранения CRM-заметки.
5. Supervisor dashboard показывает adoption и качество использования рекомендаций.

## Стек

- Backend: FastAPI, Pydantic v2, SQLite.
- Frontend: React 19, TypeScript, Vite.
- Тесты: pytest, Playwright.
- AI-слой: summary, CRM draft, sales script, objection workflow, assistant chat.

## Структура проекта

```text
app/
  main.py              сборка FastAPI-приложения
  runtime.py           wiring сервисов и runtime-контекст приложения
  cases.py             case-scoped helpers для client/ai/crm flow
  db.py                SQLite storage и seed-friendly access layer
  models.py            Pydantic-модели домена и API
  seed_data.py         demo dataset
  services/            cockpit, assistant, summary, scripts, objections, supervisor
  routers/             system, cockpit, client, assistant, ai, crm, supervisor
  static/              production build frontend
frontend/
  src/                 React UI
scripts/
  check_env.py         проверка готовности окружения
  reset_db.py          пересборка seeded SQLite
  run_demo.sh          канонический запуск demo-сервера
  run_e2e_server.sh    изолированный сервер для Playwright
tests/
  test_stage1_api.py
  test_assistant_api.py
  e2e/
```

## Канонический запуск

Проект должен запускаться из локального virtualenv `.venv`. Критичные сценарии не должны использовать случайный системный `python3`.

### 1. Подготовка окружения

```bash
make bootstrap
npm install
```

`make bootstrap`:

- создаёт `.venv`;
- ставит Python-зависимости;
- пересобирает seeded БД.

### 2. Сборка frontend

```bash
make frontend-build
```

Vite складывает production bundle в `app/static/`, а FastAPI раздаёт его по `/static/...`.
Если bundle ещё не собран, backend всё равно поднимет API: `/static` не будет смонтирован, а `/health` вернёт warning про отсутствие frontend.

### 3. Проверка готовности перед демо

```bash
make demo-check
```

Проверка валидирует:

- запуск через `.venv/bin/python`;
- наличие Pydantic v2;
- наличие pinned frontend dependencies;
- наличие production bundle в `app/static/index.html`.

### 4. Запуск demo

```bash
make demo
```

Этот сценарий:

1. проверяет окружение;
2. пересобирает demo-базу;
3. запускает `uvicorn` на `127.0.0.1:8000`.

После старта:

- UI: `http://127.0.0.1:8000/`
- Swagger: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`

## Режим разработки

### Backend

```bash
make reset-db
make run
```

### Frontend dev server

```bash
make frontend-dev
```

Vite проксирует `health`, `cockpit`, `client`, `assistant`, `ai`, `crm-note` и `feedback` на backend.

## Тесты

### Быстрый backend-прогон

```bash
make test
```

### E2E

```bash
make frontend-build
make test-e2e
```

Playwright не зависит от вручную поднятого backend. Он использует отдельный seeded server через `scripts/run_e2e_server.sh`.

### Полный прогон

```bash
make test-all
```

## Основные API

- `GET /health`
- `GET /cockpit?manager_id=...`
- `GET /client/{client_id}?work_item_id=...`
- `GET /client/{client_id}/propensity`
- `GET /propensity/clients?manager_id=...&product_id=...`
- `GET /supervisor/dashboard?manager_id=...`
- `POST /assistant/chat`
- `POST /ai/summarize-dialog`
- `POST /ai/generate-script`
- `POST /ai/objection-workflow`
- `POST /feedback`
- `POST /crm-note`

## Env-переменные

Базовый вариант:

```bash
cp .env.example .env
set -a
source .env
set +a
```

Ключевые переменные:

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

## Ограничения прототипа

- Используются mock-данные и seeded SQLite.
- Внешние банковские системы не подключены.
- AI-контур не отправляет сообщения клиенту автоматически.
- Production vision отделён от MVP: прототип показывает интерфейс, поток и объяснимость, а не интеграцию в реальный контур банка.
