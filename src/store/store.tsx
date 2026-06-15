// ============================================================================
// Центральное состояние приложения. Хранит выбор менеджера/кейса, рантайм-
// мутации (отправленные сообщения, сохранённые заметки, обратная связь — FR8,
// история — FR9) и поднимает их в UI через React-контекст.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { ChatTurn, CrmNote, FeedbackDecision, FeedbackEvent, Message } from "../domain/types";
import { dataset } from "../data/index";

export type AppView = "cases" | "products" | "analytics";
export type CaseTab = "dialog" | "actions" | "crm" | "client";

export interface Toast {
  id: number;
  text: string;
  tone: "success" | "info";
}

interface State {
  managerId: string;
  view: AppView;
  selectedWorkItemId: string | null;
  caseTab: CaseTab;
  assistantOpen: boolean;
  feedback: FeedbackEvent[];
  sentMessages: Record<string, Message[]>;
  savedNotes: CrmNote[];
  chats: Record<string, ChatTurn[]>;
  toasts: Toast[];
  /** Имитация недоступности сервиса приоритизации (UC-01 исключение, NFR6). */
  priorityServiceDown: boolean;
}

type Action =
  | { type: "setManager"; managerId: string }
  | { type: "setView"; view: AppView }
  | { type: "selectWorkItem"; id: string | null }
  | { type: "setCaseTab"; tab: CaseTab }
  | { type: "setAssistant"; open: boolean }
  | { type: "addFeedback"; event: FeedbackEvent }
  | { type: "appendMessage"; conversationId: string; message: Message }
  | { type: "saveNote"; note: CrmNote }
  | { type: "setChat"; workItemId: string; turns: ChatTurn[] }
  | { type: "pushToast"; toast: Toast }
  | { type: "dismissToast"; id: number }
  | { type: "setPriorityService"; down: boolean };

const initialState: State = {
  managerId: "m1",
  view: "cases",
  selectedWorkItemId: null,
  caseTab: "dialog",
  assistantOpen: false,
  feedback: [...dataset.seedFeedback],
  sentMessages: {},
  savedNotes: [],
  chats: {},
  toasts: [],
  priorityServiceDown: false,
};

// --- Персистентность работы менеджера (FR9: история доступна после перезагрузки) ---
// Сохраняем только рантайм-результаты работы; эфемерный UI-state не пишем.
const STORAGE_KEY = "alfa-only-runtime-v1";
type PersistedState = Pick<State, "feedback" | "sentMessages" | "savedNotes" | "chats">;

function loadPersisted(): State {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as Partial<PersistedState>;
    return {
      ...initialState,
      feedback: saved.feedback ?? initialState.feedback,
      sentMessages: saved.sentMessages ?? initialState.sentMessages,
      savedNotes: saved.savedNotes ?? initialState.savedNotes,
      chats: saved.chats ?? initialState.chats,
    };
  } catch {
    return initialState;
  }
}

// Стартовое значение счётчика id — выше максимального сохранённого, чтобы
// новые id не коллизировали с прошлой сессией.
function seedCounter(state: State): number {
  let max = 1000;
  const scan = (id: string) => {
    const m = id.match(/(\d+)$/);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  };
  state.feedback.forEach((f) => scan(f.id));
  Object.values(state.sentMessages).forEach((list) => list.forEach((msg) => scan(msg.id)));
  state.savedNotes.forEach((n) => scan(n.id));
  return max;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setManager":
      if (action.managerId === state.managerId) return state;
      return {
        ...state,
        managerId: action.managerId,
        selectedWorkItemId: null,
        view: "cases",
        caseTab: "dialog",
        assistantOpen: false,
      };
    case "setView":
      return { ...state, view: action.view, assistantOpen: false };
    case "selectWorkItem":
      return {
        ...state,
        selectedWorkItemId: action.id,
        view: "cases",
        caseTab: "dialog",
      };
    case "setCaseTab":
      return { ...state, caseTab: action.tab };
    case "setAssistant":
      return { ...state, assistantOpen: action.open };
    case "addFeedback":
      return { ...state, feedback: [...state.feedback, action.event] };
    case "appendMessage": {
      const list = state.sentMessages[action.conversationId] ?? [];
      return {
        ...state,
        sentMessages: {
          ...state.sentMessages,
          [action.conversationId]: [...list, action.message],
        },
      };
    }
    case "saveNote":
      return { ...state, savedNotes: [...state.savedNotes, action.note] };
    case "setChat":
      return { ...state, chats: { ...state.chats, [action.workItemId]: action.turns } };
    case "pushToast":
      // Не более 3 тостов одновременно — иначе скрытые тосты копились бы без таймера.
      return { ...state, toasts: [...state.toasts, action.toast].slice(-3) };
    case "dismissToast":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "setPriorityService":
      return { ...state, priorityServiceDown: action.down };
    default:
      return state;
  }
}

export interface StoreApi {
  state: State;
  setManager: (id: string) => void;
  setView: (view: AppView) => void;
  selectWorkItem: (id: string | null) => void;
  setCaseTab: (tab: CaseTab) => void;
  setAssistant: (open: boolean) => void;
  setPriorityService: (down: boolean) => void;
  sendReply: (conversationId: string, text: string) => void;
  recordFeedback: (input: {
    recommendationId: string;
    decision: FeedbackDecision;
    comment: string;
    clientId: string | null;
    conversationId: string | null;
    label: string;
    kind?: string;
  }) => void;
  saveNote: (input: Omit<CrmNote, "id" | "managerId" | "createdAtIso">) => void;
  setChat: (workItemId: string, turns: ChatTurn[]) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  /** Сообщения диалога = база + отправленные в рантайме. */
  threadMessages: (conversationId: string | null, base: Message[]) => Message[];
}

const StoreContext = createContext<StoreApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, loadPersisted);
  const counter = useRef(seedCounter(state));
  const nextId = () => {
    counter.current += 1;
    return counter.current;
  };

  // Стабильная ссылка: иначе таймер автоскрытия тоста сбрасывался бы на каждом
  // изменении state (dispatch от useReducer стабилен).
  const dismissToast = useCallback((id: number) => dispatch({ type: "dismissToast", id }), []);

  // Сохраняем результаты работы менеджера при каждом изменении.
  useEffect(() => {
    try {
      const toSave: PersistedState = {
        feedback: state.feedback,
        sentMessages: state.sentMessages,
        savedNotes: state.savedNotes,
        chats: state.chats,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      /* приватный режим / превышен лимит — игнорируем */
    }
  }, [state.feedback, state.sentMessages, state.savedNotes, state.chats]);

  const api = useMemo<StoreApi>(() => {
    return {
      state,
      setManager: (id) => dispatch({ type: "setManager", managerId: id }),
      setView: (view) => dispatch({ type: "setView", view }),
      selectWorkItem: (id) => dispatch({ type: "selectWorkItem", id }),
      setCaseTab: (tab) => dispatch({ type: "setCaseTab", tab }),
      setAssistant: (open) => dispatch({ type: "setAssistant", open }),
      setPriorityService: (down) => dispatch({ type: "setPriorityService", down }),
      sendReply: (conversationId, text) => {
        const message: Message = {
          id: `rt-msg-${nextId()}`,
          conversationId,
          sender: "manager",
          text,
          sentAtIso: new Date().toISOString(),
        };
        dispatch({ type: "appendMessage", conversationId, message });
        dispatch({ type: "pushToast", toast: { id: nextId(), text: "Сообщение отправлено клиенту", tone: "success" } });
      },
      recordFeedback: (input) => {
        const event: FeedbackEvent = {
          id: `rt-fb-${nextId()}`,
          recommendationId: input.recommendationId,
          managerId: state.managerId,
          kind: input.kind ?? "manager_work_item",
          clientId: input.clientId,
          conversationId: input.conversationId,
          decision: input.decision,
          comment: input.comment,
          label: input.label,
          createdAtIso: new Date().toISOString(),
        };
        dispatch({ type: "addFeedback", event });
        const verb =
          input.decision === "accepted" ? "принято" : input.decision === "edited" ? "отредактировано" : "отклонено";
        dispatch({ type: "pushToast", toast: { id: nextId(), text: `Решение зафиксировано: ${verb}`, tone: "info" } });
      },
      saveNote: (input) => {
        const note: CrmNote = {
          ...input,
          id: `rt-note-${nextId()}`,
          managerId: state.managerId,
          createdAtIso: new Date().toISOString(),
        };
        dispatch({ type: "saveNote", note });
        dispatch({ type: "pushToast", toast: { id: nextId(), text: "Заметка сохранена в CRM", tone: "success" } });
      },
      setChat: (workItemId, turns) => dispatch({ type: "setChat", workItemId, turns }),
      toast: (text, tone = "success") => dispatch({ type: "pushToast", toast: { id: nextId(), text, tone } }),
      dismissToast,
      threadMessages: (conversationId, base) => {
        if (!conversationId) return base;
        const extra = state.sentMessages[conversationId] ?? [];
        return [...base, ...extra];
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within AppProvider");
  return ctx;
}
