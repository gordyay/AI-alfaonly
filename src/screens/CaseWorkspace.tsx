// Рабочее пространство кейса (раздел 6.5): единый поток работы вокруг клиента —
// диалог, сценарий, итог/CRM, профиль. Данные кейса и результаты ИИ-функций
// приходят с бэкенда; действия менеджера уходят на бэкенд после подтверждения.

import { useState } from "react";
import type { CaseTab } from "../store/store";
import { useStore } from "../store/store";
import { api, type CaseDetail } from "../api/client";
import type { FeedbackDecision, ReplySource } from "../domain/types";
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
  detail,
  managerId,
  onMutated,
  hasNext,
  onAdvance,
}: {
  detail: CaseDetail;
  managerId: string;
  onMutated: () => void;
  hasNext: boolean;
  onAdvance: () => void;
}) {
  const store = useStore();
  const item = detail.item;
  const ctx = detail.context;
  const client = ctx.client;
  const wid = item.id;

  const [replyDraft, setReplyDraft] = useState("");
  const [replySource, setReplySource] = useState<ReplySource>("manual");

  function handleUseReply(text: string, source: ReplySource) {
    setReplyDraft(text);
    setReplySource(source);
    store.setCaseTab("dialog");
    store.toast("Текст перенесён в ответ клиенту", "info");
  }

  async function handleSend(text: string): Promise<boolean> {
    try {
      await api.send(wid, text, managerId);
      setReplyDraft("");
      setReplySource("manual");
      store.toast("Сообщение отправлено клиенту", "success");
      onMutated();
      return true;
    } catch {
      store.toast("Не удалось отправить сообщение — попробуйте ещё раз", "info");
      return false;
    }
  }

  async function handleRecordFeedback(
    decision: FeedbackDecision,
    comment: string,
    opts?: { kind?: string },
  ): Promise<boolean> {
    // Отклонение черновика CRM логируется отдельным id/kind, чтобы не перетирать
    // решение по рекомендации и не искажать метрики (FR8/FR10).
    const recommendationId =
      opts?.kind === "crm_draft" ? `${item.recommendationId}:crm-draft` : item.recommendationId;
    try {
      await api.recordFeedback({
        recommendationId,
        decision,
        comment,
        clientId: item.clientId,
        conversationId: item.conversationId,
        label: item.title,
        kind: opts?.kind,
        managerId,
      });
      const verb =
        decision === "accepted" ? "принято" : decision === "edited" ? "отредактировано" : "отклонено";
      store.toast(`Решение зафиксировано: ${verb}`, "info");
      onMutated();
      return true;
    } catch {
      store.toast("Не удалось зафиксировать решение — попробуйте ещё раз", "info");
      return false;
    }
  }

  async function handleSaveNote(text: string, nextContactIso: string): Promise<boolean> {
    try {
      await api.saveNote({
        clientId: item.clientId,
        taskId: item.taskId,
        text,
        outcome: "follow_up",
        channel: item.channel,
        nextContactIso,
        managerId,
      });
      store.toast("Заметка сохранена в CRM", "success");
      onMutated();
      return true;
    } catch {
      store.toast("Не удалось сохранить заметку — попробуйте ещё раз", "info");
      return false;
    }
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
                wid={wid}
                ctx={ctx}
                messages={ctx.messages}
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
              <ActionsTab wid={wid} ctx={ctx} defaultGoal={item.nextBestAction} onUseReply={handleUseReply} />
            )}
            {tab === "crm" && (
              <CrmTab
                wid={wid}
                notes={detail.notes}
                savedDecision={detail.savedDecision}
                onRecordFeedback={handleRecordFeedback}
                onSaveNote={handleSaveNote}
              />
            )}
            {tab === "client" && <ClientTab ctx={ctx} propensities={detail.propensities} />}
          </div>

          {detail.handled && (
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
