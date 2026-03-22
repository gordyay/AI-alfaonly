import { getChannelLabel } from "../../lib/utils";
import type { UiStatus } from "../../lib/ui";
import type { CaseInteraction, ReplySource } from "../../types";
import { StatusMessage } from "../StatusMessage";

interface CaseReplyComposerProps {
  interaction?: CaseInteraction | null;
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
  onOpenAssistantReply: () => void;
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
  interaction,
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
  onOpenAssistantReply,
}: CaseReplyComposerProps) {
  const canSend = Boolean(replyDraftText.trim()) && interaction?.is_text_based && !replySending;

  return (
    <section className="content-card reply-composer">
      <div className="section-title">
        <div>
          <p className="panel__eyebrow">Ответ клиенту</p>
          <h3>Черновик и отправка сообщения</h3>
        </div>
        <div className="reply-composer__meta">
          <span className="badge badge--accent">{interaction ? getChannelLabel(interaction.channel) : "Без канала"}</span>
          <span className="badge">{getReplySourceLabel(replySource)}</span>
        </div>
      </div>

      <p className="insight">
        После отправки сообщение сразу попадёт в историю кейса и сохранится в CRM как исходящий ответ.
      </p>

      {interaction && !interaction.is_text_based ? (
        <StatusMessage
          compact
          type="error"
          message="Для звонка и встречи нет буквальной отправки сообщения. Выберите текстовый interaction кейса, чтобы ответить клиенту."
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
        <button className="ghost-button" type="button" onClick={onOpenAssistantReply}>
          Через помощника
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
