// Демо-часы. Всё время в прототипе отсчитывается от фиксированной точки,
// чтобы демонстрация была воспроизводимой (одинаковые "X минут назад"
// и сроки независимо от реальной даты запуска).
//
// DEMO_NOW — утро вторника, 09:40 по Москве: типичный момент "утренней
// сортировки" менеджера (UC-01).

export const DEMO_NOW = new Date("2026-06-16T09:40:00+03:00");

interface Offset {
  days?: number;
  hours?: number;
  minutes?: number;
}

function shift(base: Date, sign: 1 | -1, o: Offset): string {
  const ms =
    (o.days ?? 0) * 86_400_000 +
    (o.hours ?? 0) * 3_600_000 +
    (o.minutes ?? 0) * 60_000;
  return new Date(base.getTime() + sign * ms).toISOString();
}

/** Момент в прошлом относительно DEMO_NOW. */
export function ago(o: Offset): string {
  return shift(DEMO_NOW, -1, o);
}

/** Момент в будущем относительно DEMO_NOW. */
export function ahead(o: Offset): string {
  return shift(DEMO_NOW, 1, o);
}

/** Фиксированное "сейчас" в минутах от эпохи — для расчётов. */
export const DEMO_NOW_MS = DEMO_NOW.getTime();
