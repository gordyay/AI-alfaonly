import { useMemo } from "react";
import { AppProvider, useStore } from "./store/store";
import { dataset } from "./data/index";
import { buildWorkQueue, isWorkItemHandled } from "./domain/workqueue";
import { buildAIContext } from "./domain/contextBuilders";
import { Header } from "./components/Header";
import { AssistantDrawer } from "./components/AssistantDrawer";
import { ToastHost } from "./components/Primitives";
import { CasesScreen } from "./screens/CasesScreen";
import { ProductFocusScreen } from "./screens/ProductFocusScreen";
import { SupervisorScreen } from "./screens/SupervisorScreen";

function Shell() {
  const store = useStore();
  const { managerId, view, selectedWorkItemId, assistantOpen } = store.state;
  const manager = dataset.managers.find((m) => m.id === managerId)!;

  const queue = useMemo(() => buildWorkQueue(managerId), [managerId]);
  const unhandledCount = useMemo(
    () =>
      queue.filter(
        (item) => !isWorkItemHandled(item, store.state.sentMessages, store.state.feedback, managerId),
      ).length,
    [queue, store.state.sentMessages, store.state.feedback, managerId],
  );
  const selectedItem = useMemo(
    () => queue.find((i) => i.id === selectedWorkItemId) ?? null,
    [queue, selectedWorkItemId],
  );
  const drawerCtx = useMemo(() => (selectedItem ? buildAIContext(selectedItem) : null), [selectedItem]);
  const chatTurns = selectedItem ? store.state.chats[selectedItem.id] ?? [] : [];

  return (
    <div className="app-shell">
      <Header
        view={view}
        onSetView={store.setView}
        managerName={manager.fullName}
        managerRole={manager.role}
        onToggleManager={() => {
          const next = managerId === "m1" ? "m2" : "m1";
          const nextName = dataset.managers.find((m) => m.id === next)?.fullName ?? "";
          store.setManager(next);
          store.toast(`Менеджер: ${nextName}`, "info");
        }}
        queueCount={unhandledCount}
      />
      <main className="app-main">
        {view === "cases" && <CasesScreen />}
        {view === "products" && <ProductFocusScreen />}
        {view === "analytics" && <SupervisorScreen />}
      </main>

      <AssistantDrawer
        open={assistantOpen && view === "cases"}
        ctx={drawerCtx}
        turns={chatTurns}
        onClose={() => store.setAssistant(false)}
        onTurns={(t) => selectedItem && store.setChat(selectedItem.id, t)}
      />
      <ToastHost />
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
