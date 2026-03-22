import {
  formatDateTime,
  getActivityActionLabel,
  getPriorityFactorLabel,
  getRecommendationStatusLabel,
  getRecommendationTypeLabel,
} from "../../lib/utils";
import { StatusMessage } from "../StatusMessage";
import { getRecentAuditEntries, type CaseSummaryProps, type VisibleActivityEntry } from "./types";

export function CaseSummary({
  detail,
  workItem,
  conversation,
  aiEnabled,
  aiUnavailableMessage,
  assistantEnabled = true,
  feedbackEnabled = true,
  feedbackDecision,
  savedFeedbackDecision,
  feedbackComment,
  feedbackSubmitting,
  feedbackStatus,
  assistantSending,
  onChangeTab,
  onFeedbackCommentChange,
  onFeedbackDecisionChange,
  onSubmitFeedback,
  onQuickAssistantAction,
}: CaseSummaryProps) {
  const { client } = detail;
  const currentFeedback = detail.recommendation_feedback.find(
    (item) => item.recommendation_id === workItem.recommendation_id,
  );
  const latestSavedNote = detail.crm_notes[0] ?? null;
  const recentAuditEntries = getRecentAuditEntries(detail, workItem);
  const savedFeedbackComment = currentFeedback?.comment || "";
  const isFeedbackDirty =
    (feedbackDecision || null) !== (savedFeedbackDecision || null) ||
    feedbackComment.trim() !== savedFeedbackComment.trim();
  const hasFeedbackInHistory = recentAuditEntries.some((item) => item.action === "feedback_saved");
  const hasCRMInHistory = recentAuditEntries.some((item) => item.action === "crm_note_saved");
  const visibleActivityEntries: VisibleActivityEntry[] = recentAuditEntries.map((item) => ({
    id: item.id,
    title: `${getRecommendationTypeLabel(item.recommendation_type)} · ${getActivityActionLabel(item.action)}${
      item.decision ? ` · ${getRecommendationStatusLabel(item.decision)}` : ""
    }`,
    text: item.payload_excerpt || "Описание действия не заполнено.",
    createdAt: item.created_at,
  }));

  if (currentFeedback && !hasFeedbackInHistory) {
    visibleActivityEntries.push({
      id: `feedback-derived-${currentFeedback.recommendation_id}-${currentFeedback.created_at}`,
      title: `Рекомендация менеджеру · Решение сохранено · ${getRecommendationStatusLabel(currentFeedback.decision)}`,
      text: currentFeedback.comment || "Комментарий не добавлен.",
      createdAt: currentFeedback.created_at,
    });
  }

  if (latestSavedNote && !hasCRMInHistory) {
    visibleActivityEntries.push({
      id: `crm-derived-${latestSavedNote.id}`,
      title: "CRM-заметка · Сохранено",
      text: latestSavedNote.summary_text || latestSavedNote.note_text || "Запись сохранена без пояснения.",
      createdAt: latestSavedNote.created_at,
    });
  }

  visibleActivityEntries.sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  const feedbackButtonLabel = feedbackSubmitting
    ? "Сохраняем решение..."
    : savedFeedbackDecision
      ? isFeedbackDirty
        ? "Обновить решение"
        : "Решение сохранено"
      : "Зафиксировать решение";

  return (
    <div className="focus-layout">
      <section className="content-card">
        <h3>История контакта</h3>
        <div className="message-thread">
          {conversation?.messages.length ? (
            conversation.messages.map((message) => (
              <article
                className={`message-bubble message-bubble--${message.sender === "manager" ? "manager" : "client"}`}
                key={message.id}
              >
                <div className="message-bubble__meta">
                  <span>{message.sender === "manager" ? "Менеджер" : client.full_name}</span>
                  <span>{formatDateTime(message.created_at)}</span>
                </div>
                <p>{message.text}</p>
              </article>
            ))
          ) : (
            <div className="empty-state empty-state--small">
              <strong>Коммуникация не найдена</strong>
              <p>Для этого кейса нет привязанной истории сообщений.</p>
            </div>
          )}
        </div>
      </section>

      <aside className="content-stack">
        <section className="content-card">
          <h3>Почему этот кейс в фокусе</h3>
          <p className="insight">{workItem.expected_benefit}</p>
          <div className="chip-row">
            {workItem.why.map((reason) => (
              <span className="badge" key={reason}>
                {reason}
              </span>
            ))}
          </div>
          <div className="factor-grid">
            {Object.entries(workItem.factor_breakdown).map(([key, value]) => (
              <article className="factor-tile" key={key}>
                <span>{getPriorityFactorLabel(key)}</span>
                <strong>{value.toFixed(2)}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="content-card">
          <h3>Решение и следующий шаг</h3>
          <div className="stack-list">
            <article className="stack-card">
              <strong>Бизнес-цель кейса</strong>
              <p>{workItem.business_goal || "Нужно закрыть точный следующий шаг без потери темпа."}</p>
            </article>
            <article className="stack-card">
              <strong>Рекомендуемое действие</strong>
              <p>{workItem.next_best_action}</p>
            </article>
            <article className="stack-card">
              <strong>Продуктовый фокус</strong>
              <p>
                {workItem.product_name ||
                  "Явный продукт не выделен, фокус идёт по кейсу и следующему действию."}
              </p>
            </article>
          </div>
        </section>

        <section className="content-card">
          <h3>Центр действий по кейсу</h3>
          <p className="insight">
            Шаги можно проходить в удобном порядке, но цикл считается завершённым только после двух действий:
            решение зафиксировано и итог сохранён в CRM.
          </p>
          <div className="button-row">
            <button className="ghost-button" type="button" onClick={() => onChangeTab("script")}>
              Открыть сценарий
            </button>
            <button className="ghost-button" type="button" onClick={() => onChangeTab("objections")}>
              Открыть возражения
            </button>
            <button className="ghost-button" type="button" onClick={() => onChangeTab("crm")}>
              Открыть CRM
            </button>
            {assistantEnabled ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => onQuickAssistantAction("Подскажи следующий шаг по текущему кейсу")}
                disabled={!aiEnabled || assistantSending}
              >
                {!aiEnabled ? "AI недоступен" : assistantSending ? "Готовим..." : "Спросить ассистента"}
              </button>
            ) : null}
          </div>
          {assistantEnabled && !aiEnabled ? <StatusMessage compact type="error" message={aiUnavailableMessage} /> : null}
        </section>

        {feedbackEnabled ? (
          <section className="content-card">
            <h3>Решение по рекомендации</h3>
            <p className="insight">
              Выбор и сохранение разделены: сначала статус, затем отдельное сохранение. Так история решений и
              сводка по менеджеру остаются согласованными.
            </p>
            <div className="button-row">
              <button
                className={`ghost-button${feedbackDecision === "accepted" ? " is-selected" : ""}`}
                type="button"
                onClick={() => onFeedbackDecisionChange("accepted")}
                disabled={feedbackSubmitting}
              >
                Принять
              </button>
              <button
                className={`ghost-button${feedbackDecision === "edited" ? " is-selected" : ""}`}
                type="button"
                onClick={() => onFeedbackDecisionChange("edited")}
                disabled={feedbackSubmitting}
              >
                Доработать
              </button>
              <button
                className={`ghost-button${feedbackDecision === "rejected" ? " is-selected" : ""}`}
                type="button"
                onClick={() => onFeedbackDecisionChange("rejected")}
                disabled={feedbackSubmitting}
              >
                Отклонить
              </button>
            </div>
            <label className="field">
              <span>Комментарий к решению</span>
              <textarea
                rows={3}
                value={feedbackComment}
                onChange={(event) => onFeedbackCommentChange(event.target.value)}
                placeholder="Почему рекомендация принята, доработана или отклонена"
              />
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={onSubmitFeedback}
              disabled={feedbackSubmitting || !feedbackDecision || !isFeedbackDirty}
            >
              {feedbackButtonLabel}
            </button>
            <StatusMessage type={feedbackStatus?.type} message={feedbackStatus?.text} />
            {currentFeedback ? (
              <div className="stack-card">
                <strong>
                  Последнее решение: {getRecommendationStatusLabel(savedFeedbackDecision || currentFeedback.decision)}
                </strong>
                <p>{currentFeedback.comment || "Комментарий не был добавлен."}</p>
                <small>{formatDateTime(currentFeedback.created_at)}</small>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="content-card">
          <h3>История действий</h3>
          <div className="stack-list">
            {visibleActivityEntries.length ? (
              visibleActivityEntries.slice(0, 6).map((item) => (
                <article className="stack-card" key={item.id}>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                  <small>{formatDateTime(item.createdAt)}</small>
                </article>
              ))
            ) : (
              <p className="insight">Решения и действия по этой рекомендации пока не зафиксированы.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
