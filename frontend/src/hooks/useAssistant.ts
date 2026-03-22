import { useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { getErrorText, type UiStatus } from "../lib/ui";
import type {
  AssistantActionResult,
  AssistantApplyResponse,
  AssistantChatResponse,
  AssistantMessageActionPayload,
  AssistantMode,
  AssistantPreview,
  AssistantPreviewChoice,
  AssistantStage,
  AssistantTaskKind,
  AssistantThread,
  AssistantThreadDetail,
  ThreadListResponse,
} from "../types";

function getTaskLabel(taskKind: AssistantTaskKind) {
  const labels: Record<AssistantTaskKind, string> = {
    summary_crm: "CRM",
    sales_script: "Скрипт",
    objection_workflow: "Возражение",
    reply_draft: "Ответ",
    client_qa: "По кейсу",
    general_qa: "Общий AI",
  };
  return labels[taskKind];
}

function createDraftThread(
  managerId: string,
  mode: AssistantMode,
  taskKind: AssistantTaskKind,
  selectedClientId?: string | null,
  selectedWorkItemId?: string | null,
  selectedInteractionId?: string | null,
  selectedClientName?: string | null,
): AssistantThread {
  const now = new Date().toISOString();
  return {
    id: "draft",
    manager_id: managerId,
    title: selectedClientName ? `${getTaskLabel(taskKind)}: ${selectedClientName}` : getTaskLabel(taskKind),
    scope_kind: mode,
    client_id: selectedClientId ?? null,
    work_item_id: selectedWorkItemId ?? null,
    interaction_id: selectedInteractionId ?? null,
    task_kind: taskKind,
    last_selected_client_id: selectedClientId ?? null,
    memory_summary: null,
    created_at: now,
    updated_at: now,
  };
}

function buildPreviewFromPayload(
  taskKind: AssistantTaskKind,
  payload: AssistantMessageActionPayload | null | undefined,
): AssistantPreview | null {
  if (!payload) {
    return null;
  }

  if (taskKind === "summary_crm" && payload.summary_draft) {
    return {
      task_kind: taskKind,
      title: "Сводка и CRM-черновик",
      summary: payload.summary_draft.contact_summary,
      target_tab: "crm",
      can_apply: true,
      requires_choice: false,
      choices: [],
      payload: {
        outcome: payload.summary_draft.outcome,
        follow_up_required: payload.summary_draft.follow_up_required,
      },
    };
  }

  if (taskKind === "sales_script" && payload.sales_script_draft) {
    const choices: AssistantPreviewChoice[] = [
      { id: "main", title: "Основной вариант", text: payload.sales_script_draft.ready_script },
      ...payload.sales_script_draft.alternatives.map((variant) => ({
        id: variant.label,
        title: variant.label,
        text: variant.ready_script,
        helper_text: [variant.style, variant.tactic].filter(Boolean).join(" · ") || null,
      })),
    ];
    return {
      task_kind: taskKind,
      title: "Скрипт контакта",
      summary: payload.sales_script_draft.ready_script,
      target_tab: "actions",
      can_apply: true,
      requires_choice: true,
      choices,
      payload: {
        contact_goal: payload.sales_script_draft.contact_goal,
      },
    };
  }

  if (taskKind === "objection_workflow" && payload.objection_workflow_draft) {
    return {
      task_kind: taskKind,
      title: payload.objection_workflow_draft.analysis.objection_label,
      summary: payload.objection_workflow_draft.next_step,
      target_tab: "actions",
      can_apply: true,
      requires_choice: true,
      choices: payload.objection_workflow_draft.handling_options.map((option) => ({
        id: option.title,
        title: option.title,
        text: option.response,
        helper_text: option.rationale,
      })),
      payload: {
        confidence: Math.round(payload.objection_workflow_draft.analysis.confidence * 100),
      },
    };
  }

  if (taskKind === "reply_draft" && payload.reply_draft_text) {
    return {
      task_kind: taskKind,
      title: "Черновик ответа клиенту",
      summary: payload.reply_draft_text,
      target_tab: "overview",
      can_apply: true,
      requires_choice: false,
      choices: [],
      payload: {},
    };
  }

  return null;
}

function resolveStage(detail: AssistantThreadDetail | null, preview: AssistantPreview | null): AssistantStage {
  if (!detail) {
    return "launcher";
  }
  const lastMessage = detail.messages[detail.messages.length - 1];
  if (lastMessage?.role === "tool") {
    return "applied";
  }
  if (preview) {
    return "preview";
  }
  return "launcher";
}

interface UseAssistantOptions {
  managerId: string;
  selectedClientId: string | null;
  selectedClientName?: string | null;
  selectedWorkItemId: string | null;
  selectedInteractionId: string | null;
  onActionResult?: (actionResult?: AssistantActionResult | null, targetTab?: string | null) => Promise<void> | void;
}

export function useAssistant({
  managerId,
  selectedClientId,
  selectedClientName,
  selectedWorkItemId,
  selectedInteractionId,
  onActionResult,
}: UseAssistantOptions) {
  const [assistantThreads, setAssistantThreads] = useState<AssistantThread[]>([]);
  const [assistantSelectedThreadId, setAssistantSelectedThreadId] = useState<string | null>(null);
  const [assistantThreadDetail, setAssistantThreadDetail] = useState<AssistantThreadDetail | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantSending, setAssistantSending] = useState(false);
  const [assistantApplying, setAssistantApplying] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState<UiStatus>(null);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("global");
  const [assistantTaskKind, setAssistantTaskKind] = useState<AssistantTaskKind>("general_qa");
  const [assistantStage, setAssistantStage] = useState<AssistantStage>("launcher");
  const [assistantPreview, setAssistantPreview] = useState<AssistantPreview | null>(null);
  const [assistantSelectedChoice, setAssistantSelectedChoice] = useState<string | null>(null);

  function setDraftThread(nextMode: AssistantMode, taskKind: AssistantTaskKind, nextClientName?: string | null) {
    setAssistantSelectedThreadId("draft");
    const draftThread = createDraftThread(
      managerId,
      nextMode,
      taskKind,
      nextMode === "case" ? selectedClientId : null,
      nextMode === "case" ? selectedWorkItemId : null,
      nextMode === "case" ? selectedInteractionId : null,
      nextClientName,
    );
    setAssistantThreadDetail({
      thread: draftThread,
      messages: [],
    });
    setAssistantPreview(null);
    setAssistantStage("launcher");
    setAssistantSelectedChoice(null);
  }

  function prepareDraftThread(nextClientName?: string | null) {
    const nextMode: AssistantMode = selectedClientId ? "case" : "global";
    const nextTaskKind: AssistantTaskKind = nextMode === "case" ? "client_qa" : "general_qa";
    setAssistantMode(nextMode);
    setAssistantTaskKind(nextTaskKind);
    setDraftThread(nextMode, nextTaskKind, nextClientName ?? selectedClientName ?? null);
    setAssistantInput("");
    setAssistantStatus(null);
  }

  function resetAssistantState() {
    setAssistantThreads([]);
    setAssistantThreadDetail(null);
    setAssistantPreview(null);
    setAssistantSelectedChoice(null);
    setAssistantStatus(null);
    setAssistantInput("");
    prepareDraftThread(selectedClientName ?? null);
  }

  async function loadAssistantThread(threadId: string) {
    const detail = await apiGet<AssistantThreadDetail>(`/assistant/threads/${encodeURIComponent(threadId)}`);
    const nextTaskKind = detail.thread.task_kind ?? (detail.thread.scope_kind === "case" ? "client_qa" : "general_qa");
    const nextMode = detail.thread.scope_kind ?? "global";
    const latestPayload = [...detail.messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.action_payload)?.action_payload;
    const nextPreview = buildPreviewFromPayload(nextTaskKind, latestPayload);

    setAssistantSelectedThreadId(threadId);
    setAssistantThreadDetail(detail);
    setAssistantMode(nextMode);
    setAssistantTaskKind(nextTaskKind);
    setAssistantPreview(nextPreview);
    setAssistantStage(resolveStage(detail, nextPreview));
    setAssistantSelectedChoice(nextPreview?.requires_choice ? nextPreview.choices[0]?.id ?? null : null);
    setAssistantThreads((current) =>
      current.some((thread) => thread.id === detail.thread.id)
        ? current.map((thread) => (thread.id === detail.thread.id ? detail.thread : thread))
        : [detail.thread, ...current],
    );
    return detail;
  }

  async function loadAssistantThreads(
    preferredThreadId?: string | null,
    mode: AssistantMode = assistantMode,
    taskKind: AssistantTaskKind = assistantTaskKind,
  ) {
    setAssistantLoading(true);
    try {
      const params = new URLSearchParams({
        manager_id: managerId,
        scope_kind: mode,
      });
      if (mode === "case" && selectedClientId) {
        params.set("client_id", selectedClientId);
      }
      if (mode === "case" && selectedWorkItemId) {
        params.set("work_item_id", selectedWorkItemId);
      }
      const response = await apiGet<ThreadListResponse>(`/assistant/threads?${params.toString()}`);
      const items = response.items ?? [];
      setAssistantThreads(items);
      const preferredByTask = items.find((item) => item.task_kind === taskKind)?.id ?? null;
      const nextThreadId = preferredThreadId ?? preferredByTask ?? items[0]?.id ?? null;
      if (nextThreadId) {
        await loadAssistantThread(nextThreadId);
      } else {
        setDraftThread(mode, taskKind, selectedClientName ?? null);
      }
      setAssistantStatus(null);
    } catch (error) {
      setAssistantStatus({
        type: "error",
        text: getErrorText(error, "Не удалось загрузить сессии помощника."),
      });
    } finally {
      setAssistantLoading(false);
    }
  }

  async function createAssistantThread(nextMode: AssistantMode, taskKind: AssistantTaskKind) {
    const response = await apiPost<
      { thread: AssistantThread },
      {
        manager_id: string;
        scope_kind: AssistantMode;
        client_id: string | null;
        work_item_id: string | null;
        interaction_id: string | null;
        task_kind: AssistantTaskKind;
        selected_client_id: string | null;
        title: string | null;
      }
    >("/assistant/threads", {
      manager_id: managerId,
      scope_kind: nextMode,
      client_id: nextMode === "case" ? selectedClientId : null,
      work_item_id: nextMode === "case" ? selectedWorkItemId : null,
      interaction_id: nextMode === "case" ? selectedInteractionId : null,
      task_kind: taskKind,
      selected_client_id: nextMode === "case" ? selectedClientId : null,
      title: selectedClientName ? `${getTaskLabel(taskKind)}: ${selectedClientName}` : getTaskLabel(taskKind),
    });

    setAssistantThreads((current) => [response.thread, ...current.filter((thread) => thread.id !== response.thread.id)]);
    setAssistantSelectedThreadId(response.thread.id);
    setAssistantThreadDetail({ thread: response.thread, messages: [] });
    return response.thread.id;
  }

  async function openAssistantTask(taskKind: AssistantTaskKind, mode?: AssistantMode) {
    const nextMode = mode ?? (taskKind === "general_qa" ? "global" : selectedClientId ? "case" : "global");
    const nextTaskKind = nextMode === "global" && taskKind !== "general_qa" ? "general_qa" : taskKind;

    setAssistantMode(nextMode);
    setAssistantTaskKind(nextTaskKind);
    setAssistantInput("");
    setAssistantStatus(null);
    setAssistantPreview(null);
    setAssistantSelectedChoice(null);
    setAssistantStage("launcher");

    await loadAssistantThreads(null, nextMode, nextTaskKind);
  }

  async function sendAssistantMessage(prefilledMessage?: string) {
    const message = (prefilledMessage ?? assistantInput).trim();
    if (!message) {
      return;
    }

    setAssistantSending(true);
    setAssistantStatus({ type: "loading", text: "Помощник готовит результат..." });

    try {
      const threadId =
        assistantSelectedThreadId === "draft"
          ? await createAssistantThread(assistantMode, assistantTaskKind)
          : assistantSelectedThreadId || (await createAssistantThread(assistantMode, assistantTaskKind));
      const response = await apiPost<
        AssistantChatResponse,
        {
          manager_id: string;
          thread_id: string;
          task_kind: AssistantTaskKind;
          message: string;
          selected_client_id: string | null;
          selected_work_item_id: string | null;
          selected_interaction_id: string | null;
          task_input: string | null;
        }
      >("/assistant/chat", {
        manager_id: managerId,
        thread_id: threadId,
        task_kind: assistantTaskKind,
        message,
        selected_client_id: assistantMode === "case" ? selectedClientId : null,
        selected_work_item_id: assistantMode === "case" ? selectedWorkItemId : null,
        selected_interaction_id: assistantMode === "case" ? selectedInteractionId : null,
        task_input: message,
      });

      setAssistantInput("");
      await loadAssistantThread(response.session.id);
      setAssistantStatus({
        type: "success",
        text: response.preview?.can_apply ? "Результат готов к применению." : "Ответ помощника готов.",
      });
    } catch (error) {
      setAssistantStatus({
        type: "error",
        text: getErrorText(error, "Не удалось получить ответ помощника."),
      });
    } finally {
      setAssistantSending(false);
    }
  }

  async function applyAssistantPreview() {
    if (!assistantSelectedThreadId || assistantSelectedThreadId === "draft" || !assistantPreview) {
      return;
    }

    setAssistantApplying(true);
    setAssistantStatus({ type: "loading", text: "Применяем результат..." });

    try {
      const response = await apiPost<
        AssistantApplyResponse,
        {
          manager_id: string;
          thread_id: string;
          task_kind: AssistantTaskKind;
          selected_client_id: string | null;
          selected_work_item_id: string | null;
          selected_interaction_id: string | null;
          selected_choice: string | null;
        }
      >("/assistant/apply", {
        manager_id: managerId,
        thread_id: assistantSelectedThreadId,
        task_kind: assistantTaskKind,
        selected_client_id: assistantMode === "case" ? selectedClientId : null,
        selected_work_item_id: assistantMode === "case" ? selectedWorkItemId : null,
        selected_interaction_id: assistantMode === "case" ? selectedInteractionId : null,
        selected_choice: assistantPreview.requires_choice ? assistantSelectedChoice : null,
      });

      await loadAssistantThread(response.session.id);
      await onActionResult?.(response.action_result, response.target_tab ?? null);
      setAssistantStage("applied");
      setAssistantStatus({ type: "success", text: response.message });
    } catch (error) {
      setAssistantStatus({
        type: "error",
        text: getErrorText(error, "Не удалось применить результат помощника."),
      });
    } finally {
      setAssistantApplying(false);
    }
  }

  return {
    assistantThreads,
    assistantSelectedThreadId,
    assistantThreadDetail,
    assistantLoading,
    assistantSending,
    assistantApplying,
    assistantStatus,
    assistantInput,
    assistantMode,
    assistantTaskKind,
    assistantStage,
    assistantPreview,
    assistantSelectedChoice,
    setAssistantInput,
    setAssistantSelectedChoice,
    setDraftThread,
    prepareDraftThread,
    resetAssistantState,
    openAssistantTask,
    loadAssistantThreads,
    loadAssistantThread,
    sendAssistantMessage,
    applyAssistantPreview,
  };
}
