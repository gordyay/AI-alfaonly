import type { CockpitStats, SortMode } from "../types";

interface HeroProps {
  stats?: CockpitStats | null;
  managerId: string;
  sortMode: SortMode;
  onToggleSort: () => void;
  onToggleManager: () => void;
}

const SORT_LABELS: Record<SortMode, string> = {
  priority: "По важности",
  due_at: "По ближайшему сроку",
};

export function Hero({ stats, managerId, sortMode, onToggleSort, onToggleManager }: HeroProps) {
  return (
    <header className="hero">
      <div className="hero__copy">
        <p className="eyebrow">Alfa Only</p>
        <h1>План дня менеджера</h1>
        <p className="hero__text">
          Один главный сценарий: менеджер открывает день, выбирает кейс из приоритетного списка,
          быстро понимает, почему он важен, готовит запись в CRM и при необходимости обращается к ассистенту.
        </p>

        <div className="hero__controls">
          <button className="ghost-button" type="button" onClick={onToggleSort}>
            Сортировка: {SORT_LABELS[sortMode]}
          </button>
          <button className="ghost-button" type="button" onClick={onToggleManager}>
            Менеджер: {managerId}
          </button>
        </div>
      </div>

      <div className="hero__stats">
        <section className="stat-card">
          <span className="stat-card__label">Кейсов в работе</span>
          <strong className="stat-card__value">{stats?.actionable_items ?? 0}</strong>
        </section>
        <section className="stat-card">
          <span className="stat-card__label">Срочно сегодня</span>
          <strong className="stat-card__value">{stats?.urgent_items ?? 0}</strong>
        </section>
        <section className="stat-card">
          <span className="stat-card__label">Клиентов в фокусе</span>
          <strong className="stat-card__value">{stats?.clients_in_focus ?? 0}</strong>
        </section>
        <section className="stat-card stat-card--accent">
          <span className="stat-card__label">Возможности</span>
          <strong className="stat-card__value">{stats?.opportunity_items ?? 0}</strong>
        </section>
      </div>
    </header>
  );
}
