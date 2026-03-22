import { formatDateTime, getFocusPropensityLabel, getMiniSummaryCopy, getRecommendationStatusLabel, getWorkItemTypeLabel } from "../lib/utils";
import type { UiStatus } from "../lib/ui";
import type { AISummaryDraft, ClientDetailResponse, Conversation, RecommendationStatus, ViewTab, WorkItem } from "../types";
import { CaseAction } from "./focus-panel/CaseAction";
import { CaseCRM } from "./focus-panel/CaseCRM";
import { CasePortfolio } from "./focus-panel/CasePortfolio";
import { CaseProfile } from "./focus-panel/CaseProfile";
import { CaseSummary } from "./focus-panel/CaseSummary";

interface FocusPanelProps {
  detail?: ClientDetailResponse | null;
  workItem?: WorkItem | null;
  conversation?: Conversation | null;
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
  feedbackDecision?: RecommendationStatus | null;
  savedFeedbackDecision?: RecommendationStatus | null;
  feedbackComment: string;
  feedbackSubmitting: boolean;
  feedbackStatus?: UiStatus;
  assistantSending: boolean;
  onFeedbackCommentChange: (value: string) => void;
  onFeedbackDecisionChange: (decision: RecommendationStatus) => void;
  onSubmitFeedback: () => void;
  onQuickAssistantAction: (message: string) => void;
}

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: "summary", label: "Сводка" },
  { id: "script", label: "Сценарий" },
  { id: "objections", label: "Возражения" },
  { id: "crm", label: "CRM" },
  { id: "profile", label: "Профиль" },
  { id: "portfolio", label: "Портфель" },
];

export function FocusPanel({
  detail,
  workItem,
  conversation,
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
  feedbackDecision,
  savedFeedbackDecision,
  feedbackComment,
  feedbackSubmitting,
  feedbackStatus,
  assistantSending,
  onFeedbackCommentChange,
  onFeedbackDecisionChange,
  onSubmitFeedback,
  onQuickAssistantAction,
}: FocusPanelProps) {
  if (!detail || !workItem) {
    return (
      <section className="panel focus-panel focus-panel--empty">
        <p className="panel__eyebrow">Рабочее окно менеджера</p>
        <h2>Фокус на день</h2>
        <p>
          Выберите задачу, коммуникацию или возможность в левой колонке. Основной кейс откроется здесь
          вместе с объяснением приоритета, записью в CRM и контекстом клиента.
        </p>
      </section>
    );
  }

  const { client } = detail;
  const nextContact =
    workItem.due_at || conversation?.insights?.next_contact_due_at || client.next_contact_due_at || null;

  return (
    <section className="panel focus-panel">
      <header className="focus-panel__header">
        <div>
          <p className="panel__eyebrow">Фокусный кейс</p>
          <h2>{workItem.title}</h2>
          <p className="focus-panel__subtitle">
            {client.full_name} · {getWorkItemTypeLabel(workItem.item_type)} ·{" "}
            {getRecommendationStatusLabel(workItem.recommendation_status)}
          </p>
        </div>
        <div className="focus-panel__score">
          <span>Оценка приоритета</span>
          <strong>{workItem.priority_score}</strong>
        </div>
      </header>

      <div className="chip-row">
        {client.tags.map((tag) => (
          <span className="badge" key={tag}>
            {tag}
          </span>
        ))}
        {workItem.business_goal ? <span className="badge badge--accent">{workItem.business_goal}</span> : null}
      </div>

      <section className="summary-strip">
        <article className="summary-card summary-card--feature">
          <span>Мини-сводка</span>
          <strong>{getMiniSummaryCopy({ detailSummary: client.ai_summary_text, workItem, draft: aiDraft })}</strong>
        </article>
        <article className="summary-card">
          <span>Следующее действие</span>
          <strong>{workItem.next_best_action}</strong>
        </article>
        {propensityEnabled ? (
          <article className="summary-card">
            <span>Лучший продукт</span>
            <strong>{getFocusPropensityLabel(detail.product_propensity)}</strong>
          </article>
        ) : null}
        <article className="summary-card">
          <span>Следующий контакт</span>
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

      {activeTab === "summary" ? (
        <CaseSummary
          detail={detail}
          workItem={workItem}
          conversation={conversation}
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
          onChangeTab={onChangeTab}
          onFeedbackCommentChange={onFeedbackCommentChange}
          onFeedbackDecisionChange={onFeedbackDecisionChange}
          onSubmitFeedback={onSubmitFeedback}
          onQuickAssistantAction={onQuickAssistantAction}
        />
      ) : null}

      {activeTab === "script" ? (
        <CaseAction
          detail={detail}
          workItem={workItem}
          conversation={conversation}
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
        />
      ) : null}

      {activeTab === "objections" ? (
        <CaseAction
          detail={detail}
          workItem={workItem}
          conversation={conversation}
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
        />
      ) : null}

      {activeTab === "crm" ? (
        <CaseCRM
          detail={detail}
          workItem={workItem}
          conversation={conversation}
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
        />
      ) : null}

      {activeTab === "profile" ? (
        <CaseProfile
          detail={detail}
          workItem={workItem}
          conversation={conversation}
          aiEnabled={aiEnabled}
          aiUnavailableMessage={aiUnavailableMessage}
          assistantEnabled={assistantEnabled}
          feedbackEnabled={feedbackEnabled}
          propensityEnabled={propensityEnabled}
        />
      ) : null}

      {activeTab === "portfolio" ? (
        <CasePortfolio
          detail={detail}
          workItem={workItem}
          conversation={conversation}
          aiEnabled={aiEnabled}
          aiUnavailableMessage={aiUnavailableMessage}
          assistantEnabled={assistantEnabled}
          feedbackEnabled={feedbackEnabled}
          propensityEnabled={propensityEnabled}
        />
      ) : null}
    </section>
  );
}
