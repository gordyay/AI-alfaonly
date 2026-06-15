// ============================================================================
// Сборка приоритизированной очереди кейсов менеджера (UC-01, FR1).
// Каждая задача/коммуникация превращается в WorkItem с рассчитанным
// приоритетом, объяснением и следующим лучшим действием.
// ============================================================================

import { DEMO_NOW_MS } from "../data/clock";
import {
  clientById,
  insightByConversation,
  lastIncomingMessage,
  lastMessage,
  tasksByClient,
} from "../data/index";
import { dataset } from "../data/index";
import { buildValueScale, computePriority } from "./prioritization";
import type { FeedbackEvent, Message, Task, TaskIntent, WorkItem } from "./types";

/** Кейс «обработан» в текущей сессии: есть отправленный ответ или решение менеджера. */
export function isWorkItemHandled(
  item: WorkItem,
  sentMessages: Record<string, Message[]>,
  feedback: FeedbackEvent[],
  managerId: string,
): boolean {
  const replied =
    !!item.conversationId && (sentMessages[item.conversationId]?.length ?? 0) > 0;
  const decided = feedback.some(
    (f) => f.recommendationId === item.recommendationId && f.managerId === managerId,
  );
  return replied || decided;
}

const IMPACT_BY_INTENT: Record<TaskIntent, string> = {
  service_recovery: "Снижение оттока и восстановление доверия",
  retention_follow_up: "Удержание клиента и ликвидности в банке",
  product_pitch: "Шаг к продаже премиум-продукта",
  offer_follow_up: "Перевод интереса в конкретное предложение",
  investment_plan: "Конвертация интереса к инвестициям в сделку",
  liquidity_follow_up: "Размещение свободной ликвидности",
  portfolio_review: "Развитие и защита портфеля клиента",
  meeting_conversion: "Перевод интереса в очную встречу",
  service_follow_up: "Поддержание качества премиального сервиса",
  discovery_follow_up: "Прояснение профиля до предложения",
};

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((DEMO_NOW_MS - new Date(iso).getTime()) / 60_000));
}

function buildWorkItem(task: Task, valueScale: ReturnType<typeof buildValueScale>): WorkItem | null {
  const client = clientById.get(task.clientId);
  if (!client) return null;

  const insight = task.conversationId ? insightByConversation.get(task.conversationId) ?? null : null;
  const incoming = task.conversationId ? lastIncomingMessage(task.conversationId) : null;
  const newest = task.conversationId ? lastMessage(task.conversationId) : null;
  const hasIncoming = newest !== null && newest.sender === "client";

  const waitingMinutes = Math.max(minutesSince(task.createdAtIso), insight?.waitingMinutes ?? 0);

  const priority = computePriority({
    client,
    insight,
    task,
    valueScale,
    waitingMinutes,
    dueAtIso: task.dueAtIso,
    lastIncomingText: incoming?.text ?? null,
  });

  const nextBestAction = insight?.recommendedAction || task.goal || task.title;

  const summary = hasIncoming && incoming ? incoming.text : task.description;

  return {
    id: `wi:${task.id}`,
    kind: hasIncoming ? "communication" : "task",
    clientId: client.id,
    taskId: task.id,
    conversationId: task.conversationId,
    title: task.title,
    summary,
    channel: task.channel,
    productCode: task.productCode,
    dueAtIso: task.dueAtIso,
    createdAtIso: task.createdAtIso,
    hasIncoming,
    lastIncomingText: incoming?.text ?? null,
    priority,
    nextBestAction,
    expectedImpact: IMPACT_BY_INTENT[task.intent],
    recommendationId: `rec:task:${task.id}`,
  };
}

/** Очередь кейсов менеджера, отсортированная по убыванию приоритета (FR1). */
export function buildWorkQueue(managerId: string): WorkItem[] {
  const managerClients = dataset.clients.filter((c) => c.managerId === managerId);
  const valueScale = buildValueScale(managerClients);

  const items: WorkItem[] = [];
  for (const client of managerClients) {
    const tasks = tasksByClient.get(client.id) ?? [];
    for (const task of tasks) {
      if (task.status === "done") continue;
      const item = buildWorkItem(task, valueScale);
      if (item) items.push(item);
    }
  }

  return items.sort((a, b) => {
    if (b.priority.total !== a.priority.total) return b.priority.total - a.priority.total;
    // При равенстве — раньше тот, кто дольше ждёт (более ранний createdAt).
    return new Date(a.createdAtIso).getTime() - new Date(b.createdAtIso).getTime();
  });
}

/** Все рекомендации обоих менеджеров — для панели руководителя (UC-07). */
export function buildAllRecommendations(): {
  recommendationId: string;
  level: WorkItem["priority"]["level"];
  managerId: string;
}[] {
  const refs: { recommendationId: string; level: WorkItem["priority"]["level"]; managerId: string }[] = [];
  for (const manager of dataset.managers) {
    for (const item of buildWorkQueue(manager.id)) {
      refs.push({ recommendationId: item.recommendationId, level: item.priority.level, managerId: manager.id });
    }
  }
  return refs;
}
