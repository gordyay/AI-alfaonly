// Вкладка «Сценарий»: персональный сценарий продаж (FR3, FR5) и разбор
// возражений (FR4). Тексты готовит бэкенд по ограниченному контексту кейса.

import { useState } from "react";
import type { ObjectionResult, ReplySource, ScriptResult } from "../../domain/types";
import { lastIncoming, type AIContext } from "../../ai/context";
import { api } from "../../api/client";
import { Icon } from "../Icon";

export function ActionsTab({
  wid,
  ctx,
  defaultGoal,
  onUseReply,
}: {
  wid: string;
  ctx: AIContext;
  defaultGoal: string;
  onUseReply: (text: string, source: ReplySource) => void;
}) {
  const [goal, setGoal] = useState(defaultGoal);
  const [instruction, setInstruction] = useState("");
  const [script, setScript] = useState<ScriptResult | null>(null);
  const [activeVariant, setActiveVariant] = useState(0);
  const [scriptLoading, setScriptLoading] = useState(false);

  const incoming = lastIncoming(ctx);
  const [objectionText, setObjectionText] = useState(incoming?.text ?? "");
  const [objection, setObjection] = useState<ObjectionResult | null>(null);
  const [objectionLoading, setObjectionLoading] = useState(false);

  async function runScript() {
    setScriptLoading(true);
    try {
      const result = await api.generateScript(wid, goal.trim() || defaultGoal, instruction.trim() || undefined);
      setScript(result);
      setActiveVariant(0);
    } finally {
      setScriptLoading(false);
    }
  }

  async function runObjection() {
    if (!objectionText.trim()) return;
    setObjectionLoading(true);
    try {
      setObjection(await api.generateObjection(wid, objectionText.trim()));
    } finally {
      setObjectionLoading(false);
    }
  }

  return (
    <div className="actions-tab">
      {/* --- Сценарий продаж --- */}
      <section className="panel work-card">
        <div className="section-head">
          <span className="section-head__icon section-head__icon--ai">
            <Icon name="message" size={17} />
          </span>
          <span className="section-head__text">
            <span className="section-head__title">Персональный сценарий</span>
            <span className="section-head__sub">Тезисы и готовый текст под профиль клиента</span>
          </span>
        </div>

        <label className="work-card__label" htmlFor="script-goal">
          Цель контакта
        </label>
        <div className="work-card__inline">
          <input
            id="script-goal"
            className="field"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Например: предложить размещение свободной ликвидности"
          />
          <button className="btn btn--ai" onClick={runScript} disabled={scriptLoading}>
            <Icon name="sparkles" size={16} />
            {scriptLoading ? "Собираю…" : "Сценарий"}
          </button>
        </div>

        <label className="work-card__label" htmlFor="script-instruction">
          Уточнение к сценарию (необязательно)
        </label>
        <input
          id="script-instruction"
          className="field"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="напр. «сделай мягче и короче, без упоминания цены»"
        />

        {script && (
          <div className="script-result">
            {script.dataGaps.length > 0 && (
              <div className="inline-gap">
                <Icon name="alert" size={15} />
                <span>
                  Данных мало: {script.dataGaps.join(", ")}. Варианты сделаны нейтральными — уточните детали у клиента.
                </span>
              </div>
            )}

            <div className="talking-points">
              <span className="u-eyebrow">Опорные тезисы</span>
              <ul>
                {script.talkingPoints.map((p, i) => (
                  <li key={i}>
                    <Icon name="check" size={14} /> {p}
                  </li>
                ))}
              </ul>
            </div>

            <div className="variant-tabs">
              {script.variants.map((v, i) => (
                <button
                  key={v.label}
                  className={`variant-tab${i === activeVariant ? " variant-tab--active" : ""}`}
                  onClick={() => setActiveVariant(i)}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {script.variants[activeVariant] && (
              <div className="variant-body">
                <span className="variant-body__tone">{script.variants[activeVariant].tone}</span>
                <p className="variant-body__text">{script.variants[activeVariant].text}</p>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => onUseReply(script.variants[activeVariant].text, "script")}
                >
                  <Icon name="arrowRight" size={15} /> Использовать как ответ
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* --- Отработка возражений --- */}
      <section className="panel work-card">
        <div className="section-head">
          <span className="section-head__icon section-head__icon--ai">
            <Icon name="shield" size={17} />
          </span>
          <span className="section-head__text">
            <span className="section-head__title">Отработка возражения</span>
            <span className="section-head__sub">Варианты ответа, обоснование и чего не стоит говорить</span>
          </span>
        </div>

        <label className="work-card__label" htmlFor="objection-input">
          Текст возражения клиента
        </label>
        <textarea
          id="objection-input"
          className="field"
          value={objectionText}
          onChange={(e) => setObjectionText(e.target.value)}
          placeholder="Вставьте реплику клиента с сомнением или возражением…"
          rows={2}
        />
        <div className="work-card__inline work-card__inline--end">
          <button className="btn btn--ai" onClick={runObjection} disabled={objectionLoading || !objectionText.trim()}>
            <Icon name="sparkles" size={16} />
            {objectionLoading ? "Разбираю…" : "Разобрать возражение"}
          </button>
        </div>

        {objection && (
          <div className="objection-result">
            <div className="objection-result__type">
              <span className="badge badge--neutral">Тип: {objection.objectionType}</span>
            </div>

            {objection.escalate && (
              <div className="inline-gap inline-gap--warn">
                <Icon name="flag" size={15} />
                <span>{objection.escalate}</span>
              </div>
            )}

            <div className="objection-options">
              {objection.options.map((opt, i) => (
                <div key={i} className="objection-option">
                  <div className="objection-option__head">
                    <span className="objection-option__title">{opt.title}</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => onUseReply(opt.response, "objection")}>
                      <Icon name="arrowRight" size={14} /> В ответ
                    </button>
                  </div>
                  <p className="objection-option__response">{opt.response}</p>
                  <p className="objection-option__rationale">
                    <Icon name="bulb" size={13} /> {opt.rationale}
                  </p>
                </div>
              ))}
            </div>

            {objection.avoid.length > 0 && (
              <div className="avoid-box">
                <span className="avoid-box__title">
                  <Icon name="x" size={14} /> Чего не говорить
                </span>
                <ul>
                  {objection.avoid.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
