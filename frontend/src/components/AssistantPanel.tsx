import type {
  AssistantMessageRecord,
  AssistantThread,
  AssistantThreadDetail,
  ObjectionWorkflowDraft,
  SalesScriptDraft,
} from "../types";
import { formatDateTime, getChannelLabel, getToneLabel } from "../lib/utils";
import { StatusMessage } from "./StatusMessage";

interface AssistantPanelProps {
  selectedClientName?: string | null;
  threads: AssistantThread[];
  selectedThreadId?: string | null;
  threadDetail?: AssistantThreadDetail | null;
  loading: boolean;
  sending: boolean;
  status?: { type: "loading" | "success" | "error"; text: string } | null;
  inputValue: string;
  onInputChange: (value: string) => void;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onSendMessage: (message?: string) => void;
}

const QUICK_ACTIONS = [
  "Сделай сводку диалога",
  "Собери CRM-заметку",
  "Подготовь скрипт продажи",
  "Как отработать возражение?",
  "Подготовь мягкое напоминание",
  "Что важно по клиенту?",
];

function renderSalesScriptDraft(draft: SalesScriptDraft) {
  return (
    <section className="assistant-rich-card">
      <header className="assistant-rich-card__header">
        <strong>Скрипт продажи</strong>
        <span>{getChannelLabel(draft.channel)}</span>
      </header>
      <p className="assistant-rich-card__line">
        {(draft.product_name || "Без выделенного продукта") +
          " · " +
          (draft.contact_goal || "Без явной цели") +
          " · " +
          getToneLabel(draft.tone)}
      </p>
      <div className="assistant-rich-card__block">
        <span>Готовый текст</span>
        <p>{draft.ready_script}</p>
      </div>
      {draft.manager_talking_points.length ? (
        <div className="assistant-rich-card__block">
          <span>Тезисы</span>
          <ul>
            {draft.manager_talking_points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft.follow_up_message ? (
        <div className="assistant-rich-card__block">
          <span>Короткое напоминание</span>
          <p>{draft.follow_up_message}</p>
        </div>
      ) : null}
      {draft.next_step ? (
        <div className="assistant-rich-card__block">
          <span>Следующий шаг</span>
          <p>{draft.next_step}</p>
        </div>
      ) : null}
      {draft.grounding_facts.length ? (
        <div className="assistant-rich-card__block">
          <span>На чём основан ответ</span>
          <ul>
            {draft.grounding_facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft.data_gaps.length ? (
        <div className="assistant-rich-card__block">
          <span>Чего не хватает</span>
          <ul>
            {draft.data_gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function renderObjectionDraft(draft: ObjectionWorkflowDraft) {
  return (
    <section className="assistant-rich-card">
      <header className="assistant-rich-card__header">
        <strong>{draft.analysis.objection_label}</strong>
        <span>{Math.round(draft.analysis.confidence * 100)}%</span>
      </header>
      <div className="assistant-rich-card__block">
        <span>Что делать</span>
        <div className="stack-list">
          {draft.handling_options.map((option) => (
            <article className="stack-card" key={option.title}>
              <strong>{option.title}</strong>
              <p>{option.response}</p>
              <small>{option.rationale}</small>
            </article>
          ))}
        </div>
      </div>
      <div className="assistant-rich-card__block">
        <span>Что не говорить</span>
        <ul>
          {draft.what_not_to_say.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="assistant-rich-card__block">
        <span>Следующий шаг</span>
        <p>{draft.next_step}</p>
      </div>
      {draft.grounding_facts.length ? (
        <div className="assistant-rich-card__block">
          <span>На чём основан ответ</span>
          <ul>
            {draft.grounding_facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft.data_gaps.length ? (
        <div className="assistant-rich-card__block">
          <span>Чего не хватает</span>
          <ul>
            {draft.data_gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function AssistantMessageCard({ message }: { message: AssistantMessageRecord }) {
  return (
    <article className={`assistant-message assistant-message--${message.role}`}>
      <div className="assistant-message__meta">
        <span>{message.role === "user" ? "Вы" : message.role === "tool" ? "Действие" : "Ассистент"}</span>
        <span>{formatDateTime(message.created_at)}</span>
      </div>
      <p>{message.content}</p>
      {message.action_payload?.sales_script_draft ? renderSalesScriptDraft(message.action_payload.sales_script_draft) : null}
      {message.action_payload?.objection_workflow_draft
        ? renderObjectionDraft(message.action_payload.objection_workflow_draft)
        : null}
      {message.citations.length ? (
        <div className="citation-list">
          {message.citations.map((citation) => (
            <article className="citation-card" key={citation.snapshot_id}>
              <strong>{citation.title}</strong>
              <p>{citation.excerpt || "Источник из базы знаний"}</p>
            </article>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function AssistantPanel({
  selectedClientName,
  threads,
  selectedThreadId,
  threadDetail,
  loading,
  sending,
  status,
  inputValue,
  onInputChange,
  onCreateThread,
  onSelectThread,
  onSendMessage,
}: AssistantPanelProps) {
  return (
    <aside className="panel assistant-panel">
      <header className="assistant-panel__header">
        <div>
          <p className="panel__eyebrow">Помощник</p>
          <h2>Помощь по текущему кейсу</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onCreateThread}>
          Новый диалог
        </button>
      </header>

      <p className="assistant-panel__scope">
        Контекст: <strong>{selectedClientName || "общий контекст менеджера"}</strong>
      </p>
      <StatusMessage type={status?.type} message={status?.text} />

      <div className="assistant-panel__threads">
        {threads.length ? (
          threads.map((thread) => (
            <button
              className={`assistant-thread-card${thread.id === selectedThreadId ? " is-active" : ""}`}
              key={thread.id}
              type="button"
              onClick={() => onSelectThread(thread.id)}
            >
              <strong>{thread.title}</strong>
              <span>{formatDateTime(thread.updated_at)}</span>
            </button>
          ))
        ) : (
          <div className="empty-state empty-state--small">
            <strong>{loading ? "Загружаем диалоги" : "Пока нет сохранённых диалогов"}</strong>
            <p>Создайте новый диалог или задайте вопрос по открытому кейсу.</p>
          </div>
        )}
      </div>

      <div className="assistant-quick-actions">
        {QUICK_ACTIONS.map((action) => (
          <button className="ghost-button" key={action} type="button" onClick={() => onSendMessage(action)} disabled={sending}>
            {action}
          </button>
        ))}
      </div>

      <div className="assistant-panel__messages">
        {threadDetail?.messages.length ? (
          threadDetail.messages.map((message) => <AssistantMessageCard key={message.id} message={message} />)
        ) : (
          <div className="empty-state empty-state--small">
            <strong>Ассистент готов</strong>
            <p>История появится здесь после первого запроса.</p>
          </div>
        )}
      </div>

      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSendMessage();
        }}
      >
        <textarea
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Спросите про клиента, текст сообщения, разбор возражения или следующий шаг"
          rows={4}
        />
        <button className="primary-button" disabled={sending || !inputValue.trim()} type="submit">
          {sending ? "Отправляем..." : "Отправить"}
        </button>
      </form>
    </aside>
  );
}
