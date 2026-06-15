// ============================================================================
// Контекст для ИИ-функций. Ассистент работает ТОЛЬКО с этим ограниченным
// срезом данных конкретного клиента (принцип «ограниченного контекста», NFR4):
// при нехватке данных функции обязаны фиксировать пробелы, а не домысливать.
//
// Это аналог "LLM-шлюза" из целевой архитектуры (раздел 6.4): сервисы не
// обращаются к данным напрямую, а получают подготовленный контекст. Замена
// детерминированного провайдера на реальную LLM не меняет этот контракт.
// ============================================================================

import type {
  Client,
  Conversation,
  ConversationInsight,
  Message,
  Product,
  Task,
} from "../domain/types";

export interface OwnedProductView {
  product: Product;
  balance: number;
}

export interface AIContext {
  client: Client;
  /** Активный диалог по кейсу (если есть). */
  conversation: Conversation | null;
  /** Сообщения активного диалога в хронологическом порядке. */
  messages: Message[];
  /** Аналитический инсайт по диалогу (может отсутствовать — это пробел в данных). */
  insight: ConversationInsight | null;
  /** Задача, к которой привязан кейс (если есть). */
  task: Task | null;
  /** Релевантные продукты (из инсайта/задачи), в порядке релевантности. */
  relevantProducts: Product[];
  /** Продукты клиента с остатками. */
  ownedProducts: OwnedProductView[];
  /** Рекомендованное следующее лучшее действие по кейсу. */
  nextBestAction: string;
}

/** Последнее входящее сообщение клиента в контексте (или null). */
export function lastIncoming(ctx: AIContext): Message | null {
  for (let i = ctx.messages.length - 1; i >= 0; i -= 1) {
    if (ctx.messages[i].sender === "client") return ctx.messages[i];
  }
  return null;
}

/**
 * Есть ли НЕОТВЕЧЕННОЕ входящее: самое последнее сообщение в диалоге — от
 * клиента. Это тот же предикат, что и hasIncoming в workqueue, — чтобы
 * ИИ-тексты не выдавали завершённый менеджером (или проактивный) кейс за
 * непрочитанное обращение клиента. `lastIncoming` для этого не годится: оно
 * истинно при ЛЮБОМ сообщении клиента в истории, даже если менеджер уже ответил.
 */
export function hasPendingIncoming(ctx: AIContext): boolean {
  const newest = ctx.messages[ctx.messages.length - 1];
  return newest?.sender === "client";
}

/** Имя клиента в обращении (первое слово ФИО). */
export function firstName(ctx: AIContext): string {
  return ctx.client.fullName.trim().split(/\s+/)[0];
}
