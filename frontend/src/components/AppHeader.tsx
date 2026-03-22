import type { AppMode, CockpitStats } from "../types";

interface AppHeaderProps {
  stats?: CockpitStats | null;
  managerId: string;
  loading: boolean;
  mode: AppMode;
  selectedWorkItemTitle?: string | null;
  onToggleManager: () => void;
  onShowInbox: () => void;
  onShowAnalytics: () => void;
  onOpenTour: () => void;
}

function getModeLabel(mode: AppMode) {
  switch (mode) {
    case "case":
      return "Кейс";
    case "analytics":
      return "Аналитика";
    default:
      return "Входящие";
  }
}

function HeaderStat({
  label,
  value,
  loading,
}: {
  label: string;
  value?: number | null;
  loading: boolean;
}) {
  return (
    <article className="app-stat">
      <span>{label}</span>
      <strong>{loading ? "..." : value ?? 0}</strong>
    </article>
  );
}

export function AppHeader({
  stats,
  managerId,
  loading,
  mode,
  selectedWorkItemTitle,
  onToggleManager,
  onShowInbox,
  onShowAnalytics,
  onOpenTour,
}: AppHeaderProps) {
  return (
    <header className="panel app-header" data-tour="appbar">
      <div className="app-header__main">
        <div className="app-header__copy">
          <p className="panel__eyebrow">Alfa Only</p>
          <h1>Рабочий день</h1>
          <p className="app-header__subtitle">
            {mode === "case" && selectedWorkItemTitle
              ? selectedWorkItemTitle
              : mode === "analytics"
                ? "Метрики команды и рекомендаций."
                : "Очередь кейсов и быстрый переход в работу."}
          </p>
        </div>

        <div className="app-header__actions">
          <div className="app-header__mode-nav">
            <button
              className={`ghost-button${mode === "inbox" || mode === "case" ? " is-selected" : ""}`}
              type="button"
              onClick={onShowInbox}
            >
              {mode === "case" ? "К очереди" : "Входящие"}
            </button>
            <button
              className={`ghost-button${mode === "analytics" ? " is-selected" : ""}`}
              type="button"
              onClick={onShowAnalytics}
            >
              Аналитика
            </button>
          </div>

          <div className="app-header__controls">
            <button className="ghost-button" type="button" onClick={onToggleManager}>
              Менеджер: {managerId}
            </button>
            <button className="primary-button" type="button" onClick={onOpenTour}>
              Тур
            </button>
          </div>
        </div>
      </div>

      <div className="app-header__footer">
        <div className="app-header__stats">
          <HeaderStat label="В работе" value={stats?.actionable_items} loading={loading} />
          <HeaderStat label="Срочно" value={stats?.urgent_items} loading={loading} />
          <HeaderStat label="В фокусе" value={stats?.clients_in_focus} loading={loading} />
        </div>

        <div className="app-header__mode-badge">
          <span>Экран</span>
          <strong>{getModeLabel(mode)}</strong>
        </div>
      </div>
    </header>
  );
}
