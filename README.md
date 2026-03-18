# Alfa Only Assistant — MVP Stage 6

Учебный MVP AI-ассистента для персонального менеджера Alfa Only.  
Текущий фокус проекта: **dialogs-first workflow**, rule-based priority, explainability, Groq summary, черновик CRM-заметки, **плавающий AI-ассистент с историей и базой знаний** и **sales scripts внутри assistant-widget**.

## Что уже реализовано

- FastAPI backend + статический frontend без отдельного SPA build-step.
- SQLite-хранилище с reset/seed-скриптом.
- Реалистичные seeded диалоги и `conversation insights`.
- Rule-based приоритизация диалогов:
  - `priority_score`
  - `priority_label`
  - `why[]`
  - `next_best_action`
  - `factor_breakdown`
- Ручной AI-flow через Groq:
  - генерация мини-сводки диалога
  - генерация черновика CRM-заметки
  - ручное редактирование
  - сохранение в CRM
- Human-in-the-loop: AI ничего не отправляет клиенту автоматически.
- Audit/recommendation log:
  - генерация мини-сводки
  - генерация CRM draft
  - ошибки AI-вызова
  - сохранение CRM-заметки
- Floating Assistant:
  - глобальный assistant-widget для текущего менеджера
  - история прошлых диалогов с ассистентом
  - quick actions для summary / CRM note / sales scripts / Q&A
  - knowledge base из внутренних системных данных
- Sales Scripts:
  - генерация только внутри floating assistant
  - quick actions и free-text intent detection
  - результат в формате `тезисы + готовый текст`
  - сохранение structured payload в истории assistant thread

## Текущий пользовательский сценарий

1. Менеджер открывает список диалогов.
2. Выбирает клиента и видит чат.
3. Смотрит `priority`, объяснение и `next best action`.
4. Генерирует мини-сводку.
5. Генерирует CRM-заметку.
6. Редактирует поля вручную.
7. Сохраняет результат.
8. Обновляет страницу и видит, что мини-сводка и CRM draft сохранены.
9. При необходимости открывает плавающего ассистента, задает вопрос по клиенту или по всей очереди диалогов.
10. Просит ассистента подготовить sales script и получает готовый ответ прямо внутри assistant history.

## Локальный запуск

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python scripts/reset_db.py
uvicorn app.main:app --reload
```

Frontend MVP:
- `http://127.0.0.1:8000/`

Swagger UI:
- `http://127.0.0.1:8000/docs`

## Настройка Groq

Приложение читает настройки **только из переменных окружения**.

Простой вариант:

```bash
export GROQ_API_KEY=your_key_here
export GROQ_MODEL=llama-3.1-8b-instant
export GROQ_FAST_MODEL=llama-3.1-8b-instant
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

- `GET /health` — состояние сервиса.
- `GET /clients?manager_id=...` — список клиентов.
- `GET /dialogs?manager_id=...&sort_by=priority|last_message` — dialogs feed.
- `GET /client/{id}` — карточка клиента, диалоги, рекомендации, CRM notes.
- `GET /client/{id}/activity-log` — audit log по клиенту.
- `GET /assistant/threads?manager_id=...` — список диалогов с ассистентом.
- `POST /assistant/threads` — создать новый assistant thread.
- `GET /assistant/threads/{thread_id}` — история выбранного assistant thread.
- `POST /assistant/chat` — вопрос ассистенту, Q&A или запуск summary / CRM note action.
- `POST /ai/generate-script` — генерация sales script по открытому клиенту и диалогу.
- `POST /ai/summarize-dialog` — AI summary + CRM draft.
- `POST /crm-note` — сохранение CRM-заметки.
- `POST /feedback` — feedback менеджера.

## UI-концепт

- Главный экран — список диалогов.
- По клику открывается чат:
  - слева — мини-бар диалогов;
  - по центру — переписка;
  - справа — приоритет, сводка, CRM-заметка, профиль и портфель.
- Сортировка переключается прямо в блоке списка диалогов.
- Смена менеджера вынесена в floating control.
- В правом нижнем углу есть floating assistant-widget:
  - в свернутом виде это небольшая кнопка;
  - по клику открывается overlay-панель;
  - внутри видны прошлые assistant threads, quick actions, active chat и cards для sales scripts.

## Floating Assistant

Ассистент в этой версии **глобальный по менеджеру**, а не привязан жестко к одному клиенту.

Если в основном UI уже открыт клиент:
- ассистент получает его как `focus context`;
- quick actions `Сделай сводку диалога` и `Собери CRM-заметку` работают именно по нему;
- quick actions `Подготовь скрипт продажи`, `Сделай мягкий follow-up` и `Как ответить клиенту?` тоже работают по нему;
- результат возвращается в floating widget и одновременно обновляет основной интерфейс.

### Что входит в базу знаний

На этом этапе knowledge base строится **только из внутренних данных текущей системы**:

- профиль клиента;
- портфель и текущие продукты;
- активный диалог и `conversation insights`;
- rule-based recommendation:
  - `priority_score`
  - `priority_label`
  - `why[]`
  - `next_best_action`
  - `factor_breakdown`
- мини-сводка, если она уже была сгенерирована;
- последние CRM notes и follow-ups;
- manager-level overview по приоритетам.

### Как хранится история

История floating assistant хранится в SQLite в отдельных таблицах:

- `assistant_threads`
- `assistant_messages`
- `assistant_kb_snapshots`

Это не смешивается с клиентскими сообщениями и не заменяет CRM-заметки.

Для rich assistant actions в `assistant_messages` есть поле:

- `action_payload_json`

Туда сохраняется structured payload действий ассистента, включая sales scripts.  
Это позволяет после refresh страницы заново отрисовать готовый script card прямо в истории ассистента.

### Сокращение контекста ради токенов

В LLM не отправляются сырые таблицы и полные переписки.

В prompt попадает только:
- `memory_summary` assistant thread;
- последние 6 сообщений thread-а;
- выбранные KB snapshots;
- текущий UI focus: менеджер и при необходимости открытый клиент.

Жесткие лимиты:
- `client_overview` до `500` символов;
- `portfolio_overview` до `450` символов;
- `conversation_overview` до `1200` символов;
- `recommendation_overview` до `450` символов;
- `crm_overview` до `600` символов;
- суммарный retrieved context до `4500` символов.

### Инфраструктурная схема

```text
SQLite data
  -> snapshot builder
  -> assistant retrieval
  -> intent routing
  -> Groq / LLM answer
  -> assistant history tables
  -> UI widget
```

## Sales Scripts

Sales scripts в этой версии живут **только внутри floating assistant**.

Что можно сделать:
- нажать quick action `Подготовь скрипт продажи`;
- нажать quick action `Сделай мягкий follow-up`;
- нажать quick action `Как ответить клиенту?`;
- написать свободным текстом что-то вроде `дай скрипт`, `как ответить клиенту`, `сделай follow-up`, `сформулируй ответ`.

### Как работает routing

Поток такой:

```text
assistant input
  -> intent routing
  -> script context builder
  -> Groq
  -> assistant history render
```

Если ассистент понимает, что это script request:
- без открытого клиента он честно просит сначала выбрать клиента в основном окне;
- с открытым клиентом backend собирает context и вызывает `POST /ai/generate-script`-совместимый flow.

### Какой context идет в script generation

В prompt попадает только локальный контекст:

- профиль клиента;
- продукты и портфель;
- текущий conversation;
- `conversation insights`;
- `dialog recommendation`;
- `ai_summary_text`, если уже есть;
- последние CRM notes;
- `instruction` от менеджера.

Сырые таблицы и полная база в модель не отправляются.

### Structured output

Sales script возвращается в виде `SalesScriptDraft`:

- `manager_talking_points: list[str]`
- `ready_script: str`
- `channel: "chat" | "call" | "meeting"`

### Где хранится результат

Sales script:
- остается в assistant history;
- сохраняется в `assistant_messages.action_payload_json`;
- переживает refresh страницы;
- не переносится автоматически в основной composer;
- не сохраняется в CRM автоматически;
- не отправляется клиенту автоматически.

### Ограничения knowledge base

- внешние файлы и документы пока не загружаются;
- vector store / pgvector / RAG пока не используются;
- retrieval делается server-side в Python поверх SQLite snapshots.

## Stage 6 изменения

- Добавлена генерация sales scripts внутри floating assistant.
- Появился новый endpoint `POST /ai/generate-script`.
- Реализован script routing по quick actions и free-text intent detection.
- Structured script payload сохраняется в `assistant_messages.action_payload_json`.
- После refresh assistant history заново показывает сохраненные script cards.
- README синхронизирован с новой Stage 6 архитектурой.

## Ограничения текущего этапа

- Скрипты продаж пока имеют формат v1: `тезисы + готовый текст`.
- Objections-mode еще не реализован.
- Call helper еще не реализован.
- Tasks не используются в текущем UI.
- Supervisor / team dashboard пока отсутствует.
- External files / documents upload пока отсутствуют.
- Vector search / RAG пока не используются.

## Следующий этап

Следующий логичный AI-блок после Stage 6:

- objection handling / objection packs;
- alternative replies;
- расширение script formats для `chat / call / meeting`;
- возможно, отдельный script mode для персонального follow-up.

## Тесты

```bash
pytest -q
```

Текущий проект покрыт:
- API smoke tests
- dialog scoring tests
- AI summary / CRM draft tests
- AI sales script tests
- audit logging tests
- assistant API / knowledge base tests
