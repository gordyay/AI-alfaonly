import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { apiGet } from "./lib/api";
import { getFrontendFeatureFlags } from "./lib/ui";
import {
  cloneDraft,
  filterWorkQueue,
  getConversationForWorkItem,
  getRecommendationStatusLabel,
  groupWorkQueue,
  type WorkQueueFilters,
} from "./lib/utils";
import type { AssistantActionResult, ClientDetailResponse, HealthResponse, SortMode, WorkItem } from "./types";
import { AssistantPanel } from "./components/AssistantPanel";
import { FocusPanel } from "./components/FocusPanel";
import { GuidedTour, type GuidedTourStep } from "./components/GuidedTour";
import { Hero } from "./components/Hero";
import { JourneyBar } from "./components/JourneyBar";
import { OnboardingPanel } from "./components/OnboardingPanel";
import { StatusMessage } from "./components/StatusMessage";
import { SupervisorPanel } from "./components/SupervisorPanel";
import { WorkQueueRail } from "./components/WorkQueueRail";
import { useAssistant } from "./hooks/useAssistant";
import { useCaseWorkflowActions } from "./hooks/useCaseWorkflowActions";
import { useClientDetail } from "./hooks/useClientDetail";
import { useCockpit } from "./hooks/useCockpit";
import { useFocusScreenReducer } from "./hooks/useFocusScreenReducer";
import { useSupervisorDashboard } from "./hooks/useSupervisorDashboard";

const ONBOARDING_STORAGE_KEY = "alfa_only_onboarding_hidden";
const TOUR_SEEN_STORAGE_KEY = "alfa_only_guided_tour_seen";

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

export function App() {
  const [screenState, dispatch] = useFocusScreenReducer();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const focusPanelRef = useRef<HTMLDivElement | null>(null);
  const deferredQuery = useDeferredValue(screenState.filterQuery.trim().toLowerCase());

  const { cockpit, cockpitLoading, cockpitError, loadCockpit } = useCockpit(screenState.managerId);
  const { supervisorDashboard, loadSupervisorDashboard } = useSupervisorDashboard(screenState.managerId);
  const { selectedDetail, detailLoading, loadClientDetail, reloadClientDetail, resetClientDetails } = useClientDetail(
    screenState.selectedClientId,
    screenState.selectedWorkItemId,
  );

  const featureFlags = health ? getFrontendFeatureFlags(health) : null;
  const assistantEnabled = featureFlags?.assistantPanel ?? false;
  const supervisorEnabled = featureFlags?.supervisorDashboard ?? false;
  const feedbackEnabled = featureFlags?.feedbackLoop ?? false;
  const propensityEnabled = featureFlags?.propensityModule ?? false;

  const workQueue = cockpit?.work_queue ?? [];
  const selectedWorkItem = getSelectedWorkItem(workQueue, selectedDetail, screenState.selectedWorkItemId);
  const selectedConversation = selectedDetail
    ? getConversationForWorkItem(selectedDetail.conversations, selectedWorkItem)
    : null;
  const latestScriptArtifact = selectedDetail?.script_history?.[0] ?? null;
  const latestObjectionArtifact = selectedDetail?.objection_history?.[0] ?? null;
  const filteredWorkQueue = filterWorkQueue(workQueue, deferredQuery, screenState.queueFilters);
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
  const effectiveSavedFeedbackDecision = feedbackEnabled ? (savedFeedbackDecision ?? null) : null;
  const savedCRMNote =
    selectedDetail?.crm_notes.find((note) => note.recommendation_id === selectedWorkItem?.recommendation_id) ??
    selectedDetail?.crm_notes[0] ??
    null;
  const aiEnabled = health?.ai.available ?? false;
  const aiUnavailableMessage = health?.ai.reason ?? "AI-функции временно недоступны.";

  async function handleAssistantActionResult(actionResult?: AssistantActionResult | null) {
    await workflowActions.syncAssistantAction(actionResult);
  }

  const assistant = useAssistant({
    managerId: screenState.managerId,
    selectedClientId: screenState.selectedClientId,
    selectedClientName: selectedDetail?.client.full_name ?? null,
    selectedWorkItemId: screenState.selectedWorkItemId,
    onActionResult: handleAssistantActionResult,
  });

  const workflowActions = useCaseWorkflowActions({
    state: screenState,
    dispatch,
    selectedDetail,
    selectedWorkItem,
    selectedConversation,
    latestScriptArtifact,
    latestObjectionArtifact,
    savedFeedbackDecision: effectiveSavedFeedbackDecision,
    workQueue,
    loadCockpit,
    loadClientDetail,
    reloadClientDetail,
    loadSupervisorDashboard: supervisorEnabled ? loadSupervisorDashboard : async () => undefined,
    prepareAssistantDraftThread: assistant.prepareDraftThread,
  });

  const journeySteps = [
    {
      id: "select",
      title: "Выбрать кейс",
      description: selectedWorkItem ? selectedWorkItem.title : "Откройте кейс из плана дня.",
      done: Boolean(selectedWorkItem),
      active: !selectedWorkItem,
    },
    ...(feedbackEnabled
      ? [
          {
            id: "decide",
            title: "Принять решение",
            description: effectiveSavedFeedbackDecision
              ? `Решение сохранено: ${getRecommendationStatusLabel(effectiveSavedFeedbackDecision)}`
              : screenState.feedbackDecision
                ? `Готово к сохранению: ${getRecommendationStatusLabel(screenState.feedbackDecision)}`
                : "Выберите: принять, доработать или отклонить.",
            done: Boolean(effectiveSavedFeedbackDecision),
            active: Boolean(selectedWorkItem) && !effectiveSavedFeedbackDecision,
          },
        ]
      : []),
    {
      id: "prepare",
      title: "Подготовить артефакт",
      description:
        screenState.aiDraft || latestScriptArtifact || latestObjectionArtifact
          ? "Сценарий, разбор возражения или CRM-черновик готовы к проверке."
          : "Подготовьте сценарий, разбор возражения или CRM-черновик по кейсу.",
      done: Boolean(screenState.aiDraft || latestScriptArtifact || latestObjectionArtifact),
      active: Boolean(selectedWorkItem) && !screenState.aiDraft && !latestScriptArtifact && !latestObjectionArtifact,
    },
    {
      id: "save",
      title: "Закрыть цикл",
      description: savedCRMNote
        ? "Результат уже сохранён в CRM и попал в историю действий."
        : "Сохраните итог в CRM, чтобы он появился в общей сводке.",
      done: Boolean(savedCRMNote),
      active: Boolean(selectedWorkItem) && !savedCRMNote,
    },
  ];

  const tourSteps = TOUR_STEPS.filter((step) => {
    if (step.id === "assistant") {
      return assistantEnabled;
    }
    if (step.id === "supervisor") {
      return supervisorEnabled;
    }
    return true;
  });

  async function loadHealth() {
    const response = await apiGet<HealthResponse>("/health");
    setHealth(response);
  }

  useEffect(() => {
    const savedValue = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (savedValue !== "true") {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    }
    loadHealth().catch(() => undefined);
  }, []);

  useEffect(() => {
    let ignore = false;

    resetClientDetails();
    assistant.resetAssistantState();

    async function initializeManagerScreen() {
      try {
        const cockpitResponse = await loadCockpit();
        if (!ignore) {
          await workflowActions.applyCockpitSelection(cockpitResponse);
        }
      } catch {
        return;
      }
    }

    initializeManagerScreen().catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [screenState.managerId]);

  useEffect(() => {
    if (!supervisorEnabled) {
      return;
    }
    loadSupervisorDashboard().catch(() => undefined);
  }, [screenState.managerId, supervisorEnabled]);

  useEffect(() => {
    if (!assistantEnabled) {
      return;
    }
    assistant.loadAssistantThreads(null).catch(() => undefined);
  }, [screenState.managerId, assistantEnabled]);

  useEffect(() => {
    if (!selectedDetail || screenState.aiDraft) {
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        aiDraft: cloneDraft(selectedDetail.saved_ai_draft),
      },
    });
  }, [selectedDetail, screenState.aiDraft]);

  useEffect(() => {
    dispatch({
      type: "patch",
      patch: {
        scriptGoal: selectedWorkItem?.next_best_action || "",
        objectionInput: "",
        scriptStatus: null,
        objectionStatus: null,
      },
    });
  }, [selectedWorkItem?.id]);

  useEffect(() => {
    if (!screenState.pendingFocusJump || cockpitLoading || detailLoading) {
      return;
    }

    if (!window.matchMedia("(max-width: 1080px)").matches) {
      dispatch({
        type: "patch",
        patch: {
          pendingFocusJump: false,
        },
      });
      return;
    }

    focusPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    dispatch({
      type: "patch",
      patch: {
        pendingFocusJump: false,
      },
    });
  }, [screenState.pendingFocusJump, cockpitLoading, detailLoading, selectedWorkItem?.id]);

  useEffect(() => {
    if (!feedbackEnabled) {
      dispatch({
        type: "syncFeedback",
        decision: null,
        comment: "",
      });
      return;
    }

    if (!selectedDetail || !selectedWorkItem) {
      dispatch({
        type: "syncFeedback",
        decision: null,
        comment: "",
      });
      return;
    }

    const latestFeedback =
      selectedDetail.recommendation_feedback.find((item) => item.recommendation_id === selectedWorkItem.recommendation_id) ??
      null;
    dispatch({
      type: "syncFeedback",
      decision:
        latestFeedback?.decision ??
        (selectedWorkItem.recommendation_status !== "pending" ? selectedWorkItem.recommendation_status : null),
      comment: latestFeedback?.comment || "",
    });
  }, [selectedDetail, selectedWorkItem, feedbackEnabled]);

  return (
    <div className="app-shell">
      <div data-tour="hero">
        <Hero
          stats={cockpit?.stats}
          managerId={screenState.managerId}
          sortMode={screenState.sortMode}
          loading={cockpitLoading && !cockpit}
          onToggleSort={() =>
            dispatch({
              type: "patch",
              patch: {
                sortMode: getNextSortMode(screenState.sortMode),
              },
            })
          }
          onToggleManager={() =>
            startTransition(() => {
              dispatch({
                type: "resetForManagerChange",
                managerId: getNextManagerId(screenState.managerId),
              });
            })
          }
        />
      </div>

      {cockpitError ? <StatusMessage type="error" message={cockpitError} /> : null}

      <OnboardingPanel
        collapsed={screenState.onboardingCollapsed}
        onDismiss={() => {
          dispatch({
            type: "patch",
            patch: {
              onboardingCollapsed: true,
            },
          });
          window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
        }}
        onExpand={() => {
          dispatch({
            type: "patch",
            patch: {
              onboardingCollapsed: false,
            },
          });
          window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
        }}
        onStartTour={() => {
          dispatch({
            type: "patch",
            patch: {
              tourOpen: true,
              onboardingCollapsed: true,
            },
          });
          window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
        }}
      />

      <GuidedTour
        open={screenState.tourOpen}
        steps={tourSteps}
        onClose={() => {
          dispatch({
            type: "patch",
            patch: {
              tourOpen: false,
              onboardingCollapsed: true,
            },
          });
          window.localStorage.setItem(TOUR_SEEN_STORAGE_KEY, "true");
          window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
        }}
        onComplete={() => {
          dispatch({
            type: "patch",
            patch: {
              tourOpen: false,
              onboardingCollapsed: true,
            },
          });
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
            loading={cockpitLoading}
            selectedWorkItemId={screenState.selectedWorkItemId}
            selectedWorkItemTitle={selectedWorkItem?.title ?? null}
            onJumpToFocus={() => {
              focusPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            filterValue={screenState.filterQuery}
            onFilterChange={(value) =>
              dispatch({
                type: "patch",
                patch: {
                  filterQuery: value,
                },
              })
            }
            onSelectWorkItem={(item) => {
              dispatch({
                type: "patch",
                patch: {
                  pendingFocusJump: true,
                },
              });
              workflowActions.selectWorkItem(item).catch(() => undefined);
            }}
            sortMode={screenState.sortMode}
            filters={screenState.queueFilters}
            productOptions={productOptions}
            onChangeQueueFilter={(name: keyof WorkQueueFilters, value: string) => {
              dispatch({
                type: "setQueueFilter",
                name,
                value,
              });
            }}
          />
        </div>

        <div className="workspace-main" data-tour="focus" ref={focusPanelRef}>
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
              aiEnabled={aiEnabled}
              aiUnavailableMessage={aiUnavailableMessage}
              assistantEnabled={assistantEnabled}
              feedbackEnabled={feedbackEnabled}
              propensityEnabled={propensityEnabled}
              activeTab={screenState.activeTab}
              onChangeTab={(tab) =>
                dispatch({
                  type: "patch",
                  patch: {
                    activeTab: tab,
                  },
                })
              }
              aiDraft={screenState.aiDraft}
              aiLoading={screenState.aiLoading}
              aiSaving={screenState.aiSaving}
              aiStatus={screenState.aiStatus}
              aiSaveStatus={screenState.aiSaveStatus}
              onGenerateSummary={() => {
                workflowActions.handleGenerateSummary().catch(() => undefined);
              }}
              onSaveSummary={() => {
                workflowActions.handleSaveSummary().catch(() => undefined);
              }}
              onCopyCRM={() => {
                workflowActions.handleCopyCRM().catch(() => undefined);
              }}
              onUpdateDraft={(draft) => {
                dispatch({
                  type: "patch",
                  patch: {
                    aiDraft: draft,
                  },
                });
              }}
              scriptGoal={screenState.scriptGoal}
              onScriptGoalChange={(value) =>
                dispatch({
                  type: "patch",
                  patch: {
                    scriptGoal: value,
                  },
                })
              }
              scriptLoading={screenState.scriptLoading}
              scriptSelecting={screenState.scriptSelecting}
              scriptStatus={screenState.scriptStatus}
              onGenerateScript={() => {
                workflowActions.handleGenerateScript().catch(() => undefined);
              }}
              onSelectScriptVariant={(variantLabel, selectedText) => {
                workflowActions.handleSelectScriptVariant(variantLabel, selectedText).catch(() => undefined);
              }}
              objectionInput={screenState.objectionInput}
              onObjectionInputChange={(value) =>
                dispatch({
                  type: "patch",
                  patch: {
                    objectionInput: value,
                  },
                })
              }
              objectionLoading={screenState.objectionLoading}
              objectionSelecting={screenState.objectionSelecting}
              objectionStatus={screenState.objectionStatus}
              onGenerateObjectionWorkflow={() => {
                workflowActions.handleGenerateObjectionWorkflow().catch(() => undefined);
              }}
              onSelectObjectionOption={(optionTitle, selectedResponse) => {
                workflowActions.handleSelectObjectionOption(optionTitle, selectedResponse).catch(() => undefined);
              }}
              feedbackDecision={screenState.feedbackDecision}
              savedFeedbackDecision={effectiveSavedFeedbackDecision}
              feedbackComment={screenState.feedbackComment}
              feedbackSubmitting={screenState.feedbackSubmitting}
              feedbackStatus={screenState.feedbackStatus}
              assistantSending={assistant.assistantSending}
              onFeedbackCommentChange={(value) =>
                dispatch({
                  type: "patch",
                  patch: {
                    feedbackComment: value,
                  },
                })
              }
              onFeedbackDecisionChange={(decision) =>
                dispatch({
                  type: "patch",
                  patch: {
                    feedbackDecision: decision,
                  },
                })
              }
              onSubmitFeedback={() => {
                workflowActions.handleRecordFeedback().catch(() => undefined);
              }}
              onQuickAssistantAction={(message) => {
                assistant.sendAssistantMessage(message).catch(() => undefined);
              }}
            />
          )}
        </div>

        {assistantEnabled ? (
          <div data-tour="assistant">
            <AssistantPanel
              selectedClientName={selectedDetail?.client.full_name}
              threads={assistant.assistantThreads}
              selectedThreadId={assistant.assistantSelectedThreadId}
              threadDetail={assistant.assistantThreadDetail}
              aiEnabled={aiEnabled}
              aiUnavailableMessage={aiUnavailableMessage}
              loading={assistant.assistantLoading}
              sending={assistant.assistantSending}
              status={assistant.assistantStatus}
              inputValue={assistant.assistantInput}
              onInputChange={assistant.setAssistantInput}
              onCreateThread={() => {
                assistant.prepareDraftThread(selectedDetail?.client.full_name ?? null);
              }}
              onSelectThread={(threadId) => {
                assistant.loadAssistantThread(threadId).catch(() => undefined);
              }}
              onSendMessage={(message) => {
                assistant.sendAssistantMessage(message).catch(() => undefined);
              }}
            />
          </div>
        ) : null}
      </main>

      <div data-tour="journey">
        <JourneyBar
          steps={journeySteps}
          note={
            feedbackEnabled
              ? "Шаги можно проходить в удобном порядке. Цикл считается завершённым, когда решение зафиксировано и итог сохранён в CRM."
              : "Шаги можно проходить в удобном порядке. Цикл считается завершённым, когда итог по кейсу подготовлен и сохранён в CRM."
          }
        />
      </div>

      {supervisorEnabled ? (
        <div data-tour="supervisor">
          <SupervisorPanel dashboard={supervisorDashboard} />
        </div>
      ) : null}
    </div>
  );
}
