// ============================================================================
// Оценка склонности клиента к покупке продукта (отчёт, раздел 6.3).
// Пять факторов: соответствие продукта, платёжеспособность, поведенческий
// сигнал, глубина отношений, пробел в портфеле.
// В прототипе — правила; в проде — ML-модель классификации по продукту.
// ============================================================================

import type {
  Client,
  Product,
  ProductCategory,
  PropensityFactor,
  PropensityScore,
} from "./types";
import { priorityLevel } from "./prioritization";
import { tagLabel } from "./tags";

const RISK_RU: Record<Client["riskAppetite"], string> = {
  conservative: "консервативный",
  moderate: "умеренный",
  aggressive: "агрессивный",
};

export const PROPENSITY_WEIGHTS: Record<PropensityFactor["key"], number> = {
  product_fit: 0.25,
  behavioral_signal: 0.25,
  payment_capacity: 0.2,
  relationship_depth: 0.15,
  portfolio_gap: 0.15,
};

const PROPENSITY_LABEL: Record<PropensityFactor["key"], string> = {
  product_fit: "Соответствие продукта",
  behavioral_signal: "Поведенческий сигнал",
  payment_capacity: "Платёжеспособность",
  relationship_depth: "Глубина отношений",
  portfolio_gap: "Пробел в портфеле",
};

// Сопоставление склонности к риску и уровня риска продукта.
function riskFit(client: Client, product: Product): number {
  const a = client.riskAppetite;
  const r = product.riskLevel;
  if (a === "aggressive") return r === "high" ? 92 : r === "medium" ? 70 : 45;
  if (a === "conservative") return r === "low" ? 92 : r === "medium" ? 60 : 32;
  // moderate
  return r === "medium" ? 84 : r === "low" ? 72 : 60;
}

function scoreProductFit(client: Client, product: Product): { score: number; reason: string } {
  let score = riskFit(client, product);
  const categoryTag: Record<ProductCategory, string[]> = {
    investment: ["investments", "investment-intent", "growth"],
    brokerage: ["fx", "brokerage", "growth", "investment-intent"],
    deposits: ["liquidity", "deposit", "wealth", "retention"],
    cards: ["premium-card", "travel", "service"],
    insurance: ["insurance", "travel", "family"],
  };
  const matchTags = categoryTag[product.category].filter((t) => client.tags.includes(t));
  if (matchTags.length > 0) {
    score = Math.min(100, score + 8 * matchTags.length);
  }
  const reason =
    matchTags.length > 0
      ? `Продукт совпадает с профилем (${RISK_RU[client.riskAppetite]} риск, интересы: ${matchTags.map(tagLabel).join(", ")})`
      : `Соответствие риск-профилю клиента (${RISK_RU[client.riskAppetite]})`;
  return { score: Math.round(score), reason };
}

function scorePaymentCapacity(client: Client, product: Product): { score: number; reason: string } {
  const liquidityProduct = ["deposits", "investment", "brokerage"].includes(product.category);
  if (liquidityProduct) {
    const lb = client.liquidBalance;
    // Текст-объяснение согласован с тем же порогом, что и балл (NFR2): низкий
    // балл не может сопровождаться формулировкой о «достаточной» ликвидности.
    if (lb >= 5_000_000) return { score: 96, reason: "Высокая свободная ликвидность для размещения" };
    if (lb >= 2_000_000) return { score: 82, reason: "Достаточная свободная ликвидность для размещения" };
    if (lb >= 1_000_000) return { score: 66, reason: "Умеренная свободная ликвидность" };
    if (lb >= 500_000) return { score: 50, reason: "Ограниченная свободная ликвидность" };
    return { score: 34, reason: "Свободной ликвидности мало — крупное размещение маловероятно" };
  }
  // Для карт/страхования платёжеспособность оцениваем по AUM.
  if (client.aum >= 20_000_000) return { score: 88, reason: "Высокая платёжеспособность по объёму активов" };
  if (client.aum >= 8_000_000) return { score: 72, reason: "Умеренная платёжеспособность по объёму активов" };
  return { score: 56, reason: "Платёжеспособность по объёму активов ограничена" };
}

function scoreBehavioralSignal(
  product: Product,
  relevantProductCodes: string[],
  interestTopics: string[],
): { score: number; reason: string } {
  if (relevantProductCodes.includes(product.id)) {
    return { score: 88, reason: "Клиент сам поднимал тему этого продукта в диалогах" };
  }
  const categoryTopics: Record<ProductCategory, string[]> = {
    investment: ["investments", "portfolio_growth", "growth", "capital_preservation"],
    brokerage: ["fx", "brokerage", "growth"],
    deposits: ["liquidity", "deposit", "capital_protection", "capital_preservation", "bond_alternative"],
    cards: ["premium_card", "travel", "service", "cashback"],
    insurance: ["insurance", "travel", "family"],
  };
  const overlap = categoryTopics[product.category].filter((t) => interestTopics.includes(t));
  if (overlap.length >= 2) return { score: 72, reason: "В диалогах есть устойчивый интерес к теме продукта" };
  if (overlap.length === 1) return { score: 58, reason: "В диалогах встречалась смежная тема" };
  return { score: 28, reason: "Прямых сигналов интереса к продукту пока нет" };
}

function scoreRelationshipDepth(ownedCount: number): { score: number; reason: string } {
  if (ownedCount >= 3) return { score: 90, reason: "Глубокие отношения: 3+ активных продукта" };
  if (ownedCount === 2) return { score: 70, reason: "Двусторонние отношения: 2 активных продукта" };
  if (ownedCount === 1) return { score: 50, reason: "Один активный продукт — есть пространство для развития" };
  return { score: 30, reason: "Новый клиент без активных продуктов" };
}

function scorePortfolioGap(
  product: Product,
  ownedProductIds: string[],
  ownedCategories: ProductCategory[],
): { score: number; reason: string } {
  if (ownedProductIds.includes(product.id)) {
    return { score: 25, reason: "Продукт уже есть — возможен только апсейл" };
  }
  if (ownedCategories.includes(product.category)) {
    return { score: 62, reason: "Категория уже знакома клиенту, но конкретного продукта нет" };
  }
  return { score: 92, reason: "Явный пробел: категория ещё не закрыта" };
}

export interface PropensityInput {
  client: Client;
  product: Product;
  ownedProductIds: string[];
  ownedCategories: ProductCategory[];
  relevantProductCodes: string[];
  interestTopics: string[];
}

export function computePropensity(input: PropensityInput): PropensityScore {
  const fit = scoreProductFit(input.client, input.product);
  const cap = scorePaymentCapacity(input.client, input.product);
  const beh = scoreBehavioralSignal(input.product, input.relevantProductCodes, input.interestTopics);
  const depth = scoreRelationshipDepth(input.ownedProductIds.length);
  const gap = scorePortfolioGap(input.product, input.ownedProductIds, input.ownedCategories);

  const raw: Array<{ key: PropensityFactor["key"]; score: number; reason: string }> = [
    { key: "product_fit", ...fit },
    { key: "behavioral_signal", ...beh },
    { key: "payment_capacity", ...cap },
    { key: "relationship_depth", ...depth },
    { key: "portfolio_gap", ...gap },
  ];

  const factors: PropensityFactor[] = raw.map((f) => {
    const weight = PROPENSITY_WEIGHTS[f.key];
    return {
      key: f.key,
      label: PROPENSITY_LABEL[f.key],
      score: f.score,
      weight,
      contribution: Math.round(f.score * weight * 10) / 10,
      reason: f.reason,
    };
  });

  // Итог — честная сумма пяти факторов (разбор всегда сходится с числом, NFR2).
  const total = Math.round(factors.reduce((s, f) => s + f.contribution, 0));
  const reasons = [...factors]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((f) => f.reason);

  // Удержание важнее продажи: при высоком риске оттока + silent/негативном тоне
  // клиент помечается флагом retentionFirst — UI убирает его из целей продаж
  // (зеркалит логику churn в prioritization.ts), НЕ искажая саму оценку.
  const silent = input.client.tags.some((t) =>
    ["churn-risk", "silent", "silent-client", "negative-tone"].includes(t),
  );
  const retentionFirst = input.client.churnRisk === "high" && silent;

  return {
    clientId: input.client.id,
    productId: input.product.id,
    total,
    level: priorityLevel(total),
    factors,
    reasons,
    retentionFirst,
  };
}
