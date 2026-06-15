// Сборка датасета прототипа + индексы для быстрого доступа.
// Это «тестовая база» из раздела 6.4.2 (имитирует MDM/СХК/OCRM/DWH/EQ-АБС/VOC).

import type {
  Client,
  ClientProduct,
  Conversation,
  ConversationInsight,
  CrmNote,
  FeedbackEvent,
  FollowUp,
  Message,
  Product,
  Task,
} from "../domain/types";
import { CLIENTS } from "./clients";
import { CLIENT_PRODUCTS } from "./clientProducts";
import { CONVERSATIONS } from "./conversations";
import { MESSAGES } from "./messages";
import { INSIGHTS } from "./insights";
import { CRM_NOTES, FOLLOW_UPS } from "./crm";
import { TASKS } from "./tasks";
import { SEED_FEEDBACK } from "./feedback";
import { PRODUCTS } from "./products";
import { MANAGERS, type Manager } from "./managers";

export { CLIENTS, PRODUCTS, CONVERSATIONS, MESSAGES, TASKS, MANAGERS };
export type { Manager };

function index<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(key(row), row);
  return map;
}

function group<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export const clientById = index(CLIENTS, (c) => c.id);
export const productById = index(PRODUCTS, (p) => p.id);
export const conversationById = index(CONVERSATIONS, (c) => c.id);
export const insightByConversation = index(INSIGHTS, (i) => i.conversationId);
export const taskById = index(TASKS, (t) => t.id);

export const messagesByConversation = group(MESSAGES, (m) => m.conversationId);
export const conversationsByClient = group(CONVERSATIONS, (c) => c.clientId);
export const clientProductsByClient = group(CLIENT_PRODUCTS, (cp) => cp.clientId);
export const tasksByClient = group(TASKS, (t) => t.clientId);

// Сообщения внутри диалога — в хронологическом порядке.
for (const list of messagesByConversation.values()) {
  list.sort((a, b) => new Date(a.sentAtIso).getTime() - new Date(b.sentAtIso).getTime());
}

export interface Dataset {
  clients: Client[];
  products: Product[];
  clientProducts: ClientProduct[];
  conversations: Conversation[];
  messages: Message[];
  insights: ConversationInsight[];
  tasks: Task[];
  crmNotes: CrmNote[];
  followUps: FollowUp[];
  seedFeedback: FeedbackEvent[];
  managers: Manager[];
}

export const dataset: Dataset = {
  clients: CLIENTS,
  products: PRODUCTS,
  clientProducts: CLIENT_PRODUCTS,
  conversations: CONVERSATIONS,
  messages: MESSAGES,
  insights: INSIGHTS,
  tasks: TASKS,
  crmNotes: CRM_NOTES,
  followUps: FOLLOW_UPS,
  seedFeedback: SEED_FEEDBACK,
  managers: MANAGERS,
};

/** Последнее входящее сообщение клиента по диалогу. */
export function lastIncomingMessage(conversationId: string): Message | null {
  const list = messagesByConversation.get(conversationId) ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].sender === "client") return list[i];
  }
  return null;
}

/** Самое свежее сообщение по диалогу (любой стороны). */
export function lastMessage(conversationId: string): Message | null {
  const list = messagesByConversation.get(conversationId) ?? [];
  return list.length ? list[list.length - 1] : null;
}
