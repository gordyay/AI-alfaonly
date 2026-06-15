// Экран «Кейсы»: очередь (с бэкенда) + рабочее пространство (master-detail).

import { useEffect, useMemo, useState } from "react";
import type { CaseDetail, QueuedItem } from "../api/client";
import { useReference } from "../api/reference";
import { useStore } from "../store/store";
import { QueueRail, orderQueue, type QueueKind, type QueueSort } from "../components/QueueRail";
import { LEVEL_LABEL } from "../components/visual";
import { useGlobalKeyboard } from "../hooks/useGlobalKeyboard";
import { CaseWorkspace } from "./CaseWorkspace";
import { Icon } from "../components/Icon";

interface Props {
  queue: QueuedItem[];
  queueLoading: boolean;
  caseDetail: CaseDetail | null;
  caseLoading: boolean;
  managerId: string;
  onMutated: () => void;
}

export function CasesScreen({ queue, queueLoading, caseDetail, caseLoading, managerId, onMutated }: Props) {
  const store = useStore();
  const { clientById } = useReference();
  const serviceDown = store.state.priorityServiceDown;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<QueueSort>("priority");
  const [kind, setKind] = useState<QueueKind>("all");

  // Единый источник истины: порядок, который видит менеджер. Им же пользуются
  // клавиатурная навигация (J/K) и переход к следующему кейсу.
  const ordered = useMemo(
    () => orderQueue(queue, { search, kind, sort, serviceDown }, clientById),
    [queue, search, kind, sort, serviceDown, clientById],
  );

  const selectedId = store.state.selectedWorkItemId;
  const selectedIdx = ordered.findIndex((i) => i.id === selectedId);

  // Автовыбор верхнего кейса, чтобы рабочая область не была пустой.
  useEffect(() => {
    if (!selectedId && queue.length > 0) {
      store.selectWorkItem(queue[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, selectedId]);

  // Следующий НЕобработанный кейс после текущего (с переносом в начало),
  // исключая сам текущий — для кнопки «Следующий кейс».
  const nextUnhandled = useMemo<QueuedItem | null>(() => {
    if (ordered.length === 0) return null;
    const start = selectedIdx < 0 ? -1 : selectedIdx;
    for (let off = 1; off <= ordered.length; off++) {
      const cand = ordered[(start + off + ordered.length) % ordered.length];
      if (cand.id === selectedId) continue;
      if (!cand.handled) return cand;
    }
    return null;
  }, [ordered, selectedIdx, selectedId]);

  // Озвучивание выбора при навигации с клавиатуры (фокус не переносится).
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

  const detailReady = caseDetail && caseDetail.item.id === selectedId;

  return (
    <div className="cases-layout">
      <div className="u-visually-hidden" role="status" aria-live="polite">
        {liveMessage}
      </div>
      <QueueRail
        items={queue}
        ordered={ordered}
        selectedId={selectedId}
        onSelect={(item) => store.selectWorkItem(item.id)}
        search={search}
        onSearch={setSearch}
        sort={sort}
        onSort={setSort}
        kind={kind}
        onKind={setKind}
        loading={queueLoading}
      />
      {detailReady ? (
        <CaseWorkspace
          key={caseDetail!.item.id}
          detail={caseDetail!}
          managerId={managerId}
          onMutated={onMutated}
          hasNext={!!nextUnhandled}
          onAdvance={() => nextUnhandled && store.selectWorkItem(nextUnhandled.id)}
        />
      ) : (
        <div className="case-empty">
          <div className="empty-state">
            <span className="empty-state__icon">
              <Icon name="inbox" size={24} />
            </span>
            <span className="empty-state__title">
              {selectedId || caseLoading ? "Загрузка кейса…" : "Выберите кейс из очереди"}
            </span>
            {!selectedId && !caseLoading && (
              <span className="empty-state__text">
                Очередь отсортирована по приоритету. Начните с верхнего кейса — он самый важный сейчас.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
