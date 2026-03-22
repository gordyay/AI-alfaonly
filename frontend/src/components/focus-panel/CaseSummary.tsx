import {
  formatDateTime,
  getActivityActionLabel,
  getChannelLabel,
  getPriorityFactorLabel,
  getRecommendationStatusLabel,
  getRecommendationTypeLabel,
} from "../../lib/utils";
import { StatusMessage } from "../StatusMessage";
import { CaseReplyComposer } from "./CaseReplyComposer";
import { getRecentAuditEntries, type CaseSummaryProps, type VisibleActivityEntry } from "./types";

export function CaseSummary({
  detail,
  workItem,
  interaction,
  feedbackEnabled = true,
  feedbackDecision,
  savedFeedbackDecision,
  feedbackComment,
  feedbackSubmitting,
  feedbackStatus,
  replyDraftText,
  replySource,
  replySending,
  replyStatus,
  canPrefillReplyFromScript,
  canPrefillReplyFromObjection,
  onFeedbackCommentChange,
  onFeedbackDecisionChange,
  onSubmitFeedback,
  onOpenAssistantTask,
  onReplyDraftChange,
  onPrefillReplyFromScript,
  onPrefillReplyFromObjection,
  onClearReplyDraft,
  onSendReply,
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
  const timelineItems = [...detail.timeline].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );
  const replyInteraction =
    (interaction?.is_text_based ? interaction : null) ??
    detail.interactions.find((item) => item.is_text_based) ??
    null;
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
    <div className="overview-stack">
      <section className="content-card content-card--history">
        <div className="section-title">
          <h3>Лента кейса</h3>
        </div>

        <div className="message-thread message-thread--case">
          {timelineItems.length ? (
            timelineItems.map((event) =>
              event.event_type === "chat_message" ? (
                <article
                  className={`message-bubble message-bubble--${event.sender === "manager" ? "manager" : "client"}`}
                  key={event.id}
                >
                  <div className="message-bubble__meta">
                    <span>{event.sender === "manager" ? "Менеджер" : client.full_name}</span>
                    <span>{formatDateTime(event.created_at)}</span>
                  </div>
                  <p>{event.text}</p>
                </article>
              ) : (
                <article className="timeline-event-card" key={event.id}>
                  <div className="timeline-event-card__meta">
                    <span className="badge badge--accent">{getChannelLabel(event.channel)}</span>
                    <span>{formatDateTime(event.created_at)}</span>
                  </div>
                  <strong>{event.title}</strong>
                  <p>{event.text}</p>
                  {detail.interactions.find((item) => item.id === event.interaction_id)?.next_step ? (
                    <small>
                      Следующий шаг: {detail.interactions.find((item) => item.id === event.interaction_id)?.next_step}
                    </small>
                  ) : null}
                </article>
              ),
            )
          ) : (
            <div className="empty-state empty-state--small">
              <strong>История пуста</strong>
              <p>Для кейса ещё не зафиксированы события.</p>
            </div>
          )}
        </div>
      </section>

      {replyInteraction ? (
        <section className="content-card reply-target-block">
          <CaseReplyComposer
            interaction={replyInteraction}
            replyDraftText={replyDraftText}
            replySource={replySource}
            replySending={replySending}
            replyStatus={replyStatus}
            canPrefillFromScript={canPrefillReplyFromScript}
            canPrefillFromObjection={canPrefillReplyFromObjection}
            onReplyDraftChange={onReplyDraftChange}
            onPrefillFromScript={onPrefillReplyFromScript}
            onPrefillFromObjection={onPrefillReplyFromObjection}
            onClearReplyDraft={onClearReplyDraft}
            onSendReply={onSendReply}
            onOpenAssistantReply={() => onOpenAssistantTask("reply_draft")}
          />
        </section>
      ) : (
        <section className="content-card reply-unavailable-card">
          <h4>Ответ клиенту</h4>
          <p className="insight">Для этого кейса недоступен текстовый канал.</p>
        </section>
      )}

      <div className="overview-grid">
        <section className="content-card">
          <h3>Почему в фокусе</h3>
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

        <div className="content-stack">
          <section className="content-card">
            <h3>Следующий шаг</h3>
            <div className="stack-list">
              <article className="stack-card">
                <strong>Цель</strong>
                <p>{workItem.business_goal || "Закрыть ближайший следующий шаг."}</p>
              </article>
              <article className="stack-card">
                <strong>Действие</strong>
                <p>{workItem.next_best_action}</p>
              </article>
              <article className="stack-card">
                <strong>Продукт</strong>
                <p>{workItem.product_name || "Не выделен"}</p>
              </article>
            </div>
          </section>

          {feedbackEnabled ? (
            <section className="content-card">
              <h3>Решение по рекомендации</h3>
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
                <span>Комментарий</span>
                <textarea
                  rows={3}
                  value={feedbackComment}
                  onChange={(event) => onFeedbackCommentChange(event.target.value)}
                  placeholder="Коротко зафиксируйте причину"
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
        </div>
      </div>

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
    </div>
  );
}
