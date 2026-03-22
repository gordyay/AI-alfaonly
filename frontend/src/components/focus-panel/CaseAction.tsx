import { formatDateTime } from "../../lib/utils";
import { StatusMessage } from "../StatusMessage";
import type { CaseActionProps } from "./types";

export function CaseAction({
  detail,
  aiEnabled,
  aiUnavailableMessage,
  mode,
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
}: CaseActionProps) {
  if (mode === "script") {
    const latestScript = detail.script_history[0] ?? null;

    return (
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
                  <small>
                    {[variant.style, variant.tactic].filter(Boolean).join(" · ") || "Дополнительные пометки не указаны"}
                  </small>
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
    );
  }

  const latestObjectionRecord = detail.objection_history[0] ?? null;
  const visibleObjectionDraft = latestObjectionRecord?.draft ?? detail.objection_workflow?.draft ?? null;

  return (
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
                    {record.selected_option_title ? `Выбран: ${record.selected_option_title}` : "Вариант ещё не выбран"}{" "}
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
  );
}
