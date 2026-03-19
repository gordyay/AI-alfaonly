import type { CockpitStats, SortMode } from "../types";

interface HeroProps {
  stats?: CockpitStats | null;
  managerId: string;
  sortMode: SortMode;
  loading: boolean;
  onToggleSort: () => void;
  onToggleManager: () => void;
}

const SORT_LABELS: Record<SortMode, string> = {
  priority: "По важности",
  due_at: "По ближайшему сроку",
};

function HeroStat({
  label,
  value,
  loading,
  accent = false,
}: {
  label: string;
  value?: number | null;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <section className={`stat-card${accent ? " stat-card--accent" : ""}${loading ? " stat-card--loading" : ""}`}>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{loading ? "..." : value ?? 0}</strong>
    </section>
  );
}

export function Hero({ stats, managerId, sortMode, loading, onToggleSort, onToggleManager }: HeroProps) {
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
        <HeroStat label="Кейсов в работе" value={stats?.actionable_items} loading={loading} />
        <HeroStat label="Срочно сегодня" value={stats?.urgent_items} loading={loading} />
        <HeroStat label="Клиентов в фокусе" value={stats?.clients_in_focus} loading={loading} />
        <HeroStat label="Возможности" value={stats?.opportunity_items} loading={loading} accent />
      </div>
    </header>
  );
}
