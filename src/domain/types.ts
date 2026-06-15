// ============================================================================
// Доменная модель ИИ-ассистента персонального менеджера Alfa Only.
// Соответствует составу данных из отчёта (раздел 6.4.2, таблица 28):
// клиенты, продукты, продуктовые позиции, задачи, диалоги, сообщения,
// аналитические инсайты, CRM-заметки, follow-up, обратная связь.
// ============================================================================

export type ChannelType = "chat" | "call" | "meeting";

export type RiskAppetite = "conservative" | "moderate" | "aggressive";

export type ChurnRiskLevel = "low" | "medium" | "high";

export type ProductCategory =
  | "cards"
  | "investment"
  | "deposits"
  | "insurance"
  | "brokerage";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  /** Доходность/риск продукта — влияет на подбор аргументов. */
  riskLevel: "low" | "medium" | "high";
  margin: "low" | "medium" | "high";
  currency: "RUB" | "USD";
  /** Короткое продающее описание. */
  pitch: string;
}

export interface ClientProduct {
  clientId: string;
  productId: string;
  status: "active" | "closed";
  /** Остаток/объём по позиции, в валюте продукта. */
  balance: number;
  openedAtIso: string;
}

export interface Client {
  id: string;
  fullName: string;
  segment: string; // "Alfa Only"
  riskAppetite: RiskAppetite;
  managerId: string;
  age: number;
  city: string;
  preferredChannel: ChannelType;
  maritalStatus: "single" | "married";
  occupation: string;
  /** Совокупные активы под управлением (AUM), RUB. */
  aum: number;
  /** Свободная ликвидность на счетах, RUB. */
  liquidBalance: number;
  churnRisk: ChurnRiskLevel;
  lastContactIso: string;
  nextContactIso: string;
  /** Заметка менеджера о клиенте; null — данных недостаточно. */
  note: string | null;
  /** Семантические теги: investments|churn-risk|silent и т.п. */
  tags: string[];
}

export type TaskStatus = "new" | "in_progress" | "done";

export type TaskIntent =
  | "portfolio_review"
  | "offer_follow_up"
  | "product_pitch"
  | "retention_follow_up"
  | "meeting_conversion"
  | "service_follow_up"
  | "discovery_follow_up"
  | "liquidity_follow_up"
  | "investment_plan"
  | "service_recovery";

export interface Task {
  id: string;
  clientId: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueAtIso: string;
  createdAtIso: string;
  channel: ChannelType;
  managerPriorityHint: "low" | "medium" | "high";
  intent: TaskIntent;
  goal: string;
  source: "sfa" | "crm";
  conversationId: string | null;
  productCode: string | null;
}

export type MessageSender = "client" | "manager";

export interface Message {
  id: string;
  conversationId: string;
  sender: MessageSender;
  text: string;
  sentAtIso: string;
}

export interface Conversation {
  id: string;
  clientId: string;
  channel: ChannelType;
  topic: string;
  startedAtIso: string;
}

export type Sentiment = "interested" | "neutral" | "tense" | "negative";

export type InsightUrgency = "low" | "normal" | "high" | "critical";

export type ResponseStyle = "short" | "comparison" | "detailed";

/** Аналитический инсайт по диалогу — вход для приоритизации и ИИ-функций. */
export interface ConversationInsight {
  conversationId: string;
  sentiment: Sentiment;
  urgency: InsightUrgency;
  buyingSignal: "low" | "medium" | "high" | "speed_sensitive";
  /** Минут с момента последнего значимого события (ожидание). */
  waitingMinutes: number;
  nextTouchIso: string;
  recommendedAction: string;
  preferredChannel: ChannelType;
  responseStyle: ResponseStyle;
  /** Темы интереса клиента. */
  topics: string[];
  /** Чувствительные моменты / ограничения («чего не делать»). */
  constraints: string[];
  /** Коды релевантных продуктов. */
  productCodes: string[];
  /** Рекомендованные шаги (для скриптов). */
  playbook: string[];
}

export type CrmNoteOutcome = "follow_up" | "pending" | "resolved";

export interface CrmNote {
  id: string;
  clientId: string;
  managerId: string;
  taskId: string | null;
  text: string;
  outcome: CrmNoteOutcome;
  channel: ChannelType;
  nextContactIso: string;
  createdAtIso: string;
}

export interface FollowUp {
  id: string;
  clientId: string;
  noteId: string | null;
  dueAtIso: string;
  title: string;
  done: boolean;
}

export type FeedbackDecision = "accepted" | "edited" | "rejected";

export interface FeedbackEvent {
  id: string;
  recommendationId: string;
  managerId: string;
  kind: string;
  clientId: string | null;
  conversationId: string | null;
  decision: FeedbackDecision;
  comment: string;
  label: string;
  createdAtIso: string;
}

// ----------------------------------------------------------------------------
// Приоритизация (раздел 6.2): 5 факторов, веса в сумме = 1.
// Приоритет = 0.25·Ожидание + 0.30·Ценность + 0.20·Срочность
//           + 0.15·Потенциал + 0.10·Риск оттока
// ----------------------------------------------------------------------------

export type PriorityFactorKey =
  | "waiting"
  | "value"
  | "urgency"
  | "potential"
  | "churn";

export interface PriorityFactor {
  key: PriorityFactorKey;
  label: string;
  /** Балл фактора, 0–100. */
  score: number;
  weight: number;
  /** Вклад в итог = score × weight. */
  contribution: number;
  /** Человекочитаемое пояснение, почему такой балл. */
  reason: string;
}

export type PriorityLevel = "high" | "medium" | "low";

export interface PriorityBreakdown {
  /** Итоговая оценка 0–100. */
  total: number;
  level: PriorityLevel;
  factors: PriorityFactor[];
  /** Топ-причины приоритета (короткие). */
  reasons: string[];
  /** Признаки нехватки данных (NFR4 / UC-01 исключение). */
  dataGaps: string[];
}

// ----------------------------------------------------------------------------
// Склонность к покупке (раздел 6.3): 5 факторов.
// ----------------------------------------------------------------------------

export type PropensityFactorKey =
  | "product_fit"
  | "payment_capacity"
  | "behavioral_signal"
  | "relationship_depth"
  | "portfolio_gap";

export interface PropensityFactor {
  key: PropensityFactorKey;
  label: string;
  score: number; // 0–100
  weight: number;
  contribution: number;
  reason: string;
}

export interface PropensityScore {
  clientId: string;
  productId: string;
  total: number; // 0–100 (честная сумма 5 факторов)
  level: PriorityLevel;
  factors: PropensityFactor[];
  reasons: string[];
  /** Высокий риск оттока: продажа отложена ради удержания (клиент не цель для продаж). */
  retentionFirst: boolean;
}

// ----------------------------------------------------------------------------
// WorkItem — единица очереди (коммуникация или задача), раздел 6.2.
// ----------------------------------------------------------------------------

export type WorkItemKind = "communication" | "task";

export interface WorkItem {
  id: string;
  kind: WorkItemKind;
  clientId: string;
  taskId: string | null;
  conversationId: string | null;
  title: string;
  /** Короткая суть кейса. */
  summary: string;
  channel: ChannelType;
  productCode: string | null;
  dueAtIso: string;
  createdAtIso: string;
  /** Есть ли непрочитанное входящее сообщение клиента. */
  hasIncoming: boolean;
  /** Текст последнего входящего сообщения (если есть). */
  lastIncomingText: string | null;
  priority: PriorityBreakdown;
  /** Рекомендуемое следующее лучшее действие (NBA). */
  nextBestAction: string;
  /** Ожидаемый эффект от действия. */
  expectedImpact: string;
  /** ID рекомендации для цикла обратной связи (FR8). */
  recommendationId: string;
}

// ----------------------------------------------------------------------------
// ИИ-артефакты (deterministic generators, ai/*).
// ----------------------------------------------------------------------------

export interface ScriptVariant {
  label: string;
  tone: string;
  text: string;
}

export interface ScriptResult {
  goal: string;
  /** Опорные тезисы. */
  talkingPoints: string[];
  variants: ScriptVariant[];
  dataGaps: string[];
}

export interface ObjectionOption {
  title: string;
  response: string;
  rationale: string;
}

export interface ObjectionResult {
  objectionText: string;
  objectionType: string;
  options: ObjectionOption[];
  /** Чего говорить НЕ стоит (FR4). */
  avoid: string[];
  /** Эскалация профильному специалисту (UC-05 исключение). */
  escalate: string | null;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  outcome: string;
  nextStep: string;
  /** Черновик заметки в CRM (FR6). */
  crmDraft: string;
  nextContactIso: string;
}

export type ReplySource = "manual" | "script" | "objection" | "assistant";

export interface ChatTurn {
  role: "manager" | "assistant";
  text: string;
  /** Использованные источники контекста (NFR4). */
  sources?: string[];
}
