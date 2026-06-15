// Очередь кейсов менеджера (UC-01, FR1): поиск, фильтр, сортировка и
// объяснённые карточки кейсов, сгруппированные по уровню приоритета.
// Данные очереди приходят с бэкенда (каждый кейс уже несёт флаг handled).

import { useEffect, useMemo, useRef } from "react";
import type { Client, PriorityLevel } from "../domain/types";
import type { QueuedItem } from "../api/client";
import { useReference } from "../api/reference";
import { CHANNEL_LABEL, dueIn, formatMoney } from "../domain/format";
import { useStore } from "../store/store";
import { Icon } from "./Icon";
import { LEVEL_COLOR, LEVEL_LABEL, scoreTextColor } from "./visual";

export type QueueSort = "priority" | "due";
export type QueueKind = "all" | "communication" | "task";

interface QueueRailProps {
  /** Полная очередь — для общего счётчика в подзаголовке. */
  items: QueuedItem[];
  /** Отфильтрованный и отсортированный список в том порядке, что видит менеджер. */
  ordered: QueuedItem[];
  selectedId: string | null;
  onSelect: (item: QueuedItem) => void;
  search: string;
  onSearch: (v: string) => void;
  sort: QueueSort;
  onSort: (s: QueueSort) => void;
  kind: QueueKind;
  onKind: (k: QueueKind) => void;
  loading: boolean;
}

/**
 * Применяет фильтр (тип кейса + поиск) и сортировку очереди и возвращает список
 * в порядке отображения. Поиск по имени клиента использует справочную карту.
 */
export function orderQueue(
  items: QueuedItem[],
  opts: { search: string; kind: QueueKind; sort: QueueSort; serviceDown: boolean },
  clientById: Map<string, Client>,
): QueuedItem[] {
  const q = opts.search.trim().toLowerCase();
  let list = items.filter((item) => {
    if (opts.kind !== "all" && item.kind !== opts.kind) return false;
    if (!q) return true;
    const client = clientById.get(item.clientId);
    return (
      (client?.fullName.toLowerCase().includes(q) ?? false) ||
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q)
    );
  });
  if (opts.serviceDown) {
    list = [...list].sort((a, b) => new Date(a.createdAtIso).getTime() - new Date(b.createdAtIso).getTime());
  } else if (opts.sort === "due") {
    list = [...list].sort((a, b) => new Date(a.dueAtIso).getTime() - new Date(b.dueAtIso).getTime());
  }
  return list;
}

const CHANNEL_ICON = { chat: "chat", call: "phone", meeting: "calendar" } as const;
const LEVEL_ORDER: PriorityLevel[] = ["high", "medium", "low"];

function QueueCard({
  item,
  selected,
  onSelect,
  serviceDown = false,
}: {
  item: QueuedItem;
  selected: boolean;
  onSelect: () => void;
  serviceDown?: boolean;
}) {
  const { clientById, productById } = useReference();
  const client = clientById.get(item.clientId);
  if (!client) return null;
  const product = item.productCode ? productById.get(item.productCode) : null;
  const due = dueIn(item.dueAtIso);
  const needsData = item.priority.dataGaps.length > 0;
  const handled = item.handled;

  return (
    <button
      type="button"
      className={`queue-card${selected ? " queue-card--selected" : ""}${handled ? " queue-card--handled" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span
        className="queue-card__bar"
        style={{ background: serviceDown ? "var(--graphite-soft)" : LEVEL_COLOR[item.priority.level] }}
      />
      <span className="queue-card__body">
        <span className="queue-card__top">
          <span className="queue-card__client">
            <span className="queue-card__name">{client.fullName}</span>
            <span className="queue-card__aum u-num">{formatMoney(client.aum)}</span>
          </span>
          {handled ? (
            <span className="queue-card__handled">
              <Icon name="check" size={12} /> обработано
            </span>
          ) : serviceDown ? null : (
            <span className="queue-card__score u-num" style={{ color: scoreTextColor(item.priority.total) }}>
              {item.priority.total}
            </span>
          )}
        </span>

        <span className="queue-card__summary">
          {item.hasIncoming && <span className="queue-card__incoming">Входящее ·</span>} {item.summary}
        </span>

        {!handled && !serviceDown && item.priority.reasons[0] && (
          <span className="queue-card__driver">{item.priority.reasons[0]}</span>
        )}

        <span className="queue-card__meta">
          <span className="queue-card__meta-item">
            <Icon name={CHANNEL_ICON[item.channel]} size={13} />
            {CHANNEL_LABEL[item.channel]}
          </span>
          <span className={`queue-card__meta-item${due.soon ? " queue-card__meta-item--soon" : ""}`}>
            <Icon name="clock" size={13} />
            {due.label}
          </span>
          {product && (
            <span className="queue-card__meta-item queue-card__meta-item--product">
              <Icon name="briefcase" size={13} />
              {product.name}
            </span>
          )}
          {needsData && (
            <span className="queue-card__meta-item queue-card__meta-item--gap">
              <Icon name="alert" size={13} />
              нужны данные
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export function QueueRail({
  items,
  ordered,
  selectedId,
  onSelect,
  search,
  onSearch,
  sort,
  onSort,
  kind,
  onKind,
  loading,
}: QueueRailProps) {
  const { state, setPriorityService } = useStore();
  const serviceDown = state.priorityServiceDown;
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = ordered;
  const filtersActive = search.trim() !== "" || kind !== "all";
  const displayCount = filtersActive ? filtered.length : items.length;

  const grouped = useMemo(() => {
    const map: Record<PriorityLevel, QueuedItem[]> = { high: [], medium: [], low: [] };
    for (const item of filtered) map[item.priority.level].push(item);
    return map;
  }, [filtered]);

  const highCount = grouped.high.length;

  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <aside className="queue-rail">
      <div className="queue-rail__head">
        <div className="queue-rail__title-row">
          <div>
            <h2 className="queue-rail__title">Очередь на сегодня</h2>
            <p className="queue-rail__subtitle">
              {displayCount} {plural(displayCount, ["кейс", "кейса", "кейсов"])} ·{" "}
              {serviceDown ? "по времени ожидания" : `${highCount} высокого приоритета`}
            </p>
          </div>
          <span
            className="queue-rail__kbd"
            title="Горячие клавиши: J — следующий кейс, K — предыдущий, Esc — закрыть ассистента"
            aria-label="Горячие клавиши: J — следующий кейс, K — предыдущий кейс, Esc — закрыть ассистента"
          >
            <kbd className="kbd">J</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </div>

        <div className="input-search queue-rail__search">
          <Icon name="search" size={16} />
          <input
            className="field"
            type="search"
            aria-label="Поиск клиента или кейса"
            placeholder="Поиск клиента или кейса"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        <div className="queue-rail__controls">
          <div className="segmented" role="group" aria-label="Фильтр кейсов">
            <button className={`segmented__item${kind === "all" ? " segmented__item--active" : ""}`} onClick={() => onKind("all")} aria-pressed={kind === "all"}>
              Все
            </button>
            <button className={`segmented__item${kind === "communication" ? " segmented__item--active" : ""}`} onClick={() => onKind("communication")} aria-pressed={kind === "communication"}>
              Входящие
            </button>
            <button className={`segmented__item${kind === "task" ? " segmented__item--active" : ""}`} onClick={() => onKind("task")} aria-pressed={kind === "task"}>
              Задачи
            </button>
          </div>
          <button className="queue-rail__sort" onClick={() => onSort(sort === "priority" ? "due" : "priority")} title="Изменить сортировку">
            <Icon name="layers" size={14} />
            {sort === "priority" ? "По приоритету" : "По сроку"}
          </button>
        </div>

        <div className="queue-rail__legend-row">
          <p className="queue-rail__legend" title="Методика приоритизации (раздел 6.2)">
            Приоритет по 5 факторам: ожидание · ценность · срочность · потенциал · риск оттока
          </p>
          <button className="queue-rail__svc" onClick={() => setPriorityService(!serviceDown)} title="Имитировать недоступность сервиса приоритизации (UC-01)">
            {serviceDown ? "восстановить сервис" : "сбой сервиса"}
          </button>
        </div>

        {serviceDown && (
          <div className="service-banner">
            <Icon name="alert" size={15} />
            Сервис приоритизации недоступен — очередь по времени ожидания
          </div>
        )}
      </div>

      <div className="queue-rail__list" ref={listRef}>
        {loading && items.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Icon name="layers" size={22} />
            </span>
            <span className="empty-state__title">Загрузка очереди…</span>
          </div>
        ) : filtered.length === 0 ? (
          filtersActive ? (
            <div className="empty-state">
              <span className="empty-state__icon"><Icon name="search" size={22} /></span>
              <span className="empty-state__title">Ничего не найдено</span>
              <span className="empty-state__text">Измените запрос или сбросьте фильтр кейсов.</span>
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-state__icon"><Icon name="inbox" size={22} /></span>
              <span className="empty-state__title">В очереди нет кейсов</span>
              <span className="empty-state__text">Вы разобрали очередь или новые кейсы ещё не поступили.</span>
            </div>
          )
        ) : serviceDown ? (
          <section className="queue-group">
            <div className="queue-group__head">
              <Icon name="clock" size={13} />
              По времени ожидания
              <span className="queue-group__count">{filtered.length}</span>
            </div>
            {filtered.map((item) => (
              <QueueCard key={item.id} item={item} selected={item.id === selectedId} onSelect={() => onSelect(item)} serviceDown />
            ))}
          </section>
        ) : sort === "due" ? (
          <section className="queue-group">
            <div className="queue-group__head">
              <Icon name="clock" size={13} />
              Сначала самые срочные
              <span className="queue-group__count">{filtered.length}</span>
            </div>
            {filtered.map((item) => (
              <QueueCard key={item.id} item={item} selected={item.id === selectedId} onSelect={() => onSelect(item)} />
            ))}
          </section>
        ) : (
          LEVEL_ORDER.map((level) =>
            grouped[level].length === 0 ? null : (
              <section key={level} className="queue-group">
                <div className="queue-group__head">
                  <span className="queue-group__dot" style={{ background: LEVEL_COLOR[level] }} />
                  {LEVEL_LABEL[level]} приоритет
                  <span className="queue-group__count">{grouped[level].length}</span>
                </div>
                {grouped[level].map((item) => (
                  <QueueCard key={item.id} item={item} selected={item.id === selectedId} onSelect={() => onSelect(item)} />
                ))}
              </section>
            ),
          )
        )}
      </div>
    </aside>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}
