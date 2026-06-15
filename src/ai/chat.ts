// ============================================================================
// Ассистент Q&A в рамках кейса (FR9, NFR4).
//
// Менеджер задаёт свободный вопрос — отвечаем, опираясь ИСКЛЮЧИТЕЛЬНО на ctx.
// Интент определяется по ключевым словам. Источники контекста всегда указаны
// (NFR4). Если ответа в контексте нет — честно об этом говорим, а не выдумываем
// (анти-галлюцинация — критично).
//
// Чистые функции, без сайд-эффектов и без импорта модулей данных.
// ============================================================================

import type { ChatTurn, Product } from "../domain/types";
import { tagLabel } from "../domain/tags";
import { type AIContext, lastIncoming } from "./context";
import { constraintRu } from "./summary";

type Intent =
  | "product"
  | "churn"
  | "profile"
  | "next_step"
  | "summary"
  | "unknown";

const INTENT_PATTERNS: Array<{ intent: Intent; re: RegExp }> = [
  { intent: "product", re: /что предложить|какой продукт|продукт|предложен|подобрать|апсейл|допродаж|кросс/i },
  { intent: "churn", re: /риск|оттток|отток|удержа|уход|теряем|молчит|молчан|недовол/i },
  { intent: "profile", re: /о клиенте|профил|кто (он|она|это|такой)|расскажи о|что за клиент|кто клиент/i },
  { intent: "next_step", re: /следующий шаг|что делать|что дальше|как поступ|какой шаг|план действ|nba|next/i },
  { intent: "summary", re: /итог|сводк|резюм|кратко|обзор|что было|подытож/i },
];

function detectIntent(question: string): Intent {
  for (const p of INTENT_PATTERNS) {
    if (p.re.test(question)) return p.intent;
  }
  return "unknown";
}

const RISK_RU: Record<string, string> = {
  conservative: "консервативный",
  moderate: "умеренный",
  aggressive: "активный",
};

const CHURN_RU: Record<string, string> = {
  low: "низкий",
  medium: "средний",
  high: "высокий",
};

const TOPIC_RU: Record<string, string> = {
  investments: "инвестиции",
  investment: "инвестиции",
  liquidity: "свободная ликвидность",
  capital_preservation: "сохранение капитала",
  capital_protection: "защита капитала",
  deposit: "вклад",
  structured_deals: "структурные решения",
  fx: "валютные инструменты",
  brokerage: "брокерский счёт",
  portfolio_growth: "рост портфеля",
  growth: "рост портфеля",
  travel: "travel-сервис",
  premium_card: "премиальная карта",
  service: "качество сервиса",
  insurance: "страховая защита",
  family: "защита семьи",
  cashback: "кэшбэк",
  retention: "удержание",
  bond_alternative: "альтернатива облигациям",
  soft_follow_up: "мягкое продолжение",
};

function topicRu(topic: string): string {
  return TOPIC_RU[topic] ?? topic.replace(/_/g, " ");
}

const NO_DATA = "В доступном контексте этих данных нет — стоит уточнить у клиента.";

export function answerCaseQuestion(ctx: AIContext, question: string): ChatTurn {
  const intent = detectIntent(question);

  switch (intent) {
    case "product":
      return answerProduct(ctx);
    case "churn":
      return answerChurn(ctx);
    case "profile":
      return answerProfile(ctx);
    case "next_step":
      return answerNextStep(ctx);
    case "summary":
      return answerSummary(ctx);
    default:
      return answerUnknown(ctx, question);
  }
}

function turn(text: string, sources: string[]): ChatTurn {
  return { role: "assistant", text, sources };
}

// ----------------------------------------------------------------------------
// Что предложить / продукт.
// ----------------------------------------------------------------------------

function answerProduct(ctx: AIContext): ChatTurn {
  const sources: string[] = [];

  const ownedIds = new Set(ctx.ownedProducts.map((o) => o.product.id));
  const candidates: Product[] = ctx.relevantProducts.filter((p) => !ownedIds.has(p.id));

  if (candidates.length === 0 && ctx.relevantProducts.length === 0) {
    sources.push("Релевантные продукты в контексте отсутствуют");
    if (ctx.client.tags.length > 0) sources.push(`Теги профиля: ${ctx.client.tags.map(tagLabel).join(", ")}`);
    const tagHint =
      ctx.client.tags.length > 0
        ? ` По профилю клиент тяготеет к темам: ${ctx.client.tags.slice(0, 3).map(tagLabel).join(", ")} — это можно использовать как зацепку.`
        : "";
    return turn(
      `Конкретных релевантных продуктов в контексте кейса нет.${tagHint} Точечное предложение лучше подобрать после уточнения интереса у клиента.`,
      sources,
    );
  }

  sources.push("Релевантные продукты кейса");
  if (ctx.insight && ctx.insight.topics.length > 0) sources.push(`Темы интереса: ${ctx.insight.topics.slice(0, 3).map(topicRu).join(", ")}`);
  sources.push(`Риск-профиль: ${RISK_RU[ctx.client.riskAppetite] ?? ctx.client.riskAppetite}`);
  if (ctx.ownedProducts.length > 0) sources.push(`Текущие продукты: ${ctx.ownedProducts.map((o) => o.product.name).join(", ")}`);

  const pick = candidates.length > 0 ? candidates : ctx.relevantProducts;
  const lines = pick
    .slice(0, 3)
    .map((p) => `«${p.name}» — ${p.pitch.replace(/\.$/, "")}`);

  const gapNote =
    candidates.length > 0
      ? `Этих продуктов у клиента ещё нет — предложение закрывает пробел в портфеле.`
      : `Эти продукты у клиента уже есть, поэтому речь скорее об апсейле, чем о новом продукте.`;

  const text = `Под этот кейс уместно предложить:\n• ${lines.join("\n• ")}\n${gapNote} Привязывайте предложение к риск-профилю (${RISK_RU[ctx.client.riskAppetite] ?? ctx.client.riskAppetite}) и тому, что клиент уже поднимал в диалоге.`;
  return turn(text, sources);
}

// ----------------------------------------------------------------------------
// Риск оттока / удержание.
// ----------------------------------------------------------------------------

function answerChurn(ctx: AIContext): ChatTurn {
  const { client, insight } = ctx;
  const sources: string[] = [`Профиль: риск оттока — ${CHURN_RU[client.churnRisk] ?? client.churnRisk}`];

  const signals: string[] = [];
  if (insight) {
    sources.push("Инсайт диалога");
    if (insight.sentiment === "negative") signals.push("в диалоге выраженный негатив");
    if (insight.sentiment === "tense") signals.push("клиент держится настороженно");
    if (insight.constraints.includes("silent")) signals.push("снижена активность (молчание)");
    if (insight.constraints.includes("trust") || insight.constraints.includes("negative_service")) {
      signals.push("есть вопрос доверия / сервисная претензия");
    }
  }
  const churnTags = client.tags.filter((t) => /churn|silent/.test(t));
  if (churnTags.length > 0) {
    sources.push(`Теги: ${churnTags.map(tagLabel).join(", ")}`);
    signals.push("в профиле отмечены сигналы оттока");
  }

  let guidance: string;
  if (client.churnRisk === "high" || signals.length > 0) {
    guidance =
      `Риск оттока требует внимания${signals.length > 0 ? ` (${signals.join("; ")})` : ""}. ` +
      `Тактика удержания: сначала закрыть сервисную/эмоциональную часть и взять ответственность на себя, ` +
      `никакого давления и продаж в моменте. Дальше — короткий аккуратный контакт, проактивная забота, а не оффер.`;
  } else if (client.churnRisk === "medium") {
    guidance =
      `Риск оттока средний. Явных тревожных сигналов в диалоге не видно, но стоит поддерживать ритм контактов ` +
      `и реагировать быстро — это снижает вероятность ухода к конкуренту.`;
  } else {
    guidance = `Риск оттока низкий. Сигналов ухода в контексте нет — достаточно поддерживать привычный уровень сервиса.`;
  }

  if (insight?.recommendedAction) {
    guidance += ` Рекомендованное действие по кейсу: ${lowerFirst(insight.recommendedAction)}.`;
    sources.push("Рекомендованное действие из инсайта");
  }

  return turn(guidance, sources);
}

// ----------------------------------------------------------------------------
// О клиенте / профиль.
// ----------------------------------------------------------------------------

function answerProfile(ctx: AIContext): ChatTurn {
  const { client, insight } = ctx;
  const sources: string[] = ["Профиль клиента"];

  const parts: string[] = [];
  parts.push(`${client.fullName}, ${client.age} лет, ${client.city}.`);
  parts.push(`Сегмент ${client.segment}, риск-профиль ${RISK_RU[client.riskAppetite] ?? client.riskAppetite}.`);
  if (client.occupation) parts.push(`Род занятий: ${client.occupation}.`);

  const owned = ctx.ownedProducts;
  if (owned.length > 0) {
    sources.push("Продукты клиента");
    parts.push(`Активные продукты: ${owned.map((o) => o.product.name).join(", ")}.`);
  }

  if (client.note) {
    sources.push("Заметка менеджера");
    parts.push(`Заметка: ${client.note}`);
  } else {
    parts.push(`Заметка менеджера не заполнена — часть профиля стоит уточнить.`);
  }

  if (insight && insight.topics.length > 0) {
    sources.push("Темы интереса из инсайта");
    parts.push(`В диалогах поднимал: ${insight.topics.slice(0, 3).map(topicRu).join(", ")}.`);
  }
  if (insight && insight.constraints.length > 0) {
    parts.push(`Что учитывать: ${insight.constraints.slice(0, 3).map(constraintRu).join(", ")}.`);
  }

  // Если по сути нет ничего, кроме базового — честно отметим скудость данных.
  if (!client.note && (!insight || insight.topics.length === 0)) {
    parts.push(`Подробной аналитики в контексте мало — для точной картины нужен личный разговор.`);
  }

  return turn(parts.join(" "), sources);
}

// ----------------------------------------------------------------------------
// Следующий шаг / что делать.
// ----------------------------------------------------------------------------

function answerNextStep(ctx: AIContext): ChatTurn {
  const sources: string[] = [];
  const action = ctx.insight?.recommendedAction ?? ctx.nextBestAction ?? null;

  if (!action) {
    sources.push("Рекомендованное действие в контексте отсутствует");
    return turn(
      `Готового следующего шага в контексте нет. ${NO_DATA} Ориентируйтесь на ближайший срок контакта и тему последнего диалога.`,
      sources,
    );
  }

  if (ctx.insight?.recommendedAction) sources.push("Рекомендованное действие из инсайта");
  else sources.push("Следующее лучшее действие по кейсу (NBA)");

  let text = `Следующий шаг: ${action}.`;
  if (ctx.insight) {
    sources.push(`Канал: ${channelRu(ctx.insight.preferredChannel)}`);
    if (ctx.insight.constraints.length > 0) {
      sources.push(`Ограничения: ${ctx.insight.constraints.slice(0, 3).map(constraintRu).join(", ")}`);
      text += ` При этом учитывайте: ${ctx.insight.constraints.slice(0, 3).map(constraintRu).join(", ")}.`;
    }
    text += ` Предпочтительный канал — ${channelRu(ctx.insight.preferredChannel)}.`;
  }
  return turn(text, sources);
}

const CHANNEL_RU: Record<string, string> = {
  chat: "чат",
  call: "звонок",
  meeting: "встреча",
};

function channelRu(channel: string): string {
  return CHANNEL_RU[channel] ?? channel;
}

// ----------------------------------------------------------------------------
// Итог / сводка.
// ----------------------------------------------------------------------------

function answerSummary(ctx: AIContext): ChatTurn {
  const { insight, messages } = ctx;
  const sources: string[] = [];

  const topics = insight?.topics ?? [];
  const last = lastIncoming(ctx);

  if (topics.length === 0 && messages.length === 0 && !insight) {
    sources.push("Диалог и инсайт в контексте отсутствуют");
    return turn(`По этому кейсу пока нечего резюмировать — ${NO_DATA}`, sources);
  }

  const bits: string[] = [];
  if (topics.length > 0) {
    sources.push("Темы из инсайта");
    bits.push(`в диалоге обсуждали ${topics.slice(0, 3).map(topicRu).join(", ")}`);
  }
  if (insight) {
    sources.push("Инсайт диалога");
    bits.push(`${sentimentRu(insight.sentiment)}, сигнал к покупке — ${buyingRu(insight.buyingSignal)}`);
  }
  if (messages.length > 0) {
    sources.push("Сообщения диалога");
  }
  if (last) {
    const snippet = last.text.length > 80 ? `${last.text.slice(0, 77).trim()}…` : last.text;
    bits.push(`последняя реплика клиента: «${snippet}»`);
  }
  if (insight?.recommendedAction) {
    sources.push("Рекомендованное действие");
    bits.push(`следующий шаг — ${lowerFirst(insight.recommendedAction)}`);
  }

  return turn(`${capitalizeFirst(bits.join("; "))}.`, sources);
}

// ----------------------------------------------------------------------------
// Неизвестный интент — пробуем дать полезный общий ответ из контекста.
// ----------------------------------------------------------------------------

function answerUnknown(ctx: AIContext, _question: string): ChatTurn {
  const sources: string[] = ["Профиль клиента"];
  const bits: string[] = [`по этому кейсу могу подсказать: профиль и риск-профиль (${RISK_RU[ctx.client.riskAppetite] ?? ctx.client.riskAppetite})`];

  if (ctx.insight) {
    sources.push("Инсайт диалога");
    bits.push("темы интереса и ограничения из диалога");
  }
  if (ctx.relevantProducts.length > 0) {
    sources.push("Релевантные продукты");
    bits.push("какой продукт предложить");
  }
  bits.push("следующий шаг по кейсу");

  const text =
    `Не вполне понял вопрос, поэтому отвечу осторожно, чтобы не домысливать. Если коротко, ` +
    `${bits.join(", ")}. Если вопрос про что-то за пределами этого — ${lowerFirst(NO_DATA)}`;
  return turn(text, sources);
}

// ----------------------------------------------------------------------------
// Локальные хелперы.
// ----------------------------------------------------------------------------

const SENTIMENT_RU: Record<string, string> = {
  interested: "есть интерес к теме",
  neutral: "настрой нейтральный",
  tense: "настрой настороженный",
  negative: "есть недовольство",
};

function sentimentRu(s: string): string {
  return SENTIMENT_RU[s] ?? s;
}

const BUYING_RU: Record<string, string> = {
  low: "слабый",
  medium: "умеренный",
  high: "выраженный",
  speed_sensitive: "чувствителен к скорости",
};

function buyingRu(s: string): string {
  return BUYING_RU[s] ?? s;
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}
