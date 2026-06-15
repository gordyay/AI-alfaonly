// Экран «Кейсы»: очередь + рабочее пространство (master-detail).

import { useEffect, useMemo, useState } from "react";
import type { WorkItem } from "../domain/types";
import { useStore } from "../store/store";
import { clientById } from "../data/index";
import { buildWorkQueue, isWorkItemHandled } from "../domain/workqueue";
import { QueueRail, orderQueue, type QueueKind, type QueueSort } from "../components/QueueRail";
import { LEVEL_LABEL } from "../components/visual";
import { useGlobalKeyboard } from "../hooks/useGlobalKeyboard";
import { CaseWorkspace } from "./CaseWorkspace";
import { Icon } from "../components/Icon";

export function CasesScreen() {
  const store = useStore();
  const managerId = store.state.managerId;
  const serviceDown = store.state.priorityServiceDown;

  const workQueue = useMemo(() => buildWorkQueue(managerId), [managerId]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<QueueSort>("priority");
  const [kind, setKind] = useState<QueueKind>("all");

  // Единый источник истины: порядок, который видит менеджер. Им же пользуются
  // клавиатурная навигация (J/K) и переход к следующему кейсу.
  const ordered = useMemo(
    () => orderQueue(workQueue, { search, kind, sort, serviceDown }),
    [workQueue, search, kind, sort, serviceDown],
  );

  const selectedId = store.state.selectedWorkItemId;
  const selectedItem = useMemo(
    () => workQueue.find((i) => i.id === selectedId) ?? null,
    [workQueue, selectedId],
  );
  const selectedIdx = ordered.findIndex((i) => i.id === selectedId);

  // Автовыбор верхнего кейса, чтобы рабочая область не была пустой.
  useEffect(() => {
    if (!store.state.selectedWorkItemId && workQueue.length > 0) {
      store.selectWorkItem(workQueue[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerId, workQueue]);

  // Следующий НЕобработанный кейс после текущего (с переносом в начало),
  // исключая сам текущий — для кнопки «Следующий кейс» (импульс прохождения очереди).
  const nextUnhandled = useMemo<WorkItem | null>(() => {
    if (ordered.length === 0) return null;
    const start = selectedIdx < 0 ? -1 : selectedIdx;
    for (let off = 1; off <= ordered.length; off++) {
      const cand = ordered[(start + off + ordered.length) % ordered.length];
      if (cand.id === selectedId) continue;
      if (!isWorkItemHandled(cand, store.state.sentMessages, store.state.feedback, managerId)) {
        return cand;
      }
    }
    return null;
  }, [ordered, selectedIdx, selectedId, store.state.sentMessages, store.state.feedback, managerId]);

  // Сообщение для скринридера при навигации с клавиатуры (выбор меняется без
  // переноса фокуса, поэтому состояние карточки само по себе не озвучивается).
  const [liveMessage, setLiveMessage] = useState("");

  function navigateTo(index: number) {
    const item = ordered[index];
    if (!item) return;
    store.selectWorkItem(item.id);
    const name = clientById.get(item.clientId)?.fullName ?? "";
    setLiveMessage(
      `Кейс ${index + 1} из ${ordered.length}: ${name}, ${LEVEL_LABEL[item.priority.level].toLowerCase()} приоритет`,
    );
  }

  // J / K — переход между кейсами в видимом порядке (без переноса, с фиксацией
  // на краях); Esc — закрыть ассистента. Тосты на каждый шаг не показываем —
  // достаточно подсветки карточки, автоскролла к ней и озвучивания для скринридера.
  useGlobalKeyboard({
    onNext: () => {
      if (ordered.length === 0) return;
      navigateTo(selectedIdx < 0 ? 0 : Math.min(selectedIdx + 1, ordered.length - 1));
    },
    onPrev: () => {
      if (ordered.length === 0) return;
      navigateTo(selectedIdx < 0 ? 0 : Math.max(selectedIdx - 1, 0));
    },
    onEscape: () => {
      if (store.state.assistantOpen) store.setAssistant(false);
    },
  });

  return (
    <div className="cases-layout">
      <div className="u-visually-hidden" role="status" aria-live="polite">
        {liveMessage}
      </div>
      <QueueRail
        items={workQueue}
        ordered={ordered}
        selectedId={selectedId}
        onSelect={(item) => store.selectWorkItem(item.id)}
        search={search}
        onSearch={setSearch}
        sort={sort}
        onSort={setSort}
        kind={kind}
        onKind={setKind}
      />
      {selectedItem ? (
        // key — полный сброс локального состояния вкладок при смене кейса
        // (черновики, сводка, решение не переносятся на другого клиента).
        <CaseWorkspace
          key={selectedItem.id}
          item={selectedItem}
          hasNext={!!nextUnhandled}
          onAdvance={() => nextUnhandled && store.selectWorkItem(nextUnhandled.id)}
        />
      ) : (
        <div className="case-empty">
          <div className="empty-state">
            <span className="empty-state__icon">
              <Icon name="inbox" size={24} />
            </span>
            <span className="empty-state__title">Выберите кейс из очереди</span>
            <span className="empty-state__text">
              Очередь отсортирована по приоритету. Начните с верхнего кейса — он самый важный сейчас.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
