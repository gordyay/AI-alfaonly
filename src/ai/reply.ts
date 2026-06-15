// ============================================================================
// Черновик ответа на входящее сообщение клиента (UC-04).
//
// По последнему входящему сообщению (или проактивному поводу, если входящего
// нет) собираем готовый к отправке ответ, обращённый к клиенту по имени, с
// учётом стиля ответа (responseStyle) и ограничений (constraints). Возвращаем
// также короткое обоснование и список использованных источников контекста.
//
// Чистые функции, без сайд-эффектов и без импорта модулей данных.
// ============================================================================

import type { Product } from "../domain/types";
import { type AIContext, firstName, hasPendingIncoming, lastIncoming } from "./context";
import { constraintRu } from "./summary";

export interface ReplyDraft {
  text: string;
  rationale: string;
  sources: string[];
}

const RISK_RU: Record<string, string> = {
  conservative: "консервативный",
  moderate: "умеренный",
  aggressive: "активный",
};

const TOPIC_RU: Record<string, string> = {
  investments: "инвестиции",
  investment: "инвестиции",
  liquidity: "свободную ликвидность",
  capital_preservation: "сохранение капитала",
  capital_protection: "защиту капитала",
  deposit: "вклад",
  structured_deals: "структурные решения",
  fx: "валютные инструменты",
  brokerage: "брокерский счёт",
  portfolio_growth: "рост портфеля",
  growth: "рост портфеля",
  travel: "travel-сервис",
  premium_card: "премиальную карту",
  service: "качество сервиса",
  insurance: "страховую защиту",
  family: "защиту семьи",
  cashback: "кэшбэк",
  retention: "продолжение нашего сотрудничества",
  bond_alternative: "альтернативу облигациям",
  soft_follow_up: "наш диалог",
};

function topicRu(topic: string): string {
  return TOPIC_RU[topic] ?? topic.replace(/_/g, " ");
}

interface ConstraintFlags {
  noPressure: boolean;
  short: boolean;
  oneTopic: boolean;
  noCall: boolean;
  serviceFirst: boolean;
  mobile: boolean;
  ownership: boolean;
}

function readConstraints(constraints: string[]): ConstraintFlags {
  const has = (...keys: string[]) => keys.some((k) => constraints.includes(k));
  return {
    noPressure: has("avoid_pressure", "no_pressure", "timing_risk", "timing"),
    short: has("keep_message_short", "no_long_messages", "avoid_long_presentation", "avoid_long_terms"),
    oneTopic: has("separate_topics", "avoid_topic_mixing"),
    noCall: has("no_call"),
    serviceFirst: has("no_sales_push", "negative_service"),
    mobile: has("mobile_format_only"),
    ownership: has("show_ownership"),
  };
}

function leadProduct(ctx: AIContext): Product | null {
  return ctx.relevantProducts.length > 0 ? ctx.relevantProducts[0] : null;
}

export function generateReply(ctx: AIContext): ReplyDraft {
  const name = firstName(ctx);
  const { client, insight } = ctx;
  const last = lastIncoming(ctx);
  // pending = диалог ОЖИДАЕТ ответа (последнее сообщение — клиента). Именно это,
  // а не «было ли вообще входящее», определяет режим ответа (см. hasPendingIncoming).
  const pending = hasPendingIncoming(ctx);
  const flags = readConstraints(insight?.constraints ?? []);
  const style = insight?.responseStyle ?? "short";
  const lead = leadProduct(ctx);
  const topicPhrase = insight && insight.topics.length > 0 ? topicRu(insight.topics[0]) : null;

  const sources = buildSources(ctx, pending);

  // --- Защита от догадки: смысл входящего не определяется (исключение UC-04) -
  if (pending && last) {
    const cleaned = last.text.trim();
    const noTopic = !ctx.insight || ctx.insight.topics.length === 0;
    const tooShort = cleaned.replace(/[\s\p{P}\p{S}]/gu, "").length < 4;
    if ((tooShort || noTopic) && ctx.relevantProducts.length === 0) {
      return {
        text: `${name}, спасибо, что написали. Чтобы ответить точно, а не наугад, уточните, пожалуйста, что именно вас интересует — так подберу решение под вашу ситуацию.`,
        rationale: "Смысл сообщения не удалось однозначно определить — вместо догадки задаём уточняющий вопрос (исключение UC-04, принцип «фиксировать пробел, а не домысливать»).",
        sources,
      };
    }
  }

  // --- Сервис-первый сценарий (негатив / запрет на продажу) ----------------
  if (flags.serviceFirst) {
    const text = pending
      ? `${name}, спасибо, что написали. Беру ваш вопрос под личный контроль и вернусь с решением, а не с отписками. Сейчас для меня это приоритет — никаких предложений, пока всё не уладим.`
      : `${name}, на связи. Хочу убедиться, что у вас всё в порядке по последнему вопросу — держу его на личном контроле. Если что-то ещё беспокоит, напишите, разберусь.`;
    const rationale = pending
      ? "Клиент в негативе/просил не продавать — отвечаем сервисом и личной ответственностью, без продуктов."
      : "Непрочитанного обращения нет; проактивно закрываем сервисный вопрос без продуктовой темы, как требуют ограничения.";
    return { text, rationale, sources };
  }

  // --- Проактивный опенер, если непрочитанного входящего нет ----------------
  if (!pending) {
    const text = buildProactive(name, topicPhrase, lead, flags);
    const rationale = "Непрочитанного сообщения нет — это аккуратный проактивный повод вернуться к теме клиента без давления.";
    return { text, rationale, sources };
  }

  // --- Ответ на входящее ----------------------------------------------------
  const text = buildReply(name, style, topicPhrase, lead, flags, client.riskAppetite);
  const rationale = buildRationale(style, flags);
  return { text, rationale, sources };
}

// ----------------------------------------------------------------------------

function buildProactive(
  name: string,
  topicPhrase: string | null,
  lead: Product | null,
  flags: ConstraintFlags,
): string {
  if (flags.noPressure) {
    return topicPhrase
      ? `${name}, без спешки — если тема «${topicPhrase}» ещё актуальна, я готов помочь, когда вам будет удобно.`
      : `${name}, на связи. Если появится вопрос или что-то станет актуальным — пишите, я рядом.`;
  }
  if (lead && topicPhrase) {
    return `${name}, подготовил кое-что по «${lead.name}» под вашу тему «${topicPhrase}». Подсказать подробнее или прислать короткое сравнение?`;
  }
  return `${name}, добрый день. Хотел вернуться к нашему разговору — подскажите, актуальна ли ещё тема, и я помогу с конкретикой.`;
}

function buildReply(
  name: string,
  style: string,
  topicPhrase: string | null,
  lead: Product | null,
  flags: ConstraintFlags,
  risk: string,
): string {
  const theme = topicPhrase ?? "ваш вопрос";

  // Короткий / мобильный стиль — 1–2 предложения.
  if (style === "short" || flags.short || flags.mobile) {
    if (lead) {
      return `${name}, спасибо за сообщение. По «${lead.name}» под ${theme} подобрал вариант — прислать кратко?`;
    }
    return `${name}, спасибо, понял вас. Подготовлю короткий ответ по теме «${theme}» — пришлю в ближайшее время.`;
  }

  // Сравнение — предлагаем структурированный выбор.
  if (style === "comparison") {
    const base = lead
      ? `${name}, спасибо за вопрос. Соберу для вас сравнение в двух-трёх сценариях вокруг «${lead.name}», чтобы вы видели логику, а не только итог.`
      : `${name}, спасибо за вопрос. Подготовлю сравнение нескольких вариантов по теме «${theme}», чтобы выбор был наглядным.`;
    const tail = flags.noPressure
      ? ` Без спешки — посмотрите, когда будет удобно.`
      : ` Скажите, какой горизонт для вас комфортнее, и я уточню расчёт.`;
    return base + tail;
  }

  // Подробный стиль — допускаем чуть больше контекста, но по делу.
  const lead2 = lead
    ? `${name}, спасибо, что написали. По теме «${theme}» предлагаю отталкиваться от «${lead.name}»: ${lead.pitch.split(/(?<=[.!?])\s/)[0].replace(/\.$/, "").toLowerCase()}.`
    : `${name}, спасибо, что написали. По теме «${theme}» подготовлю развёрнутый ответ с конкретными вариантами под ваш ${RISK_RU[risk] ?? risk} профиль.`;
  const action = flags.noCall
    ? ` Распишу всё в переписке, чтобы вам было удобно вернуться к деталям.`
    : ` Если будет удобно, можем коротко созвониться и пройтись по деталям вместе.`;
  return lead2 + action;
}

function buildRationale(style: string, flags: ConstraintFlags): string {
  const parts: string[] = [];
  if (flags.short || flags.mobile || style === "short") parts.push("держим ответ коротким");
  if (style === "comparison") parts.push("даём сравнение вариантов, как предпочитает клиент");
  if (style === "detailed") parts.push("отвечаем развёрнуто, как ожидает клиент");
  if (flags.noPressure) parts.push("без давления");
  if (flags.noCall) parts.push("остаёмся в переписке");
  if (flags.oneTopic) parts.push("не смешиваем темы");
  const tail = parts.length > 0 ? parts.join(", ") : "отвечаем по существу обращения";
  return `Ответ учитывает последнее сообщение клиента и его предпочтения: ${tail}.`;
}

function buildSources(ctx: AIContext, hasIncoming: boolean): string[] {
  const sources: string[] = [];
  sources.push(hasIncoming ? "Последнее сообщение клиента" : "Контакт без непрочитанного сообщения (проактивный повод)");

  const riskRu = RISK_RU[ctx.client.riskAppetite] ?? ctx.client.riskAppetite;
  sources.push(`Профиль: ${riskRu} риск-профиль`);

  if (ctx.insight) {
    sources.push("Инсайт диалога");
    if (ctx.insight.topics.length > 0) {
      sources.push(`Темы интереса: ${ctx.insight.topics.slice(0, 3).map(topicRu).join(", ")}`);
    }
    if (ctx.insight.constraints.length > 0) {
      sources.push(`Ограничения: ${ctx.insight.constraints.slice(0, 3).map(constraintRu).join(", ")}`);
    }
  } else {
    sources.push("Анализ диалога недоступен — формулировки нейтральные");
  }

  if (ctx.relevantProducts.length > 0) {
    sources.push(`Релевантные продукты: ${ctx.relevantProducts.slice(0, 2).map((p) => p.name).join(", ")}`);
  }

  return sources;
}
