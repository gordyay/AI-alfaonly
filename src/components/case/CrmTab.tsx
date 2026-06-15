// Вкладка «Итог и CRM»: фиксация решения по рекомендации (FR8, отдельно от
// сохранения заметки — PR4/PR5), сводка контакта и черновик CRM-заметки (FR6),
// история заметок. Сводку готовит бэкенд; заметка/решение уходят на бэкенд.

import { useState } from "react";
import type { CrmNote, FeedbackDecision, SummaryResult } from "../../domain/types";
import { api } from "../../api/client";
import { clockTime, timeAgo } from "../../domain/format";
import { Icon } from "../Icon";

const DECISIONS: { key: FeedbackDecision; label: string; icon: "check" | "edit" | "x" }[] = [
  { key: "accepted", label: "Принять", icon: "check" },
  { key: "edited", label: "Изменить", icon: "edit" },
  { key: "rejected", label: "Отклонить", icon: "x" },
];

const DECISION_VERB: Record<FeedbackDecision, string> = {
  accepted: "Принято",
  edited: "Отредактировано",
  rejected: "Отклонено",
};

export function CrmTab({
  wid,
  notes,
  savedDecision,
  onRecordFeedback,
  onSaveNote,
}: {
  wid: string;
  notes: CrmNote[];
  savedDecision: FeedbackDecision | null;
  onRecordFeedback: (decision: FeedbackDecision, comment: string, opts?: { kind?: string }) => Promise<boolean>;
  onSaveNote: (text: string, nextContactIso: string) => Promise<boolean>;
}) {
  const [decision, setDecision] = useState<FeedbackDecision | null>(savedDecision);
  const [comment, setComment] = useState("");

  const matchesSaved = decision === savedDecision && savedDecision !== null;
  const editedNeedsComment = decision === "edited" && comment.trim() === "";
  const canSubmit = !!decision && !matchesSaved && !editedNeedsComment;

  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  async function runSummary() {
    setSummaryLoading(true);
    try {
      const result = await api.generateSummary(wid);
      setSummary(result);
      setDraft(result.crmDraft);
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className="crm-tab">
      {/* --- Решение по рекомендации (FR8) --- */}
      <section className="panel work-card">
        <div className="section-head">
          <span className="section-head__icon">
            <Icon name="thumbsUp" size={17} />
          </span>
          <span className="section-head__text">
            <span className="section-head__title">Решение по рекомендации</span>
            <span className="section-head__sub">Фиксируется отдельно от заметки — формирует данные для обучения моделей</span>
          </span>
          {savedDecision && (
            <span className={`badge badge--${savedDecision === "rejected" ? "danger" : "success"}`}>
              {DECISION_VERB[savedDecision]}
            </span>
          )}
          {decision !== savedDecision && <span className="badge badge--neutral">Не сохранено</span>}
        </div>

        <div className="decision-row">
          {DECISIONS.map((d) => (
            <button
              key={d.key}
              className={`decision-btn${decision === d.key ? ` decision-btn--active decision-btn--${d.key}` : ""}`}
              onClick={() => setDecision(d.key)}
            >
              <Icon name={d.icon} size={16} />
              {d.label}
            </button>
          ))}
        </div>

        <textarea
          className="field"
          aria-label="Комментарий к решению"
          placeholder={
            decision === "edited" ? "Что именно изменили в рекомендации…" : "Комментарий к решению (необязательно)…"
          }
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
        />
        <div className="work-card__inline work-card__inline--end">
          <button
            className="btn btn--secondary btn--sm"
            disabled={!canSubmit}
            onClick={() => decision && onRecordFeedback(decision, comment.trim())}
          >
            {matchesSaved ? (
              <>
                <Icon name="check" size={15} /> Зафиксировано
              </>
            ) : (
              "Зафиксировать решение"
            )}
          </button>
        </div>
      </section>

      {/* --- Сводка контакта и черновик CRM (FR6) --- */}
      <section className="panel work-card">
        <div className="section-head">
          <span className="section-head__icon section-head__icon--ai">
            <Icon name="copy" size={17} />
          </span>
          <span className="section-head__text">
            <span className="section-head__title">Сводка контакта и черновик CRM</span>
            <span className="section-head__sub">Заметка сохраняется только после вашего подтверждения</span>
          </span>
        </div>

        {!summary ? (
          <div className="work-card__cta">
            <button className="btn btn--ai" onClick={runSummary} disabled={summaryLoading}>
              <Icon name="sparkles" size={16} />
              {summaryLoading ? "Готовлю сводку…" : "Сформировать сводку"}
            </button>
            <span className="u-faint">Ассистент соберёт итог по переписке и черновик заметки.</span>
          </div>
        ) : (
          <div className="summary-result">
            <p className="summary-result__lead">{summary.summary}</p>

            <div className="summary-grid">
              <div className="summary-grid__cell">
                <span className="u-eyebrow">Результат</span>
                <p>{summary.outcome}</p>
              </div>
              <div className="summary-grid__cell">
                <span className="u-eyebrow">Следующий шаг</span>
                <p>{summary.nextStep}</p>
              </div>
            </div>

            <div className="key-points">
              <span className="u-eyebrow">Ключевые моменты</span>
              <ul>
                {summary.keyPoints.map((k, i) => (
                  <li key={i}>
                    <Icon name="dot" size={14} /> {k}
                  </li>
                ))}
              </ul>
            </div>

            <label className="work-card__label" htmlFor="crm-draft">
              Черновик заметки в CRM
            </label>
            <textarea
              id="crm-draft"
              className="field"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
              rows={5}
            />

            <div className="work-card__inline work-card__inline--end">
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => onRecordFeedback("rejected", "Черновик CRM отклонён", { kind: "crm_draft" })}
              >
                Отклонить черновик
              </button>
              <button
                className="btn btn--primary btn--sm"
                disabled={!draft.trim() || saved}
                onClick={async () => {
                  if (await onSaveNote(draft.trim(), summary.nextContactIso)) setSaved(true);
                }}
              >
                <Icon name="check" size={15} /> {saved ? "Сохранено" : "Сохранить в CRM"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* --- История заметок и контактов (FR9) --- */}
      <section className="panel work-card">
        <div className="section-head">
          <span className="section-head__icon">
            <Icon name="history" size={17} />
          </span>
          <span className="section-head__text">
            <span className="section-head__title">История по клиенту</span>
            <span className="section-head__sub">Заметки CRM и зафиксированные контакты</span>
          </span>
        </div>

        {notes.length === 0 ? (
          <p className="u-faint">Заметок по клиенту пока нет.</p>
        ) : (
          <ul className="note-history">
            {notes.map((n) => (
              <li key={n.id} className="note-history__item">
                <div className="note-history__top">
                  <span className={`badge badge--${n.outcome === "resolved" ? "success" : "neutral"}`}>
                    {n.outcome === "follow_up" ? "Follow-up" : n.outcome === "resolved" ? "Закрыто" : "В работе"}
                  </span>
                  <span className="u-faint">
                    {n.id.startsWith("rt-") ? "только что" : timeAgo(n.createdAtIso)} · {clockTime(n.createdAtIso)}
                  </span>
                </div>
                <p className="note-history__text">{n.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
