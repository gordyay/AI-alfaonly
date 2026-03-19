import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { apiGet, apiPost } from "./lib/api";
import {
  cloneDraft,
  filterWorkQueue,
  formatDateTime,
  getConversationForWorkItem,
  groupWorkQueue,
  getRecommendationStatusLabel,
  type WorkQueueFilters,
} from "./lib/utils";
import type {
  AISummaryDraft,
  AssistantChatResponse,
  AssistantThread,
  AssistantThreadDetail,
  ClientDetailResponse,
  ManagerCockpit,
  RecommendationStatus,
  SortMode,
  SupervisorDashboardResponse,
  SummarizeDialogResponse,
  ThreadListResponse,
  ViewTab,
  WorkItem,
} from "./types";
import { AssistantPanel } from "./components/AssistantPanel";
import { FocusPanel } from "./components/FocusPanel";
import { GuidedTour, type GuidedTourStep } from "./components/GuidedTour";
import { Hero } from "./components/Hero";
import { JourneyBar } from "./components/JourneyBar";
import { OnboardingPanel } from "./components/OnboardingPanel";
import { StatusMessage } from "./components/StatusMessage";
import { SupervisorPanel } from "./components/SupervisorPanel";
import { WorkQueueRail } from "./components/WorkQueueRail";

type UiStatus = { type: "loading" | "success" | "error"; text: string } | null;
const ONBOARDING_STORAGE_KEY = "alfa_only_onboarding_hidden";
const TOUR_SEEN_STORAGE_KEY = "alfa_only_guided_tour_seen";
const DEFAULT_QUEUE_FILTERS: WorkQueueFilters = {
  itemType: "all",
  productCode: "all",
  priorityLabel: "all",
  recommendationStatus: "all",
  churnRisk: "all",
  channel: "all",
};

const TOUR_STEPS: GuidedTourStep[] = [
  {
    id: "hero",
    selector: "[data-tour='hero']",
    title: "Это верхняя панель дня",
    description: "Здесь видно общую картину: сколько кейсов в работе, что срочно и по какому менеджеру открыт экран.",
    note: "Если хотите быстро сменить порядок просмотра или менеджера, начните отсюда.",
  },
  {
    id: "queue",
    selector: "[data-tour='queue']",
    title: "Слева находится очередь кейсов",
    description: "Это основной вход в работу. Каждый элемент уже отсортирован по важности и содержит краткое объяснение пользы.",
    note: "Нажмите на любой кейс, чтобы открыть его подробности в центре.",
  },
  {
    id: "focus",
    selector: "[data-tour='focus']",
    title: "В центре вы работаете с кейсом",
    description: "Здесь можно прочитать историю контакта, понять, почему кейс важен, принять решение и подготовить запись в CRM.",
    note: "Если вы зашли впервые, начните со вкладки «Сводка», затем перейдите в «CRM».",
  },
  {
    id: "assistant",
    selector: "[data-tour='assistant']",
    title: "Справа находится помощник",
    description: "Помощник умеет собирать сводку, предлагать текст сообщения, помогать с возражениями и подсказывать следующий шаг.",
    note: "Используйте быстрые кнопки, если не хотите печатать запрос вручную.",
  },
  {
    id: "journey",
    selector: "[data-tour='journey']",
    title: "Сверху есть дорожная карта",
    description: "Этот блок показывает, где вы находитесь: выбрали кейс, приняли решение, подготовили результат или уже сохранили итог.",
    note: "Если потерялись, просто посмотрите на активный шаг и продолжайте оттуда.",
  },
  {
    id: "supervisor",
    selector: "[data-tour='supervisor']",
    title: "Ниже видна общая сводка по использованию",
    description: "Здесь отражается, насколько часто рекомендации реально используются и по каким типам кейсов менеджер принимает решения.",
    note: "Этот блок полезен, чтобы понять, где система помогает, а где ей пока не доверяют.",
  },
];

function getNextManagerId(currentManagerId: string) {
  return currentManagerId === "m1" ? "m2" : "m1";
}

function getNextSortMode(currentSortMode: SortMode): SortMode {
  return currentSortMode === "priority" ? "due_at" : "priority";
}

function getSelectedWorkItem(
  workQueue: WorkItem[],
  detail: ClientDetailResponse | null,
  selectedWorkItemId: string | null,
): WorkItem | null {
  if (!selectedWorkItemId) {
    return detail?.work_items[0] ?? null;
  }

  return (
    detail?.work_items.find((item) => item.id === selectedWorkItemId) ??
    workQueue.find((item) => item.id === selectedWorkItemId) ??
    null
  );
}

function getDetailCacheKey(clientId: string, workItemId?: string | null) {
  return `${clientId}::${workItemId || "default"}`;
}

function findWorkItemByConversation(items: WorkItem[], clientId: string, conversationId?: string | null) {
  if (!conversationId) {
    return items.find((item) => item.client_id === clientId) ?? null;
  }

  return (
    items.find((item) => item.client_id === clientId && item.conversation_id === conversationId) ??
    items.find((item) => item.client_id === clientId) ??
    null
  );
}

function createDraftThread(managerId: string, selectedClientName?: string | null): AssistantThread {
  const now = new Date().toISOString();
  return {
    id: "draft",
    manager_id: managerId,
    title: selectedClientName || "Новый диалог",
    last_selected_client_id: null,
    memory_summary: null,
    created_at: now,
    updated_at: now,
  };
}

export function App() {
  const [managerId, setManagerId] = useState("m1");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [filterQuery, setFilterQuery] = useState("");
  const [queueFilters, setQueueFilters] = useState<WorkQueueFilters>(DEFAULT_QUEUE_FILTERS);
  const deferredQuery = useDeferredValue(filterQuery.trim().toLowerCase());
  const [onboardingCollapsed, setOnboardingCollapsed] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const [cockpit, setCockpit] = useState<ManagerCockpit | null>(null);
  const [cockpitLoading, setCockpitLoading] = useState(true);
  const [cockpitError, setCockpitError] = useState<string | null>(null);
  const [supervisorDashboard, setSupervisorDashboard] = useState<SupervisorDashboardResponse | null>(null);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(null);
  const [clientDetails, setClientDetails] = useState<Record<string, ClientDetailResponse>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<ViewTab>("summary");
  const [aiDraft, setAiDraft] = useState<AISummaryDraft | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiStatus, setAiStatus] = useState<UiStatus>(null);
  const [aiSaveStatus, setAiSaveStatus] = useState<UiStatus>(null);
  const [feedbackDecision, setFeedbackDecision] = useState<RecommendationStatus | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<UiStatus>(null);

  const [assistantThreads, setAssistantThreads] = useState<AssistantThread[]>([]);
  const [assistantSelectedThreadId, setAssistantSelectedThreadId] = useState<string | null>(null);
  const [assistantThreadDetail, setAssistantThreadDetail] = useState<AssistantThreadDetail | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantSending, setAssistantSending] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState<UiStatus>(null);
  const [assistantInput, setAssistantInput] = useState("");

  const workQueue = cockpit?.work_queue ?? [];
  const selectedDetailKey = selectedClientId ? getDetailCacheKey(selectedClientId, selectedWorkItemId) : null;
  const selectedDetail = selectedDetailKey ? clientDetails[selectedDetailKey] ?? null : null;
  const selectedWorkItem = getSelectedWorkItem(workQueue, selectedDetail, selectedWorkItemId);
  const selectedConversation = selectedDetail
    ? getConversationForWorkItem(selectedDetail.conversations, selectedWorkItem)
    : null;
  const filteredWorkQueue = filterWorkQueue(workQueue, deferredQuery, queueFilters);
  const filteredSections = groupWorkQueue(filteredWorkQueue);
  const productOptions = [
    { value: "all", label: "Все продукты" },
    ...Array.from(
      new Map(
        workQueue
          .filter((item) => item.product_code && item.product_name)
          .map((item) => [item.product_code as string, { value: item.product_code as string, label: item.product_name as string }]),
      ).values(),
    ),
  ];
  const currentFeedback =
    selectedDetail?.recommendation_feedback.find((item) => item.recommendation_id === selectedWorkItem?.recommendation_id) ??
    null;
  const savedFeedbackDecision =
    currentFeedback?.decision ??
    (selectedWorkItem?.recommendation_status !== "pending" ? selectedWorkItem?.recommendation_status : null);
  const savedCRMNote =
    selectedDetail?.crm_notes.find((note) => note.recommendation_id === selectedWorkItem?.recommendation_id) ??
    selectedDetail?.crm_notes[0] ??
    null;
  const journeySteps = [
    {
      id: "select",
      title: "Выбрать кейс",
      description: selectedWorkItem ? selectedWorkItem.title : "Откройте кейс из плана дня.",
      done: Boolean(selectedWorkItem),
      active: !selectedWorkItem,
    },
    {
      id: "decide",
      title: "Принять решение",
      description: savedFeedbackDecision
        ? `Решение сохранено: ${getRecommendationStatusLabel(savedFeedbackDecision)}`
        : feedbackDecision
          ? `Готово к сохранению: ${getRecommendationStatusLabel(feedbackDecision)}`
        : "Выберите: принять, доработать или отклонить.",
      done: Boolean(savedFeedbackDecision),
      active: Boolean(selectedWorkItem) && !savedFeedbackDecision,
    },
    {
      id: "prepare",
      title: "Подготовить артефакт",
      description: aiDraft ? "Сводка и запись в CRM готовы к проверке." : "Подготовьте сводку, запись в CRM или спросите помощника.",
      done: Boolean(aiDraft),
      active: Boolean(selectedWorkItem) && Boolean(savedFeedbackDecision) && !aiDraft,
    },
    {
      id: "save",
      title: "Закрыть цикл",
      description: savedCRMNote
        ? "Результат уже сохранён в CRM и попал в историю действий."
        : "Сохраните итог в CRM, чтобы он появился в общей сводке.",
      done: Boolean(savedCRMNote),
      active: Boolean(selectedWorkItem) && Boolean(savedFeedbackDecision),
    },
  ];

  async function loadSupervisorDashboard() {
    const response = await apiGet<SupervisorDashboardResponse>(
      `/supervisor/dashboard?manager_id=${encodeURIComponent(managerId)}`,
    );
    setSupervisorDashboard(response);
  }

  async function loadCockpit(preferredWorkItemId?: string | null, preferredClientId?: string | null) {
    setCockpitLoading(true);
    setCockpitError(null);

    try {
      const response = await apiGet<ManagerCockpit>(`/cockpit?manager_id=${encodeURIComponent(managerId)}`);
      setCockpit(response);

      const availableQueue = response.work_queue ?? [];
      const nextItem =
        (preferredWorkItemId && availableQueue.find((item) => item.id === preferredWorkItemId)) ||
        response.focus_item ||
        availableQueue[0] ||
        null;

      if (nextItem) {
        await selectWorkItem(nextItem, preferredClientId ?? nextItem.client_id);
      } else {
        setSelectedClientId(null);
        setSelectedWorkItemId(null);
      }
    } catch (error) {
      setCockpitError(error instanceof Error ? error.message : "Не удалось загрузить cockpit.");
    } finally {
      setCockpitLoading(false);
    }
  }

  async function loadClientDetail(clientId: string, workItemId?: string | null): Promise<ClientDetailResponse> {
    const cacheKey = getDetailCacheKey(clientId, workItemId);
    const cachedDetail = clientDetails[cacheKey];
    if (cachedDetail) {
      return cachedDetail;
    }

    setDetailLoading(true);
    try {
      const query = workItemId ? `?work_item_id=${encodeURIComponent(workItemId)}` : "";
      const detail = await apiGet<ClientDetailResponse>(`/client/${clientId}${query}`);
      setClientDetails((current) => ({ ...current, [cacheKey]: detail }));
      return detail;
    } finally {
      setDetailLoading(false);
    }
  }

  async function selectWorkItem(item: WorkItem, forcedClientId?: string) {
    const nextClientId = forcedClientId ?? item.client_id;

    startTransition(() => {
      setSelectedClientId(nextClientId);
      setSelectedWorkItemId(item.id);
      setActiveTab("summary");
      setAiDraft(null);
      setAiStatus(null);
      setAiSaveStatus(null);
    });

    const detail = await loadClientDetail(nextClientId, item.id);
    setAiDraft(cloneDraft(detail.saved_ai_draft));
  }

  async function reloadClientDetail(clientId: string, workItemId?: string | null) {
    const query = workItemId ? `?work_item_id=${encodeURIComponent(workItemId)}` : "";
    const detail = await apiGet<ClientDetailResponse>(`/client/${clientId}${query}`);
    setClientDetails((current) => ({ ...current, [getDetailCacheKey(clientId, workItemId)]: detail }));
    return detail;
  }

  async function loadAssistantThreads(preferredThreadId?: string | null) {
    setAssistantLoading(true);
    try {
      const response = await apiGet<ThreadListResponse>(`/assistant/threads?manager_id=${encodeURIComponent(managerId)}`);
      const items = response.items ?? [];
      setAssistantThreads(items);
      const nextThreadId = preferredThreadId ?? items[0]?.id ?? null;
      if (nextThreadId) {
        await loadAssistantThread(nextThreadId);
      } else {
        setAssistantThreadDetail(null);
      }
      setAssistantStatus(null);
    } catch (error) {
      setAssistantStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Не удалось загрузить историю ассистента.",
      });
    } finally {
      setAssistantLoading(false);
    }
  }

  async function loadAssistantThread(threadId: string) {
    const detail = await apiGet<AssistantThreadDetail>(`/assistant/threads/${encodeURIComponent(threadId)}`);
    setAssistantSelectedThreadId(threadId);
    setAssistantThreadDetail(detail);
    setAssistantThreads((current) =>
      current.some((thread) => thread.id === detail.thread.id)
        ? current.map((thread) => (thread.id === detail.thread.id ? detail.thread : thread))
        : [detail.thread, ...current],
    );
  }

  async function createAssistantThread() {
    const response = await apiPost<{ thread: AssistantThread }, { manager_id: string; selected_client_id: string | null; title: string | null }>(
      "/assistant/threads",
      {
        manager_id: managerId,
        selected_client_id: selectedClientId,
        title: selectedDetail?.client.full_name ?? null,
      },
    );

    setAssistantThreads((current) => [response.thread, ...current.filter((thread) => thread.id !== response.thread.id)]);
    setAssistantSelectedThreadId(response.thread.id);
    setAssistantThreadDetail({ thread: response.thread, messages: [] });
    return response.thread.id;
  }

  async function syncAssistantAction(actionResult?: AssistantChatResponse["action_result"] | null) {
    if (!actionResult?.client_id) {
      return;
    }

    const nextWorkItem = findWorkItemByConversation(workQueue, actionResult.client_id, actionResult.conversation_id);
    const detail = await reloadClientDetail(actionResult.client_id, nextWorkItem?.id ?? null);
    setSelectedClientId(actionResult.client_id);
    setSelectedWorkItemId(detail.selected_work_item_id ?? nextWorkItem?.id ?? null);
    await loadCockpit(detail.selected_work_item_id ?? nextWorkItem?.id ?? null, actionResult.client_id);

    if (actionResult.draft) {
      setAiDraft(cloneDraft(actionResult.draft));
      setActiveTab("crm");
      setAiStatus({ type: "success", text: "Черновик для CRM подготовлен через помощника." });
    }
  }

  async function handleSendAssistantMessage(prefilledMessage?: string) {
    const message = (prefilledMessage ?? assistantInput).trim();
    if (!message) {
      return;
    }

    setAssistantSending(true);
    setAssistantStatus({ type: "loading", text: "Ассистент готовит ответ..." });

    try {
      const threadId = assistantSelectedThreadId === "draft" ? await createAssistantThread() : assistantSelectedThreadId || (await createAssistantThread());
      const response = await apiPost<
        AssistantChatResponse,
        { manager_id: string; thread_id: string; message: string; selected_client_id: string | null }
      >("/assistant/chat", {
        manager_id: managerId,
        thread_id: threadId,
        message,
        selected_client_id: selectedClientId,
        selected_work_item_id: selectedWorkItemId,
      });

      setAssistantInput("");
      await loadAssistantThread(response.thread.id);
      await syncAssistantAction(response.action_result);
      setAssistantStatus({
        type: "success",
        text: response.action_result?.draft
          ? "Сводка и CRM-черновик готовы."
          : response.action_result?.sales_script_draft
            ? "Скрипт продажи готов."
            : response.action_result?.objection_workflow_draft
              ? "Варианты отработки возражения готовы."
              : "Ответ ассистента готов.",
      });
    } catch (error) {
      setAssistantStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Не удалось получить ответ ассистента.",
      });
    } finally {
      setAssistantSending(false);
    }
  }

  async function handleGenerateSummary() {
    if (!selectedDetail || !selectedConversation) {
      setAiStatus({ type: "error", text: "Для выбранного кейса нет коммуникации для обработки." });
      return;
    }

    setAiLoading(true);
    setAiStatus({ type: "loading", text: "Готовим сводку и запись для CRM..." });
    setAiSaveStatus(null);

    try {
      const response = await apiPost<
        SummarizeDialogResponse,
        { client_id: string; conversation_id: string; manager_id: string }
      >("/ai/summarize-dialog", {
        client_id: selectedDetail.client.id,
        conversation_id: selectedConversation.id,
        manager_id: managerId,
      });

      setAiDraft(response.draft);
      await reloadClientDetail(selectedDetail.client.id, selectedWorkItem?.id ?? null);
      await loadCockpit(selectedWorkItem?.id ?? null, selectedDetail.client.id);
      setActiveTab("crm");
      setAiStatus({
        type: "success",
        text: `Черновик готов (${response.model_name}, ${formatDateTime(response.generated_at)}).`,
      });
    } catch (error) {
      setAiStatus({ type: "error", text: error instanceof Error ? error.message : "Не удалось сгенерировать черновик." });
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveSummary() {
    if (!selectedDetail || !selectedWorkItem || !selectedConversation || !aiDraft) {
      return;
    }

    setAiSaving(true);
    setAiSaveStatus({ type: "loading", text: "Сохраняем CRM-заметку..." });

    try {
      await apiPost<unknown, Record<string, unknown>>("/crm-note", {
        client_id: selectedDetail.client.id,
        manager_id: managerId,
        task_id: selectedWorkItem.task_id,
        recommendation_id: selectedWorkItem.recommendation_id,
        recommendation_decision: savedFeedbackDecision ?? null,
        decision_comment: feedbackComment || null,
        note_text: aiDraft.crm_note_draft,
        outcome: aiDraft.outcome,
        channel: selectedConversation.channel,
        follow_up_date: aiDraft.follow_up_required ? aiDraft.follow_up_date : null,
        follow_up_reason: aiDraft.follow_up_reason,
        summary_text: aiDraft.contact_summary,
        source_conversation_id: selectedConversation.id,
        ai_generated: true,
        ai_draft_payload: aiDraft,
      });

      const detail = await reloadClientDetail(selectedDetail.client.id, selectedWorkItem.id);
      setAiDraft(cloneDraft(detail.saved_ai_draft) ?? cloneDraft(aiDraft));
      await loadCockpit(selectedWorkItem.id, selectedDetail.client.id);
      await loadSupervisorDashboard();
      setAiSaveStatus({ type: "success", text: "CRM-заметка сохранена." });
    } catch (error) {
      setAiSaveStatus({ type: "error", text: error instanceof Error ? error.message : "Не удалось сохранить запись в CRM." });
    } finally {
      setAiSaving(false);
    }
  }

  async function handleRecordFeedback() {
    if (!selectedDetail || !selectedWorkItem || !feedbackDecision) {
      return;
    }

    setFeedbackSubmitting(true);
    setFeedbackStatus({ type: "loading", text: "Сохраняем решение менеджера..." });

    try {
      await apiPost<unknown, Record<string, unknown>>("/feedback", {
        recommendation_id: selectedWorkItem.recommendation_id,
        manager_id: managerId,
        recommendation_type: "manager_work_item",
        client_id: selectedDetail.client.id,
        conversation_id: selectedWorkItem.conversation_id,
        decision: feedbackDecision,
        comment: feedbackComment || null,
        selected_variant:
          aiDraft?.crm_note_draft || aiDraft?.contact_summary || selectedWorkItem.next_best_action,
      });

      await reloadClientDetail(selectedDetail.client.id, selectedWorkItem.id);
      await loadCockpit(selectedWorkItem.id, selectedDetail.client.id);
      await loadSupervisorDashboard();
      setFeedbackStatus({ type: "success", text: "Решение менеджера сохранено." });
    } catch (error) {
      setFeedbackStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Не удалось сохранить решение менеджера.",
      });
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  async function handleCopyCRM() {
    if (!aiDraft?.crm_note_draft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(aiDraft.crm_note_draft);
      setAiSaveStatus({ type: "success", text: "Текст CRM-заметки скопирован." });
    } catch {
      setAiSaveStatus({ type: "error", text: "Не удалось скопировать текст в буфер обмена." });
    }
  }

  useEffect(() => {
    const savedValue = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (savedValue === "true") {
      setOnboardingCollapsed(true);
    }

    const hasSeenTour = window.localStorage.getItem(TOUR_SEEN_STORAGE_KEY) === "true";
    if (!hasSeenTour) {
      setTourOpen(true);
    }
  }, []);

  useEffect(() => {
    setClientDetails({});
    setSelectedClientId(null);
    setSelectedWorkItemId(null);
    setAiDraft(null);
    setFilterQuery("");
    setQueueFilters(DEFAULT_QUEUE_FILTERS);
    loadCockpit().catch(() => undefined);
    loadSupervisorDashboard().catch(() => undefined);
    setAssistantThreads([]);
    setAssistantSelectedThreadId(null);
    setAssistantThreadDetail({
      thread: createDraftThread(managerId, null),
      messages: [],
    });
    loadAssistantThreads(null).catch(() => undefined);
  }, [managerId]);

  useEffect(() => {
    if (!selectedClientId) {
      return;
    }
    const detail = clientDetails[getDetailCacheKey(selectedClientId, selectedWorkItemId)];
    if (detail) {
      setAiDraft((current) => current ?? cloneDraft(detail.saved_ai_draft));
    }
  }, [clientDetails, selectedClientId, selectedWorkItemId]);

  useEffect(() => {
    if (!selectedDetail || !selectedWorkItem) {
      setFeedbackDecision(null);
      setFeedbackComment("");
      setFeedbackStatus(null);
      return;
    }

    const latestFeedback =
      selectedDetail.recommendation_feedback.find((item) => item.recommendation_id === selectedWorkItem.recommendation_id) ??
      null;
    setFeedbackDecision(
      latestFeedback?.decision ??
        (selectedWorkItem.recommendation_status !== "pending" ? selectedWorkItem.recommendation_status : null),
    );
    setFeedbackComment(latestFeedback?.comment || "");
    setFeedbackStatus(null);
  }, [selectedDetail, selectedWorkItem]);

  return (
    <div className="app-shell">
      <div data-tour="hero">
        <Hero
          stats={cockpit?.stats}
          managerId={managerId}
          sortMode={sortMode}
          onToggleSort={() => setSortMode((current) => getNextSortMode(current))}
          onToggleManager={() =>
            startTransition(() => {
              setManagerId((current) => getNextManagerId(current));
            })
          }
        />
      </div>

      {cockpitError ? <StatusMessage type="error" message={cockpitError} /> : null}

      <OnboardingPanel
        collapsed={onboardingCollapsed}
        onDismiss={() => {
          setOnboardingCollapsed(true);
          window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
        }}
        onExpand={() => {
          setOnboardingCollapsed(false);
          window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
        }}
        onStartTour={() => {
          setTourOpen(true);
          setOnboardingCollapsed(true);
          window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
        }}
      />

      <div data-tour="journey">
        <JourneyBar steps={journeySteps} />
      </div>

      <div data-tour="supervisor">
        <SupervisorPanel dashboard={supervisorDashboard} />
      </div>

      <GuidedTour
        open={tourOpen}
        steps={TOUR_STEPS}
        onClose={() => {
          setTourOpen(false);
          setOnboardingCollapsed(true);
          window.localStorage.setItem(TOUR_SEEN_STORAGE_KEY, "true");
          window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
        }}
        onComplete={() => {
          setTourOpen(false);
          setOnboardingCollapsed(true);
          window.localStorage.setItem(TOUR_SEEN_STORAGE_KEY, "true");
          window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
        }}
      />

      <main className="workspace-grid">
        <div data-tour="queue">
          <WorkQueueRail
            sections={filteredSections}
            totalItems={workQueue.length}
            visibleItems={filteredWorkQueue.length}
            selectedWorkItemId={selectedWorkItemId}
            filterValue={filterQuery}
            onFilterChange={setFilterQuery}
            onSelectWorkItem={(item) => {
              selectWorkItem(item).catch(() => undefined);
            }}
            sortMode={sortMode}
            filters={queueFilters}
            productOptions={productOptions}
            onChangeQueueFilter={(name, value) => {
              setQueueFilters((current) => ({ ...current, [name]: value }));
            }}
          />
        </div>

        <div className="workspace-main" data-tour="focus">
          {cockpitLoading || detailLoading ? (
            <section className="panel focus-panel focus-panel--empty">
              <p className="panel__eyebrow">Загрузка</p>
              <h2>Собираем контекст менеджера</h2>
              <p>Подтягиваем очередь, профиль клиента и последние артефакты.</p>
            </section>
          ) : (
            <FocusPanel
              detail={selectedDetail}
              workItem={selectedWorkItem}
              conversation={selectedConversation}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              aiDraft={aiDraft}
              aiLoading={aiLoading}
              aiSaving={aiSaving}
              aiStatus={aiStatus}
              aiSaveStatus={aiSaveStatus}
              onGenerateSummary={() => {
                handleGenerateSummary().catch(() => undefined);
              }}
              onSaveSummary={() => {
                handleSaveSummary().catch(() => undefined);
              }}
              onCopyCRM={() => {
                handleCopyCRM().catch(() => undefined);
              }}
              onUpdateDraft={(draft) => {
                setAiDraft(draft);
              }}
              feedbackDecision={feedbackDecision}
              savedFeedbackDecision={savedFeedbackDecision}
              feedbackComment={feedbackComment}
              feedbackSubmitting={feedbackSubmitting}
              feedbackStatus={feedbackStatus}
              assistantSending={assistantSending}
              onFeedbackCommentChange={setFeedbackComment}
              onFeedbackDecisionChange={setFeedbackDecision}
              onSubmitFeedback={() => {
                handleRecordFeedback().catch(() => undefined);
              }}
              onQuickAssistantAction={(message) => {
                handleSendAssistantMessage(message).catch(() => undefined);
              }}
            />
          )}
        </div>

        <div data-tour="assistant">
          <AssistantPanel
            selectedClientName={selectedDetail?.client.full_name}
            threads={assistantThreads}
            selectedThreadId={assistantSelectedThreadId}
            threadDetail={assistantThreadDetail}
            loading={assistantLoading}
            sending={assistantSending}
            status={assistantStatus}
            inputValue={assistantInput}
            onInputChange={setAssistantInput}
            onCreateThread={() => {
              setAssistantSelectedThreadId("draft");
              setAssistantThreadDetail({
                thread: createDraftThread(managerId, selectedDetail?.client.full_name),
                messages: [],
              });
            }}
            onSelectThread={(threadId) => {
              loadAssistantThread(threadId).catch(() => undefined);
            }}
            onSendMessage={(message) => {
              handleSendAssistantMessage(message).catch(() => undefined);
            }}
          />
        </div>
      </main>
    </div>
  );
}
