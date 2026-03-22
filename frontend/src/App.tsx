import { startTransition, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { AssistantDrawer } from "./components/AssistantDrawer";
import { AssistantPanel } from "./components/AssistantPanel";
import { AppHeader } from "./components/AppHeader";
import { CaseProgressStrip } from "./components/CaseProgressStrip";
import { FocusPanel } from "./components/FocusPanel";
import { GuidedTour, type GuidedTourStep } from "./components/GuidedTour";
import { StatusMessage } from "./components/StatusMessage";
import { SupervisorPanel } from "./components/SupervisorPanel";
import { WorkQueueRail } from "./components/WorkQueueRail";
import { useAssistant } from "./hooks/useAssistant";
import { useCaseWorkflowActions } from "./hooks/useCaseWorkflowActions";
import { useClientDetail } from "./hooks/useClientDetail";
import { useCockpit } from "./hooks/useCockpit";
import { syncFocusScreenStateToUrl, useFocusScreenReducer } from "./hooks/useFocusScreenReducer";
import { useSupervisorDashboard } from "./hooks/useSupervisorDashboard";
import { apiGet } from "./lib/api";
import { getFrontendFeatureFlags } from "./lib/ui";
import {
  cloneDraft,
  filterWorkQueue,
  getInteractionForCase,
  getRecommendationStatusLabel,
  groupWorkQueue,
  type WorkQueueFilters,
} from "./lib/utils";
import type {
  AppMode,
  AssistantActionResult,
  AssistantTaskKind,
  ClientDetailResponse,
  HealthResponse,
  SortMode,
  WorkItem,
} from "./types";

const TOUR_SEEN_STORAGE_KEY = "alfa_only_guided_tour_seen";

const APPBAR_TOUR_STEP: GuidedTourStep = {
  id: "appbar",
  selector: "[data-tour='appbar']",
  title: "Верхняя навигация",
  description: "Здесь переключаются входящие, кейс и аналитика.",
  note: "Сначала выберите режим, потом выполняйте задачу.",
};

const INBOX_TOUR_STEP: GuidedTourStep = {
  id: "queue",
  selector: "[data-tour='queue']",
  spotlightSelector: "[data-tour-spotlight='queue']",
  title: "Очередь кейсов",
  description: "Здесь только список кейсов, поиск и фильтры.",
  note: "Выберите карточку, чтобы открыть рабочее место.",
};

const CASE_TOUR_STEP: GuidedTourStep = {
  id: "focus",
  selector: "[data-tour='focus']",
  title: "Работа по кейсу",
  description: "Здесь принимается решение и готовится запись в CRM.",
  note: "Вкладки сгруппированы по задаче.",
};

const CASE_LAUNCH_TOUR_STEP: GuidedTourStep = {
  id: "case-launch",
  selector: "[data-tour='case-launch']",
  title: "Быстрый переход в кейс",
  description: "Выбранный кейс можно открыть отдельно от очереди.",
  note: "Так triage не смешивается с исполнением.",
};

const ASSISTANT_TOUR_STEP: GuidedTourStep = {
  id: "assistant",
  selector: "[data-tour='assistant']",
  title: "Помощник по запросу",
  description: "AI открывается в drawer только когда нужен.",
  note: "Основной экран остается чистым.",
};

const ANALYTICS_TOUR_STEP: GuidedTourStep = {
  id: "supervisor",
  selector: "[data-tour='supervisor']",
  title: "Отдельная аналитика",
  description: "Метрики вынесены из основного потока.",
  note: "Открывайте этот режим после работы по кейсам.",
};

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
  const tourOriginRef = useRef<{ mode: AppMode; assistantOpen: boolean } | null>(null);
  const deferredQuery = useDeferredValue(screenState.filterQuery.trim().toLowerCase());

  const { cockpit, cockpitLoading, cockpitError, loadCockpit } = useCockpit(screenState.managerId);
  const { supervisorDashboard, loadSupervisorDashboard } = useSupervisorDashboard(screenState.managerId);
  const { selectedDetail, detailLoading, loadClientDetail, reloadClientDetail, resetClientDetails } = useClientDetail(
    screenState.selectedClientId,
    screenState.selectedWorkItemId,
  );

  const featureFlags = useMemo(() => (health ? getFrontendFeatureFlags(health) : null), [health]);
  const assistantEnabled = featureFlags?.assistantPanel ?? false;
  const supervisorEnabled = featureFlags?.supervisorDashboard ?? false;
  const feedbackEnabled = featureFlags?.feedbackLoop ?? false;
  const propensityEnabled = featureFlags?.propensityModule ?? false;

  const workQueue = useMemo(() => cockpit?.work_queue ?? [], [cockpit]);
  const selectedWorkItem = useMemo(
    () => getSelectedWorkItem(workQueue, selectedDetail, screenState.selectedWorkItemId),
    [workQueue, selectedDetail, screenState.selectedWorkItemId],
  );
  const selectedInteraction = useMemo(
    () =>
      selectedDetail
        ? getInteractionForCase(
            selectedDetail.interactions,
            screenState.selectedInteractionId || selectedDetail.selected_interaction_id,
          )
        : null,
    [screenState.selectedInteractionId, selectedDetail],
  );
  const latestScriptArtifact = selectedDetail?.script_history?.[0] ?? null;
  const latestObjectionArtifact = selectedDetail?.objection_history?.[0] ?? null;
  const filteredWorkQueue = useMemo(
    () => filterWorkQueue(workQueue, deferredQuery, screenState.queueFilters),
    [workQueue, deferredQuery, screenState.queueFilters],
  );
  const filteredSections = useMemo(() => groupWorkQueue(filteredWorkQueue), [filteredWorkQueue]);
  const productOptions = useMemo(
    () => [
      { value: "all", label: "Все продукты" },
      ...Array.from(
        new Map(
          workQueue
            .filter((item) => item.product_code && item.product_name)
            .map((item) => [
              item.product_code as string,
              { value: item.product_code as string, label: item.product_name as string },
            ]),
        ).values(),
      ),
    ],
    [workQueue],
  );
  const currentFeedback = useMemo(
    () =>
      selectedDetail?.recommendation_feedback.find((item) => item.recommendation_id === selectedWorkItem?.recommendation_id) ??
      null,
    [selectedDetail, selectedWorkItem?.recommendation_id],
  );
  const savedFeedbackDecision = useMemo(
    () =>
      currentFeedback?.decision ??
      (selectedWorkItem?.recommendation_status !== "pending" ? selectedWorkItem?.recommendation_status : null),
    [currentFeedback, selectedWorkItem?.recommendation_status],
  );
  const effectiveSavedFeedbackDecision = feedbackEnabled ? (savedFeedbackDecision ?? null) : null;
  const savedCRMNote = useMemo(
    () =>
      selectedDetail?.crm_notes.find((note) => note.recommendation_id === selectedWorkItem?.recommendation_id) ??
      selectedDetail?.crm_notes[0] ??
      null,
    [selectedDetail, selectedWorkItem?.recommendation_id],
  );
  const aiEnabled = health?.ai.available ?? false;
  const aiUnavailableMessage = health?.ai.reason ?? "AI-функции временно недоступны.";

  async function handleAssistantActionResult(actionResult?: AssistantActionResult | null, targetTab?: string | null) {
    await workflowActions.syncAssistantAction(actionResult, targetTab);
  }

  const assistant = useAssistant({
    managerId: screenState.managerId,
    selectedClientId: screenState.selectedClientId,
    selectedClientName: selectedDetail?.client.full_name ?? null,
    selectedWorkItemId: screenState.selectedWorkItemId,
    selectedInteractionId: screenState.selectedInteractionId,
    onActionResult: handleAssistantActionResult,
  });

  const workflowActions = useCaseWorkflowActions({
    state: screenState,
    dispatch,
    selectedDetail,
    selectedWorkItem,
    selectedInteraction,
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

  const journeySteps = useMemo(
    () => [
      {
        id: "select",
        title: "Кейс",
        description: selectedWorkItem ? "Выбран" : "Не выбран",
        done: Boolean(selectedWorkItem),
        active: !selectedWorkItem,
      },
      ...(feedbackEnabled
        ? [
            {
              id: "decide",
              title: "Решение",
              description: effectiveSavedFeedbackDecision
                ? getRecommendationStatusLabel(effectiveSavedFeedbackDecision)
                : screenState.feedbackDecision
                  ? getRecommendationStatusLabel(screenState.feedbackDecision)
                  : "Не выбрано",
              done: Boolean(effectiveSavedFeedbackDecision),
              active: Boolean(selectedWorkItem) && !effectiveSavedFeedbackDecision,
            },
          ]
        : []),
      {
        id: "prepare",
        title: "Артефакты",
        description: screenState.aiDraft || latestScriptArtifact || latestObjectionArtifact ? "Готовы" : "В работе",
        done: Boolean(screenState.aiDraft || latestScriptArtifact || latestObjectionArtifact),
        active: Boolean(selectedWorkItem) && !screenState.aiDraft && !latestScriptArtifact && !latestObjectionArtifact,
      },
      {
        id: "save",
        title: "CRM",
        description: savedCRMNote ? "Сохранено" : "Не сохранено",
        done: Boolean(savedCRMNote),
        active: Boolean(selectedWorkItem) && !savedCRMNote,
      },
    ],
    [
      feedbackEnabled,
      effectiveSavedFeedbackDecision,
      latestObjectionArtifact,
      latestScriptArtifact,
      savedCRMNote,
      screenState.aiDraft,
      screenState.feedbackDecision,
      selectedWorkItem,
    ],
  );

  const tourSteps = useMemo(() => {
    const showInbox = () =>
      dispatch({
        type: "patch",
        patch: {
          mode: "inbox",
          assistantOpen: false,
        },
      });
    const showCase = () =>
      dispatch({
        type: "patch",
        patch: {
          mode: "case",
          assistantOpen: false,
        },
      });
    const showAssistant = () =>
      dispatch({
        type: "patch",
        patch: {
          mode: "case",
          assistantOpen: true,
        },
      });
    const showAnalytics = () =>
      dispatch({
        type: "patch",
        patch: {
          mode: "analytics",
          assistantOpen: false,
        },
      });

    const steps: GuidedTourStep[] = [
      {
        ...APPBAR_TOUR_STEP,
        prepare: showInbox,
      },
      {
        ...INBOX_TOUR_STEP,
        prepare: showInbox,
      },
    ];

    if (selectedWorkItem) {
      steps.push(
        {
          ...CASE_LAUNCH_TOUR_STEP,
          prepare: showInbox,
        },
        {
          ...CASE_TOUR_STEP,
          prepare: showCase,
        },
      );

      if (assistantEnabled) {
        steps.push({
          ...ASSISTANT_TOUR_STEP,
          prepare: showAssistant,
        });
      }
    }

    if (supervisorEnabled) {
      steps.push({
        ...ANALYTICS_TOUR_STEP,
        prepare: showAnalytics,
      });
    }

    return steps;
  }, [assistantEnabled, dispatch, selectedWorkItem, supervisorEnabled]);

  async function loadHealth() {
    const response = await apiGet<HealthResponse>("/health");
    setHealth(response);
  }

  const initializeManagerScreen = useEffectEvent(async (ignoreSignal: { current: boolean }) => {
    resetClientDetails();
    assistant.resetAssistantState();

    try {
      const cockpitResponse = await loadCockpit();
      if (!ignoreSignal.current) {
        await workflowActions.applyCockpitSelection(
          cockpitResponse,
          screenState.selectedWorkItemId,
          screenState.selectedClientId,
        );
      }
    } catch {
      return;
    }
  });

  const loadSupervisorDashboardEvent = useEffectEvent(async () => {
    await loadSupervisorDashboard();
  });

  const loadAssistantThreadsEvent = useEffectEvent(async () => {
    await assistant.loadAssistantThreads(null);
  });

  useEffect(() => {
    loadHealth().catch(() => undefined);
  }, []);

  useEffect(() => {
    syncFocusScreenStateToUrl({
      managerId: screenState.managerId,
      mode: screenState.mode,
      selectedClientId: screenState.selectedClientId,
      selectedWorkItemId: screenState.selectedWorkItemId,
      selectedInteractionId: screenState.selectedInteractionId,
      activeTab: screenState.activeTab,
      assistantOpen: screenState.assistantOpen,
    });
  }, [
    screenState.activeTab,
    screenState.assistantOpen,
    screenState.managerId,
    screenState.mode,
    screenState.selectedClientId,
    screenState.selectedInteractionId,
    screenState.selectedWorkItemId,
  ]);

  useEffect(() => {
    const ignoreSignal = { current: false };

    initializeManagerScreen(ignoreSignal).catch(() => undefined);

    return () => {
      ignoreSignal.current = true;
    };
  }, [screenState.managerId]);

  useEffect(() => {
    if (!supervisorEnabled || screenState.mode !== "analytics") {
      return;
    }
    loadSupervisorDashboardEvent().catch(() => undefined);
  }, [screenState.managerId, screenState.mode, supervisorEnabled]);

  useEffect(() => {
    if (!assistantEnabled || !screenState.assistantOpen || assistant.assistantThreadDetail) {
      return;
    }
    loadAssistantThreadsEvent().catch(() => undefined);
  }, [assistant.assistantThreadDetail, screenState.assistantOpen, screenState.managerId, assistantEnabled]);

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
  }, [dispatch, selectedDetail, screenState.aiDraft]);

  useEffect(() => {
    if (!selectedDetail) {
      return;
    }

    const preferredInteractionId = screenState.selectedInteractionId || selectedDetail.selected_interaction_id || null;
    const nextInteraction =
      getInteractionForCase(selectedDetail.interactions, preferredInteractionId) ??
      getInteractionForCase(selectedDetail.interactions, null);
    if (nextInteraction && nextInteraction.id !== screenState.selectedInteractionId) {
      dispatch({
        type: "patch",
        patch: {
          selectedInteractionId: nextInteraction.id,
        },
      });
    }
  }, [dispatch, screenState.selectedInteractionId, selectedDetail]);

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
  }, [dispatch, selectedWorkItem?.id, selectedWorkItem?.next_best_action]);

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
  }, [dispatch, selectedDetail, selectedWorkItem, feedbackEnabled]);

  function openTour() {
    if (!screenState.tourOpen) {
      tourOriginRef.current = {
        mode: screenState.mode,
        assistantOpen: screenState.assistantOpen,
      };
    }

    dispatch({
      type: "patch",
      patch: {
        tourOpen: true,
        mode: "inbox",
        assistantOpen: false,
      },
    });
  }

  function closeTour() {
    const tourOrigin = tourOriginRef.current;
    tourOriginRef.current = null;

    dispatch({
      type: "patch",
      patch: {
        tourOpen: false,
        mode: tourOrigin?.mode ?? screenState.mode,
        assistantOpen: tourOrigin?.assistantOpen ?? false,
      },
    });
    window.localStorage.setItem(TOUR_SEEN_STORAGE_KEY, "true");
  }

  function openInbox() {
    dispatch({
      type: "patch",
      patch: {
        mode: "inbox",
        assistantOpen: false,
      },
    });
  }

  function openAnalytics() {
    dispatch({
      type: "patch",
      patch: {
        mode: "analytics",
        assistantOpen: false,
      },
    });
  }

  function openCaseWorkspace() {
    if (!selectedWorkItem) {
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        mode: "case",
      },
    });
  }

  function openAssistant(taskKind?: AssistantTaskKind) {
    if (!assistantEnabled) {
      return;
    }

    const nextTaskKind = taskKind ?? (selectedWorkItem ? "client_qa" : "general_qa");
    dispatch({
      type: "patch",
      patch: {
        assistantOpen: true,
      },
    });
    assistant.openAssistantTask(nextTaskKind).catch(() => undefined);
  }

  function closeAssistant() {
    dispatch({
      type: "patch",
      patch: {
        assistantOpen: false,
      },
    });
  }

  return (
    <div className="app-shell">
      <AppHeader
        stats={cockpit?.stats}
        managerId={screenState.managerId}
        loading={cockpitLoading && !cockpit}
        mode={screenState.mode}
        selectedWorkItemTitle={selectedWorkItem?.title ?? null}
        onToggleManager={() =>
          startTransition(() => {
            dispatch({
              type: "resetForManagerChange",
              managerId: getNextManagerId(screenState.managerId),
            });
          })
        }
        onShowInbox={openInbox}
        onShowAnalytics={openAnalytics}
        onOpenTour={openTour}
      />

      {cockpitError ? <StatusMessage type="error" message={cockpitError} /> : null}

      <GuidedTour open={screenState.tourOpen} steps={tourSteps} onClose={closeTour} onComplete={closeTour} />

      {screenState.mode === "inbox" ? (
        <main className="screen-shell inbox-screen">
          {selectedWorkItem ? (
            <section className="panel inbox-focus-card" data-tour="case-launch">
              <div className="inbox-focus-card__copy">
                <p className="panel__eyebrow">Выбранный кейс</p>
                <h2>{selectedWorkItem.title}</h2>
                <p>{selectedWorkItem.client_name}</p>
              </div>
              <div className="button-row">
                <button className="primary-button" type="button" onClick={openCaseWorkspace}>
                  Открыть кейс
                </button>
                {assistantEnabled ? (
                  <button className="ghost-button" type="button" onClick={openAssistant}>
                    Помощник
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <div data-tour="queue">
            <WorkQueueRail
              sections={filteredSections}
              totalItems={workQueue.length}
              visibleItems={filteredWorkQueue.length}
              loading={cockpitLoading}
              selectedWorkItemId={screenState.selectedWorkItemId}
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
                    mode: "case",
                    assistantOpen: false,
                  },
                });
                workflowActions.selectWorkItem(item).catch(() => undefined);
              }}
              sortMode={screenState.sortMode}
              onToggleSort={() =>
                dispatch({
                  type: "patch",
                  patch: {
                    sortMode: getNextSortMode(screenState.sortMode),
                  },
                })
              }
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
        </main>
      ) : null}

      {screenState.mode === "case" ? (
        <main className="screen-shell case-screen" data-tour="focus">
          <section className="panel case-workspace-bar">
            <div className="case-workspace-bar__copy">
              <p className="panel__eyebrow">Case Workspace</p>
              <h2>{selectedWorkItem?.client_name || "Работа по кейсу"}</h2>
              <p>{selectedWorkItem ? selectedWorkItem.title : "Выберите кейс во входящих."}</p>
            </div>
            <div className="button-row">
              <button className="ghost-button" type="button" onClick={openInbox}>
                К очереди
              </button>
              {assistantEnabled ? (
                <button className="primary-button" type="button" onClick={openAssistant}>
                  Помощник
                </button>
              ) : null}
            </div>
          </section>

          {selectedWorkItem ? <CaseProgressStrip steps={journeySteps} /> : null}

          {cockpitLoading || detailLoading ? (
            <section className="panel focus-panel focus-panel--empty">
              <p className="panel__eyebrow">Загрузка</p>
              <h2>Собираем кейс</h2>
              <p>Подтягиваем данные клиента и историю контакта.</p>
            </section>
          ) : (
            <FocusPanel
              detail={selectedDetail}
              workItem={selectedWorkItem}
              interaction={selectedInteraction}
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
              replyDraftText={screenState.replyDraftText}
              replySource={screenState.replySource}
              replySending={screenState.replySending}
              replyStatus={screenState.replyStatus}
              onReplyDraftChange={(value) =>
                dispatch({
                  type: "patch",
                  patch: {
                    replyDraftText: value,
                    replyStatus: null,
                  },
                })
              }
              onPrefillReplyFromScript={workflowActions.handlePrefillReplyFromScript}
              onPrefillReplyFromObjection={workflowActions.handlePrefillReplyFromObjection}
              onClearReplyDraft={() =>
                dispatch({
                  type: "patch",
                  patch: {
                    replyDraftText: "",
                    replySource: "manual",
                    replyStatus: null,
                  },
                })
              }
              onSendReply={() => {
                workflowActions.handleSendReply().catch(() => undefined);
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
              onOpenAssistantTask={(taskKind) => {
                openAssistant(taskKind);
              }}
            />
          )}
        </main>
      ) : null}

      {screenState.mode === "analytics" ? (
        <main className="screen-shell analytics-screen" data-tour="supervisor">
          <section className="panel analytics-intro">
            <div>
              <p className="panel__eyebrow">Analytics</p>
              <h2>Метрики использования</h2>
              <p>Отдельный экран для контроля качества и adoption.</p>
            </div>
            <button className="ghost-button" type="button" onClick={openInbox}>
              Ко входящим
            </button>
          </section>

          {supervisorEnabled ? (
            <SupervisorPanel dashboard={supervisorDashboard} />
          ) : (
            <StatusMessage type="loading" message="Supervisor-аналитика отключена feature flag'ом." />
          )}
        </main>
      ) : null}

      {assistantEnabled ? (
        <AssistantDrawer open={screenState.assistantOpen} onClose={closeAssistant}>
          <AssistantPanel
            selectedClientName={selectedDetail?.client.full_name}
            selectedWorkItemTitle={selectedWorkItem?.title ?? null}
            mode={assistant.assistantMode}
            taskKind={assistant.assistantTaskKind}
            stage={assistant.assistantStage}
            preview={assistant.assistantPreview}
            selectedChoice={assistant.assistantSelectedChoice}
            threads={assistant.assistantThreads}
            selectedThreadId={assistant.assistantSelectedThreadId}
            threadDetail={assistant.assistantThreadDetail}
            aiEnabled={aiEnabled}
            aiUnavailableMessage={aiUnavailableMessage}
            loading={assistant.assistantLoading}
            sending={assistant.assistantSending}
            applying={assistant.assistantApplying}
            status={assistant.assistantStatus}
            inputValue={assistant.assistantInput}
            onInputChange={assistant.setAssistantInput}
            onSelectTask={(taskKind) => {
              assistant.openAssistantTask(taskKind).catch(() => undefined);
            }}
            onSelectThread={(threadId) => {
              assistant.loadAssistantThread(threadId).catch(() => undefined);
            }}
            onSelectChoice={assistant.setAssistantSelectedChoice}
            onSendMessage={(message) => {
              assistant.sendAssistantMessage(message).catch(() => undefined);
            }}
            onApplyPreview={() => {
              assistant.applyAssistantPreview().catch(() => undefined);
            }}
          />
        </AssistantDrawer>
      ) : null}
    </div>
  );
}
