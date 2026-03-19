import type {
  ActivityLogEntry,
  AISummaryDraft,
  ClientDetailResponse,
  Conversation,
  RecommendationStatus,
  ViewTab,
  WorkItem,
} from "../types";
import {
  fromFollowUpInputValue,
  formatDateTime,
  formatMoney,
  getActivityActionLabel,
  getFocusPropensityLabel,
  getMiniSummaryCopy,
  getPriorityFactorLabel,
  getRecommendationStatusLabel,
  getRecommendationTypeLabel,
  getWorkItemTypeLabel,
  sanitizeTimeInput,
  toFollowUpInputValue,
} from "../lib/utils";
import { StatusMessage } from "./StatusMessage";

interface UiStatus {
  type: "loading" | "success" | "error";
  text: string;
}

interface FocusPanelProps {
  detail?: ClientDetailResponse | null;
  workItem?: WorkItem | null;
  conversation?: Conversation | null;
  aiEnabled: boolean;
  aiUnavailableMessage?: string | null;
  activeTab: ViewTab;
  onChangeTab: (tab: ViewTab) => void;
  aiDraft?: AISummaryDraft | null;
  aiLoading: boolean;
  aiSaving: boolean;
  aiStatus?: UiStatus | null;
  aiSaveStatus?: UiStatus | null;
  onGenerateSummary: () => void;
  onSaveSummary: () => void;
  onCopyCRM: () => void;
  onUpdateDraft: (draft: AISummaryDraft) => void;
  scriptGoal: string;
  onScriptGoalChange: (value: string) => void;
  scriptLoading: boolean;
  scriptSelecting: boolean;
  scriptStatus?: UiStatus | null;
  onGenerateScript: () => void;
  onSelectScriptVariant: (variantLabel: string, selectedText: string) => void;
  objectionInput: string;
  onObjectionInputChange: (value: string) => void;
  objectionLoading: boolean;
  objectionSelecting: boolean;
  objectionStatus?: UiStatus | null;
  onGenerateObjectionWorkflow: () => void;
  onSelectObjectionOption: (optionTitle: string, selectedResponse: string) => void;
  feedbackDecision?: RecommendationStatus | null;
  savedFeedbackDecision?: RecommendationStatus | null;
  feedbackComment: string;
  feedbackSubmitting: boolean;
  feedbackStatus?: UiStatus | null;
  assistantSending: boolean;
  onFeedbackCommentChange: (value: string) => void;
  onFeedbackDecisionChange: (decision: RecommendationStatus) => void;
  onSubmitFeedback: () => void;
  onQuickAssistantAction: (message: string) => void;
}

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: "summary", label: "Сводка" },
  { id: "script", label: "Сценарий" },
  { id: "objections", label: "Возражения" },
  { id: "crm", label: "CRM" },
  { id: "profile", label: "Профиль" },
  { id: "portfolio", label: "Портфель" },
];

const OUTCOME_LABELS: Record<AISummaryDraft["outcome"], string> = {
  follow_up: "Нужен повторный контакт",
  info_sent: "Информация отправлена",
  meeting_scheduled: "Назначена встреча / звонок",
  not_now: "Не сейчас",
  closed_no_action: "Закрыто без дальнейших действий",
};

function getCRMRevisionStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    ai_generated: "Черновик ИИ",
    manager_finalized: "Финальная версия менеджера",
  };
  return labels[stage] ?? stage.replaceAll("_", " ");
}

export function FocusPanel({
  detail,
  workItem,
  conversation,
  aiEnabled,
  aiUnavailableMessage,
  activeTab,
  onChangeTab,
  aiDraft,
  aiLoading,
  aiSaving,
  aiStatus,
  aiSaveStatus,
  onGenerateSummary,
  onSaveSummary,
  onCopyCRM,
  onUpdateDraft,
  scriptGoal,
  onScriptGoalChange,
  scriptLoading,
  scriptSelecting,
  scriptStatus,
  onGenerateScript,
  onSelectScriptVariant,
  objectionInput,
  onObjectionInputChange,
  objectionLoading,
  objectionSelecting,
  objectionStatus,
  onGenerateObjectionWorkflow,
  onSelectObjectionOption,
  feedbackDecision,
  savedFeedbackDecision,
  feedbackComment,
  feedbackSubmitting,
  feedbackStatus,
  assistantSending,
  onFeedbackCommentChange,
  onFeedbackDecisionChange,
  onSubmitFeedback,
  onQuickAssistantAction,
}: FocusPanelProps) {
  if (!detail || !workItem) {
    return (
      <section className="panel focus-panel focus-panel--empty">
        <p className="panel__eyebrow">Рабочее окно менеджера</p>
        <h2>Фокус на день</h2>
        <p>
          Выберите задачу, коммуникацию или возможность в левой колонке. Основной кейс откроется здесь
          вместе с объяснением приоритета, записью в CRM и контекстом клиента.
        </p>
      </section>
    );
  }

  const { client } = detail;
  const followUpValue = toFollowUpInputValue(aiDraft?.follow_up_date);
  const topPropensity = detail.product_propensity?.items?.[0];
  const nextContact =
    workItem.due_at || conversation?.insights?.next_contact_due_at || client.next_contact_due_at || null;
  const currentFeedback = detail.recommendation_feedback.find(
    (item) => item.recommendation_id === workItem.recommendation_id,
  );
  const recentAuditEntries = detail.activity_log.filter(
    (item: ActivityLogEntry) =>
      item.recommendation_id === workItem.recommendation_id ||
      (workItem.conversation_id && item.conversation_id === workItem.conversation_id),
  );
  const latestScript = detail.script_history[0] ?? null;
  const latestObjectionRecord = detail.objection_history[0] ?? null;
  const visibleObjectionDraft = latestObjectionRecord?.draft ?? detail.objection_workflow?.draft ?? null;
  const latestSavedNote = detail.crm_notes[0] ?? null;
  const savedFeedbackComment = currentFeedback?.comment || "";
  const isFeedbackDirty =
    (feedbackDecision || null) !== (savedFeedbackDecision || null) ||
    feedbackComment.trim() !== savedFeedbackComment.trim();
  const feedbackButtonLabel = feedbackSubmitting
    ? "Сохраняем решение..."
    : savedFeedbackDecision
      ? isFeedbackDirty
        ? "Обновить решение"
        : "Решение сохранено"
      : "Зафиксировать решение";

  return (
    <section className="panel focus-panel">
      <header className="focus-panel__header">
        <div>
          <p className="panel__eyebrow">Фокусный кейс</p>
          <h2>{workItem.title}</h2>
          <p className="focus-panel__subtitle">
            {client.full_name} · {getWorkItemTypeLabel(workItem.item_type)} ·{" "}
            {getRecommendationStatusLabel(workItem.recommendation_status)}
          </p>
        </div>
        <div className="focus-panel__score">
          <span>Оценка приоритета</span>
          <strong>{workItem.priority_score}</strong>
        </div>
      </header>

      <div className="chip-row">
        {client.tags.map((tag) => (
          <span className="badge" key={tag}>
            {tag}
          </span>
        ))}
        {workItem.business_goal ? <span className="badge badge--accent">{workItem.business_goal}</span> : null}
      </div>

      <section className="summary-strip">
        <article className="summary-card summary-card--feature">
          <span>Мини-сводка</span>
          <strong>{getMiniSummaryCopy({ detailSummary: client.ai_summary_text, workItem, draft: aiDraft })}</strong>
        </article>
        <article className="summary-card">
          <span>Следующее действие</span>
          <strong>{workItem.next_best_action}</strong>
        </article>
        <article className="summary-card">
          <span>Лучший продукт</span>
          <strong>{getFocusPropensityLabel(detail.product_propensity)}</strong>
        </article>
        <article className="summary-card">
          <span>Следующий контакт</span>
          <strong>{formatDateTime(nextContact)}</strong>
        </article>
      </section>

      <div className="focus-panel__tabs">
        {TABS.map((tab) => (
          <button
            className={`context-tab${tab.id === activeTab ? " is-active" : ""}`}
            key={tab.id}
            type="button"
            onClick={() => onChangeTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "summary" ? (
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
                Сначала выберите артефакт в центре кейса, затем отдельно сохраните лучший вариант. Это убирает
                случайные accept и оставляет чистую историю решений.
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
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onQuickAssistantAction("Подскажи следующий шаг по текущему кейсу")}
                  disabled={!aiEnabled || assistantSending}
                >
                  {!aiEnabled ? "AI недоступен" : assistantSending ? "Готовим..." : "Спросить ассистента"}
                </button>
              </div>
              {!aiEnabled ? <StatusMessage compact type="error" message={aiUnavailableMessage} /> : null}
            </section>

            <section className="content-card">
              <h3>Решение по рекомендации</h3>
              <p className="insight">
                Выбор и сохранение разделены: сначала статус, затем отдельный save. Это и есть single source of truth
                для supervisor метрик.
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
                    Последнее решение:{" "}
                    {getRecommendationStatusLabel(savedFeedbackDecision || currentFeedback.decision)}
                  </strong>
                  <p>{currentFeedback.comment || "Комментарий не был добавлен."}</p>
                  <small>{formatDateTime(currentFeedback.created_at)}</small>
                </div>
              ) : null}
            </section>

            <section className="content-card">
              <h3>История действий</h3>
              <div className="stack-list">
                {recentAuditEntries.length ? (
                  recentAuditEntries.slice(0, 6).map((item) => (
                    <article className="stack-card" key={item.id}>
                      <strong>
                        {getRecommendationTypeLabel(item.recommendation_type)} ·{" "}
                        {getActivityActionLabel(item.action)}
                        {item.decision ? ` · ${getRecommendationStatusLabel(item.decision)}` : ""}
                      </strong>
                      <p>{item.payload_excerpt || "Краткое описание действия не было сохранено."}</p>
                      <small>{formatDateTime(item.created_at)}</small>
                    </article>
                  ))
                ) : (
                  <p className="insight">Решения и действия по этой рекомендации пока не зафиксированы.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {activeTab === "script" ? (
        <section className="focus-layout">
          <section className="content-card">
              <div className="section-title">
                <div>
                  <p className="panel__eyebrow">Сценарий</p>
                  <h3>Сценарий контакта по кейсу</h3>
                </div>
              <div className="button-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onGenerateScript}
                    disabled={!aiEnabled || scriptLoading}
                  >
                    {scriptLoading ? "Генерируем..." : "Собрать сценарий"}
                  </button>
                </div>
            </div>

            <label className="field">
              <span>Цель контакта</span>
              <input
                type="text"
                value={scriptGoal}
                onChange={(event) => onScriptGoalChange(event.target.value)}
                placeholder="Какой следующий шаг нужно закрыть в этом контакте"
              />
            </label>
            {!aiEnabled ? <StatusMessage compact type="error" message={aiUnavailableMessage} /> : null}
            <StatusMessage type={scriptStatus?.type} message={scriptStatus?.text} />

            {latestScript ? (
              <div className="stack-list">
                <article className="stack-card">
                  <strong>Основной вариант</strong>
                  <p>{latestScript.draft.ready_script}</p>
                  <small>
                    Цель: {latestScript.draft.contact_goal || "Не указана"} · Канал: {latestScript.draft.channel}
                  </small>
                  <div className="button-row">
                    <button
                      className={`ghost-button${latestScript.selected_variant_label === "main" ? " is-selected" : ""}`}
                      type="button"
                      onClick={() => onSelectScriptVariant("main", latestScript.draft.ready_script)}
                      disabled={scriptSelecting}
                    >
                      {latestScript.selected_variant_label === "main" ? "Выбран" : "Выбрать основной"}
                    </button>
                  </div>
                </article>

                <article className="stack-card">
                  <strong>Опорные тезисы</strong>
                  <p>{latestScript.draft.manager_talking_points.join(" · ") || "Не указаны"}</p>
                </article>

                {latestScript.draft.alternatives.map((variant) => (
                  <article className="stack-card" key={variant.label}>
                    <strong>{variant.label}</strong>
                    <p>{variant.ready_script}</p>
                    <small>{[variant.style, variant.tactic].filter(Boolean).join(" · ") || "Дополнительные пометки не указаны"}</small>
                    {variant.manager_talking_points.length ? (
                      <p>{variant.manager_talking_points.join(" · ")}</p>
                    ) : null}
                    <div className="button-row">
                      <button
                        className={`ghost-button${latestScript.selected_variant_label === variant.label ? " is-selected" : ""}`}
                        type="button"
                        onClick={() => onSelectScriptVariant(variant.label, variant.ready_script)}
                        disabled={scriptSelecting}
                      >
                        {latestScript.selected_variant_label === variant.label ? "Выбран" : "Выбрать вариант"}
                      </button>
                    </div>
                  </article>
                ))}

                <article className="stack-card">
                  <strong>На чём основан сценарий</strong>
                  <p>{latestScript.draft.grounding_facts.join(" · ") || "Не указано"}</p>
                </article>
                {latestScript.draft.data_gaps.length ? (
                  <article className="stack-card">
                    <strong>Чего не хватает</strong>
                    <p>{latestScript.draft.data_gaps.join(" · ")}</p>
                  </article>
                ) : null}
              </div>
            ) : (
              <div className="empty-state empty-state--small">
                <strong>Сценарий ещё не собран</strong>
                <p>Сформируйте сценарий из текущего кейса, затем отдельно выберите вариант для контакта.</p>
              </div>
            )}
          </section>

          <aside className="content-stack">
            <section className="content-card">
              <h3>История сценариев</h3>
              <div className="stack-list">
                {detail.script_history.length ? (
                  detail.script_history.map((record) => (
                    <article className="stack-card" key={record.id}>
                      <strong>{record.contact_goal || record.draft.contact_goal || "Без явной цели"}</strong>
                      <p>{record.selected_text || record.draft.ready_script}</p>
                      <small>
                        {record.selected_variant_label
                          ? `Выбран: ${record.selected_variant_label}`
                          : "Вариант ещё не выбран"}{" "}
                        · {formatDateTime(record.created_at)}
                      </small>
                    </article>
                  ))
                ) : (
                  <p className="insight">История появится после первого собранного сценария.</p>
                )}
              </div>
            </section>
          </aside>
        </section>
      ) : null}

      {activeTab === "objections" ? (
        <section className="focus-layout">
          <section className="content-card">
              <div className="section-title">
                <div>
                  <p className="panel__eyebrow">Возражения</p>
                  <h3>Разбор возражения по кейсу</h3>
                </div>
              <div className="button-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onGenerateObjectionWorkflow}
                    disabled={!aiEnabled || objectionLoading}
                  >
                    {objectionLoading ? "Генерируем..." : "Собрать варианты"}
                  </button>
                </div>
            </div>

            <label className="field">
              <span>Текущее возражение</span>
              <textarea
                rows={3}
                value={objectionInput}
                onChange={(event) => onObjectionInputChange(event.target.value)}
                placeholder="Например: дорого, слишком рискованно, не сейчас"
              />
            </label>
            {!aiEnabled ? <StatusMessage compact type="error" message={aiUnavailableMessage} /> : null}
            <StatusMessage type={objectionStatus?.type} message={objectionStatus?.text} />

            {visibleObjectionDraft ? (
              <div className="stack-list">
                <article className="stack-card">
                  <strong>{visibleObjectionDraft.analysis.objection_label}</strong>
                  <p>{visibleObjectionDraft.analysis.customer_intent || "Интент клиента не извлечён."}</p>
                  <small>
                    Уверенность {Math.round(visibleObjectionDraft.analysis.confidence * 100)}% · Основания:{" "}
                    {visibleObjectionDraft.analysis.evidence.join(" · ") || "не найдено"}
                  </small>
                </article>

                {visibleObjectionDraft.handling_options.map((option) => (
                  <article className="stack-card" key={option.title}>
                    <strong>{option.title}</strong>
                    <p>{option.response}</p>
                    <small>{[option.style, option.tactic].filter(Boolean).join(" · ") || "Подход не уточнён"}</small>
                    <p>{option.rationale}</p>
                    {latestObjectionRecord ? (
                      <div className="button-row">
                        <button
                          className={`ghost-button${latestObjectionRecord.selected_option_title === option.title ? " is-selected" : ""}`}
                          type="button"
                          onClick={() => onSelectObjectionOption(option.title, option.response)}
                          disabled={objectionSelecting}
                        >
                          {latestObjectionRecord.selected_option_title === option.title ? "Выбран" : "Выбрать ответ"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}

                <article className="stack-card">
                  <strong>Что не говорить</strong>
                  <p>{visibleObjectionDraft.what_not_to_say.join(" · ") || "Ограничения не зафиксированы"}</p>
                </article>
                <article className="stack-card">
                  <strong>Следующий шаг</strong>
                  <p>{visibleObjectionDraft.next_step}</p>
                </article>
                <article className="stack-card">
                  <strong>Факты</strong>
                  <p>{visibleObjectionDraft.grounding_facts.join(" · ") || "Не указаны"}</p>
                </article>
                {visibleObjectionDraft.data_gaps.length ? (
                  <article className="stack-card">
                    <strong>Чего не хватает</strong>
                    <p>{visibleObjectionDraft.data_gaps.join(" · ")}</p>
                  </article>
                ) : null}
              </div>
            ) : (
              <div className="empty-state empty-state--small">
                <strong>Разбор возражения ещё не собран</strong>
                <p>Сначала сформируйте варианты, затем отдельно выберите ответ, который менеджер реально возьмёт в работу.</p>
              </div>
            )}
          </section>

          <aside className="content-stack">
            <section className="content-card">
              <h3>История возражений</h3>
              <div className="stack-list">
                {detail.objection_history.length ? (
                  detail.objection_history.map((record) => (
                    <article className="stack-card" key={record.id}>
                      <strong>{record.draft.analysis.objection_label}</strong>
                      <p>{record.selected_response || record.draft.next_step}</p>
                      <small>
                        {record.selected_option_title
                          ? `Выбран: ${record.selected_option_title}`
                          : "Вариант ещё не выбран"}{" "}
                        · {formatDateTime(record.created_at)}
                      </small>
                    </article>
                  ))
                ) : (
                  <p className="insight">История появится после первого разбора возражения.</p>
                )}
              </div>
            </section>
          </aside>
        </section>
      ) : null}

      {activeTab === "crm" ? (
        <section className="focus-layout focus-layout--crm">
          <section className="content-card">
              <div className="section-title">
                <div>
                  <p className="panel__eyebrow">CRM-заметка</p>
                  <h3>Черновик ИИ и финальная версия менеджера</h3>
                </div>
              <div className="button-row">
                  <button className="ghost-button" type="button" onClick={onGenerateSummary} disabled={!aiEnabled || aiLoading}>
                    {aiLoading ? "Генерируем..." : "Собрать черновик"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onCopyCRM} disabled={!aiDraft?.crm_note_draft}>
                    Копировать текст
                  </button>
                  <button className="primary-button" type="button" onClick={onSaveSummary} disabled={!aiDraft || aiSaving}>
                    {aiSaving ? "Сохраняем..." : "Сохранить в CRM"}
                  </button>
                </div>
            </div>

            {!aiEnabled ? <StatusMessage compact type="error" message={aiUnavailableMessage} /> : null}
            <StatusMessage type={aiStatus?.type} message={aiStatus?.text} />
            <StatusMessage compact type={aiSaveStatus?.type} message={aiSaveStatus?.text} />

            {aiDraft ? (
              <div className="form-stack">
                <label className="field">
                  <span>Краткая сводка</span>
                  <textarea
                    rows={4}
                    value={aiDraft.contact_summary}
                    onChange={(event) => onUpdateDraft({ ...aiDraft, contact_summary: event.target.value })}
                  />
                </label>

                <div className="field">
                  <span>Ключевые пункты</span>
                  <div className="chip-row">
                    {aiDraft.key_points.length ? (
                      aiDraft.key_points.map((point) => (
                        <span className="badge" key={point}>
                          {point}
                        </span>
                      ))
                    ) : (
                      <span className="badge">Ключевые пункты не выделены</span>
                    )}
                  </div>
                </div>

                <div className="field">
                  <span>На чём основана сводка</span>
                  <div className="stack-list">
                    {aiDraft.grounding_facts.length ? (
                      aiDraft.grounding_facts.map((fact) => (
                        <article className="stack-card" key={fact}>
                          <p>{fact}</p>
                        </article>
                      ))
                    ) : (
                      <span className="badge">Основания пока не собраны</span>
                    )}
                  </div>
                </div>

                {aiDraft.data_gaps.length ? (
                  <div className="field">
                    <span>Чего не хватает</span>
                    <div className="chip-row">
                      {aiDraft.data_gaps.map((gap) => (
                        <span className="badge" key={gap}>
                          {gap}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <label className="field">
                  <span>Итог контакта</span>
                  <select
                    value={aiDraft.outcome}
                    onChange={(event) =>
                      onUpdateDraft({
                        ...aiDraft,
                        outcome: event.target.value as AISummaryDraft["outcome"],
                      })
                    }
                  >
                    {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Черновик CRM-заметки</span>
                  <textarea
                    rows={8}
                    value={aiDraft.crm_note_draft}
                    onChange={(event) => onUpdateDraft({ ...aiDraft, crm_note_draft: event.target.value })}
                  />
                </label>

                <div className="field">
                  <span>Следующий контакт</span>
                  <div className="follow-up-inline">
                    <input
                      type="date"
                      value={followUpValue.date}
                      onChange={(event) =>
                        onUpdateDraft({
                          ...aiDraft,
                          follow_up_date: fromFollowUpInputValue(event.target.value, followUpValue.time),
                          follow_up_required: Boolean(event.target.value || followUpValue.time),
                        })
                      }
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="20:30"
                      value={followUpValue.time}
                      onChange={(event) =>
                        onUpdateDraft({
                          ...aiDraft,
                          follow_up_date: fromFollowUpInputValue(
                            followUpValue.date,
                            sanitizeTimeInput(event.target.value),
                          ),
                          follow_up_required: Boolean(followUpValue.date || event.target.value),
                        })
                      }
                    />
                  </div>
                </div>

                <label className="field">
                  <span>Причина следующего контакта</span>
                  <input
                    type="text"
                    value={aiDraft.follow_up_reason || ""}
                    onChange={(event) => onUpdateDraft({ ...aiDraft, follow_up_reason: event.target.value || null })}
                    placeholder="Что именно нужно закрыть на следующем контакте"
                  />
                </label>
              </div>
            ) : (
              <div className="empty-state empty-state--small">
                <strong>Черновик ещё не создан</strong>
                <p>Соберите черновик по текущему кейсу, затем проверьте текст и сохраните итог в CRM.</p>
              </div>
            )}
          </section>

          <aside className="content-stack">
            <section className="content-card">
              <h3>История черновиков</h3>
              <div className="stack-list">
                {detail.crm_draft_history.length ? (
                  detail.crm_draft_history.map((revision) => (
                    <article className="stack-card" key={revision.id}>
                      <strong>{getCRMRevisionStageLabel(revision.stage)}</strong>
                      <p>{revision.final_note_text || revision.draft.crm_note_draft}</p>
                      <small>
                        {revision.changed_fields.length
                          ? `Изменены поля: ${revision.changed_fields.join(", ")}`
                          : "Без изменений"}{" "}
                        · {formatDateTime(revision.created_at)}
                      </small>
                    </article>
                  ))
                ) : (
                  <p className="insight">История появится после первой AI-сводки или сохранения CRM.</p>
                )}
              </div>
            </section>

            <section className="content-card">
              <h3>Последний финальный результат</h3>
              {latestSavedNote ? (
                <article className="stack-card">
                  <strong>{latestSavedNote.summary_text || "CRM-заметка"}</strong>
                  <p>{latestSavedNote.note_text}</p>
                  <small>
                    {latestSavedNote.follow_up_date
                      ? `Следующий контакт: ${formatDateTime(latestSavedNote.follow_up_date)}`
                      : "Следующий контакт не назначен"}
                  </small>
                  {latestSavedNote.follow_up_reason ? <p>{latestSavedNote.follow_up_reason}</p> : null}
                </article>
              ) : (
                <p className="insight">Финальная CRM-заметка ещё не сохранена.</p>
              )}
            </section>
          </aside>
        </section>
      ) : null}

      {activeTab === "profile" ? (
        <section className="focus-layout">
          <section className="content-card">
            <h3>Профиль клиента</h3>
            <div className="meta-grid">
              <article className="meta-tile">
                <span>Возраст</span>
                <strong>{client.age}</strong>
              </article>
              <article className="meta-tile">
                <span>Риск-профиль</span>
                <strong>{client.risk_profile}</strong>
              </article>
              <article className="meta-tile">
                <span>Доход</span>
                <strong>{client.income_band}</strong>
              </article>
              <article className="meta-tile">
                <span>Свободный остаток</span>
                <strong>{formatMoney(client.cash_balance)}</strong>
              </article>
              <article className="meta-tile">
                <span>Город</span>
                <strong>{client.city}</strong>
              </article>
              <article className="meta-tile">
                <span>Последний контакт</span>
                <strong>{formatDateTime(client.last_contact_at)}</strong>
              </article>
            </div>
          </section>

          <aside className="content-stack">
            <section className="content-card">
              <h3>О клиенте</h3>
              <p className="insight">{client.notes_summary || "Расширенный контекст клиента пока не заполнен."}</p>
            </section>
            <section className="content-card">
              <h3>Подходящие продукты</h3>
              <div className="stack-list">
                {detail.product_propensity?.items.length ? (
                  detail.product_propensity.items.slice(0, 4).map((item) => (
                    <article className="stack-card" key={item.product_id}>
                      <strong>
                        {item.product_name} · {item.score}
                      </strong>
                      <p>{item.reasons.join(" · ")}</p>
                      <small>{item.next_best_action}</small>
                    </article>
                  ))
                ) : (
                  <p className="insight">Подходящие продукты пока не рассчитаны.</p>
                )}
              </div>
            </section>
          </aside>
        </section>
      ) : null}

      {activeTab === "portfolio" ? (
        <section className="focus-layout">
          <section className="content-card">
            <h3>Портфель клиента</h3>
            <div className="stack-list">
              {client.products.length ? (
                client.products.map((product) => (
                  <article className="stack-card" key={product.product_id}>
                    <strong>
                      {product.name} · {product.status}
                    </strong>
                    <p>
                      {product.category} · {product.margin_level} · {product.risk_level}
                    </p>
                    <small>
                      Баланс: {formatMoney(product.balance, product.currency)} · Открыт:{" "}
                      {formatDateTime(product.opened_at)}
                    </small>
                  </article>
                ))
              ) : (
                <p className="insight">Портфель пока пуст.</p>
              )}
            </div>
          </section>

          <aside className="content-stack">
            <section className="content-card">
              <h3>Лучший следующий продукт</h3>
              {topPropensity ? (
                <article className="stack-card">
                  <strong>
                    {topPropensity.product_name} · {topPropensity.score}
                  </strong>
                  <p>{topPropensity.reasons.join(" · ")}</p>
                  <small>{topPropensity.next_best_action}</small>
                </article>
              ) : (
                <p className="insight">Нужны дополнительные сигналы для продуктового ранжирования.</p>
              )}
            </section>
          </aside>
        </section>
      ) : null}
    </section>
  );
}
