import type { AISummaryDraft, Conversation, ProductPropensityResponse, WorkItem, WorkItemType } from "../types";

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
    return "Изменено";
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

export function getConversationForWorkItem(
  conversations: Conversation[],
  workItem?: WorkItem | null,
): Conversation | null {
  if (!conversations.length) {
    return null;
  }

  if (workItem?.conversation_id) {
    return conversations.find((conversation) => conversation.id === workItem.conversation_id) ?? conversations[0];
  }

  return conversations[0];
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

export function filterSectionsByQuery<T extends { title: string; client_name: string; summary: string }>(
  sections: Array<{ id: string; title: string; subtitle: string; items: T[] }>,
  query: string,
) {
  if (!query) {
    return sections;
  }

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        `${item.title} ${item.client_name} ${item.summary}`.toLowerCase().includes(query),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export function getFocusPropensityLabel(propensity?: ProductPropensityResponse | null): string {
  const topItem = propensity?.items?.[0];
  if (!topItem) {
    return "Нужно собрать больше данных";
  }
  return `${topItem.product_name} · ${topItem.score}`;
}

export function getRecommendationTypeLabel(value?: string | null): string {
  if (!value) {
    return "Рекомендация";
  }

  const labels: Record<string, string> = {
    manager_work_item: "Рекомендация менеджеру",
    dialog_summary: "Сводка диалога",
    crm_note: "CRM-заметка",
    objection_workflow: "Разбор возражения",
    sales_script: "Скрипт продажи",
  };

  return labels[value] ?? value.replaceAll("_", " ");
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
    assistant_answered: "Ассистент ответил",
    script_generated: "Скрипт подготовлен",
    objection_prepared: "Варианты ответа подготовлены",
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
