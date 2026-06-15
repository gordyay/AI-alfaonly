import type { AppView } from "../store/store";
import { Icon, type IconName } from "./Icon";
import { Avatar } from "./Primitives";

interface NavDef {
  view: AppView;
  label: string;
  icon: IconName;
}

const NAV: NavDef[] = [
  { view: "cases", label: "Кейсы", icon: "inbox" },
  { view: "products", label: "Подбор под продукт", icon: "target" },
  { view: "analytics", label: "Аналитика", icon: "chart" },
];

export function Header({
  view,
  onSetView,
  managerName,
  managerRole,
  onToggleManager,
  queueCount,
}: {
  view: AppView;
  onSetView: (v: AppView) => void;
  managerName: string;
  managerRole: string;
  onToggleManager: () => void;
  queueCount: number;
}) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand__mark">A</span>
        <span className="brand__text">
          <span className="brand__title">Alfa Only</span>
          <span className="brand__sub">ИИ-ассистент менеджера</span>
        </span>
      </div>

      <nav className="app-nav" aria-label="Основная навигация">
        {NAV.map((item) => (
          <button
            key={item.view}
            className={`app-nav__item${view === item.view ? " app-nav__item--active" : ""}`}
            onClick={() => onSetView(item.view)}
            aria-current={view === item.view ? "page" : undefined}
          >
            <Icon name={item.icon} size={17} />
            {item.label}
            {item.view === "cases" && queueCount > 0 && (
              <span className="app-nav__badge">{queueCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="header-spacer" />

      <button
        className="manager-switch"
        onClick={onToggleManager}
        title="Переключить менеджера"
        aria-label={`Менеджер ${managerName}. Переключить на другого менеджера`}
      >
        <span className="manager-switch__meta">
          <span className="manager-switch__name">{managerName}</span>
          <span className="manager-switch__role">{managerRole}</span>
        </span>
        <Avatar name={managerName} size={34} />
        <Icon name="refresh" size={14} className="manager-switch__icon" />
      </button>
    </header>
  );
}
