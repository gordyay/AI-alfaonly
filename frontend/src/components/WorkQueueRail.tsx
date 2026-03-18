import type { CockpitSection, SortMode, WorkItem } from "../types";
import { formatDueLabel, getRecommendationStatusLabel, getWorkItemTypeLabel, initials } from "../lib/utils";

interface WorkQueueRailProps {
  sections: CockpitSection[];
  selectedWorkItemId?: string | null;
  filterValue: string;
  onFilterChange: (value: string) => void;
  onSelectWorkItem: (item: WorkItem) => void;
  sortMode: SortMode;
}

function sortItems(items: WorkItem[], sortMode: SortMode): WorkItem[] {
  const list = [...items];
  if (sortMode === "due_at") {
    return list.sort((left, right) => {
      const leftTime = left.due_at ? new Date(left.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.due_at ? new Date(right.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || right.priority_score - left.priority_score;
    });
  }
  return list.sort((left, right) => right.priority_score - left.priority_score);
}

export function WorkQueueRail({
  sections,
  selectedWorkItemId,
  filterValue,
  onFilterChange,
  onSelectWorkItem,
  sortMode,
}: WorkQueueRailProps) {
  return (
    <section className="panel rail-panel">
      <div className="panel__header panel__header--stack">
        <div>
          <p className="panel__eyebrow">Рабочий план</p>
          <h2>Очередь на сегодня</h2>
        </div>
        <label className="search-field">
          <span>Фильтр по клиенту или кейсу</span>
          <input
            type="search"
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Например, премиум карта или Елена Смирнова"
          />
        </label>
      </div>

      <div className="rail-sections">
        {sections.length ? (
          sections.map((section) => (
            <section className="cockpit-section" key={section.id}>
              <header className="cockpit-section__header">
                <p className="panel__eyebrow">{section.title}</p>
                <strong>{section.subtitle}</strong>
              </header>

              <div className="cockpit-card-list">
                {sortItems(section.items, sortMode).map((item) => (
                  <button
                    className={`work-item-card${item.id === selectedWorkItemId ? " is-active" : ""}`}
                    key={item.id}
                    type="button"
                    onClick={() => onSelectWorkItem(item)}
                  >
                    <div className="work-item-card__score">{item.priority_score}</div>
                    <div className="work-item-card__avatar">{initials(item.client_name)}</div>
                    <div className="work-item-card__body">
                      <p className="work-item-card__eyebrow">
                        {getWorkItemTypeLabel(item.item_type)} · {getRecommendationStatusLabel(item.recommendation_status)}
                      </p>
                      <h3>{item.title}</h3>
                      <p className="work-item-card__summary">{item.client_name}</p>
                      <p className="work-item-card__summary">{item.summary}</p>
                      <div className="work-item-card__meta">
                        <span>{item.expected_benefit}</span>
                        <span>{formatDueLabel(item.due_at)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="empty-state empty-state--small">
            <strong>Очередь пока пуста</strong>
            <p>Попробуйте очистить фильтр или переключить менеджера.</p>
          </div>
        )}
      </div>
    </section>
  );
}
