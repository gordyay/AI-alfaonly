import type { CockpitSection, SortMode, WorkItem } from "../types";
import type { WorkQueueFilters } from "../lib/utils";
import {
  formatDueLabel,
  getChannelLabel,
  getChurnRiskLabel,
  getPriorityLabel,
  getRecommendationStatusLabel,
  getWorkItemTypeLabel,
  initials,
} from "../lib/utils";

interface FilterOption {
  value: string;
  label: string;
}

interface WorkQueueRailProps {
  sections: CockpitSection[];
  totalItems: number;
  visibleItems: number;
  selectedWorkItemId?: string | null;
  filterValue: string;
  onFilterChange: (value: string) => void;
  onSelectWorkItem: (item: WorkItem) => void;
  sortMode: SortMode;
  filters: WorkQueueFilters;
  productOptions: FilterOption[];
  onChangeQueueFilter: (name: keyof WorkQueueFilters, value: string) => void;
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

const ITEM_TYPE_OPTIONS: FilterOption[] = [
  { value: "all", label: "Все типы" },
  { value: "task", label: "Задачи" },
  { value: "communication", label: "Коммуникации" },
  { value: "opportunity", label: "Возможности" },
];

const PRIORITY_OPTIONS: FilterOption[] = [
  { value: "all", label: "Любая срочность" },
  { value: "urgent", label: "Срочно" },
  { value: "high", label: "Высокая" },
  { value: "medium", label: "Средняя" },
  { value: "low", label: "Низкая" },
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "Любой статус" },
  { value: "pending", label: "Ожидает решения" },
  { value: "accepted", label: "Принято" },
  { value: "edited", label: "Доработано" },
  { value: "rejected", label: "Отклонено" },
];

const CHURN_OPTIONS: FilterOption[] = [
  { value: "all", label: "Любой риск churn" },
  { value: "high", label: "Высокий churn" },
  { value: "medium", label: "Средний churn" },
  { value: "low", label: "Низкий churn" },
];

const CHANNEL_OPTIONS: FilterOption[] = [
  { value: "all", label: "Любой канал" },
  { value: "chat", label: "Чат" },
  { value: "call", label: "Звонок" },
  { value: "meeting", label: "Встреча" },
];

function QueueFilters({
  filters,
  productOptions,
  onChangeQueueFilter,
}: {
  filters: WorkQueueFilters;
  productOptions: FilterOption[];
  onChangeQueueFilter: (name: keyof WorkQueueFilters, value: string) => void;
}) {
  const controls: Array<{ name: keyof WorkQueueFilters; label: string; options: FilterOption[] }> = [
    { name: "itemType", label: "Тип кейса", options: ITEM_TYPE_OPTIONS },
    { name: "productCode", label: "Фокус по продукту", options: productOptions },
    { name: "priorityLabel", label: "Срочность", options: PRIORITY_OPTIONS },
    { name: "recommendationStatus", label: "Статус решения", options: STATUS_OPTIONS },
    { name: "churnRisk", label: "Риск churn", options: CHURN_OPTIONS },
    { name: "channel", label: "Канал", options: CHANNEL_OPTIONS },
  ];

  return (
    <div className="queue-filter-grid">
      {controls.map((control) => (
        <label className="field" key={control.name}>
          <span>{control.label}</span>
          <select value={filters[control.name]} onChange={(event) => onChangeQueueFilter(control.name, event.target.value)}>
            {control.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

export function WorkQueueRail({
  sections,
  totalItems,
  visibleItems,
  selectedWorkItemId,
  filterValue,
  onFilterChange,
  onSelectWorkItem,
  sortMode,
  filters,
  productOptions,
  onChangeQueueFilter,
}: WorkQueueRailProps) {
  return (
    <section className="panel rail-panel">
      <div className="panel__header panel__header--stack">
        <div className="queue-header">
          <div>
            <p className="panel__eyebrow">Рабочий triage</p>
            <h2>Полная очередь кейсов</h2>
          </div>
          <div className="queue-summary-card">
            <strong>{visibleItems}</strong>
            <span>из {totalItems} кейсов в текущем фокусе</span>
            <small>{sortMode === "priority" ? "Сортировка по приоритету" : "Сортировка по сроку"}</small>
          </div>
        </div>

        <label className="search-field">
          <span>Поиск по клиенту, кейсу, цели или продукту</span>
          <input
            type="search"
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Например, премиум карта, ликвидность или Елена Смирнова"
          />
        </label>

        <QueueFilters filters={filters} productOptions={productOptions} onChangeQueueFilter={onChangeQueueFilter} />
      </div>

      <div className="rail-sections">
        {sections.length ? (
          sections.map((section) => (
            <section className="cockpit-section" key={section.id}>
              <header className="cockpit-section__header">
                <div>
                  <p className="panel__eyebrow">{section.title}</p>
                  <strong>{section.subtitle}</strong>
                </div>
                <span className="badge">{section.items.length}</span>
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
                      <div className="chip-row chip-row--compact">
                        <span className="badge">{getPriorityLabel(item.priority_label)}</span>
                        {item.product_name ? <span className="badge badge--accent">{item.product_name}</span> : null}
                        {item.channel ? <span className="badge">{getChannelLabel(item.channel)}</span> : null}
                        {item.client_churn_risk ? <span className="badge">{getChurnRiskLabel(item.client_churn_risk)}</span> : null}
                      </div>
                      {item.why.length ? (
                        <div className="chip-row chip-row--compact">
                          {item.why.slice(0, 2).map((reason) => (
                            <span className="badge queue-reason-badge" key={reason}>
                              {reason}
                            </span>
                          ))}
                        </div>
                      ) : null}
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
            <strong>Очередь по текущему фильтру пуста</strong>
            <p>Сбросьте часть фильтров или уберите текстовый поиск, чтобы вернуть кейсы в работу.</p>
          </div>
        )}
      </div>
    </section>
  );
}
