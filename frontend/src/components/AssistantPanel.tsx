import type {
  AssistantMessageRecord,
  AssistantMode,
  AssistantPreview,
  AssistantStage,
  AssistantTaskKind,
  AssistantThread,
  AssistantThreadDetail,
  ObjectionWorkflowDraft,
  SalesScriptDraft,
} from "../types";
import { formatDateTime, getChannelLabel, getToneLabel } from "../lib/utils";
import { StatusMessage } from "./StatusMessage";

interface AssistantPanelProps {
  selectedClientName?: string | null;
  mode: AssistantMode;
  taskKind: AssistantTaskKind;
  stage: AssistantStage;
  preview?: AssistantPreview | null;
  selectedChoice?: string | null;
  threads: AssistantThread[];
  selectedThreadId?: string | null;
  threadDetail?: AssistantThreadDetail | null;
  aiEnabled: boolean;
  aiUnavailableMessage?: string | null;
  loading: boolean;
  sending: boolean;
  applying: boolean;
  status?: { type: "loading" | "success" | "error"; text: string } | null;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSelectTask: (taskKind: AssistantTaskKind) => void;
  onSelectThread: (threadId: string) => void;
  onSelectChoice: (choiceId: string) => void;
  onSendMessage: (message?: string) => void;
  onApplyPreview: () => void;
}

const CASE_TASKS: AssistantTaskKind[] = [
  "client_qa",
  "summary_crm",
  "sales_script",
  "objection_workflow",
  "reply_draft",
];

const GLOBAL_TASKS: AssistantTaskKind[] = ["general_qa"];

function getTaskLabel(taskKind: AssistantTaskKind) {
  const labels: Record<AssistantTaskKind, string> = {
    summary_crm: "CRM",
    sales_script: "Скрипт",
    objection_workflow: "Возражение",
    reply_draft: "Ответ",
    client_qa: "По кейсу",
    general_qa: "Общий AI",
  };
  return labels[taskKind];
}

function getTaskPrompt(taskKind: AssistantTaskKind) {
  const prompts: Record<AssistantTaskKind, { title: string; placeholder: string }> = {
    summary_crm: {
      title: "Собрать сводку и CRM-черновик",
      placeholder: "При необходимости уточните, на чем сделать акцент в CRM.",
    },
    sales_script: {
      title: "Подготовить скрипт контакта",
      placeholder: "Опишите цель или нюанс контакта, который нужно учесть.",
    },
    objection_workflow: {
      title: "Разобрать возражение",
      placeholder: "Введите формулировку возражения клиента.",
    },
    reply_draft: {
      title: "Подготовить ответ клиенту",
      placeholder: "Уточните тон или задачу ответа.",
    },
    client_qa: {
      title: "Вопрос по кейсу",
      placeholder: "Спросите про клиента, контекст или следующий шаг.",
    },
    general_qa: {
      title: "Общий AI",
      placeholder: "Задайте общий вопрос без привязки к кейсу.",
    },
  };
  return prompts[taskKind];
}

function renderSalesScriptDraft(draft: SalesScriptDraft) {
  return (
    <section className="assistant-rich-card">
      <header className="assistant-rich-card__header">
        <strong>Скрипт продажи</strong>
        <span>{getChannelLabel(draft.channel)}</span>
      </header>
      <p className="assistant-rich-card__line">
        {(draft.product_name || "Без продукта") + " · " + (draft.contact_goal || "Без цели") + " · " + getToneLabel(draft.tone)}
      </p>
      <div className="assistant-rich-card__block">
        <span>Основной текст</span>
        <p>{draft.ready_script}</p>
      </div>
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
        <span>Следующий шаг</span>
        <p>{draft.next_step}</p>
      </div>
    </section>
  );
}

function AssistantMessageCard({ message }: { message: AssistantMessageRecord }) {
  return (
    <article className={`assistant-message assistant-message--${message.role}`}>
      <div className="assistant-message__meta">
        <span>{message.role === "user" ? "Вы" : message.role === "tool" ? "Применение" : "Помощник"}</span>
        <span>{formatDateTime(message.created_at)}</span>
      </div>
      <p>{message.content}</p>
      {message.action_payload?.sales_script_draft ? renderSalesScriptDraft(message.action_payload.sales_script_draft) : null}
      {message.action_payload?.objection_workflow_draft
        ? renderObjectionDraft(message.action_payload.objection_workflow_draft)
        : null}
    </article>
  );
}

export function AssistantPanel({
  selectedClientName,
  mode,
  taskKind,
  stage,
  preview,
  selectedChoice,
  threads,
  selectedThreadId,
  threadDetail,
  aiEnabled,
  aiUnavailableMessage,
  loading,
  sending,
  applying,
  status,
  inputValue,
  onInputChange,
  onSelectTask,
  onSelectThread,
  onSelectChoice,
  onSendMessage,
  onApplyPreview,
}: AssistantPanelProps) {
  const tasks = mode === "case" ? CASE_TASKS : GLOBAL_TASKS;
  const taskPrompt = getTaskPrompt(taskKind);

  return (
    <aside className="panel assistant-panel">
      <header className="assistant-panel__header">
        <h2>{taskPrompt.title}</h2>
        {mode === "case" && selectedClientName ? <span className="assistant-panel__context">{selectedClientName}</span> : null}
      </header>

      <div className="assistant-task-tabs">
        {tasks.map((item) => (
          <button
            className={`ghost-button${item === taskKind ? " is-selected" : ""}`}
            key={item}
            type="button"
            onClick={() => onSelectTask(item)}
          >
            {getTaskLabel(item)}
          </button>
        ))}
      </div>

      {!aiEnabled ? <StatusMessage type="error" message={aiUnavailableMessage} /> : null}
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
            <strong>{loading ? "Загружаем сессии" : "Истории пока нет"}</strong>
            <p>Новая сессия начнется после первого запроса.</p>
          </div>
        )}
      </div>

      {preview ? (
        <section className="assistant-preview-card">
          <div className="assistant-preview-card__header">
            <h3>{preview.title}</h3>
            <span className="badge badge--accent">{stage === "applied" ? "Применено" : "Готово"}</span>
          </div>
          <p className="assistant-preview-card__summary">{preview.summary}</p>
          {preview.choices.length ? (
            <div className="assistant-preview-card__choices">
              {preview.choices.map((choice) => (
                <button
                  className={`assistant-choice-card${selectedChoice === choice.id ? " is-active" : ""}`}
                  key={choice.id}
                  type="button"
                  onClick={() => onSelectChoice(choice.id)}
                >
                  <strong>{choice.title}</strong>
                  <p>{choice.text}</p>
                  {choice.helper_text ? <small>{choice.helper_text}</small> : null}
                </button>
              ))}
            </div>
          ) : null}
          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              onClick={onApplyPreview}
              disabled={!preview.can_apply || applying || (preview.requires_choice && !selectedChoice)}
            >
              {applying ? "Применяем..." : "Применить в кейс"}
            </button>
          </div>
        </section>
      ) : null}

      <div className="assistant-panel__messages">
        {threadDetail?.messages.length ? (
          threadDetail.messages.map((message) => <AssistantMessageCard key={message.id} message={message} />)
        ) : (
          <div className="empty-state empty-state--small">
            <strong>Сессия готова</strong>
            <p>Отправьте первый запрос для этой задачи.</p>
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
          placeholder={taskPrompt.placeholder}
          rows={4}
          disabled={!aiEnabled}
        />
        <button className="primary-button" disabled={!aiEnabled || sending || !inputValue.trim()} type="submit">
          {sending ? "Готовим..." : "Сформировать"}
        </button>
      </form>
    </aside>
  );
}
