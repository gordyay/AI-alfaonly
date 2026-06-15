import type { Product } from "../domain/types";

export const PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Премиальная карта",
    category: "cards",
    riskLevel: "low",
    margin: "medium",
    currency: "RUB",
    pitch: "Премиальный сервис, lounge и travel-страховка с повышенным кэшбэком в поездках без скрытых условий.",
  },
  {
    id: "p2",
    name: "Инвест-счет",
    category: "investment",
    riskLevel: "high",
    margin: "high",
    currency: "RUB",
    pitch: "Доступ к диверсифицированным инвестиционным идеям с поэтапным входом и контролем уровня риска.",
  },
  {
    id: "p3",
    name: "Премиальный вклад",
    category: "deposits",
    riskLevel: "low",
    margin: "medium",
    currency: "RUB",
    pitch: "Защита капитала с доходностью выше базового вклада и гибким сроком размещения.",
  },
  {
    id: "p4",
    name: "Страхование путешествий",
    category: "insurance",
    riskLevel: "low",
    margin: "high",
    currency: "RUB",
    pitch: "Надежная страховая защита всей семьи в поездках с быстрым покрытием и понятными условиями.",
  },
  {
    id: "p5",
    name: "Брокерский счет",
    category: "brokerage",
    riskLevel: "high",
    margin: "high",
    currency: "USD",
    pitch: "Выход на валютные и зарубежные инструменты с поэтапным входом частями для умеренного управления риском.",
  },
];
