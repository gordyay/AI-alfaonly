// Человекочитаемые метки для слагов-тегов профиля клиента. Слаги остаются
// машинными ключами (по ним работают prioritization/propensity/chat-интенты),
// а в UI и в генерируемых текстах показываем русские формулировки.
//
// Модуль намеренно без импортов (в т.ч. без модулей данных), чтобы и UI, и
// чистый ИИ-слой могли использовать его, не нарушая контракт ограниченного
// контекста.

const TAG_LABEL: Record<string, string> = {
  "active-chat": "Активный диалог",
  brokerage: "Брокерские",
  campaign: "Кампания",
  "churn-risk": "Риск оттока",
  "deal-window": "Окно сделки",
  deposit: "Депозит",
  family: "Семья",
  fx: "Валюта",
  growth: "Рост капитала",
  "insufficient-data": "Мало данных",
  insurance: "Страхование",
  "investment-intent": "Интерес к инвестициям",
  investments: "Инвестиции",
  liquidity: "Ликвидность",
  "negative-tone": "Негативный тон",
  "new-client": "Новый клиент",
  "premium-card": "Премиальная карта",
  retention: "Удержание",
  salary: "Зарплатный проект",
  service: "Сервис",
  silent: "Замолчал",
  "silent-client": "Молчаливый клиент",
  "soft-contact": "Мягкий контакт",
  "timing-risk": "Чувствителен к таймингу",
  travel: "Путешествия",
  vip: "VIP",
  wealth: "Крупный капитал",
};

/** Русская метка тега профиля; для незнакомого слага — гуманизированный fallback. */
export function tagLabel(tag: string): string {
  return TAG_LABEL[tag] ?? tag.replace(/[-_]/g, " ");
}
