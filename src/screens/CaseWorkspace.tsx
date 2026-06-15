// Рабочее пространство кейса (раздел 6.5): единый поток работы вокруг клиента —
// диалог, сценарий, итог/CRM, профиль. Объединяет ИИ-функции и решения менеджера.

import { useEffect, useMemo, useState } from "react";
import type { CaseTab } from "../store/store";
import { useStore } from "../store/store";
import type { FeedbackDecision, ReplySource, WorkItem } from "../domain/types";
import { buildAIContext } from "../domain/contextBuilders";
import { isWorkItemHandled } from "../domain/workqueue";
import { clientById, messagesByConversation, dataset } from "../data/index";
import { Icon, type IconName } from "../components/Icon";
import { CaseHeader } from "../components/case/CaseHeader";
import { DialogTab } from "../components/case/DialogTab";
import { ActionsTab } from "../components/case/ActionsTab";
import { CrmTab } from "../components/case/CrmTab";
import { ClientTab } from "../components/case/ClientTab";

const TABS: { key: CaseTab; label: string; icon: IconName }[] = [
  { key: "dialog", label: "Диалог", icon: "chat" },
  { key: "actions", label: "Сценарий", icon: "message" },
  { key: "crm", label: "Итог и CRM", icon: "copy" },
  { key: "client", label: "Клиент", icon: "user" },
];

export function CaseWorkspace({
  item,
  hasNext,
  onAdvance,
}: {
  item: WorkItem;
  hasNext: boolean;
  onAdvance: () => void;
}) {
  const store = useStore();
  const client = clientById.get(item.clientId)!;
  const ctx = useMemo(() => buildAIContext(item), [item]);

  // Кейс «обработан» в этой сессии (есть отправленный ответ или решение) —
  // показываем спокойный итог и переход к следующему кейсу (импульс прохождения
  // очереди без авто-перескока: переход делает менеджер, человек в контуре).
  const handled = isWorkItemHandled(
    item,
    store.state.sentMessages,
    store.state.feedback,
    store.state.managerId,
  );

  const [replyDraft, setReplyDraft] = useState("");
  const [replySource, setReplySource] = useState<ReplySource>("manual");

  // Сброс состояния ответа при смене кейса.
  useEffect(() => {
    setReplyDraft("");
    setReplySource("manual");
  }, [item.id]);

  const baseMessages = item.conversationId ? messagesByConversation.get(item.conversationId) ?? [] : [];
  const thread = store.threadMessages(item.conversationId, baseMessages);

  const notes = useMemo(() => {
    const seedNotes = dataset.crmNotes.filter((n) => n.clientId === item.clientId);
    const runtimeNotes = store.state.savedNotes.filter((n) => n.clientId === item.clientId);
    return [...runtimeNotes, ...seedNotes].sort(
      (a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
    );
  }, [item.clientId, store.state.savedNotes]);

  const savedDecision = useMemo<FeedbackDecision | null>(() => {
    const events = store.state.feedback
      .filter((f) => f.recommendationId === item.recommendationId)
      .sort((a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime());
    return events[0]?.decision ?? null;
  }, [store.state.feedback, item.recommendationId]);

  function handleUseReply(text: string, source: ReplySource) {
    setReplyDraft(text);
    setReplySource(source);
    store.setCaseTab("dialog");
    store.toast("Текст перенесён в ответ клиенту", "info");
  }

  function handleSend(text: string) {
    if (item.conversationId) store.sendReply(item.conversationId, text);
    else store.toast("Сообщение отправлено клиенту", "success");
    setReplyDraft("");
    setReplySource("manual");
  }

  function handleRecordFeedback(
    decision: FeedbackDecision,
    comment: string,
    opts?: { recommendationId?: string; kind?: string },
  ) {
    // Отклонение черновика CRM логируется отдельным id/kind, чтобы не
    // перетирать решение по рекомендации и не искажать метрики (FR8/FR10).
    const recommendationId =
      opts?.kind === "crm_draft" ? `${item.recommendationId}:crm-draft` : item.recommendationId;
    store.recordFeedback({
      recommendationId,
      decision,
      comment,
      clientId: item.clientId,
      conversationId: item.conversationId,
      label: item.title,
      kind: opts?.kind,
    });
  }

  function handleSaveNote(text: string, nextContactIso: string) {
    store.saveNote({
      clientId: item.clientId,
      taskId: item.taskId,
      text,
      outcome: "follow_up",
      channel: item.channel,
      nextContactIso,
    });
  }

  const tab = store.state.caseTab;

  return (
    <div className="case-workspace">
      <div className="case-scroll">
        <div className="case-inner">
          <CaseHeader client={client} item={item} />

          <div className="case-tabs-row">
            <div className="case-tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  className={`case-tab${tab === t.key ? " case-tab--active" : ""}`}
                  onClick={() => store.setCaseTab(t.key)}
                >
                  <Icon name={t.icon} size={16} />
                  {t.label}
                </button>
              ))}
            </div>
            <button className="case-assistant-btn" onClick={() => store.setAssistant(true)}>
              <Icon name="sparkles" size={16} />
              Ассистент
            </button>
          </div>

          <div className="case-tab-panel">
            {tab === "dialog" && (
              <DialogTab
                ctx={ctx}
                messages={thread}
                clientName={client.fullName}
                replyDraft={replyDraft}
                replySource={replySource}
                onDraftChange={(text, source) => {
                  setReplyDraft(text);
                  setReplySource(source);
                }}
                onSend={handleSend}
              />
            )}
            {tab === "actions" && (
              <ActionsTab ctx={ctx} defaultGoal={item.nextBestAction} onUseReply={handleUseReply} />
            )}
            {tab === "crm" && (
              <CrmTab
                ctx={ctx}
                notes={notes}
                savedDecision={savedDecision}
                onRecordFeedback={handleRecordFeedback}
                onSaveNote={handleSaveNote}
              />
            )}
            {tab === "client" && <ClientTab ctx={ctx} />}
          </div>

          {handled && (
            <div className="case-next">
              <span className="case-next__label">
                <Icon name="check" size={15} /> Кейс обработан
              </span>
              {hasNext ? (
                <button className="btn btn--secondary btn--sm" onClick={onAdvance}>
                  Следующий кейс <Icon name="arrowRight" size={15} />
                </button>
              ) : (
                <span className="case-next__done">Очередь разобрана</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
