// Вкладка «Диалог»: переписка с клиентом + сборка и отправка ответа.
// Принцип участия человека: сообщение уходит только после подтверждения (FR11).

import { useEffect, useRef, useState } from "react";
import type { Message, ReplySource } from "../../domain/types";
import { firstName, type AIContext } from "../../ai/context";
import { generateReply } from "../../ai";
import { clockTime } from "../../domain/format";
import { Icon } from "../Icon";
import { Avatar } from "../Primitives";

const SOURCE_LABEL: Record<ReplySource, string> = {
  manual: "Вручную",
  script: "Из сценария",
  objection: "Из разбора возражения",
  assistant: "Черновик ассистента",
};

export function DialogTab({
  ctx,
  messages,
  clientName,
  replyDraft,
  replySource,
  onDraftChange,
  onSend,
}: {
  ctx: AIContext;
  messages: Message[];
  clientName: string;
  replyDraft: string;
  replySource: ReplySource;
  onDraftChange: (text: string, source: ReplySource) => void;
  onSend: (text: string) => void;
}) {
  const [rationale, setRationale] = useState<{ text: string; sources: string[] } | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  // Показать последнее сообщение после отправки/смены кейса.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [messages.length]);

  function handleAssistantDraft() {
    const draft = generateReply(ctx);
    onDraftChange(draft.text, "assistant");
    setRationale({ text: draft.rationale, sources: draft.sources });
    setFollowUps([]);
  }

  function handleSend() {
    const sent = replyDraft.trim();
    if (!sent) return;
    onSend(sent);
    setRationale(null);
    // UC-04 шаг 4: после отправки предложить варианты следующего сообщения.
    const primary = generateReply(ctx).text;
    const alt = `${firstName(ctx)}, подскажите, удобно ли продолжить здесь, в переписке, или вам комфортнее короткий звонок?`;
    setFollowUps([primary, alt].filter((t, i, arr) => t !== sent && arr.indexOf(t) === i));
  }

  function handleDraftEdit(text: string) {
    onDraftChange(text, "manual");
    if (followUps.length) setFollowUps([]);
  }

  return (
    <div className="dialog-tab">
      <div className="thread">
        {messages.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Icon name="bulb" size={22} />
            </span>
            <span className="empty-state__title">Входящих сообщений пока нет</span>
            <span className="empty-state__text">
              {ctx.conversation?.topic
                ? `Это проактивный повод связаться с клиентом: ${ctx.conversation.topic.toLowerCase()}. `
                : "Это проактивный повод связаться с клиентом. "}
              Сгенерируйте первое сообщение ассистентом ниже — он учтёт профиль клиента и ограничения по кейсу.
            </span>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`bubble bubble--${m.sender}`}>
              {m.sender === "client" && <Avatar name={clientName} size={28} />}
              <div className="bubble__content">
                <p className="bubble__text">{m.text}</p>
                <span className="bubble__time u-num">{clockTime(m.sentAtIso)}</span>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} aria-hidden="true" />
      </div>

      <div className="composer">
        <div className="composer__head">
          <span className="composer__title">
            <Icon name="send" size={15} /> Ответ клиенту
          </span>
          <span className={`chip${replySource === "assistant" ? " chip--ai" : ""}`}>{SOURCE_LABEL[replySource]}</span>
        </div>

        <textarea
          className="field composer__field"
          aria-label="Ответ клиенту"
          placeholder="Напишите ответ или сгенерируйте черновик ассистентом…"
          value={replyDraft}
          onChange={(e) => handleDraftEdit(e.target.value)}
          rows={4}
        />

        {rationale && (
          <div className="composer__rationale">
            <Icon name="sparkles" size={14} />
            <div>
              <p>{rationale.text}</p>
              <p className="composer__sources">Источники: {rationale.sources.join(" · ")}</p>
            </div>
          </div>
        )}

        <div className="composer__toolbar">
          <button className="btn btn--ai btn--sm" onClick={handleAssistantDraft}>
            <Icon name="sparkles" size={15} /> Черновик ассистента
          </button>
          {replyDraft && (
            <button className="btn btn--ghost btn--sm" onClick={() => handleDraftEdit("")}>
              Очистить
            </button>
          )}
          <span className="composer__spacer" />
          <span className="composer__guard">
            <Icon name="shieldCheck" size={14} /> Уходит только после подтверждения
          </span>
          <button className="btn btn--primary btn--sm" onClick={handleSend} disabled={!replyDraft.trim()}>
            Отправить <Icon name="arrowRight" size={15} />
          </button>
        </div>

        {followUps.length > 0 && (
          <div className="composer__followups">
            <span className="composer__followups-title">
              <Icon name="sparkles" size={13} /> Сообщение отправлено · варианты следующего шага
            </span>
            <div className="composer__followups-list">
              {followUps.map((t) => (
                <button
                  key={t}
                  className="followup-chip"
                  onClick={() => {
                    onDraftChange(t, "assistant");
                    setFollowUps([]);
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
