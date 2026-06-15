// ============================================================================
// Сборка контекста для ИИ-функций и оценки склонности.
// Изолирует данные от движков: экраны получают готовый AIContext / рейтинги.
// ============================================================================

import type { AIContext, OwnedProductView } from "../ai/context";
import {
  clientById,
  clientProductsByClient,
  conversationById,
  conversationsByClient,
  insightByConversation,
  messagesByConversation,
  productById,
  taskById,
  dataset,
} from "../data/index";
import { computePropensity } from "./propensity";
import type { Client, Product, ProductCategory, PropensityScore, WorkItem } from "./types";

/** Агрегированные сигналы клиента из всех его диалогов (для склонности). */
export function clientSignals(clientId: string): {
  topics: string[];
  productCodes: string[];
  ownedProductIds: string[];
  ownedCategories: ProductCategory[];
} {
  const convs = conversationsByClient.get(clientId) ?? [];
  const topics = new Set<string>();
  const productCodes = new Set<string>();
  for (const conv of convs) {
    const insight = insightByConversation.get(conv.id);
    if (!insight) continue;
    insight.topics.forEach((t) => topics.add(t));
    insight.productCodes.forEach((p) => productCodes.add(p));
  }
  const owned = (clientProductsByClient.get(clientId) ?? []).filter((cp) => cp.status === "active");
  const ownedProductIds = owned.map((cp) => cp.productId);
  const ownedCategories = Array.from(
    new Set(ownedProductIds.map((id) => productById.get(id)?.category).filter((c): c is ProductCategory => !!c)),
  );
  return {
    topics: [...topics],
    productCodes: [...productCodes],
    ownedProductIds,
    ownedCategories,
  };
}

function ownedProductViews(clientId: string): OwnedProductView[] {
  const owned = (clientProductsByClient.get(clientId) ?? []).filter((cp) => cp.status === "active");
  return owned
    .map((cp) => {
      const product = productById.get(cp.productId);
      return product ? { product, balance: cp.balance } : null;
    })
    .filter((v): v is OwnedProductView => v !== null);
}

function resolveRelevantProducts(productCodes: string[], primaryCode: string | null): Product[] {
  const ordered: string[] = [];
  if (primaryCode) ordered.push(primaryCode);
  for (const code of productCodes) if (!ordered.includes(code)) ordered.push(code);
  return ordered.map((code) => productById.get(code)).filter((p): p is Product => !!p);
}

/** Полный контекст кейса для ИИ-функций (ограниченный контекст клиента, NFR4). */
export function buildAIContext(item: WorkItem): AIContext {
  const client = clientById.get(item.clientId)!;
  const conversation = item.conversationId ? conversationById.get(item.conversationId) ?? null : null;
  const messages = item.conversationId ? messagesByConversation.get(item.conversationId) ?? [] : [];
  const insight = item.conversationId ? insightByConversation.get(item.conversationId) ?? null : null;
  const task = item.taskId ? taskById.get(item.taskId) ?? null : null;

  const signals = clientSignals(client.id);
  const relevantProducts = resolveRelevantProducts(
    insight?.productCodes ?? signals.productCodes,
    item.productCode,
  );

  return {
    client,
    conversation,
    messages,
    insight,
    task,
    relevantProducts,
    ownedProducts: ownedProductViews(client.id),
    nextBestAction: item.nextBestAction,
  };
}

// --- Склонность к покупке (UC-02, FR7) --------------------------------------

export interface RankedClient {
  client: Client;
  score: PropensityScore;
}

/** Ранжирование клиентов менеджера по склонности к продукту (UC-02). */
export function rankClientsForProduct(productId: string, managerId: string): RankedClient[] {
  const product = productById.get(productId);
  if (!product) return [];
  const clients = dataset.clients.filter((c) => c.managerId === managerId);
  return clients
    .map((client) => {
      const signals = clientSignals(client.id);
      const score = computePropensity({
        client,
        product,
        ownedProductIds: signals.ownedProductIds,
        ownedCategories: signals.ownedCategories,
        relevantProductCodes: signals.productCodes,
        interestTopics: signals.topics,
      });
      return { client, score };
    })
    .sort((a, b) => {
      // Клиентов с приоритетом удержания опускаем вниз, не искажая саму оценку.
      if (a.score.retentionFirst !== b.score.retentionFirst) {
        return a.score.retentionFirst ? 1 : -1;
      }
      return b.score.total - a.score.total;
    });
}

/** Склонность одного клиента ко всем продуктам (вкладка профиля, FR7). */
export function scoreClientProducts(clientId: string): PropensityScore[] {
  const client = clientById.get(clientId);
  if (!client) return [];
  const signals = clientSignals(client.id);
  return dataset.products
    .map((product) =>
      computePropensity({
        client,
        product,
        ownedProductIds: signals.ownedProductIds,
        ownedCategories: signals.ownedCategories,
        relevantProductCodes: signals.productCodes,
        interestTopics: signals.topics,
      }),
    )
    .sort((a, b) => b.total - a.total);
}
