import { useReducer } from "react";
import type { WorkQueueFilters } from "../lib/utils";
import type { AISummaryDraft, AppMode, RecommendationStatus, ReplySource, SortMode, ViewTab } from "../types";
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
  mode: AppMode;
  managerId: string;
  sortMode: SortMode;
  filterQuery: string;
  queueFilters: WorkQueueFilters;
  selectedClientId: string | null;
  selectedWorkItemId: string | null;
  selectedInteractionId: string | null;
  tourOpen: boolean;
  assistantOpen: boolean;
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
  replyDraftText: string;
  replySource: ReplySource;
  replySending: boolean;
  replyStatus: UiStatus;
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

const DEFAULT_MANAGER_ID = "m1";
const DEFAULT_APP_MODE: AppMode = "inbox";
const DEFAULT_VIEW_TAB: ViewTab = "overview";

function isAppMode(value: string | null): value is AppMode {
  return value === "inbox" || value === "case" || value === "analytics";
}

function isViewTab(value: string | null): value is ViewTab {
  return value === "overview" || value === "actions" || value === "crm" || value === "client";
}

function readInitialStateFromUrl(): Partial<FocusScreenState> {
  if (typeof window === "undefined") {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const tab = params.get("tab");
  const managerId = params.get("manager")?.trim() || null;
  const selectedClientId = params.get("client")?.trim() || null;
  const selectedWorkItemId = params.get("item")?.trim() || null;
  const selectedInteractionId = params.get("interaction")?.trim() || null;

  return {
    managerId: managerId ?? DEFAULT_MANAGER_ID,
    mode: isAppMode(mode) ? mode : DEFAULT_APP_MODE,
    activeTab: isViewTab(tab) ? tab : DEFAULT_VIEW_TAB,
    selectedClientId,
    selectedWorkItemId,
    selectedInteractionId,
    assistantOpen: params.get("assistant") === "1",
  };
}

export function syncFocusScreenStateToUrl(
  state: Pick<
    FocusScreenState,
    | "activeTab"
    | "assistantOpen"
    | "managerId"
    | "mode"
    | "selectedClientId"
    | "selectedInteractionId"
    | "selectedWorkItemId"
  >,
) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (state.managerId && state.managerId !== DEFAULT_MANAGER_ID) {
    url.searchParams.set("manager", state.managerId);
  } else {
    url.searchParams.delete("manager");
  }

  if (state.mode !== DEFAULT_APP_MODE) {
    url.searchParams.set("mode", state.mode);
  } else {
    url.searchParams.delete("mode");
  }

  if (state.selectedClientId) {
    url.searchParams.set("client", state.selectedClientId);
  } else {
    url.searchParams.delete("client");
  }

  if (state.selectedWorkItemId) {
    url.searchParams.set("item", state.selectedWorkItemId);
  } else {
    url.searchParams.delete("item");
  }

  if (state.selectedInteractionId) {
    url.searchParams.set("interaction", state.selectedInteractionId);
  } else {
    url.searchParams.delete("interaction");
  }

  if (state.activeTab !== DEFAULT_VIEW_TAB) {
    url.searchParams.set("tab", state.activeTab);
  } else {
    url.searchParams.delete("tab");
  }

  if (state.assistantOpen) {
    url.searchParams.set("assistant", "1");
  } else {
    url.searchParams.delete("assistant");
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function createInitialState(): FocusScreenState {
  return {
    mode: "inbox",
    managerId: "m1",
    sortMode: "priority",
    filterQuery: "",
    queueFilters: DEFAULT_QUEUE_FILTERS,
    selectedClientId: null,
    selectedWorkItemId: null,
    selectedInteractionId: null,
    tourOpen: false,
    assistantOpen: false,
    activeTab: "overview",
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
    replyDraftText: "",
    replySource: "manual",
    replySending: false,
    replyStatus: null,
    feedbackDecision: null,
    feedbackComment: "",
    feedbackSubmitting: false,
    feedbackStatus: null,
    ...readInitialStateFromUrl(),
  };
}

function isPatchNoop(state: FocusScreenState, patch: Partial<FocusScreenState>) {
  return (Object.entries(patch) as Array<[keyof FocusScreenState, FocusScreenState[keyof FocusScreenState]]>).every(
    ([key, value]) => Object.is(state[key], value),
  );
}

function focusScreenReducer(state: FocusScreenState, action: FocusScreenAction): FocusScreenState {
  switch (action.type) {
    case "patch":
      if (isPatchNoop(state, action.patch)) {
        return state;
      }
      return { ...state, ...action.patch };
    case "resetForManagerChange":
      return {
        ...createInitialState(),
        managerId: action.managerId,
        tourOpen: state.tourOpen,
      };
    case "resetForWorkItemSelection":
      return {
        ...state,
        selectedClientId: action.clientId,
        selectedWorkItemId: action.workItemId,
        selectedInteractionId: null,
        activeTab: "overview",
        assistantOpen: false,
        aiDraft: null,
        aiStatus: null,
        aiSaveStatus: null,
        scriptGoal: "",
        scriptStatus: null,
        objectionInput: "",
        objectionStatus: null,
        replyDraftText: "",
        replySource: "manual",
        replySending: false,
        replyStatus: null,
        feedbackDecision: null,
        feedbackComment: "",
        feedbackStatus: null,
      };
    case "syncFeedback":
      if (
        state.feedbackDecision === action.decision &&
        state.feedbackComment === action.comment &&
        state.feedbackStatus === null
      ) {
        return state;
      }
      return {
        ...state,
        feedbackDecision: action.decision,
        feedbackComment: action.comment,
        feedbackStatus: null,
      };
    case "setQueueFilter":
      if (state.queueFilters[action.name] === action.value) {
        return state;
      }
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
