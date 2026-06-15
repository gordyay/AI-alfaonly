// Диалоговый ассистент по кейсу (FR9, NFR4). Отвечает на свободные вопросы на
// ограниченном контексте клиента и всегда указывает источники. История ответов
// хранится на бэкенде и восстанавливается при открытии кейса.

import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "../domain/types";
import { firstName } from "../ai/context";
import { api, type CaseDetail } from "../api/client";
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
  detail,
  onClose,
}: {
  open: boolean;
  detail: CaseDetail | null;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [asking, setAsking] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const wid = detail?.item.id ?? null;
  const ctx = detail?.context ?? null;

  // История ассистента синхронизируется при смене кейса (FR9).
  useEffect(() => {
    setTurns(detail?.chatHistory ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid]);

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [turns, open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!wid || !q || asking) return;
    setAsking(true);
    setInput("");
    setTurns((prev) => [...prev, { role: "manager", text: q }]);
    try {
      const res = await api.chat(wid, q);
      setTurns(res.turns);
    } catch {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", text: "Не удалось получить ответ ассистента. Попробуйте ещё раз.", sources: [] },
      ]);
    } finally {
      setAsking(false);
    }
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
              <button key={s} className="chip drawer__chip" onClick={() => ask(s)} disabled={asking}>
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
            disabled={!ctx || asking}
          />
          <button className="btn btn--primary btn--icon" type="submit" disabled={!ctx || !input.trim() || asking} aria-label="Отправить">
            <Icon name="send" size={17} />
          </button>
        </form>
      </aside>
    </>
  );
}
