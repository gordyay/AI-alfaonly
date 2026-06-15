// ============================================================================
// Сводка по контакту + черновик заметки в CRM (FR6, UC-06).
//
// Из контекста диалога собираем нейтральное резюме, ключевые пункты, статус
// исхода, согласованный следующий шаг, готовый к сохранению CRM-черновик и
// дату следующего контакта.
//
// Чистые функции, без сайд-эффектов и без импорта модулей данных.
// ============================================================================

import type { SummaryResult } from "../domain/types";
import { tagLabel } from "../domain/tags";
import { type AIContext, firstName, hasPendingIncoming, lastIncoming } from "./context";

// Формы в винительном падеже — следуют за глаголом «обсуждали …».
const TOPIC_RU: Record<string, string> = {
  investments: "инвестиции",
  investment: "инвестиции",
  liquidity: "размещение свободной ликвидности",
  capital_preservation: "сохранение капитала",
  capital_protection: "защиту капитала",
  deposit: "вклад",
  structured_deals: "структурные решения",
  fx: "валютные инструменты",
  brokerage: "брокерский счёт",
  portfolio_growth: "рост портфеля",
  growth: "рост портфеля",
  travel: "travel-сервис и поездки",
  premium_card: "премиальную карту",
  service: "качество сервиса",
  insurance: "страховую защиту",
  family: "защиту семьи",
  cashback: "кэшбэк",
  retention: "удержание и отношения",
  bond_alternative: "альтернативу облигациям",
  soft_follow_up: "продолжение диалога",
};

function topicRu(topic: string): string {
  return TOPIC_RU[topic] ?? topic.replace(/_/g, " ");
}

// Настрой клиента — формулировки рода-нейтральные (подходят и для «Ольга», и
// для «Иван»): используются как существительные, без согласования по роду.
const SENTIMENT_RU: Record<string, string> = {
  interested: "есть интерес к теме",
  neutral: "настрой нейтральный",
  tense: "настрой настороженный",
  negative: "есть недовольство",
};

const CONSTRAINT_RU: Record<string, string> = {
  avoid_pressure: "без давления",
  no_pressure: "без давления",
  aggressive_entry: "осторожно с резким входом",
  complexity: "избегать сложных формулировок",
  timing_risk: "чувствителен к таймингу",
  timing: "чувствителен к таймингу",
  keep_message_short: "короткие сообщения",
  no_long_messages: "короткие сообщения",
  avoid_long_presentation: "без длинных презентаций",
  avoid_long_terms: "без сложных формулировок",
  mobile_format_only: "формат для мобильного",
  separate_topics: "не смешивать темы",
  avoid_topic_mixing: "не смешивать темы",
  no_call: "предпочитает переписку звонку",
  no_sales_push: "сначала сервис, без продаж",
  negative_service: "есть сервисная претензия",
  show_ownership: "ждёт личной ответственности",
  trust: "вопрос доверия",
  risk: "осторожен к риску",
  liquidity: "важна ликвидность",
  needs_speed: "важна скорость",
  needs_precision: "важна точность",
  silent: "снизил активность",
};

export function constraintRu(c: string): string {
  return CONSTRAINT_RU[c] ?? c.replace(/_/g, " ");
}

export function generateSummary(ctx: AIContext): SummaryResult {
  const name = firstName(ctx);
  const { client, insight, messages, conversation, task } = ctx;

  const clientMsgs = messages.filter((m) => m.sender === "client").length;
  const total = messages.length;
  // Переписки ещё не было: нельзя описывать «обсуждали…» — это была бы выдумка
  // (NFR4). Для таких кейсов формулируем повод проактивно (ср. проактивный
  // пустой стейт во вкладке «Диалог»).
  const noDialog = total === 0;
  const topics = insight?.topics ?? [];
  const topicList = topics.slice(0, 3).map(topicRu);
  const last = lastIncoming(ctx);
  // Непрочитанное обращение = последнее сообщение от клиента (как в workqueue).
  const pending = hasPendingIncoming(ctx);

  // --- Резюме (1–2 предложения) --------------------------------------------
  const sentimentPhrase = insight ? (SENTIMENT_RU[insight.sentiment] ?? "в диалоге") : null;
  const channelTopic = conversation?.topic ?? (task?.title ?? null);

  let summary: string;
  if (topicList.length > 0 && !noDialog) {
    const themes = topicList.join(", ");
    summary = `${name}: в диалоге обсуждали ${themes}${sentimentPhrase ? `; ${sentimentPhrase}` : ""}.`;
    summary += ` Всего ${total} ${pluralMsg(total)}${clientMsgs > 0 ? `, активность с обеих сторон` : ""}.`;
  } else if (topicList.length > 0) {
    // Переписки ещё не было — это проактивный повод, а не состоявшийся диалог.
    summary = `${name}: переписки по кейсу ещё не было — проактивный повод по теме ${topicList.join(", ")}${sentimentPhrase ? `; ${sentimentPhrase}` : ""}.`;
  } else if (channelTopic) {
    summary = `Контакт с ${name} по теме «${channelTopic}»${sentimentPhrase ? `; ${sentimentPhrase}` : ""}.`;
  } else {
    summary = `Контакт с ${name}; тема диалога не зафиксирована — требуется уточнение.`;
  }

  // --- Ключевые пункты (3–4) ------------------------------------------------
  const keyPoints: string[] = [];

  if (topicList.length > 0) {
    keyPoints.push(noDialog ? `Темы для проактивного контакта: ${topicList.join(", ")}.` : `Обсуждали ${topicList.join(", ")}.`);
  } else if (client.tags.length > 0) {
    keyPoints.push(`Профильные темы: ${client.tags.slice(0, 3).map(tagLabel).join(", ")}.`);
  }

  if (insight && insight.constraints.length > 0) {
    const cons = insight.constraints.slice(0, 3).map(constraintRu);
    keyPoints.push(`Ограничения и пожелания: ${cons.join(", ")}.`);
  }

  if (last) {
    const snippet = last.text.length > 90 ? `${last.text.slice(0, 87).trim()}…` : last.text;
    keyPoints.push(`Последняя реплика клиента: «${snippet}».`);
  }

  const nextStep = insight?.recommendedAction ?? ctx.nextBestAction ?? "Согласовать следующий шаг при следующем контакте.";
  keyPoints.push(`Договорённость / следующий шаг: ${lowerFirst(nextStep)}.`);

  const trimmedKeyPoints = keyPoints.slice(0, 4);

  // --- Исход ----------------------------------------------------------------
  const outcome = buildOutcome(insight, pending);

  // --- CRM-черновик (3–5 предложений) --------------------------------------
  const crmDraft = buildCrmDraft(name, topicList, insight, nextStep, pending, noDialog);

  // --- Дата следующего контакта --------------------------------------------
  const nextContactIso = insight?.nextTouchIso ?? task?.dueAtIso ?? client.nextContactIso;

  return {
    summary,
    keyPoints: trimmedKeyPoints,
    outcome,
    nextStep,
    crmDraft,
    nextContactIso,
  };
}

function pluralMsg(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "сообщение";
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "сообщения";
  return "сообщений";
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}

function buildOutcome(insight: AIContext["insight"], hasIncoming: boolean): string {
  if (!insight) {
    return hasIncoming ? "Диалог открыт, ждёт ответа менеджера" : "Контакт зафиксирован, требуется уточнение";
  }
  switch (insight.sentiment) {
    case "negative":
      return "Есть сервисная претензия — на контроле, до продаж не дошли";
    case "tense":
      return "Клиент насторожен — нужен аккуратный следующий шаг";
    case "interested":
      if (insight.buyingSignal === "high") return "Клиент подтвердил интерес, ждёт следующий шаг";
      return "Интерес есть, прогреваем дальше";
    default:
      if (insight.buyingSignal === "speed_sensitive") return "Тема актуальна, важна скорость ответа";
      return "Диалог в работе, договорённость зафиксирована";
  }
}

function buildCrmDraft(
  name: string,
  topicList: string[],
  insight: AIContext["insight"],
  nextStep: string,
  hasIncoming: boolean,
  noDialog: boolean,
): string {
  const sentences: string[] = [];

  const themes = topicList.length > 0 ? topicList.join(", ") : "общие вопросы по обслуживанию";
  sentences.push(
    noDialog
      ? `Клиент: ${name}. Переписки по кейсу пока нет — проактивный контакт по теме: ${themes}.`
      : `Клиент: ${name}. Обсуждали ${themes}.`,
  );

  if (insight) {
    const sent = SENTIMENT_RU[insight.sentiment] ?? "настрой нейтральный";
    sentences.push(
      noDialog
        ? `По профилю клиента ${sent}; сигнал к покупке — ${buyingSignalRu(insight.buyingSignal)}.`
        : `По итогам диалога ${sent}; сигнал к покупке — ${buyingSignalRu(insight.buyingSignal)}.`,
    );
    if (insight.constraints.length > 0) {
      const cons = insight.constraints.slice(0, 3).map(constraintRu).join(", ");
      sentences.push(`Учитывать: ${cons}.`);
    }
  } else {
    sentences.push(`Аналитики по диалогу нет — детали профиля стоит уточнить при следующем контакте.`);
  }

  if (hasIncoming) {
    sentences.push(`Есть непрочитанное обращение клиента — ответ в приоритете.`);
  }

  sentences.push(`Следующий шаг: ${lowerFirst(nextStep)}.`);

  return sentences.join(" ");
}

const BUYING_RU: Record<string, string> = {
  low: "слабый",
  medium: "умеренный",
  high: "выраженный",
  speed_sensitive: "чувствителен к скорости",
};

function buyingSignalRu(signal: string): string {
  return BUYING_RU[signal] ?? signal;
}
