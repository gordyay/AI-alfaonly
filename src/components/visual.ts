// Общие визуальные хелперы: цвета и подписи уровней приоритета/склонности.

import type { PriorityLevel } from "../domain/types";

export const LEVEL_LABEL: Record<PriorityLevel, string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

export const LEVEL_COLOR: Record<PriorityLevel, string> = {
  high: "var(--signal-high)",
  medium: "var(--signal-medium)",
  low: "var(--signal-low)",
};

export function scoreColor(score: number): string {
  if (score >= 70) return "var(--signal-high)";
  if (score >= 40) return "var(--signal-medium)";
  return "var(--signal-low)";
}

/** Цвет ЧИСЛА/ТЕКСТА оценки — затемнённый янтарь для контраста (AA). */
export function scoreTextColor(score: number): string {
  if (score >= 70) return "var(--signal-high)";
  if (score >= 40) return "var(--signal-medium-text)";
  return "var(--signal-low)";
}

/** Цвет заливки полосы фактора — мягче, для спокойной объяснимости. */
export function factorFill(score: number): string {
  if (score >= 70) return "var(--alfa-red)";
  if (score >= 40) return "var(--signal-medium)";
  return "var(--graphite-soft)";
}
