// Диалоговый ассистент по кейсу (FR9, NFR4). Отвечает на свободные вопросы
// на ограниченном контексте клиента и всегда указывает источники.

import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "../domain/types";
import type { AIContext } from "../ai/context";
import { answerCaseQuestion, firstName } from "../ai";
import { Icon } from "./Icon";
import { Avatar } from "./Primitives";

const SUGGESTIONS = [
  "Что предложить этому клиенту?",
  "Какой следующий шаг?",
  "Есть ли риск оттока?",
  "Сделай короткую сводку",
];

export function AssistantDrawer({
  open,
  ctx,
  turns,
  onClose,
  onTurns,
}: {
  open: boolean;
  ctx: AIContext | null;
  turns: ChatTurn[];
  onClose: () => void;
  onTurns: (turns: ChatTurn[]) => void;
}) {
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [turns, open]);

  function ask(question: string) {
    if (!ctx || !question.trim()) return;
    const userTurn: ChatTurn = { role: "manager", text: question.trim() };
    const answer = answerCaseQuestion(ctx, question.trim());
    onTurns([...turns, userTurn, answer]);
    setInput("");
  }

  return (
    <>
      <div className={`drawer-scrim${open ? " drawer-scrim--open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside
        className={`drawer${open ? " drawer--open" : ""}`}
        aria-label="Ассистент по кейсу"
        role="dialog"
        aria-hidden={open ? undefined : true}
        inert={open ? undefined : true}
      >
        <div className="drawer__head">
          <div className="drawer__title">
            <Avatar name="AI" size={32} ai />
            <div>
              <p className="drawer__name">Ассистент по кейсу</p>
              <p className="drawer__sub">{ctx ? `Контекст: ${ctx.client.fullName}` : "Выберите кейс"}</p>
            </div>
          </div>
          <button className="btn btn--icon btn--ghost btn--sm" onClick={onClose} aria-label="Закрыть">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="drawer__body" ref={bodyRef}>
          {turns.length === 0 ? (
            <div className="drawer__intro">
              <Avatar name="AI" size={44} ai />
              <p className="drawer__intro-text">
                {ctx
                  ? `Спросите что угодно по кейсу ${firstName(ctx)}. Я отвечаю только на доступном контексте и указываю источники.`
                  : "Откройте кейс, чтобы задать вопрос по клиенту."}
              </p>
            </div>
          ) : (
            turns.map((t, i) => (
              <div key={i} className={`chat-turn chat-turn--${t.role}`}>
                {t.role === "assistant" && <Avatar name="AI" size={26} ai />}
                <div className="chat-turn__bubble">
                  <p>{t.text}</p>
                  {t.sources && t.sources.length > 0 && (
                    <p className="chat-turn__sources">
                      <Icon name="shieldCheck" size={12} /> {t.sources.join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {ctx && turns.length === 0 && (
          <div className="drawer__suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip drawer__chip" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className="drawer__composer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            className="field"
            aria-label="Вопрос по кейсу"
            placeholder="Вопрос по кейсу…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!ctx}
          />
          <button className="btn btn--primary btn--icon" type="submit" disabled={!ctx || !input.trim()} aria-label="Отправить">
            <Icon name="send" size={17} />
          </button>
        </form>
      </aside>
    </>
  );
}
