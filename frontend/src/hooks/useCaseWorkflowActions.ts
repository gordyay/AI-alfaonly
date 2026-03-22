import { startTransition, type Dispatch } from "react";
import { apiPost } from "../lib/api";
import { cloneDraft, formatDateTime } from "../lib/utils";
import { getErrorText } from "../lib/ui";
import type {
  AssistantActionResult,
  ClientDetailResponse,
  Conversation,
  GenerateScriptResponse,
  ManagerCockpit,
  ObjectionWorkflowResponse,
  SummarizeDialogResponse,
  WorkItem,
} from "../types";
import type { FocusScreenAction, FocusScreenState } from "./useFocusScreenReducer";

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

interface UseCaseWorkflowActionsOptions {
  state: FocusScreenState;
  dispatch: Dispatch<FocusScreenAction>;
  selectedDetail: ClientDetailResponse | null;
  selectedWorkItem: WorkItem | null;
  selectedConversation: Conversation | null;
  latestScriptArtifact: { id: string } | null;
  latestObjectionArtifact: { id: string } | null;
  savedFeedbackDecision: WorkItem["recommendation_status"] | null;
  workQueue: WorkItem[];
  loadCockpit: () => Promise<ManagerCockpit>;
  loadClientDetail: (clientId: string, workItemId?: string | null) => Promise<ClientDetailResponse>;
  reloadClientDetail: (clientId: string, workItemId?: string | null) => Promise<ClientDetailResponse>;
  loadSupervisorDashboard: () => Promise<unknown>;
  prepareAssistantDraftThread: (clientName?: string | null) => void;
}

export function useCaseWorkflowActions({
  state,
  dispatch,
  selectedDetail,
  selectedWorkItem,
  selectedConversation,
  latestScriptArtifact,
  latestObjectionArtifact,
  savedFeedbackDecision,
  workQueue,
  loadCockpit,
  loadClientDetail,
  reloadClientDetail,
  loadSupervisorDashboard,
  prepareAssistantDraftThread,
}: UseCaseWorkflowActionsOptions) {
  async function selectWorkItem(item: WorkItem, forcedClientId?: string) {
    const nextClientId = forcedClientId ?? item.client_id;

    startTransition(() => {
      dispatch({
        type: "resetForWorkItemSelection",
        clientId: nextClientId,
        workItemId: item.id,
      });
      prepareAssistantDraftThread(item.client_name);
    });

    const detail = await loadClientDetail(nextClientId, item.id);
    dispatch({
      type: "patch",
      patch: {
        aiDraft: cloneDraft(detail.saved_ai_draft),
      },
    });
  }

  async function applyCockpitSelection(
    response: ManagerCockpit,
    preferredWorkItemId?: string | null,
    preferredClientId?: string | null,
  ) {
    const availableQueue = response.work_queue ?? [];
    const nextItem =
      (preferredWorkItemId && availableQueue.find((item) => item.id === preferredWorkItemId)) ||
      response.focus_item ||
      availableQueue[0] ||
      null;

    if (nextItem) {
      await selectWorkItem(nextItem, preferredClientId ?? nextItem.client_id);
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        selectedClientId: null,
        selectedWorkItemId: null,
      },
    });
  }

  async function syncAssistantAction(actionResult?: AssistantActionResult | null) {
    if (!actionResult?.client_id) {
      return;
    }

    const nextWorkItem = findWorkItemByConversation(workQueue, actionResult.client_id, actionResult.conversation_id);
    const detail = await reloadClientDetail(actionResult.client_id, nextWorkItem?.id ?? null);
    const nextWorkItemId = detail.selected_work_item_id ?? nextWorkItem?.id ?? null;
    const cockpitResponse = await loadCockpit();
    await applyCockpitSelection(cockpitResponse, nextWorkItemId, actionResult.client_id);

    if (actionResult.draft) {
      dispatch({
        type: "patch",
        patch: {
          aiDraft: cloneDraft(actionResult.draft),
          activeTab: "crm",
          aiStatus: { type: "success", text: "Черновик для CRM подготовлен через помощника." },
        },
      });
    }
    if (actionResult.sales_script_draft) {
      dispatch({
        type: "patch",
        patch: {
          activeTab: "script",
          scriptStatus: {
            type: "success",
            text: "Ассистент подготовил скрипт. Выберите и сохраните вариант в центре кейса.",
          },
        },
      });
    }
    if (actionResult.objection_workflow_draft) {
      dispatch({
        type: "patch",
        patch: {
          activeTab: "objections",
          objectionStatus: {
            type: "success",
            text: "Ассистент подготовил разбор возражения. Зафиксируйте выбранный ответ в центре кейса.",
          },
        },
      });
    }
  }

  async function handleGenerateSummary() {
    if (!selectedDetail || !selectedConversation) {
      dispatch({
        type: "patch",
        patch: {
          aiStatus: { type: "error", text: "Для выбранного кейса нет коммуникации для обработки." },
        },
      });
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        aiLoading: true,
        aiStatus: { type: "loading", text: "Готовим сводку и запись для CRM..." },
        aiSaveStatus: null,
      },
    });

    try {
      const response = await apiPost<
        SummarizeDialogResponse,
        { client_id: string; conversation_id: string; manager_id: string }
      >("/ai/summarize-dialog", {
        client_id: selectedDetail.client.id,
        conversation_id: selectedConversation.id,
        manager_id: state.managerId,
      });

      const refreshedDetail = await reloadClientDetail(selectedDetail.client.id, selectedWorkItem?.id ?? null);
      const cockpitResponse = await loadCockpit();
      await applyCockpitSelection(cockpitResponse, selectedWorkItem?.id ?? null, selectedDetail.client.id);
      dispatch({
        type: "patch",
        patch: {
          aiDraft: cloneDraft(refreshedDetail.saved_ai_draft) ?? cloneDraft(response.draft),
          activeTab: "crm",
          aiStatus: {
            type: "success",
            text: `Черновик готов (${response.model_name}, ${formatDateTime(response.generated_at)}).`,
          },
        },
      });
    } catch (error) {
      dispatch({
        type: "patch",
        patch: {
          aiStatus: { type: "error", text: getErrorText(error, "Не удалось сгенерировать черновик.") },
        },
      });
    } finally {
      dispatch({
        type: "patch",
        patch: {
          aiLoading: false,
        },
      });
    }
  }

  async function handleGenerateScript() {
    if (!selectedDetail || !selectedConversation || !selectedWorkItem) {
      dispatch({
        type: "patch",
        patch: {
          scriptStatus: { type: "error", text: "Для кейса не выбрана коммуникация." },
        },
      });
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        scriptLoading: true,
        scriptStatus: { type: "loading", text: "Готовим скрипт по выбранному кейсу..." },
      },
    });

    try {
      const response = await apiPost<
        GenerateScriptResponse,
        { client_id: string; conversation_id: string; manager_id: string; contact_goal: string | null; recommendation_id: string }
      >("/ai/generate-script", {
        client_id: selectedDetail.client.id,
        conversation_id: selectedConversation.id,
        manager_id: state.managerId,
        contact_goal: state.scriptGoal || selectedWorkItem.next_best_action,
        recommendation_id: selectedWorkItem.recommendation_id,
      });

      await reloadClientDetail(selectedDetail.client.id, selectedWorkItem.id);
      const cockpitResponse = await loadCockpit();
      await applyCockpitSelection(cockpitResponse, selectedWorkItem.id, selectedDetail.client.id);
      dispatch({
        type: "patch",
        patch: {
          activeTab: "script",
          scriptStatus: {
            type: "success",
            text: `Скрипт сохранён в историю кейса (${formatDateTime(response.generated_at)}).`,
          },
        },
      });
    } catch (error) {
      dispatch({
        type: "patch",
        patch: {
          scriptStatus: { type: "error", text: getErrorText(error, "Не удалось подготовить скрипт.") },
        },
      });
    } finally {
      dispatch({
        type: "patch",
        patch: {
          scriptLoading: false,
        },
      });
    }
  }

  async function handleSelectScriptVariant(variantLabel: string, selectedText: string) {
    if (!latestScriptArtifact || !selectedDetail || !selectedWorkItem) {
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        scriptSelecting: true,
        scriptStatus: { type: "loading", text: "Фиксируем выбранный вариант скрипта..." },
      },
    });

    try {
      await apiPost<unknown, Record<string, string>>("/ai/script-selection", {
        artifact_id: latestScriptArtifact.id,
        manager_id: state.managerId,
        variant_label: variantLabel,
        selected_text: selectedText,
      });
      await reloadClientDetail(selectedDetail.client.id, selectedWorkItem.id);
      await loadSupervisorDashboard();
      dispatch({
        type: "patch",
        patch: {
          scriptStatus: { type: "success", text: "Выбранный вариант скрипта сохранён в кейсе." },
        },
      });
    } catch (error) {
      dispatch({
        type: "patch",
        patch: {
          scriptStatus: { type: "error", text: getErrorText(error, "Не удалось сохранить вариант скрипта.") },
        },
      });
    } finally {
      dispatch({
        type: "patch",
        patch: {
          scriptSelecting: false,
        },
      });
    }
  }

  async function handleGenerateObjectionWorkflow() {
    if (!selectedDetail || !selectedConversation || !selectedWorkItem) {
      dispatch({
        type: "patch",
        patch: {
          objectionStatus: { type: "error", text: "Для кейса не выбрана коммуникация." },
        },
      });
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        objectionLoading: true,
        objectionStatus: { type: "loading", text: "Готовим варианты отработки возражения..." },
      },
    });

    try {
      const response = await apiPost<
        ObjectionWorkflowResponse,
        { client_id: string; conversation_id: string; manager_id: string; objection_text: string | null; recommendation_id: string }
      >("/ai/objection-workflow", {
        client_id: selectedDetail.client.id,
        conversation_id: selectedConversation.id,
        manager_id: state.managerId,
        objection_text: state.objectionInput || null,
        recommendation_id: selectedWorkItem.recommendation_id,
      });

      await reloadClientDetail(selectedDetail.client.id, selectedWorkItem.id);
      const cockpitResponse = await loadCockpit();
      await applyCockpitSelection(cockpitResponse, selectedWorkItem.id, selectedDetail.client.id);
      dispatch({
        type: "patch",
        patch: {
          activeTab: "objections",
          objectionStatus: {
            type: "success",
            text: `Варианты ответа сохранены (${formatDateTime(response.generated_at)}).`,
          },
        },
      });
    } catch (error) {
      dispatch({
        type: "patch",
        patch: {
          objectionStatus: {
            type: "error",
            text: getErrorText(error, "Не удалось подготовить разбор возражения."),
          },
        },
      });
    } finally {
      dispatch({
        type: "patch",
        patch: {
          objectionLoading: false,
        },
      });
    }
  }

  async function handleSelectObjectionOption(optionTitle: string, selectedResponse: string) {
    if (!latestObjectionArtifact || !selectedDetail || !selectedWorkItem) {
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        objectionSelecting: true,
        objectionStatus: { type: "loading", text: "Фиксируем выбранный ответ..." },
      },
    });

    try {
      await apiPost<unknown, Record<string, string>>("/ai/objection-selection", {
        artifact_id: latestObjectionArtifact.id,
        manager_id: state.managerId,
        option_title: optionTitle,
        selected_response: selectedResponse,
      });
      await reloadClientDetail(selectedDetail.client.id, selectedWorkItem.id);
      await loadSupervisorDashboard();
      dispatch({
        type: "patch",
        patch: {
          objectionStatus: { type: "success", text: "Выбранный вариант ответа сохранён." },
        },
      });
    } catch (error) {
      dispatch({
        type: "patch",
        patch: {
          objectionStatus: { type: "error", text: getErrorText(error, "Не удалось сохранить вариант ответа.") },
        },
      });
    } finally {
      dispatch({
        type: "patch",
        patch: {
          objectionSelecting: false,
        },
      });
    }
  }

  async function handleSaveSummary() {
    if (!selectedDetail || !selectedWorkItem || !selectedConversation || !state.aiDraft) {
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        aiSaving: true,
        aiSaveStatus: { type: "loading", text: "Сохраняем CRM-заметку..." },
      },
    });

    try {
      await apiPost<unknown, Record<string, unknown>>("/crm-note", {
        client_id: selectedDetail.client.id,
        manager_id: state.managerId,
        task_id: selectedWorkItem.task_id,
        recommendation_id: selectedWorkItem.recommendation_id,
        recommendation_decision: savedFeedbackDecision ?? null,
        decision_comment: state.feedbackComment || null,
        note_text: state.aiDraft.crm_note_draft,
        outcome: state.aiDraft.outcome,
        channel: selectedConversation.channel,
        follow_up_date: state.aiDraft.follow_up_required ? state.aiDraft.follow_up_date : null,
        follow_up_reason: state.aiDraft.follow_up_reason,
        summary_text: state.aiDraft.contact_summary,
        source_conversation_id: selectedConversation.id,
        ai_generated: true,
        ai_draft_payload: state.aiDraft,
      });

      const detail = await reloadClientDetail(selectedDetail.client.id, selectedWorkItem.id);
      const cockpitResponse = await loadCockpit();
      await applyCockpitSelection(cockpitResponse, selectedWorkItem.id, selectedDetail.client.id);
      await loadSupervisorDashboard();
      dispatch({
        type: "patch",
        patch: {
          aiDraft: cloneDraft(detail.saved_ai_draft) ?? cloneDraft(state.aiDraft),
          aiSaveStatus: { type: "success", text: "CRM-заметка сохранена." },
        },
      });
    } catch (error) {
      dispatch({
        type: "patch",
        patch: {
          aiSaveStatus: { type: "error", text: getErrorText(error, "Не удалось сохранить запись в CRM.") },
        },
      });
    } finally {
      dispatch({
        type: "patch",
        patch: {
          aiSaving: false,
        },
      });
    }
  }

  async function handleRecordFeedback() {
    if (!selectedDetail || !selectedWorkItem || !state.feedbackDecision) {
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        feedbackSubmitting: true,
        feedbackStatus: { type: "loading", text: "Сохраняем решение менеджера..." },
      },
    });

    try {
      await apiPost<unknown, Record<string, unknown>>("/feedback", {
        recommendation_id: selectedWorkItem.recommendation_id,
        manager_id: state.managerId,
        recommendation_type: "manager_work_item",
        client_id: selectedDetail.client.id,
        conversation_id: selectedWorkItem.conversation_id,
        decision: state.feedbackDecision,
        comment: state.feedbackComment || null,
        selected_variant: state.aiDraft?.crm_note_draft || state.aiDraft?.contact_summary || selectedWorkItem.next_best_action,
      });

      await reloadClientDetail(selectedDetail.client.id, selectedWorkItem.id);
      const cockpitResponse = await loadCockpit();
      await applyCockpitSelection(cockpitResponse, selectedWorkItem.id, selectedDetail.client.id);
      await loadSupervisorDashboard();
      dispatch({
        type: "patch",
        patch: {
          feedbackStatus: { type: "success", text: "Решение менеджера сохранено." },
        },
      });
    } catch (error) {
      dispatch({
        type: "patch",
        patch: {
          feedbackStatus: {
            type: "error",
            text: getErrorText(error, "Не удалось сохранить решение менеджера."),
          },
        },
      });
    } finally {
      dispatch({
        type: "patch",
        patch: {
          feedbackSubmitting: false,
        },
      });
    }
  }

  async function handleCopyCRM() {
    if (!state.aiDraft?.crm_note_draft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.aiDraft.crm_note_draft);
      dispatch({
        type: "patch",
        patch: {
          aiSaveStatus: { type: "success", text: "Текст CRM-заметки скопирован." },
        },
      });
    } catch {
      dispatch({
        type: "patch",
        patch: {
          aiSaveStatus: { type: "error", text: "Не удалось скопировать текст в буфер обмена." },
        },
      });
    }
  }

  return {
    selectWorkItem,
    applyCockpitSelection,
    syncAssistantAction,
    handleGenerateSummary,
    handleGenerateScript,
    handleSelectScriptVariant,
    handleGenerateObjectionWorkflow,
    handleSelectObjectionOption,
    handleSaveSummary,
    handleRecordFeedback,
    handleCopyCRM,
  };
}
