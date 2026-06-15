// ============================================================================
// Генерация скрипта продаж (FR3, FR5; UC-03).
//
// Детерминированный «ИИ»-слой: из ограниченного контекста клиента собираем
// опорные тезисы и три готовых варианта сообщения (структурный / мягкий /
// короткий). Никакой случайности — вариативность достигается переключением
// по полям контекста (риск-профиль, темы, ограничения, релевантные продукты).
//
// Чистые функции, без сайд-эффектов и без импорта модулей данных.
// ============================================================================

import type { Product, ScriptResult, ScriptVariant } from "../domain/types";
import { tagLabel } from "../domain/tags";
import { type AIContext, firstName } from "./context";

const RISK_RU: Record<string, string> = {
  conservative: "консервативный",
  moderate: "умеренный",
  aggressive: "активный",
};

/** Человекочитаемое название продукта в винительном/именительном без падежной магии. */
function productName(p: Product): string {
  return p.name;
}

/** Короткая суть продукта без «продающего» хвоста — для тезисов. */
function productEssence(p: Product): string {
  // Берём первое предложение питча — оно несёт ключевую ценность.
  const first = p.pitch.split(/(?<=[.!?])\s/)[0];
  return first.replace(/\.$/, "");
}

/** Перевод технических тем инсайта в живые формулировки. */
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
  travel: "поездки и travel-сервис",
  premium_card: "премиальную карту",
  service: "качество сервиса",
  insurance: "страховую защиту",
  family: "защиту семьи",
  cashback: "кэшбэк",
  retention: "сохранение отношений",
  bond_alternative: "альтернативу облигациям",
  soft_follow_up: "мягкое продолжение диалога",
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
    short: has("keep_message_short", "no_long_messages", "avoid_long_messages", "avoid_long_presentation", "avoid_long_terms"),
    oneTopic: has("separate_topics", "avoid_topic_mixing"),
    noCall: has("no_call"),
    serviceFirst: has("no_sales_push", "negative_service"),
    mobile: has("mobile_format_only"),
    ownership: has("show_ownership"),
  };
}

/** Глагол призыва к следующему шагу с учётом ограничений (без давления). */
function softCall(flags: ConstraintFlags): string {
  if (flags.noCall) return "Если удобно, продолжим в переписке";
  if (flags.noPressure) return "Если будет интересно, подскажите — без спешки";
  return "Скажите, когда удобно обсудить детали";
}

export function generateScript(ctx: AIContext, goal: string, instruction?: string): ScriptResult {
  const name = firstName(ctx);
  const { client, insight, relevantProducts, ownedProducts } = ctx;
  const flags = readConstraints(insight?.constraints ?? []);
  const topics = insight?.topics ?? [];
  const riskRu = RISK_RU[client.riskAppetite] ?? client.riskAppetite;

  // --- Опорные тезисы (3–5) ------------------------------------------------
  const talkingPoints: string[] = [];

  // 1. Якорь на цель/контекст.
  talkingPoints.push(`Цель контакта: ${goal.trim().replace(/\.$/, "")}.`);

  // 2. Темы интереса из инсайта (если есть) или из тегов профиля.
  if (topics.length > 0) {
    const t = topics.slice(0, 2).map(topicRu).join(" и ");
    talkingPoints.push(`Клиент уже проявлял интерес к теме: ${t} — опираемся на это, а не начинаем с нуля.`);
  } else if (client.tags.length > 0) {
    talkingPoints.push(`По профилю клиент тяготеет к темам: ${client.tags.slice(0, 2).map(tagLabel).join(", ")}.`);
  }

  // 3. Риск-профиль как рамка аргументации.
  talkingPoints.push(`Риск-профиль ${riskRu}: подбираем формулировки и продукты под этот уровень риска.`);

  // 4. Релевантный продукт + его ценность (если не сервис-первый сценарий).
  if (!flags.serviceFirst && relevantProducts.length > 0) {
    const p = relevantProducts[0];
    talkingPoints.push(`Ключевой продукт — «${productName(p)}»: ${productEssence(p)}.`);
  } else if (flags.serviceFirst) {
    talkingPoints.push(`Сначала сервис: снимаем напряжение и берём ответственность, продукт — только после восстановления доверия.`);
  }

  // 5. Опора на текущий портфель — продолжение отношений, а не «холодная» продажа.
  if (ownedProducts.length > 0) {
    const owned = ownedProducts
      .slice(0, 2)
      .map((o) => `«${o.product.name}»`)
      .join(", ");
    talkingPoints.push(`У клиента уже есть ${owned} — связываем предложение с тем, чем он пользуется.`);
  }

  // Жёстко ограничиваем 5 тезисами, гарантируя минимум 3.
  const trimmedPoints = talkingPoints.slice(0, 5);

  // --- Текстовые блоки для вариантов ---------------------------------------
  const lead = relevantProducts.length > 0 ? relevantProducts[0] : null;
  const topicPhrase = topics.length > 0 ? topicRu(topics[0]) : "ваш вопрос";
  const goalClause = goal.trim().replace(/\.$/, "").toLowerCase();

  // Структурный: по делу, со структурой и конкретикой.
  const structural = buildStructural(name, goalClause, lead, topicPhrase, flags, riskRu);
  // Мягкий: эмпатичный, без давления, оставляет инициативу клиенту.
  const soft = buildSoft(name, topicPhrase, lead, flags);
  // Короткий: 1–2 предложения, mobile-friendly.
  const short = buildShort(name, topicPhrase, lead, flags);

  const variants: ScriptVariant[] = [
    { label: "Структурный", tone: "деловой, по существу", text: structural },
    { label: "Мягкий", tone: "тёплый, без давления", text: soft },
    { label: "Короткий", tone: "лаконичный, для мобильного", text: short },
  ];

  // --- Дополнительный вариант по свободной правке менеджера (FR5) -----------
  const instr = instruction?.trim() ?? "";
  if (instr.length > 0) {
    const wantsSofter = /мягч|деликат|без давлен/i.test(instr);
    const wantsShort = /короч|кратк|сжат/i.test(instr);
    const omitProduct = /без цен|не упомин.*цен|без продукт/i.test(instr);

    // Переопределения поверх исходных флагов — детерминированно.
    const overriddenFlags: ConstraintFlags = {
      ...flags,
      noPressure: flags.noPressure || wantsSofter,
      short: flags.short || wantsShort,
    };
    // Если просили не упоминать продукт/цену — убираем ведущий продукт.
    const overriddenLead = omitProduct ? null : lead;

    let customText: string;
    if (wantsShort) {
      customText = buildShort(name, topicPhrase, overriddenLead, overriddenFlags);
    } else if (wantsSofter) {
      customText = buildSoft(name, topicPhrase, overriddenLead, overriddenFlags);
    } else {
      customText = buildStructural(name, goalClause, overriddenLead, topicPhrase, overriddenFlags, riskRu);
    }

    variants.push({ label: "По вашей правке", tone: "по инструкции менеджера", text: customText });
  }

  // --- Пробелы в данных (UC-03 исключение) ---------------------------------
  const dataGaps: string[] = [];
  if (!insight) {
    dataGaps.push("Нет анализа последнего диалога — темы и ограничения берём из профиля, формулировки нейтральные.");
  }
  if (!client.note) {
    dataGaps.push("Заметка о клиенте не заполнена — стоит уточнить приоритеты лично, прежде чем углубляться в продукт.");
  }

  return {
    goal,
    talkingPoints: trimmedPoints,
    variants,
    dataGaps,
  };
}

// ----------------------------------------------------------------------------
// Сборщики вариантов. Вынесены отдельно ради читаемости; детерминированы.
// ----------------------------------------------------------------------------

function buildStructural(
  name: string,
  goalClause: string,
  lead: Product | null,
  topicPhrase: string,
  flags: ConstraintFlags,
  riskRu: string,
): string {
  if (flags.serviceFirst) {
    return [
      `${name}, спасибо, что обозначили ситуацию.`,
      `Беру вопрос под личный контроль и в первую очередь хочу убедиться, что сервисная часть закрыта.`,
      `Как только всё будет в порядке, вернёмся к ${topicPhrase} — без спешки и в удобном вам формате.`,
    ].join(" ");
  }

  const sentences: string[] = [`${name}, по вашему запросу подготовил короткий план: ${goalClause}.`];
  if (lead) {
    sentences.push(
      `Предлагаю отталкиваться от «${lead.name}» — ${productEssence(lead).toLowerCase()}, что хорошо ложится на ваш ${riskRu} профиль.`,
    );
    if (!flags.short) {
      sentences.push(`Соберу сравнение в двух-трёх сценариях, чтобы вы видели логику, а не только итог.`);
    }
  } else {
    sentences.push(`Сначала зафиксируем приоритеты по теме «${topicPhrase}», затем подберу конкретные варианты под них.`);
  }
  sentences.push(`${softCall(flags)}.`);
  return sentences.join(" ");
}

function buildSoft(name: string, topicPhrase: string, lead: Product | null, flags: ConstraintFlags): string {
  const sentences: string[] = [
    `${name}, без какой-либо спешки — хотел вернуться к теме «${topicPhrase}», когда вам будет комфортно.`,
  ];
  if (flags.serviceFirst) {
    sentences.push(`Сейчас для меня важнее, чтобы вы остались довольны сервисом; всё остальное обсудим позже, как вам удобно.`);
  } else if (lead) {
    sentences.push(`Если будет интересно, могу спокойно показать, чем «${lead.name}» может быть полезен именно вам — без обязательств.`);
  } else {
    sentences.push(`Я рядом и готов помочь, как только тема станет для вас актуальной.`);
  }
  if (!flags.noCall && !flags.serviceFirst) {
    sentences.push(`Можем созвониться или остаться в переписке — как удобнее.`);
  }
  return sentences.join(" ");
}

function buildShort(name: string, topicPhrase: string, lead: Product | null, flags: ConstraintFlags): string {
  if (flags.serviceFirst) {
    return `${name}, держу ваш вопрос на личном контроле — отпишусь, как только всё решим.`;
  }
  if (lead) {
    return `${name}, подобрал вариант по «${lead.name}» под ${topicPhrase}. Прислать короткое сравнение?`;
  }
  return `${name}, есть пара идей по теме «${topicPhrase}». Подскажите, когда удобно — пришлю кратко.`;
}
