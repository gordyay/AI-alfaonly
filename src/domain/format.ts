// Утилиты форматирования. Все относительные времена считаются от DEMO_NOW,
// чтобы демонстрация была стабильной.

import { DEMO_NOW_MS } from "../data/clock";
import type { ChannelType } from "./types";

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

/** "12,5 млн ₽", "950 тыс ₽", "35 000 ₽". */
export function formatMoney(value: number, currency: "RUB" | "USD" = "RUB"): string {
  const symbol = currency === "USD" ? "$" : "₽";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const millions = value / 1_000_000;
    const text = millions
      .toLocaleString("ru-RU", {
        minimumFractionDigits: millions % 1 === 0 ? 0 : 1,
        maximumFractionDigits: 1,
      })
      .replace(",0", "");
    return `${text} млн ${symbol}`;
  }
  if (abs >= 100_000) {
    return `${rubFormatter.format(Math.round(value / 1000))} тыс ${symbol}`;
  }
  return `${rubFormatter.format(value)} ${symbol}`;
}

/** Точная сумма с разделителями: "12 500 000 ₽". */
export function formatMoneyExact(value: number, currency: "RUB" | "USD" = "RUB"): string {
  const symbol = currency === "USD" ? "$" : "₽";
  return `${rubFormatter.format(value)} ${symbol}`;
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

/** Сколько времени прошло: "20 мин назад", "2 ч назад", "3 дн назад". */
export function timeAgo(iso: string): string {
  const diffMs = DEMO_NOW_MS - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} ${pluralize(minutes, ["минуту", "минуты", "минут"])} назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${pluralize(hours, ["час", "часа", "часов"])} назад`;
  const days = Math.round(hours / 24);
  return `${days} ${pluralize(days, ["день", "дня", "дней"])} назад`;
}

/** Срок: "через 2 ч", "просрочено на 1 ч", "через 3 дн". */
export function dueIn(iso: string): { label: string; overdue: boolean; soon: boolean } {
  const diffMs = new Date(iso).getTime() - DEMO_NOW_MS;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 0) {
    const abs = Math.abs(minutes);
    if (abs < 60) return { label: `просрочено`, overdue: true, soon: true };
    const hours = Math.round(abs / 60);
    if (hours < 24) return { label: `просрочено на ${hours} ч`, overdue: true, soon: true };
    const days = Math.round(hours / 24);
    return { label: `просрочено на ${days} ${pluralize(days, ["день", "дня", "дней"])}`, overdue: true, soon: false };
  }
  if (minutes < 60) return { label: `через ${minutes} мин`, overdue: false, soon: true };
  const hours = Math.round(minutes / 60);
  if (hours < 8) return { label: `через ${hours} ${pluralize(hours, ["час", "часа", "часов"])}`, overdue: false, soon: true };
  if (hours < 24) return { label: `через ${hours} ${pluralize(hours, ["час", "часа", "часов"])}`, overdue: false, soon: false };
  const days = Math.round(hours / 24);
  return { label: `через ${days} ${pluralize(days, ["день", "дня", "дней"])}`, overdue: false, soon: false };
}

/** Время суток: "09:40". */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  chat: "Чат",
  call: "Звонок",
  meeting: "Встреча",
};

export function minutesToHuman(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} ч`.replace(".0", "");
}
