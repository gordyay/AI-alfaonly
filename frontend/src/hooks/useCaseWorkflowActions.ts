import { startTransition, type Dispatch } from "react";
import { apiPost } from "../lib/api";
import { cloneDraft, formatDateTime } from "../lib/utils";
import { getErrorText } from "../lib/ui";
import type {
  AssistantActionResult,
  CaseInteraction,
  ClientDetailResponse,
  ClientReplyResponse,
  GenerateScriptResponse,
  ManagerCockpit,
  ObjectionWorkflowResponse,
  ObjectionWorkflowRecord,
  ReplySource,
  ScriptGenerationRecord,
  SummarizeDialogResponse,
  WorkItem,
} from "../types";
import type { FocusScreenAction, FocusScreenState } from "./useFocusScreenReducer";

function findWorkItemByConversation(items: WorkItem[], clientId: string, conversationId?: string | null) {
  return (
    items.find(
      (item) =>
        item.client_id === clientId &&
        (item.source_interaction_id === conversationId || item.conversation_id === conversationId),
    ) ??
    items.find((item) => item.client_id === clientId) ??
    null
  );
}

interface UseCaseWorkflowActionsOptions {
  state: FocusScreenState;
  dispatch: Dispatch<FocusScreenAction>;
  selectedDetail: ClientDetailResponse | null;
  selectedWorkItem: WorkItem | null;
  selectedInteraction: CaseInteraction | null;
  latestScriptArtifact: ScriptGenerationRecord | null;
  latestObjectionArtifact: ObjectionWorkflowRecord | null;
  savedFeedbackDecision: WorkItem["recommendation_status"] | null;
  workQueue: WorkItem[];
  loadCockpit: () => Promise<ManagerCockpit>;
  loadClientDetail: (clientId: string, workItemId?: string | null) => Promise<ClientDetailResponse>;
  reloadClientDetail: (clientId: string, workItemId?: string | null) => Promise<ClientDetailResponse>;
  loadSupervisorDashboard: () => Promise<unknown>;
  prepareAssistantDraftThread: (clientName?: string | null) => void;
}

function getReplyTextFromScript(record: ScriptGenerationRecord | null): string | null {
  if (!record) {
    return null;
  }

  return record.selected_text || record.draft.follow_up_message || record.draft.ready_script || null;
}

function getReplyTextFromObjection(record: ObjectionWorkflowRecord | null): string | null {
  if (!record?.selected_response) {
    return null;
  }

  return record.selected_response;
}

export function useCaseWorkflowActions({
  state,
  dispatch,
  selectedDetail,
  selectedWorkItem,
  selectedInteraction,
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
        selectedInteractionId: detail.selected_interaction_id ?? null,
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
        selectedInteractionId: null,
      },
    });
  }

  async function syncAssistantAction(actionResult?: AssistantActionResult | null, targetTab?: string | null) {
    if (!actionResult?.client_id) {
      return;
    }

    const nextTaskKind = actionResult.task_kind ?? actionResult.action_type;

    if (nextTaskKind === "summary_crm" && actionResult.draft) {
      dispatch({
        type: "patch",
        patch: {
          aiDraft: cloneDraft(actionResult.draft),
          activeTab: (targetTab as FocusScreenState["activeTab"]) ?? "crm",
          selectedInteractionId:
            actionResult.source_interaction_id ?? actionResult.conversation_id ?? state.selectedInteractionId,
          aiStatus: { type: "success", text: actionResult.note ?? "Черновик подготовлен через помощника." },
        },
      });
      return;
    }

    if (nextTaskKind === "reply_draft" && actionResult.reply_draft_text) {
      dispatch({
        type: "patch",
        patch: {
          activeTab: (targetTab as FocusScreenState["activeTab"]) ?? "overview",
          replyDraftText: actionResult.reply_draft_text,
          replySource: "assistant",
          selectedInteractionId:
            actionResult.source_interaction_id ?? actionResult.conversation_id ?? state.selectedInteractionId,
          replyStatus: {
            type: "success",
            text: actionResult.note ?? "Черновик ответа подставлен в кейс.",
          },
        },
      });
      return;
    }

    const nextWorkItem = findWorkItemByConversation(workQueue, actionResult.client_id, actionResult.conversation_id);
    const detail = await reloadClientDetail(actionResult.client_id, nextWorkItem?.id ?? null);
    const nextWorkItemId = detail.selected_work_item_id ?? nextWorkItem?.id ?? null;
    const cockpitResponse = await loadCockpit();
    await applyCockpitSelection(cockpitResponse, nextWorkItemId, actionResult.client_id);

    if (nextTaskKind === "sales_script" && actionResult.sales_script_draft) {
      dispatch({
        type: "patch",
        patch: {
          activeTab: (targetTab as FocusScreenState["activeTab"]) ?? "actions",
          scriptStatus: {
            type: "success",
            text: actionResult.note ?? "Скрипт сохранен в историю кейса.",
          },
        },
      });
    }
    if (nextTaskKind === "objection_workflow" && actionResult.objection_workflow_draft) {
      dispatch({
        type: "patch",
        patch: {
          activeTab: (targetTab as FocusScreenState["activeTab"]) ?? "actions",
          objectionStatus: {
            type: "success",
            text: actionResult.note ?? "Ответ на возражение сохранен в кейс.",
          },
        },
      });
    }
  }

  async function handleGenerateSummary() {
    if (!selectedDetail || !selectedInteraction) {
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
        { case_id: string; source_interaction_id: string; manager_id: string }
      >("/ai/summarize-dialog", {
        case_id: selectedDetail.client.id,
        source_interaction_id: selectedInteraction.id,
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
    if (!selectedDetail || !selectedInteraction || !selectedWorkItem) {
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
        { case_id: string; source_interaction_id: string; manager_id: string; contact_goal: string | null; recommendation_id: string }
      >("/ai/generate-script", {
        case_id: selectedDetail.client.id,
        source_interaction_id: selectedInteraction.id,
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
          activeTab: "actions",
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
    if (!selectedDetail || !selectedInteraction || !selectedWorkItem) {
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
        { case_id: string; source_interaction_id: string; manager_id: string; objection_text: string | null; recommendation_id: string }
      >("/ai/objection-workflow", {
        case_id: selectedDetail.client.id,
        source_interaction_id: selectedInteraction.id,
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
          activeTab: "actions",
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
    if (!selectedDetail || !selectedWorkItem || !selectedInteraction || !state.aiDraft) {
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
        case_id: selectedDetail.client.id,
        manager_id: state.managerId,
        task_id: selectedWorkItem.task_id,
        recommendation_id: selectedWorkItem.recommendation_id,
        recommendation_decision: savedFeedbackDecision ?? null,
        decision_comment: state.feedbackComment || null,
        note_text: state.aiDraft.crm_note_draft,
        outcome: state.aiDraft.outcome,
        channel: selectedInteraction.channel,
        follow_up_date: state.aiDraft.follow_up_required ? state.aiDraft.follow_up_date : null,
        follow_up_reason: state.aiDraft.follow_up_reason,
        summary_text: state.aiDraft.contact_summary,
        source_interaction_id: selectedInteraction.id,
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
        case_id: selectedDetail.client.id,
        conversation_id: selectedInteraction?.id ?? selectedWorkItem.source_interaction_id ?? selectedWorkItem.conversation_id,
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

  function handlePrefillReplyFromScript() {
    const nextText = getReplyTextFromScript(latestScriptArtifact);
    dispatch({
      type: "patch",
      patch: nextText
        ? {
            replyDraftText: nextText,
            replySource: "script",
            replyStatus: { type: "success", text: "Текст из сценария подставлен в ответ клиенту." },
          }
        : {
            replyStatus: { type: "error", text: "Сначала выберите или соберите сценарий контакта." },
          },
    });
  }

  function handlePrefillReplyFromObjection() {
    const nextText = getReplyTextFromObjection(latestObjectionArtifact);
    dispatch({
      type: "patch",
      patch: nextText
        ? {
            replyDraftText: nextText,
            replySource: "objection",
            replyStatus: { type: "success", text: "Ответ на возражение подставлен в сообщение клиенту." },
          }
        : {
            replyStatus: { type: "error", text: "Сначала зафиксируйте выбранный ответ на возражение." },
          },
    });
  }

  async function handleSendReply() {
    if (!selectedDetail || !selectedWorkItem) {
      dispatch({
        type: "patch",
        patch: {
          replyStatus: { type: "error", text: "Для кейса не выбрана коммуникация с клиентом." },
        },
      });
      return;
    }

    const replyInteraction =
      (selectedInteraction?.is_text_based ? selectedInteraction : null) ??
      selectedDetail.interactions.find((interaction) => interaction.is_text_based) ??
      null;

    if (!replyInteraction) {
      dispatch({
        type: "patch",
        patch: {
          replyStatus: { type: "error", text: "Для ответа нужен текстовый interaction кейса." },
        },
      });
      return;
    }

    if (!state.replyDraftText.trim()) {
      dispatch({
        type: "patch",
        patch: {
          replyStatus: { type: "error", text: "Сначала подготовьте текст ответа клиенту." },
        },
      });
      return;
    }

      dispatch({
        type: "patch",
        patch: {
          selectedInteractionId:
            state.selectedInteractionId === replyInteraction.id ? state.selectedInteractionId : replyInteraction.id,
          replySending: true,
          replyStatus: { type: "loading", text: "Отправляем ответ клиенту и сохраняем в CRM..." },
        },
      });

    try {
      const response = await apiPost<
        ClientReplyResponse,
        {
          case_id: string;
          source_interaction_id: string;
          manager_id: string;
          recommendation_id: string;
          source: ReplySource;
          text: string;
        }
      >(`/cases/${encodeURIComponent(selectedDetail.client.id)}/reply`, {
        case_id: selectedDetail.client.id,
        source_interaction_id: replyInteraction.id,
        manager_id: state.managerId,
        recommendation_id: selectedWorkItem.recommendation_id,
        source: state.replySource,
        text: state.replyDraftText,
      });

      await reloadClientDetail(selectedDetail.client.id, selectedWorkItem.id);
      dispatch({
        type: "patch",
        patch: {
          replyDraftText: "",
          replySource: "manual",
          replyStatus: {
            type: "success",
            text: `Сообщение отправлено. История кейса и CRM обновлены (${formatDateTime(response.message.created_at)}).`,
          },
        },
      });
    } catch (error) {
      dispatch({
        type: "patch",
        patch: {
          replyStatus: { type: "error", text: getErrorText(error, "Не удалось отправить ответ клиенту.") },
        },
      });
    } finally {
      dispatch({
        type: "patch",
        patch: {
          replySending: false,
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
    handlePrefillReplyFromScript,
    handlePrefillReplyFromObjection,
    handleSendReply,
  };
}
