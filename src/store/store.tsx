// ============================================================================
// UI-состояние приложения. Данные и результаты работы менеджера (очередь,
// отправленные сообщения, заметки, обратная связь, история ассистента — FR8/FR9)
// хранит и персистит бэкенд (SQLite); здесь — только эфемерное состояние экрана.
// ============================================================================

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from "react";

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
  | { type: "pushToast"; toast: Toast }
  | { type: "dismissToast"; id: number }
  | { type: "setPriorityService"; down: boolean };

const initialState: State = {
  managerId: "m1",
  view: "cases",
  selectedWorkItemId: null,
  caseTab: "dialog",
  assistantOpen: false,
  toasts: [],
  priorityServiceDown: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setManager":
      if (action.managerId === state.managerId) return state;
      return { ...state, managerId: action.managerId, selectedWorkItemId: null, view: "cases", caseTab: "dialog", assistantOpen: false };
    case "setView":
      return { ...state, view: action.view, assistantOpen: false };
    case "selectWorkItem":
      return { ...state, selectedWorkItemId: action.id, view: "cases", caseTab: "dialog" };
    case "setCaseTab":
      return { ...state, caseTab: action.tab };
    case "setAssistant":
      return { ...state, assistantOpen: action.open };
    case "pushToast":
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
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const counter = useRef(1000);
  const nextId = () => {
    counter.current += 1;
    return counter.current;
  };

  const dismissToast = useCallback((id: number) => dispatch({ type: "dismissToast", id }), []);

  const api = useMemo<StoreApi>(
    () => ({
      state,
      setManager: (id) => dispatch({ type: "setManager", managerId: id }),
      setView: (view) => dispatch({ type: "setView", view }),
      selectWorkItem: (id) => dispatch({ type: "selectWorkItem", id }),
      setCaseTab: (tab) => dispatch({ type: "setCaseTab", tab }),
      setAssistant: (open) => dispatch({ type: "setAssistant", open }),
      setPriorityService: (down) => dispatch({ type: "setPriorityService", down }),
      toast: (text, tone = "success") => dispatch({ type: "pushToast", toast: { id: nextId(), text, tone } }),
      dismissToast,
    }),
    [state, dismissToast],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within AppProvider");
  return ctx;
}
