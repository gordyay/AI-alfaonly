import { formatDateTime, getFocusPropensityLabel, getMiniSummaryCopy, getRecommendationStatusLabel, getWorkItemTypeLabel } from "../lib/utils";
import type { UiStatus } from "../lib/ui";
import type {
  AISummaryDraft,
  AssistantTaskKind,
  CaseInteraction,
  ClientDetailResponse,
  RecommendationStatus,
  ViewTab,
  WorkItem,
} from "../types";
import { CaseAction } from "./focus-panel/CaseAction";
import { CaseCRM } from "./focus-panel/CaseCRM";
import { CasePortfolio } from "./focus-panel/CasePortfolio";
import { CaseProfile } from "./focus-panel/CaseProfile";
import { CaseSummary } from "./focus-panel/CaseSummary";

interface FocusPanelProps {
  detail?: ClientDetailResponse | null;
  workItem?: WorkItem | null;
  interaction?: CaseInteraction | null;
  aiEnabled: boolean;
  aiUnavailableMessage?: string | null;
  assistantEnabled?: boolean;
  feedbackEnabled?: boolean;
  propensityEnabled?: boolean;
  activeTab: ViewTab;
  onChangeTab: (tab: ViewTab) => void;
  aiDraft?: AISummaryDraft | null;
  aiLoading: boolean;
  aiSaving: boolean;
  aiStatus?: UiStatus;
  aiSaveStatus?: UiStatus;
  onGenerateSummary: () => void;
  onSaveSummary: () => void;
  onCopyCRM: () => void;
  onUpdateDraft: (draft: AISummaryDraft) => void;
  scriptGoal: string;
  onScriptGoalChange: (value: string) => void;
  scriptLoading: boolean;
  scriptSelecting: boolean;
  scriptStatus?: UiStatus;
  onGenerateScript: () => void;
  onSelectScriptVariant: (variantLabel: string, selectedText: string) => void;
  objectionInput: string;
  onObjectionInputChange: (value: string) => void;
  objectionLoading: boolean;
  objectionSelecting: boolean;
  objectionStatus?: UiStatus;
  onGenerateObjectionWorkflow: () => void;
  onSelectObjectionOption: (optionTitle: string, selectedResponse: string) => void;
  replyDraftText: string;
  replySource: "manual" | "script" | "objection" | "assistant";
  replySending: boolean;
  replyStatus?: UiStatus;
  onReplyDraftChange: (value: string) => void;
  onPrefillReplyFromScript: () => void;
  onPrefillReplyFromObjection: () => void;
  onClearReplyDraft: () => void;
  onSendReply: () => void;
  feedbackDecision?: RecommendationStatus | null;
  savedFeedbackDecision?: RecommendationStatus | null;
  feedbackComment: string;
  feedbackSubmitting: boolean;
  feedbackStatus?: UiStatus;
  assistantSending: boolean;
  onFeedbackCommentChange: (value: string) => void;
  onFeedbackDecisionChange: (decision: RecommendationStatus) => void;
  onSubmitFeedback: () => void;
  onOpenAssistantTask: (taskKind: AssistantTaskKind) => void;
}

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "actions", label: "Действия" },
  { id: "crm", label: "CRM" },
  { id: "client", label: "Клиент" },
];

export function FocusPanel({
  detail,
  workItem,
  interaction,
  aiEnabled,
  aiUnavailableMessage,
  assistantEnabled = true,
  feedbackEnabled = true,
  propensityEnabled = true,
  activeTab,
  onChangeTab,
  aiDraft,
  aiLoading,
  aiSaving,
  aiStatus,
  aiSaveStatus,
  onGenerateSummary,
  onSaveSummary,
  onCopyCRM,
  onUpdateDraft,
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
  replyDraftText,
  replySource,
  replySending,
  replyStatus,
  onReplyDraftChange,
  onPrefillReplyFromScript,
  onPrefillReplyFromObjection,
  onClearReplyDraft,
  onSendReply,
  feedbackDecision,
  savedFeedbackDecision,
  feedbackComment,
  feedbackSubmitting,
  feedbackStatus,
  assistantSending,
  onFeedbackCommentChange,
  onFeedbackDecisionChange,
  onSubmitFeedback,
  onOpenAssistantTask,
}: FocusPanelProps) {
  if (!detail || !workItem) {
    return (
      <section className="panel focus-panel focus-panel--empty">
        <h2>Выберите кейс</h2>
        <p>Детали появятся здесь.</p>
      </section>
    );
  }

  const { client } = detail;
  const latestScriptArtifact = detail.script_history[0] ?? null;
  const latestObjectionArtifact = detail.objection_history[0] ?? null;
  const nextContact =
    workItem.due_at || interaction?.insights?.next_contact_due_at || client.next_contact_due_at || null;

  return (
    <section className="panel focus-panel">
      <header className="focus-panel__header">
        <div>
          <h2>{workItem.title}</h2>
          <p className="focus-panel__subtitle">
            {client.full_name} · {getRecommendationStatusLabel(workItem.recommendation_status)} ·{" "}
            {getWorkItemTypeLabel(workItem.item_type)}
          </p>
        </div>
        <div className="focus-panel__score">
          <span>Приоритет</span>
          <strong>{workItem.priority_score}</strong>
        </div>
      </header>

      <div className="chip-row">
        {client.tags.slice(0, 4).map((tag) => (
          <span className="badge" key={tag}>
            {tag}
          </span>
        ))}
        {client.tags.length > 4 ? <span className="badge badge--subtle">+{client.tags.length - 4}</span> : null}
        {workItem.business_goal ? <span className="badge badge--accent">{workItem.business_goal}</span> : null}
      </div>

      <section className="summary-strip">
        <article className="summary-card summary-card--feature">
          <span>Коротко</span>
          <strong>{getMiniSummaryCopy({ detailSummary: client.ai_summary_text, workItem, draft: aiDraft })}</strong>
        </article>
        <article className="summary-card">
          <span>Следующий шаг</span>
          <strong>{workItem.next_best_action}</strong>
        </article>
        {propensityEnabled ? (
          <article className="summary-card">
            <span>Продукт</span>
            <strong>{getFocusPropensityLabel(detail.product_propensity)}</strong>
          </article>
        ) : null}
        <article className="summary-card">
          <span>Контакт</span>
          <strong>{formatDateTime(nextContact)}</strong>
        </article>
      </section>

      <div className="focus-panel__tabs">
        {TABS.map((tab) => (
          <button
            className={`context-tab${tab.id === activeTab ? " is-active" : ""}`}
            key={tab.id}
            type="button"
            onClick={() => onChangeTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <CaseSummary
          detail={detail}
          workItem={workItem}
          interaction={interaction}
          aiEnabled={aiEnabled}
          aiUnavailableMessage={aiUnavailableMessage}
          assistantEnabled={assistantEnabled}
          feedbackEnabled={feedbackEnabled}
          propensityEnabled={propensityEnabled}
          aiDraft={aiDraft}
          feedbackDecision={feedbackDecision}
          savedFeedbackDecision={savedFeedbackDecision}
          feedbackComment={feedbackComment}
          feedbackSubmitting={feedbackSubmitting}
          feedbackStatus={feedbackStatus}
          assistantSending={assistantSending}
          replyDraftText={replyDraftText}
          replySource={replySource}
          replySending={replySending}
          replyStatus={replyStatus}
          canPrefillReplyFromScript={Boolean(
            latestScriptArtifact?.selected_text || latestScriptArtifact?.draft.follow_up_message || latestScriptArtifact?.draft.ready_script,
          )}
          canPrefillReplyFromObjection={Boolean(latestObjectionArtifact?.selected_response)}
          onChangeTab={onChangeTab}
          onFeedbackCommentChange={onFeedbackCommentChange}
          onFeedbackDecisionChange={onFeedbackDecisionChange}
          onSubmitFeedback={onSubmitFeedback}
          onOpenAssistantTask={onOpenAssistantTask}
          onReplyDraftChange={onReplyDraftChange}
          onPrefillReplyFromScript={onPrefillReplyFromScript}
          onPrefillReplyFromObjection={onPrefillReplyFromObjection}
          onClearReplyDraft={onClearReplyDraft}
          onSendReply={onSendReply}
        />
      ) : null}

      {activeTab === "actions" ? (
        <div className="actions-stack">
          <CaseAction
            detail={detail}
            workItem={workItem}
            interaction={interaction}
            aiEnabled={aiEnabled}
            aiUnavailableMessage={aiUnavailableMessage}
            assistantEnabled={assistantEnabled}
            feedbackEnabled={feedbackEnabled}
            propensityEnabled={propensityEnabled}
            mode="script"
            scriptGoal={scriptGoal}
            onScriptGoalChange={onScriptGoalChange}
            scriptLoading={scriptLoading}
            scriptSelecting={scriptSelecting}
            scriptStatus={scriptStatus}
            onGenerateScript={onGenerateScript}
            onSelectScriptVariant={onSelectScriptVariant}
            objectionInput={objectionInput}
            onObjectionInputChange={onObjectionInputChange}
            objectionLoading={objectionLoading}
            objectionSelecting={objectionSelecting}
            objectionStatus={objectionStatus}
            onGenerateObjectionWorkflow={onGenerateObjectionWorkflow}
            onSelectObjectionOption={onSelectObjectionOption}
            onOpenAssistantTask={onOpenAssistantTask}
          />
          <CaseAction
            detail={detail}
            workItem={workItem}
            interaction={interaction}
            aiEnabled={aiEnabled}
            aiUnavailableMessage={aiUnavailableMessage}
            assistantEnabled={assistantEnabled}
            feedbackEnabled={feedbackEnabled}
            propensityEnabled={propensityEnabled}
            mode="objections"
            scriptGoal={scriptGoal}
            onScriptGoalChange={onScriptGoalChange}
            scriptLoading={scriptLoading}
            scriptSelecting={scriptSelecting}
            scriptStatus={scriptStatus}
            onGenerateScript={onGenerateScript}
            onSelectScriptVariant={onSelectScriptVariant}
            objectionInput={objectionInput}
            onObjectionInputChange={onObjectionInputChange}
            objectionLoading={objectionLoading}
            objectionSelecting={objectionSelecting}
            objectionStatus={objectionStatus}
            onGenerateObjectionWorkflow={onGenerateObjectionWorkflow}
            onSelectObjectionOption={onSelectObjectionOption}
            onOpenAssistantTask={onOpenAssistantTask}
          />
        </div>
      ) : null}

      {activeTab === "crm" ? (
        <CaseCRM
          detail={detail}
          workItem={workItem}
          interaction={interaction}
          aiEnabled={aiEnabled}
          aiUnavailableMessage={aiUnavailableMessage}
          assistantEnabled={assistantEnabled}
          feedbackEnabled={feedbackEnabled}
          propensityEnabled={propensityEnabled}
          aiDraft={aiDraft}
          savedFeedbackDecision={savedFeedbackDecision}
          aiLoading={aiLoading}
          aiSaving={aiSaving}
          aiStatus={aiStatus}
          aiSaveStatus={aiSaveStatus}
          onGenerateSummary={onGenerateSummary}
          onSaveSummary={onSaveSummary}
          onCopyCRM={onCopyCRM}
          onUpdateDraft={onUpdateDraft}
          onOpenAssistantTask={onOpenAssistantTask}
        />
      ) : null}

      {activeTab === "client" ? (
        <div className="actions-stack">
          <CaseProfile
            detail={detail}
            workItem={workItem}
            interaction={interaction}
            aiEnabled={aiEnabled}
            aiUnavailableMessage={aiUnavailableMessage}
            assistantEnabled={assistantEnabled}
            feedbackEnabled={feedbackEnabled}
            propensityEnabled={propensityEnabled}
          />
          <CasePortfolio
            detail={detail}
            workItem={workItem}
            interaction={interaction}
            aiEnabled={aiEnabled}
            aiUnavailableMessage={aiUnavailableMessage}
            assistantEnabled={assistantEnabled}
            feedbackEnabled={feedbackEnabled}
            propensityEnabled={propensityEnabled}
          />
        </div>
      ) : null}
    </section>
  );
}
