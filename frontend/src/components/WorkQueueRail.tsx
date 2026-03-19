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
  selectedWorkItemTitle?: string | null;
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
  selectedWorkItemTitle,
  filterValue,
  onFilterChange,
  onSelectWorkItem,
  sortMode,
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
          <div>
            <p className="panel__eyebrow">Рабочий triage</p>
            <h2>Полная очередь кейсов</h2>
          </div>
          <div className="queue-summary-card">
            <strong>{visibleItems}</strong>
            <span>{loading && totalItems === 0 ? "обновляем очередь" : `из ${totalItems} кейсов в текущем фокусе`}</span>
            <small>{sortMode === "priority" ? "Сортировка по приоритету" : "Сортировка по сроку"}</small>
          </div>
        </div>

        {selectedWorkItemTitle ? (
          <div className="queue-focus-banner">
            <strong>Сейчас открыт кейс:</strong>
            <span>{selectedWorkItemTitle}</span>
          </div>
        ) : null}

        <label className="search-field">
          <span>Поиск по клиенту, кейсу, цели или продукту</span>
          <input
            type="search"
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Например, премиум карта, ликвидность или Елена Смирнова"
          />
        </label>

        <div className="queue-filter-grid">{renderControls(primaryControls)}</div>

        <div className="button-row">
          <button className="ghost-button" type="button" onClick={() => setShowAdvancedFilters((current) => !current)}>
            {showAdvancedFilters ? "Скрыть дополнительные фильтры" : "Показать дополнительные фильтры"}
          </button>
        </div>

        {showAdvancedFilters ? <div className="queue-filter-grid">{renderControls(secondaryControls)}</div> : null}
      </div>

      <div className="rail-sections">
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
