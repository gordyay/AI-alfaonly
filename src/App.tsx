import { useCallback, useEffect, useMemo, useState } from "react";
import { AppProvider, useStore } from "./store/store";
import { ReferenceProvider, useReference } from "./api/reference";
import { api, type CaseDetail, type QueuedItem } from "./api/client";
import { Header } from "./components/Header";
import { AssistantDrawer } from "./components/AssistantDrawer";
import { ToastHost } from "./components/Primitives";
import { Icon } from "./components/Icon";
import { CasesScreen } from "./screens/CasesScreen";
import { ProductFocusScreen } from "./screens/ProductFocusScreen";
import { SupervisorScreen } from "./screens/SupervisorScreen";

function Shell() {
  const store = useStore();
  const { managerId, view, selectedWorkItemId, assistantOpen } = store.state;
  const reference = useReference();
  const manager = reference.managerById.get(managerId);

  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);

  const refetchQueue = useCallback(() => {
    setQueueLoading(true);
    return api
      .getQueue(managerId)
      .then(setQueue)
      .catch(() => store.toast("Не удалось загрузить очередь", "info"))
      .finally(() => setQueueLoading(false));
  }, [managerId, store]);

  const refetchCase = useCallback(() => {
    if (!selectedWorkItemId) {
      setCaseDetail(null);
      return Promise.resolve();
    }
    return api
      .getCase(selectedWorkItemId)
      .then(setCaseDetail)
      .catch(() => store.toast("Не удалось загрузить кейс", "info"));
  }, [selectedWorkItemId, store]);

  useEffect(() => {
    void refetchQueue();
  }, [refetchQueue]);

  useEffect(() => {
    setCaseLoading(true);
    void refetchCase().finally(() => setCaseLoading(false));
  }, [refetchCase]);

  const onMutated = useCallback(() => {
    void refetchCase();
    void refetchQueue();
  }, [refetchCase, refetchQueue]);

  const unhandledCount = useMemo(() => queue.filter((i) => !i.handled).length, [queue]);

  if (reference.loading) {
    return (
      <div className="boot-screen">
        <span className="brand__mark">A</span>
        <p>Загрузка рабочего места…</p>
      </div>
    );
  }
  if (reference.error) {
    return (
      <div className="boot-screen boot-screen--error">
        <Icon name="alert" size={28} />
        <p>Не удалось подключиться к серверу ассистента.</p>
        <p className="u-faint">Запустите бэкенд (uvicorn) и обновите страницу.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        view={view}
        onSetView={store.setView}
        managerName={manager?.fullName ?? ""}
        managerRole={manager?.role ?? ""}
        onToggleManager={() => {
          const next = managerId === "m1" ? "m2" : "m1";
          const nextName = reference.managerById.get(next)?.fullName ?? "";
          store.setManager(next);
          store.toast(`Менеджер: ${nextName}`, "info");
        }}
        queueCount={unhandledCount}
      />
      <main className="app-main">
        {view === "cases" && (
          <CasesScreen
            queue={queue}
            queueLoading={queueLoading}
            caseDetail={caseDetail}
            caseLoading={caseLoading}
            managerId={managerId}
            onMutated={onMutated}
          />
        )}
        {view === "products" && <ProductFocusScreen managerId={managerId} />}
        {view === "analytics" && <SupervisorScreen />}
      </main>

      <AssistantDrawer
        open={assistantOpen && view === "cases"}
        detail={caseDetail}
        onClose={() => store.setAssistant(false)}
      />
      <ToastHost />
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <ReferenceProvider>
        <Shell />
      </ReferenceProvider>
    </AppProvider>
  );
}
