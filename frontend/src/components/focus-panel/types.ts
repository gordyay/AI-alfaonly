import type { UiStatus } from "../../lib/ui";
import type {
  ActivityLogEntry,
  AISummaryDraft,
  CaseInteraction,
  ClientDetailResponse,
  RecommendationStatus,
  ReplySource,
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
  interaction?: CaseInteraction | null;
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
  replyDraftText: string;
  replySource: ReplySource;
  replySending: boolean;
  replyStatus?: UiStatus;
  canPrefillReplyFromScript: boolean;
  canPrefillReplyFromObjection: boolean;
  onChangeTab: (tab: ViewTab) => void;
  onSelectInteraction: (interactionId: string) => void;
  onFeedbackCommentChange: (value: string) => void;
  onFeedbackDecisionChange: (decision: RecommendationStatus) => void;
  onSubmitFeedback: () => void;
  onQuickAssistantAction: (message: string) => void;
  onReplyDraftChange: (value: string) => void;
  onPrefillReplyFromScript: () => void;
  onPrefillReplyFromObjection: () => void;
  onClearReplyDraft: () => void;
  onSendReply: () => void;
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
      item.case_id === detail.case_id ||
      (workItem.source_interaction_id && item.source_interaction_id === workItem.source_interaction_id) ||
      (workItem.conversation_id && item.conversation_id === workItem.conversation_id),
  );
}
