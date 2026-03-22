import { getChannelLabel } from "../../lib/utils";
import type { UiStatus } from "../../lib/ui";
import type { Conversation, ReplySource } from "../../types";
import { StatusMessage } from "../StatusMessage";

interface CaseReplyComposerProps {
  conversation?: Conversation | null;
  replyDraftText: string;
  replySource: ReplySource;
  replySending: boolean;
  replyStatus?: UiStatus;
  canPrefillFromScript: boolean;
  canPrefillFromObjection: boolean;
  onReplyDraftChange: (value: string) => void;
  onPrefillFromScript: () => void;
  onPrefillFromObjection: () => void;
  onClearReplyDraft: () => void;
  onSendReply: () => void;
}

function getReplySourceLabel(source: ReplySource) {
  const labels: Record<ReplySource, string> = {
    manual: "Ручной черновик",
    script: "Из сценария",
    objection: "Из ответа на возражение",
    assistant: "Из помощника",
  };
  return labels[source];
}

export function CaseReplyComposer({
  conversation,
  replyDraftText,
  replySource,
  replySending,
  replyStatus,
  canPrefillFromScript,
  canPrefillFromObjection,
  onReplyDraftChange,
  onPrefillFromScript,
  onPrefillFromObjection,
  onClearReplyDraft,
  onSendReply,
}: CaseReplyComposerProps) {
  const canSend = Boolean(replyDraftText.trim()) && conversation?.channel === "chat" && !replySending;

  return (
    <section className="content-card reply-composer">
      <div className="section-title">
        <div>
          <p className="panel__eyebrow">Ответ клиенту</p>
          <h3>Черновик и отправка сообщения</h3>
        </div>
        <div className="reply-composer__meta">
          <span className="badge badge--accent">{conversation ? getChannelLabel(conversation.channel) : "Без канала"}</span>
          <span className="badge">{getReplySourceLabel(replySource)}</span>
        </div>
      </div>

      <p className="insight">
        После отправки сообщение сразу попадёт в историю контакта и сохранится в CRM как исходящий ответ.
      </p>

      {conversation?.channel && conversation.channel !== "chat" ? (
        <StatusMessage
          compact
          type="error"
          message="В первой версии отправка доступна только для chat-диалогов. Для звонка и встречи можно только подготовить текст."
        />
      ) : null}
      <StatusMessage compact type={replyStatus?.type} message={replyStatus?.text} />

      <label className="field">
        <span>Текст сообщения</span>
        <textarea
          rows={6}
          value={replyDraftText}
          onChange={(event) => onReplyDraftChange(event.target.value)}
          placeholder="Напишите клиенту готовый ответ или подставьте вариант из сценария."
        />
      </label>

      <div className="button-row">
        <button className="ghost-button" type="button" onClick={onPrefillFromScript} disabled={!canPrefillFromScript}>
          Подставить из скрипта
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={onPrefillFromObjection}
          disabled={!canPrefillFromObjection}
        >
          Подставить из возражения
        </button>
        <button className="ghost-button" type="button" onClick={onClearReplyDraft} disabled={!replyDraftText}>
          Очистить
        </button>
        <button className="primary-button" type="button" onClick={onSendReply} disabled={!canSend}>
          {replySending ? "Отправляем..." : "Отправить клиенту"}
        </button>
      </div>
    </section>
  );
}
