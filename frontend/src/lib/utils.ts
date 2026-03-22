import type {
  AISummaryDraft,
  CaseInteraction,
  CockpitSection,
  ProductPropensityResponse,
  WorkItem,
  WorkItemType,
} from "../types";

export interface WorkQueueFilters {
  itemType: string;
  productCode: string;
  priorityLabel: string;
  recommendationStatus: string;
  churnRisk: string;
  channel: string;
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Не указано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatMoney(value: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function getWorkItemTypeLabel(itemType: WorkItemType): string {
  if (itemType === "task") {
    return "Задача";
  }
  if (itemType === "opportunity") {
    return "Возможность";
  }
  return "Коммуникация";
}

export function getRecommendationStatusLabel(status?: string | null): string {
  if (status === "accepted") {
    return "Принято";
  }
  if (status === "rejected") {
    return "Отклонено";
  }
  if (status === "edited") {
    return "Доработано";
  }
  return "Ожидает решения";
}

export function formatDueLabel(value?: string | null): string {
  if (!value) {
    return "Без жесткого срока";
  }
  return `Срок: ${formatDateTime(value)}`;
}

export function toFollowUpInputValue(value?: string | null): { date: string; time: string } {
  if (!value) {
    return { date: "", time: "" };
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - timezoneOffset);

  return {
    date: localDate.toISOString().slice(0, 10),
    time: localDate.toISOString().slice(11, 16),
  };
}

export function sanitizeTimeInput(value: string): string {
  const digits = value.replace(/[^\d]/g, "").slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function fromFollowUpInputValue(dateValue: string, timeValue: string): string | null {
  if (!dateValue) {
    return null;
  }

  const normalizedTime = /^\d{2}:\d{2}$/.test(timeValue || "") ? timeValue : "00:00";
  const [hourText, minuteText] = normalizedTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return new Date(`${dateValue}T${normalizedTime}:00`).toISOString();
}

export function getInteractionForCase(
  interactions: CaseInteraction[],
  interactionId?: string | null,
): CaseInteraction | null {
  if (!interactions.length) {
    return null;
  }

  if (interactionId) {
    return interactions.find((interaction) => interaction.id === interactionId) ?? null;
  }

  return interactions.find((interaction) => interaction.is_text_based) ?? interactions[0] ?? null;
}

export function getMiniSummaryCopy(args: {
  detailSummary?: string | null;
  workItem?: WorkItem | null;
  draft?: AISummaryDraft | null;
}): string {
  if (args.workItem?.summary) {
    return args.workItem.summary;
  }
  if (args.detailSummary) {
    return args.detailSummary;
  }
  if (args.draft?.contact_summary) {
    return args.draft.contact_summary;
  }
  return "Выберите кейс из плана дня, чтобы увидеть краткую сводку и следующий шаг.";
}

export function cloneDraft<T>(draft: T | null | undefined): T | null {
  if (!draft) {
    return null;
  }
  return JSON.parse(JSON.stringify(draft)) as T;
}

export function filterWorkQueue(items: WorkItem[], query: string, filters: WorkQueueFilters): WorkItem[] {
  return items.filter((item) => {
    const matchesQuery =
      !query ||
      `${item.title} ${item.client_name} ${item.summary} ${item.product_name || ""} ${item.business_goal || ""}`
        .toLowerCase()
        .includes(query);

    const matchesType = filters.itemType === "all" || item.item_type === filters.itemType;
    const matchesProduct = filters.productCode === "all" || item.product_code === filters.productCode;
    const matchesPriority = filters.priorityLabel === "all" || item.priority_label === filters.priorityLabel;
    const matchesStatus =
      filters.recommendationStatus === "all" || item.recommendation_status === filters.recommendationStatus;
    const matchesChurn = filters.churnRisk === "all" || item.client_churn_risk === filters.churnRisk;
    const matchesChannel = filters.channel === "all" || item.channel === filters.channel;

    return (
      matchesQuery &&
      matchesType &&
      matchesProduct &&
      matchesPriority &&
      matchesStatus &&
      matchesChurn &&
      matchesChannel
    );
  });
}

export function groupWorkQueue(items: WorkItem[]): CockpitSection[] {
  const definitions: Array<Pick<CockpitSection, "id" | "title" | "subtitle" | "item_type">> = [
    {
      id: "daily-plan",
      title: "План на сегодня",
      subtitle: "Задачи менеджера с понятной бизнес-целью и сроком.",
      item_type: "task",
    },
    {
      id: "urgent-communications",
      title: "Срочные коммуникации",
      subtitle: "Кейсы, где нужно ответить или вернуться с повторным контактом.",
      item_type: "communication",
    },
    {
      id: "product-opportunities",
      title: "Коммерческие возможности",
      subtitle: "Кейсы с явным продуктовым следующим шагом.",
      item_type: "opportunity",
    },
  ];

  return definitions
    .map((definition) => ({
      ...definition,
      items: items.filter((item) => item.item_type === definition.item_type),
    }))
    .filter((section) => section.items.length > 0);
}

export function getFocusPropensityLabel(propensity?: ProductPropensityResponse | null): string {
  const topItem = propensity?.items?.[0];
  if (!topItem) {
    return "Нужно собрать больше данных";
  }
  return `${topItem.product_name} · приоритет ${topItem.score}`;
}

export function getRecommendationTypeLabel(value?: string | null): string {
  if (!value) {
    return "Рекомендация";
  }

  const labels: Record<string, string> = {
    manager_work_item: "Рекомендация менеджеру",
    dialog_summary: "Сводка диалога",
    mini_summary: "Краткая сводка",
    crm_note: "CRM-заметка",
    client_reply: "Ответ клиенту",
    crm_note_draft: "Черновик CRM",
    objection_workflow: "Разбор возражения",
    sales_script: "Скрипт продажи",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

export function getPriorityLabel(value?: string | null): string {
  if (value === "urgent") {
    return "Срочно";
  }
  if (value === "high") {
    return "Высокий приоритет";
  }
  if (value === "medium") {
    return "Средний приоритет";
  }
  if (value === "low") {
    return "Низкий приоритет";
  }
  return "Без приоритета";
}

export function getActivityActionLabel(value?: string | null): string {
  if (!value) {
    return "Действие";
  }

  const labels: Record<string, string> = {
    generated: "Сформировано",
    saved: "Сохранено",
    feedback_recorded: "Решение сохранено",
    decision_recorded: "Решение зафиксировано",
    summary_generated: "Сводка подготовлена",
    crm_draft_generated: "AI-черновик CRM подготовлен",
    crm_note_saved: "CRM сохранена",
    client_reply_sent: "Ответ отправлен",
    feedback_saved: "Решение сохранено",
    assistant_answered: "Ассистент ответил",
    script_generated: "Скрипт подготовлен",
    script_variant_selected: "Выбран вариант скрипта",
    objection_generated: "Варианты ответа подготовлены",
    objection_option_selected: "Выбран ответ на возражение",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

export function getChannelLabel(value?: string | null): string {
  if (!value) {
    return "Канал не указан";
  }

  const labels: Record<string, string> = {
    chat: "Чат",
    call: "Звонок",
    meeting: "Встреча",
    phone: "Телефон",
    email: "Почта",
  };

  return labels[value] ?? value;
}

export function getChurnRiskLabel(value?: string | null): string {
  if (!value) {
    return "Риск не указан";
  }

  const labels: Record<string, string> = {
    low: "Низкий риск оттока",
    medium: "Средний риск оттока",
    high: "Высокий риск оттока",
  };

  return labels[value] ?? value;
}

export function formatProductCode(value?: string | null): string {
  if (!value) {
    return "Продукт не указан";
  }

  return value.toUpperCase();
}

export function getToneLabel(value?: string | null): string {
  if (!value) {
    return "Тон не указан";
  }

  const labels: Record<string, string> = {
    standard: "Спокойный тон",
    warm: "Тёплый тон",
    concise: "Коротко и по делу",
    formal: "Деловой тон",
  };

  return labels[value] ?? value;
}

export function getPriorityFactorLabel(value: string): string {
  const labels: Record<string, string> = {
    urgency: "Срочность",
    client_value: "Ценность клиента",
    engagement: "Вовлечённость",
    commercial_potential: "Коммерческий потенциал",
    churn_risk: "Риск потери клиента",
    ai_context: "Сигналы помощника",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}
