import { useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { getErrorText, type UiStatus } from "../lib/ui";
import type {
  AssistantActionResult,
  AssistantChatResponse,
  AssistantThread,
  AssistantThreadDetail,
  ThreadListResponse,
} from "../types";

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

interface UseAssistantOptions {
  managerId: string;
  selectedClientId: string | null;
  selectedClientName?: string | null;
  selectedWorkItemId: string | null;
  onActionResult?: (actionResult?: AssistantActionResult | null) => Promise<void> | void;
}

export function useAssistant({
  managerId,
  selectedClientId,
  selectedClientName,
  selectedWorkItemId,
  onActionResult,
}: UseAssistantOptions) {
  const [assistantThreads, setAssistantThreads] = useState<AssistantThread[]>([]);
  const [assistantSelectedThreadId, setAssistantSelectedThreadId] = useState<string | null>(null);
  const [assistantThreadDetail, setAssistantThreadDetail] = useState<AssistantThreadDetail | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantSending, setAssistantSending] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState<UiStatus>(null);
  const [assistantInput, setAssistantInput] = useState("");

  function setDraftThread(nextClientName?: string | null) {
    setAssistantSelectedThreadId("draft");
    setAssistantThreadDetail({
      thread: createDraftThread(managerId, nextClientName),
      messages: [],
    });
  }

  function prepareDraftThread(nextClientName?: string | null) {
    setDraftThread(nextClientName);
    setAssistantInput("");
    setAssistantStatus(null);
  }

  function resetAssistantState() {
    setAssistantThreads([]);
    prepareDraftThread(selectedClientName ?? null);
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
        text: getErrorText(error, "Не удалось загрузить историю ассистента."),
      });
    } finally {
      setAssistantLoading(false);
    }
  }

  async function createAssistantThread() {
    const response = await apiPost<
      { thread: AssistantThread },
      { manager_id: string; selected_client_id: string | null; title: string | null }
    >("/assistant/threads", {
      manager_id: managerId,
      selected_client_id: selectedClientId,
      title: selectedClientName ?? null,
    });

    setAssistantThreads((current) => [response.thread, ...current.filter((thread) => thread.id !== response.thread.id)]);
    setAssistantSelectedThreadId(response.thread.id);
    setAssistantThreadDetail({ thread: response.thread, messages: [] });
    return response.thread.id;
  }

  async function sendAssistantMessage(prefilledMessage?: string) {
    const message = (prefilledMessage ?? assistantInput).trim();
    if (!message) {
      return;
    }

    setAssistantSending(true);
    setAssistantStatus({ type: "loading", text: "Ассистент готовит ответ..." });

    try {
      const threadId =
        assistantSelectedThreadId === "draft"
          ? await createAssistantThread()
          : assistantSelectedThreadId || (await createAssistantThread());
      const response = await apiPost<
        AssistantChatResponse,
        { manager_id: string; thread_id: string; message: string; selected_client_id: string | null; selected_work_item_id: string | null }
      >("/assistant/chat", {
        manager_id: managerId,
        thread_id: threadId,
        message,
        selected_client_id: selectedClientId,
        selected_work_item_id: selectedWorkItemId,
      });

      setAssistantInput("");
      await loadAssistantThread(response.thread.id);
      await onActionResult?.(response.action_result);
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
        text: getErrorText(error, "Не удалось получить ответ ассистента."),
      });
    } finally {
      setAssistantSending(false);
    }
  }

  return {
    assistantThreads,
    assistantSelectedThreadId,
    assistantThreadDetail,
    assistantLoading,
    assistantSending,
    assistantStatus,
    assistantInput,
    setAssistantInput,
    setDraftThread,
    prepareDraftThread,
    resetAssistantState,
    loadAssistantThreads,
    loadAssistantThread,
    sendAssistantMessage,
  };
}
