// ============================================================================
// Методика приоритизации (отчёт, раздел 6.2).
//
//   Приоритет = 0.25·Ожидание + 0.30·Ценность + 0.20·Срочность
//             + 0.15·Потенциал + 0.10·Риск оттока
//
// Каждый фактор измеряется в баллах 0–100 по фиксированным шкалам отчёта.
// Веса заданы экспертно (стартовая калибровка), на пилоте калибруются,
// в проде заменяются ML-моделью с сохранением состава факторов.
// ============================================================================

import { DEMO_NOW_MS } from "../data/clock";
import type {
  Client,
  ConversationInsight,
  PriorityBreakdown,
  PriorityFactor,
  PriorityLevel,
  Task,
} from "./types";

export const PRIORITY_WEIGHTS: Record<PriorityFactor["key"], number> = {
  waiting: 0.25,
  value: 0.3,
  urgency: 0.2,
  potential: 0.15,
  churn: 0.1,
};

export const FACTOR_LABEL: Record<PriorityFactor["key"], string> = {
  waiting: "Ожидание",
  value: "Ценность клиента",
  urgency: "Срочность",
  potential: "Потенциал шага",
  churn: "Риск оттока",
};

export function priorityLevel(total: number): PriorityLevel {
  if (total >= 70) return "high";
  if (total >= 40) return "medium";
  return "low";
}

// --- Фактор «Ценность клиента»: квартили портфеля менеджера ------------------

export interface ValueScale {
  q1: number;
  median: number;
  q3: number;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

/** Пороговые значения квартилей по AUM для портфеля менеджера. */
export function buildValueScale(managerClients: Client[]): ValueScale {
  const aums = managerClients.map((c) => c.aum).sort((a, b) => a - b);
  return {
    q1: percentile(aums, 0.25),
    median: percentile(aums, 0.5),
    q3: percentile(aums, 0.75),
  };
}

function scoreValue(client: Client, scale: ValueScale): { score: number; reason: string } {
  // Шкала отчёта: нижний квартиль 25, средний 50, верхний 75, максимальный 100.
  if (client.aum >= scale.q3) {
    return { score: 100, reason: "Верхний квартиль портфеля — один из самых ценных клиентов менеджера" };
  }
  if (client.aum >= scale.median) {
    return { score: 75, reason: "Выше медианы портфеля по объёму активов" };
  }
  if (client.aum >= scale.q1) {
    return { score: 50, reason: "Средняя ценность в портфеле менеджера" };
  }
  return { score: 25, reason: "Нижний квартиль портфеля по объёму активов" };
}

// --- Фактор «Ожидание» ------------------------------------------------------

function scoreWaiting(waitingMinutes: number, dueAtIso: string): { score: number; reason: string } {
  const overdue = new Date(dueAtIso).getTime() < DEMO_NOW_MS;
  // Шкала отчёта: <30 мин — 10; 30 мин–2 ч — 40; 2–4 ч — 70; >4 ч / просрочка — 100.
  let score: number;
  let reason: string;
  if (waitingMinutes < 30) {
    score = 10;
    reason = "Обращение поступило недавно";
  } else if (waitingMinutes < 120) {
    score = 40;
    reason = "Клиент ждёт от 30 минут до 2 часов";
  } else if (waitingMinutes < 240) {
    score = 70;
    reason = "Клиент ждёт более 2 часов";
  } else {
    score = 100;
    reason = "Клиент ждёт более 4 часов — нельзя оставлять в конце очереди";
  }
  if (overdue) {
    score = 100;
    reason = "Срок контакта уже наступил или просрочен";
  }
  return { score, reason };
}

// --- Фактор «Срочность» -----------------------------------------------------

const FORCE_MAJEURE = /блокиров|мошенн|форс-?мажор|украл|взлом/i;

function scoreUrgency(
  insight: ConversationInsight | null,
  task: Task | null,
  lastIncomingText: string | null,
): { score: number; reason: string } {
  // Шкала отчёта: сервис 20; продуктовый вопрос 50; жалоба 80; форс-мажор 100.
  if (lastIncomingText && FORCE_MAJEURE.test(lastIncomingText)) {
    return { score: 100, reason: "Форс-мажор: требует немедленной реакции" };
  }
  if (insight) {
    if (insight.sentiment === "negative" || insight.urgency === "critical") {
      return { score: 80, reason: "Жалоба или выраженный негатив клиента" };
    }
    if (insight.urgency === "high" || insight.buyingSignal === "speed_sensitive") {
      // Срочный продуктовый разговор — по шкале Таблицы 21 это «продуктовый вопрос» (50).
      return { score: 50, reason: "Чувствительный к скорости продуктовый разговор" };
    }
  }
  if (task?.intent === "service_recovery") {
    return { score: 80, reason: "Восстановление сервиса после сбоя" };
  }
  if (task && ["product_pitch", "offer_follow_up", "portfolio_review", "investment_plan", "liquidity_follow_up"].includes(task.intent)) {
    return { score: 50, reason: "Продуктовый вопрос или активная сделка" };
  }
  return { score: 20, reason: "Типовое сервисное обращение" };
}

// --- Фактор «Потенциал следующего шага» -------------------------------------

function scorePotential(
  insight: ConversationInsight | null,
  client: Client,
): { score: number; reason: string } {
  // Шкала отчёта: нет сигналов 10; косвенный интерес 40; явный интерес/сделка 70–100.
  if (insight) {
    if (insight.buyingSignal === "high") {
      return { score: 85, reason: "Явный интерес к продукту или открытая сделка" };
    }
    if (insight.sentiment === "interested" && insight.buyingSignal === "medium") {
      return { score: 70, reason: "Выраженный интерес к продуктовой теме" };
    }
    if (insight.buyingSignal === "medium" || insight.buyingSignal === "speed_sensitive") {
      return { score: 40, reason: "Косвенный интерес, есть продуктовый запрос" };
    }
    if (insight.buyingSignal === "low") {
      return { score: 40, reason: "Слабый сигнал интереса" };
    }
  }
  if (client.liquidBalance > 3_000_000) {
    return { score: 40, reason: "Крупная свободная ликвидность — потенциал для размещения" };
  }
  return { score: 10, reason: "Явных сигналов к покупке пока нет" };
}

// --- Фактор «Риск оттока» ---------------------------------------------------

function scoreChurn(
  client: Client,
  insight: ConversationInsight | null,
): { score: number; reason: string } {
  // Шкала отчёта: нет сигналов 0; косвенные 50; прямые 100.
  const silent = client.tags.includes("churn-risk") || client.tags.includes("silent") || client.tags.includes("silent-client");
  if (client.churnRisk === "high" && (insight?.sentiment === "negative" || silent)) {
    return { score: 100, reason: "Прямые сигналы оттока: негатив или молчание при высоком риске" };
  }
  if (client.churnRisk === "high" || client.churnRisk === "medium" || insight?.sentiment === "tense") {
    return { score: 50, reason: "Косвенные сигналы: снижение активности или напряжение в диалоге" };
  }
  return { score: 0, reason: "Сигналов оттока нет" };
}

// --- Сборка приоритета ------------------------------------------------------

export interface PriorityInput {
  client: Client;
  insight: ConversationInsight | null;
  task: Task | null;
  valueScale: ValueScale;
  waitingMinutes: number;
  dueAtIso: string;
  lastIncomingText: string | null;
}

export function computePriority(input: PriorityInput): PriorityBreakdown {
  const waiting = scoreWaiting(input.waitingMinutes, input.dueAtIso);
  const value = scoreValue(input.client, input.valueScale);
  const urgency = scoreUrgency(input.insight, input.task, input.lastIncomingText);
  const potential = scorePotential(input.insight, input.client);
  const churn = scoreChurn(input.client, input.insight);

  const raw: Array<{ key: PriorityFactor["key"]; score: number; reason: string }> = [
    { key: "waiting", ...waiting },
    { key: "value", ...value },
    { key: "urgency", ...urgency },
    { key: "potential", ...potential },
    { key: "churn", ...churn },
  ];

  const factors: PriorityFactor[] = raw.map((f) => {
    const weight = PRIORITY_WEIGHTS[f.key];
    return {
      key: f.key,
      label: FACTOR_LABEL[f.key],
      score: f.score,
      weight,
      contribution: Math.round(f.score * weight * 10) / 10,
      reason: f.reason,
    };
  });

  const total = Math.round(factors.reduce((sum, f) => sum + f.contribution, 0));

  // Топ-причины: 2–3 фактора с наибольшим вкладом, кроме нулевых.
  const reasons = [...factors]
    .filter((f) => f.score > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((f) => f.reason);

  const dataGaps: string[] = [];
  if (!input.client.note) dataGaps.push("Профиль клиента заполнен частично");
  if (!input.insight) dataGaps.push("Нет анализа последнего диалога");

  return {
    total,
    level: priorityLevel(total),
    factors,
    reasons,
    dataGaps,
  };
}
