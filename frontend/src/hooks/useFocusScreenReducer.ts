import { useReducer } from "react";
import type { WorkQueueFilters } from "../lib/utils";
import type { AISummaryDraft, RecommendationStatus, SortMode, ViewTab } from "../types";
import type { UiStatus } from "../lib/ui";

export const DEFAULT_QUEUE_FILTERS: WorkQueueFilters = {
  itemType: "all",
  productCode: "all",
  priorityLabel: "all",
  recommendationStatus: "all",
  churnRisk: "all",
  channel: "all",
};

export interface FocusScreenState {
  managerId: string;
  sortMode: SortMode;
  filterQuery: string;
  queueFilters: WorkQueueFilters;
  selectedClientId: string | null;
  selectedWorkItemId: string | null;
  onboardingCollapsed: boolean;
  tourOpen: boolean;
  pendingFocusJump: boolean;
  activeTab: ViewTab;
  aiDraft: AISummaryDraft | null;
  aiLoading: boolean;
  aiSaving: boolean;
  aiStatus: UiStatus;
  aiSaveStatus: UiStatus;
  scriptGoal: string;
  scriptLoading: boolean;
  scriptSelecting: boolean;
  scriptStatus: UiStatus;
  objectionInput: string;
  objectionLoading: boolean;
  objectionSelecting: boolean;
  objectionStatus: UiStatus;
  feedbackDecision: RecommendationStatus | null;
  feedbackComment: string;
  feedbackSubmitting: boolean;
  feedbackStatus: UiStatus;
}

export type FocusScreenAction =
  | { type: "patch"; patch: Partial<FocusScreenState> }
  | { type: "resetForManagerChange"; managerId: string }
  | { type: "resetForWorkItemSelection"; clientId: string; workItemId: string }
  | { type: "syncFeedback"; decision: RecommendationStatus | null; comment: string }
  | { type: "setQueueFilter"; name: keyof WorkQueueFilters; value: string };

function createInitialState(): FocusScreenState {
  return {
    managerId: "m1",
    sortMode: "priority",
    filterQuery: "",
    queueFilters: DEFAULT_QUEUE_FILTERS,
    selectedClientId: null,
    selectedWorkItemId: null,
    onboardingCollapsed: true,
    tourOpen: false,
    pendingFocusJump: false,
    activeTab: "summary",
    aiDraft: null,
    aiLoading: false,
    aiSaving: false,
    aiStatus: null,
    aiSaveStatus: null,
    scriptGoal: "",
    scriptLoading: false,
    scriptSelecting: false,
    scriptStatus: null,
    objectionInput: "",
    objectionLoading: false,
    objectionSelecting: false,
    objectionStatus: null,
    feedbackDecision: null,
    feedbackComment: "",
    feedbackSubmitting: false,
    feedbackStatus: null,
  };
}

function focusScreenReducer(state: FocusScreenState, action: FocusScreenAction): FocusScreenState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "resetForManagerChange":
      return {
        ...createInitialState(),
        managerId: action.managerId,
        onboardingCollapsed: state.onboardingCollapsed,
        tourOpen: state.tourOpen,
      };
    case "resetForWorkItemSelection":
      return {
        ...state,
        selectedClientId: action.clientId,
        selectedWorkItemId: action.workItemId,
        activeTab: "summary",
        aiDraft: null,
        aiStatus: null,
        aiSaveStatus: null,
        scriptGoal: "",
        scriptStatus: null,
        objectionInput: "",
        objectionStatus: null,
        feedbackDecision: null,
        feedbackComment: "",
        feedbackStatus: null,
      };
    case "syncFeedback":
      return {
        ...state,
        feedbackDecision: action.decision,
        feedbackComment: action.comment,
        feedbackStatus: null,
      };
    case "setQueueFilter":
      return {
        ...state,
        queueFilters: {
          ...state.queueFilters,
          [action.name]: action.value,
        },
      };
    default:
      return state;
  }
}

export function useFocusScreenReducer() {
  return useReducer(focusScreenReducer, undefined, createInitialState);
}
