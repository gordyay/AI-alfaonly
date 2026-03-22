import { fromFollowUpInputValue, formatDateTime, sanitizeTimeInput, toFollowUpInputValue } from "../../lib/utils";
import { StatusMessage } from "../StatusMessage";
import type { AISummaryDraft } from "../../types";
import type { CaseCRMProps } from "./types";

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

function getCRMNoteTitle(noteType?: string | null) {
  if (noteType === "outbound_reply") {
    return "Исходящее сообщение клиенту";
  }
  return "CRM-заметка";
}

export function CaseCRM({
  detail,
  interaction,
  aiEnabled,
  aiUnavailableMessage,
  feedbackEnabled = true,
  aiDraft,
  savedFeedbackDecision,
  aiLoading,
  aiSaving,
  aiStatus,
  aiSaveStatus,
  onGenerateSummary,
  onSaveSummary,
  onCopyCRM,
  onUpdateDraft,
  onOpenAssistantTask,
}: CaseCRMProps) {
  const followUpValue = toFollowUpInputValue(aiDraft?.follow_up_date);
  const canSaveCRM = Boolean(aiDraft && (!feedbackEnabled || savedFeedbackDecision));
  const latestSavedNote = detail.crm_notes[0] ?? null;

  return (
    <section className="focus-layout focus-layout--crm">
      <section className="content-card" data-tour="case-crm">
        <div className="section-title">
          <h3>CRM</h3>
          <div className="button-row">
            <button className="ghost-button" type="button" onClick={() => onOpenAssistantTask("summary_crm")}>
              В помощнике
            </button>
            <button className="ghost-button" type="button" onClick={onGenerateSummary} disabled={!aiEnabled || aiLoading}>
              {aiLoading ? "Генерируем..." : "Собрать черновик"}
            </button>
            <button className="ghost-button" type="button" onClick={onCopyCRM} disabled={!aiDraft?.crm_note_draft}>
              Копировать текст
            </button>
            <button className="primary-button" type="button" onClick={onSaveSummary} disabled={!canSaveCRM || aiSaving}>
              {aiSaving ? "Сохраняем..." : "Сохранить в CRM"}
            </button>
          </div>
        </div>

        {!aiEnabled ? <StatusMessage compact type="error" message={aiUnavailableMessage} /> : null}
        {feedbackEnabled && aiDraft && !savedFeedbackDecision ? (
          <StatusMessage
            compact
            type="loading"
            message="Сначала зафиксируйте решение по кейсу, затем сохраните итог в CRM."
          />
        ) : null}
        <StatusMessage type={aiStatus?.type} message={aiStatus?.text} />
        <StatusMessage compact type={aiSaveStatus?.type} message={aiSaveStatus?.text} />

        {aiDraft ? (
          <div className="form-stack">
            <label className="field">
              <span>Сводка</span>
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
                  <span className="badge">Пункты не выделены</span>
                )}
              </div>
            </div>

            <div className="field">
              <span>Основания</span>
              <div className="stack-list">
                {aiDraft.grounding_facts.length ? (
                  aiDraft.grounding_facts.map((fact) => (
                    <article className="stack-card" key={fact}>
                      <p>{fact}</p>
                    </article>
                  ))
                ) : (
                  <span className="badge">Основания не собраны</span>
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
              <span>Текст CRM</span>
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
            <strong>Черновика пока нет</strong>
            <p>Соберите текст по текущему кейсу.</p>
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
              <p className="insight">История появится после первой сводки.</p>
            )}
          </div>
        </section>

        <section className="content-card">
          <h3>Последний финальный результат</h3>
          {latestSavedNote ? (
            <article className="stack-card">
              <strong>{latestSavedNote.summary_text || getCRMNoteTitle(latestSavedNote.note_type)}</strong>
              <p>{latestSavedNote.outbound_message_text || latestSavedNote.note_text}</p>
              <small>
                {latestSavedNote.follow_up_date
                  ? `Следующий контакт: ${formatDateTime(latestSavedNote.follow_up_date)}`
                  : "Следующий контакт не назначен"}
              </small>
              {latestSavedNote.follow_up_reason ? <p>{latestSavedNote.follow_up_reason}</p> : null}
            </article>
          ) : (
            <p className="insight">Финальная CRM-заметка не сохранена.</p>
          )}
          {interaction?.channel ? <p className="insight">Канал контакта: {interaction.channel}</p> : null}
        </section>
      </aside>
    </section>
  );
}
