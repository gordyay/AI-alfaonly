import { useEffect, useRef, useState } from "react";
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
  loading: boolean;
  selectedWorkItemId?: string | null;
  filterValue: string;
  onFilterChange: (value: string) => void;
  onSelectWorkItem: (item: WorkItem) => void;
  sortMode: SortMode;
  onToggleSort: () => void;
  filters: WorkQueueFilters;
  productOptions: FilterOption[];
  onChangeQueueFilter: (name: keyof WorkQueueFilters, value: string) => void;
}

const SORT_LABELS: Record<SortMode, string> = {
  priority: "По важности",
  due_at: "По сроку",
};

function getCompactSummary(item: WorkItem) {
  return item.summary || item.expected_benefit || "";
}

function getVisibleBadges(item: WorkItem) {
  return [
    { label: getPriorityLabel(item.priority_label), className: "" },
    item.product_name ? { label: item.product_name, className: " badge--accent" } : null,
    item.channel ? { label: getChannelLabel(item.channel), className: "" } : null,
    !item.channel && item.client_churn_risk
      ? { label: getChurnRiskLabel(item.client_churn_risk), className: " badge--subtle" }
      : null,
  ].filter(Boolean) as Array<{ label: string; className: string }>;
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
  { value: "all", label: "Любой риск оттока" },
  { value: "high", label: "Высокий риск оттока" },
  { value: "medium", label: "Средний риск оттока" },
  { value: "low", label: "Низкий риск оттока" },
];

const CHANNEL_OPTIONS: FilterOption[] = [
  { value: "all", label: "Любой канал" },
  { value: "chat", label: "Чат" },
  { value: "call", label: "Звонок" },
  { value: "meeting", label: "Встреча" },
];

export function WorkQueueRail({
  sections,
  totalItems,
  visibleItems,
  loading,
  selectedWorkItemId,
  filterValue,
  onFilterChange,
  onSelectWorkItem,
  sortMode,
  onToggleSort,
  filters,
  productOptions,
  onChangeQueueFilter,
}: WorkQueueRailProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!selectedWorkItemId) {
      return;
    }

    itemRefs.current[selectedWorkItemId]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedWorkItemId]);

  const primaryControls: Array<{ name: keyof WorkQueueFilters; label: string; options: FilterOption[] }> = [
    { name: "itemType", label: "Тип кейса", options: ITEM_TYPE_OPTIONS },
    { name: "priorityLabel", label: "Срочность", options: PRIORITY_OPTIONS },
  ];
  const secondaryControls: Array<{ name: keyof WorkQueueFilters; label: string; options: FilterOption[] }> = [
    { name: "productCode", label: "Продукт", options: productOptions },
    { name: "recommendationStatus", label: "Статус решения", options: STATUS_OPTIONS },
    { name: "churnRisk", label: "Риск оттока", options: CHURN_OPTIONS },
    { name: "channel", label: "Канал", options: CHANNEL_OPTIONS },
  ];

  const renderControls = (controls: Array<{ name: keyof WorkQueueFilters; label: string; options: FilterOption[] }>) =>
    controls.map((control) => (
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
    ));

  return (
    <section className="panel rail-panel">
      <div className="panel__header panel__header--stack">
        <div className="queue-header">
          <div className="queue-header__copy">
            <h2>Очередь кейсов</h2>
          </div>
          <p className="queue-header__meta">
            {loading && totalItems === 0 ? "Обновляем..." : `${visibleItems} из ${totalItems}`}
          </p>
        </div>

        <div className="queue-toolbar">
          <div className="queue-toolbar__top">
            <label className="search-field queue-search-field">
              <span>Поиск</span>
              <input
                type="search"
                value={filterValue}
                onChange={(event) => onFilterChange(event.target.value)}
                placeholder="Клиент, кейс или продукт"
              />
            </label>

            <div className="queue-toolbar__actions">
              <button className="ghost-button queue-sort-button" type="button" onClick={onToggleSort}>
                Сортировка: {SORT_LABELS[sortMode]}
              </button>
              <button
                className={`ghost-button${showAdvancedFilters ? " is-selected" : ""}`}
                type="button"
                onClick={() => setShowAdvancedFilters((current) => !current)}
              >
                {showAdvancedFilters ? "Скрыть фильтры" : "Еще фильтры"}
              </button>
            </div>
          </div>

          <div className="queue-filter-grid queue-filter-grid--primary">{renderControls(primaryControls)}</div>

          {showAdvancedFilters ? <div className="queue-filter-grid queue-filter-grid--secondary">{renderControls(secondaryControls)}</div> : null}
        </div>
      </div>

      <div className="rail-sections" data-tour-spotlight="queue">
        {loading && totalItems === 0 ? (
          <div className="queue-skeleton-list" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <article className="work-item-card work-item-card--skeleton" key={index}>
                <div className="work-item-card__score" />
                <div className="work-item-card__avatar" />
                <div className="work-item-card__body">
                  <div className="skeleton-line skeleton-line--short" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line skeleton-line--medium" />
                </div>
              </article>
            ))}
          </div>
        ) : sections.length ? (
          sections.map((section) => (
            <section className="cockpit-section" key={section.id}>
              <header className="cockpit-section__header">
                <strong>{section.title}</strong>
                <span className="badge">{section.items.length}</span>
              </header>

              <div className="cockpit-card-list">
                {sortItems(section.items, sortMode).map((item) => (
                  <button
                    className={`work-item-card${item.id === selectedWorkItemId ? " is-active" : ""}`}
                    key={item.id}
                    ref={(node) => {
                      itemRefs.current[item.id] = node;
                    }}
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
                      <p className="work-item-card__summary work-item-card__summary--primary">{item.client_name}</p>
                      {getCompactSummary(item) ? (
                        <p className="work-item-card__summary work-item-card__summary--secondary">{getCompactSummary(item)}</p>
                      ) : null}
                      <div className="chip-row chip-row--compact">
                        {getVisibleBadges(item).map((badge) => (
                          <span className={`badge${badge.className}`} key={`${item.id}-${badge.label}`}>
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      <div className="work-item-card__meta">{formatDueLabel(item.due_at)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="empty-state empty-state--small">
            <strong>Ничего не найдено</strong>
            <p>Ослабьте фильтры или очистите поиск.</p>
          </div>
        )}
      </div>
    </section>
  );
}
