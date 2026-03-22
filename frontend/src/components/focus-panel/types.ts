import type { UiStatus } from "../../lib/ui";
import type {
  ActivityLogEntry,
  AISummaryDraft,
  ClientDetailResponse,
  Conversation,
  RecommendationStatus,
  ViewTab,
  WorkItem,
} from "../../types";

export interface VisibleActivityEntry {
  id: string;
  title: string;
  text: string;
  createdAt: string;
}

export interface FocusCaseBaseProps {
  detail: ClientDetailResponse;
  workItem: WorkItem;
  conversation?: Conversation | null;
  aiEnabled: boolean;
  aiUnavailableMessage?: string | null;
  assistantEnabled?: boolean;
  feedbackEnabled?: boolean;
  propensityEnabled?: boolean;
}

export interface CaseSummaryProps extends FocusCaseBaseProps {
  aiDraft?: AISummaryDraft | null;
  feedbackDecision?: RecommendationStatus | null;
  savedFeedbackDecision?: RecommendationStatus | null;
  feedbackComment: string;
  feedbackSubmitting: boolean;
  feedbackStatus?: UiStatus;
  assistantSending: boolean;
  onChangeTab: (tab: ViewTab) => void;
  onFeedbackCommentChange: (value: string) => void;
  onFeedbackDecisionChange: (decision: RecommendationStatus) => void;
  onSubmitFeedback: () => void;
  onQuickAssistantAction: (message: string) => void;
}

export interface CaseActionProps extends FocusCaseBaseProps {
  mode: "script" | "objections";
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
}

export interface CaseCRMProps extends FocusCaseBaseProps {
  aiDraft?: AISummaryDraft | null;
  savedFeedbackDecision?: RecommendationStatus | null;
  aiLoading: boolean;
  aiSaving: boolean;
  aiStatus?: UiStatus;
  aiSaveStatus?: UiStatus;
  onGenerateSummary: () => void;
  onSaveSummary: () => void;
  onCopyCRM: () => void;
  onUpdateDraft: (draft: AISummaryDraft) => void;
}

export type CaseProfileProps = FocusCaseBaseProps;

export type CasePortfolioProps = FocusCaseBaseProps;

export function getRecentAuditEntries(detail: ClientDetailResponse, workItem: WorkItem): ActivityLogEntry[] {
  return detail.activity_log.filter(
    (item) =>
      item.recommendation_id === workItem.recommendation_id ||
      (workItem.conversation_id && item.conversation_id === workItem.conversation_id),
  );
}
