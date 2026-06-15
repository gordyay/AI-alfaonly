// ============================================================================
// HTTP-клиент к бэкенду (FastAPI, §6.4.2). Фронтенд не считает приоритеты и не
// генерирует тексты сам — он получает готовые результаты «ИИ-оркестратора» по
// REST API. Базовый URL настраивается через VITE_API_URL.
// ============================================================================

import type {
  ChatTurn,
  Client,
  CrmNote,
  FeedbackDecision,
  Manager,
  Message,
  ObjectionResult,
  Product,
  PropensityScore,
  ScriptResult,
  SummaryResult,
  WorkItem,
} from "../domain/types";
import type { AIContext } from "../ai/context";

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://127.0.0.1:8000/api";

export interface QueuedItem extends WorkItem {
  handled: boolean;
}

export interface RankedClient {
  client: Client;
  score: PropensityScore;
}

export interface CaseDetail {
  item: QueuedItem;
  context: AIContext;
  propensities: PropensityScore[];
  notes: CrmNote[];
  savedDecision: FeedbackDecision | null;
  chatHistory: ChatTurn[];
  handled: boolean;
}

export interface ReplyDraft {
  text: string;
  rationale: string;
  sources: string[];
}

export interface SupervisorMetrics {
  totalRecommendations: number;
  decided: number;
  usageRate: number;
  acceptanceRate: number;
  qualityRate: number;
  decisionCounts: Record<FeedbackDecision, number>;
  highPriorityTotal: number;
  highPriorityCovered: number;
  coverageRate: number;
  recentDecisions: Array<{
    id: string;
    decision: FeedbackDecision;
    comment: string;
    clientId: string | null;
    createdAtIso: string;
  }>;
  byManager: Array<{
    managerId: string;
    managerName: string;
    total: number;
    decided: number;
    usageRate: number;
    acceptanceRate: number;
  }>;
  preliminary: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (e) {
    throw new ApiError(0, "Нет связи с сервером ассистента");
  }
  if (!res.ok) {
    throw new ApiError(res.status, `Ошибка сервера (${res.status})`);
  }
  return (await res.json()) as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return http<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export interface FeedbackInput {
  recommendationId: string;
  decision: FeedbackDecision;
  comment: string;
  clientId: string | null;
  conversationId: string | null;
  label: string;
  kind?: string;
  managerId: string;
}

export interface NoteInput {
  clientId: string;
  taskId: string | null;
  text: string;
  outcome: string;
  channel: string;
  nextContactIso: string;
  managerId: string;
}

export const api = {
  health: () => http<{ status: string; aiProvider: string }>("/health"),

  // --- Справочные данные ---
  getManagers: () => http<{ managers: Manager[] }>("/managers").then((r) => r.managers),
  getClients: () => http<{ clients: Client[] }>("/clients").then((r) => r.clients),
  getProducts: () => http<{ products: Product[] }>("/products").then((r) => r.products),

  // --- Очередь и кейс (UC-01, рабочее пространство) ---
  getQueue: (managerId: string) =>
    http<{ items: QueuedItem[] }>(`/queue?managerId=${encodeURIComponent(managerId)}`).then((r) => r.items),
  getCase: (workItemId: string) => http<CaseDetail>(`/cases/${encodeURIComponent(workItemId)}`),

  // --- ИИ-функции ---
  replyDraft: (workItemId: string) => post<ReplyDraft>(`/cases/${encodeURIComponent(workItemId)}/reply-draft`),
  generateScript: (workItemId: string, goal: string, instruction?: string) =>
    post<ScriptResult>(`/cases/${encodeURIComponent(workItemId)}/script`, { goal, instruction }),
  generateObjection: (workItemId: string, text: string) =>
    post<ObjectionResult>(`/cases/${encodeURIComponent(workItemId)}/objection`, { text }),
  generateSummary: (workItemId: string) =>
    post<SummaryResult>(`/cases/${encodeURIComponent(workItemId)}/summary`),
  chat: (workItemId: string, question: string) =>
    post<{ turns: ChatTurn[]; answer: ChatTurn }>(`/cases/${encodeURIComponent(workItemId)}/chat`, { question }),

  // --- Действия менеджера (FR8/FR6/FR11) ---
  send: (workItemId: string, text: string, managerId: string) =>
    post<{ ok: boolean; messages: Message[] }>(`/cases/${encodeURIComponent(workItemId)}/send`, { text, managerId }),
  recordFeedback: (body: FeedbackInput) => post<{ ok: boolean }>("/feedback", body),
  saveNote: (body: NoteInput) => post<{ ok: boolean }>("/notes", body),

  // --- Подбор под продукт (UC-02) ---
  getRanking: (productId: string, managerId: string) =>
    http<{ ranked: RankedClient[] }>(
      `/products/${encodeURIComponent(productId)}/ranking?managerId=${encodeURIComponent(managerId)}`,
    ).then((r) => r.ranked),

  // --- Аналитика руководителя (UC-07) ---
  getSupervisor: () => http<SupervisorMetrics>("/supervisor"),
};
