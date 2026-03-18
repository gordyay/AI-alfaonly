const state = {
  dialogs: [],
  clientDetails: {},
  selectedClientId: null,
  currentManagerId: "m1",
  currentSortBy: "priority",
  aiDraft: null,
  aiMeta: null,
  aiStatus: null,
  aiSaveStatus: null,
  aiLoading: false,
  aiSaving: false,
  assistantOpen: false,
  assistantThreads: [],
  assistantSelectedThreadId: null,
  assistantThreadDetail: null,
  assistantView: "list",
  assistantLoading: false,
  assistantSending: false,
  assistantStatus: null,
  weights: {
    w1: 0.25,
    w2: 0.3,
    w3: 0.2,
    w4: 0.15,
    w5: 0.1,
  },
};

const workspace = document.querySelector(".workspace");
const dialogList = document.getElementById("dialog-list");
const miniDialogList = document.getElementById("mini-dialog-list");
const sortToggleButton = document.getElementById("sort-toggle-button");
const sortToggleLabel = document.getElementById("sort-toggle-label");
const managerToggleButton = document.getElementById("manager-toggle-button");
const managerToggleLabel = document.getElementById("manager-toggle-label");
const detailView = document.getElementById("detail-view");
const emptyState = document.getElementById("empty-state");
const priorityModal = document.getElementById("priority-modal");
const priorityOpenButton = document.getElementById("priority-open-button");
const closeModalButton = document.getElementById("close-modal-button");
const modalBackdrop = document.getElementById("modal-backdrop");
const backToListButton = document.getElementById("back-to-list-button");
const composerForm = document.getElementById("composer-form");
const composerInput = document.getElementById("composer-input");
const contextTabButtons = Array.from(document.querySelectorAll("[data-context-tab]"));
const contextPanels = Array.from(document.querySelectorAll("[data-context-panel]"));
const weightInputs = ["w1", "w2", "w3", "w4", "w5"].map((key) => document.getElementById(`weight-${key}`));
const generateAiSummaryButton = document.getElementById("generate-ai-summary-button");
const aiPlaceholderCopy = document.getElementById("ai-placeholder-copy");
const aiStatus = document.getElementById("ai-status");
const aiSaveStatus = document.getElementById("ai-save-status");
const aiEditor = document.getElementById("ai-editor");
const aiContactSummary = document.getElementById("ai-contact-summary");
const aiKeyPoints = document.getElementById("ai-key-points");
const aiOutcomeSelect = document.getElementById("ai-outcome-select");
const aiCrmNoteText = document.getElementById("ai-crm-note-text");
const aiFollowUpDate = document.getElementById("ai-follow-up-date");
const aiFollowUpTime = document.getElementById("ai-follow-up-time");
const aiFollowUpReason = document.getElementById("ai-follow-up-reason");
const saveAiDraftButton = document.getElementById("save-ai-draft-button");
const regenerateSummaryButton = document.getElementById("regenerate-summary-button");
const miniSummaryStatus = document.getElementById("mini-summary-status");
const assistantLauncherButton = document.getElementById("assistant-launcher-button");
const assistantWidget = document.getElementById("assistant-widget");
const assistantWidgetBackdrop = document.getElementById("assistant-widget-backdrop");
const assistantWidgetCloseButton = document.getElementById("assistant-widget-close-button");
const assistantThreadRail = document.querySelector(".assistant-thread-rail");
const assistantChatShell = document.querySelector(".assistant-chat-shell");
const assistantThreadList = document.getElementById("assistant-thread-list");
const assistantMessageList = document.getElementById("assistant-message-list");
const assistantThreadEmpty = document.getElementById("assistant-thread-empty");
const assistantWidgetStatus = document.getElementById("assistant-widget-status");
const assistantNewThreadButton = document.getElementById("assistant-new-thread-button");
const assistantQuickActionButtons = Array.from(document.querySelectorAll("[data-assistant-prompt]"));
const assistantForm = document.getElementById("assistant-form");
const assistantInput = document.getElementById("assistant-input");
const assistantSendButton = document.getElementById("assistant-send-button");
const assistantBackButton = document.getElementById("assistant-back-button");
const assistantChatTitle = document.getElementById("assistant-chat-title");

function formatDateTime(value) {
  if (!value) {
    return "Не указано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function initials(name) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSalesScriptChannelLabel(channel) {
  if (channel === "call") {
    return "Звонок";
  }
  if (channel === "meeting") {
    return "Встреча";
  }
  return "Чат";
}

function renderSalesScriptCard(actionPayload) {
  const draft = actionPayload?.sales_script_draft;
  if (!draft) {
    return "";
  }

  const talkingPoints = (draft.manager_talking_points || []).length
    ? `
        <div class="assistant-script-card__section">
          <span class="assistant-script-card__eyebrow">Тезисы</span>
          <ul class="assistant-script-list">
            ${draft.manager_talking_points
              .map((point) => `<li>${escapeHtml(point)}</li>`)
              .join("")}
          </ul>
        </div>
      `
    : "";

  return `
    <section class="assistant-script-card">
      <div class="assistant-script-card__header">
        <strong>Скрипт продажи</strong>
        <span class="assistant-script-card__channel">${escapeHtml(getSalesScriptChannelLabel(draft.channel))}</span>
      </div>
      ${talkingPoints}
      <div class="assistant-script-card__section">
        <span class="assistant-script-card__eyebrow">Готовый текст</span>
        <div class="assistant-script-card__body">${escapeHtml(draft.ready_script)}</div>
      </div>
    </section>
  `;
}

function renderAssistantMessage(message) {
  const citations = message.citations?.length
    ? `
        <div class="assistant-citation-list">
          ${message.citations
            .map(
              (citation) => `
                <article class="assistant-citation">
                  <strong>${escapeHtml(citation.title)}</strong>
                  <span>${escapeHtml(citation.excerpt || "Источник из базы знаний")}</span>
                </article>
              `
            )
            .join("")}
        </div>
      `
    : "";

  const richPayload =
    message.action_payload?.action_type === "sales_script"
      ? renderSalesScriptCard(message.action_payload)
      : "";

  return `
    <article class="assistant-message assistant-message--${message.role}">
      <div class="assistant-message__meta">
        <span>${message.role === "user" ? "Вы" : message.role === "tool" ? "Действие" : "Ассистент"}</span>
        <span>${formatDateTime(message.created_at)}</span>
      </div>
      <p>${escapeHtml(message.content)}</p>
      ${richPayload}
      ${citations}
    </article>
  `;
}

function getSelectedDetail() {
  return state.selectedClientId ? state.clientDetails[state.selectedClientId] || null : null;
}

function getDialogByClientId(clientId) {
  return state.dialogs.find((dialog) => dialog.client_id === clientId) || null;
}

function getMiniSummaryCopy(detail) {
  if (!detail) {
    return "Нажмите «Сгенерировать сводку», чтобы получить AI-выжимку по текущему диалогу.";
  }

  return (
    detail.client.ai_summary_text ||
    state.aiDraft?.contact_summary ||
    "Нажмите «Сгенерировать сводку», чтобы получить AI-выжимку по текущему диалогу."
  );
}

function cloneDraft(draft) {
  return draft ? JSON.parse(JSON.stringify(draft)) : null;
}

function getPersistedDraft(detail) {
  return detail?.saved_ai_draft ? cloneDraft(detail.saved_ai_draft) : null;
}

function resetAiState() {
  state.aiDraft = null;
  state.aiMeta = null;
  state.aiStatus = null;
  state.aiSaveStatus = null;
  state.aiLoading = false;
  state.aiSaving = false;
}

function resetAssistantState() {
  state.assistantThreads = [];
  state.assistantSelectedThreadId = null;
  state.assistantThreadDetail = null;
  state.assistantView = "list";
  state.assistantLoading = false;
  state.assistantSending = false;
  state.assistantStatus = null;
}

function toFollowUpInputValue(value) {
  if (!value) {
    return { date: "", time: "" };
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - timezoneOffset);

  return {
    date: localDate.toISOString().slice(0, 10),
    time: localDate.toISOString().slice(11, 16),
  };
}

function sanitizeTimeInput(value) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function fromFollowUpInputValue(dateValue, timeValue) {
  if (!dateValue) {
    return null;
  }

  const normalizedTime = /^\d{2}:\d{2}$/.test(timeValue || "") ? timeValue : "00:00";
  const [hourText, minuteText] = normalizedTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return new Date(`${dateValue}T${normalizedTime}:00`).toISOString();
}

async function apiGet(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

async function apiPost(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body.detail) {
        detail = body.detail;
      }
    } catch (error) {
      console.error(error);
    }
    throw new Error(detail);
  }

  return response.json();
}

function updateFormulaPreview() {
  document.getElementById("formula-weights").textContent =
    `PriorityScore = ${state.weights.w1.toFixed(2)}*T_wait + ${state.weights.w2.toFixed(2)}*C_value + ` +
    `${state.weights.w3.toFixed(2)}*U_comm + ${state.weights.w4.toFixed(2)}*P_sale + ${state.weights.w5.toFixed(2)}*R_churn`;
}

function getSortLabel(sortBy) {
  return sortBy === "last_message" ? "По последнему сообщению" : "По приоритету";
}

function getNextManagerId(currentManagerId) {
  return currentManagerId === "m1" ? "m2" : "m1";
}

function getNextSortBy(currentSortBy) {
  return currentSortBy === "priority" ? "last_message" : "priority";
}

function getAssistantScopeClientLabel() {
  const detail = getSelectedDetail();
  if (detail?.client?.full_name) {
    return detail.client.full_name;
  }
  const dialog = getDialogByClientId(state.selectedClientId);
  return dialog?.client_name || "Клиент не выбран";
}

function getSelectedAssistantThread() {
  return (
    state.assistantThreads.find((thread) => thread.id === state.assistantSelectedThreadId) ||
    state.assistantThreadDetail?.thread ||
    null
  );
}

function buildAssistantDraftThread() {
  return {
    id: "draft",
    manager_id: state.currentManagerId,
    title: state.selectedClientId ? getAssistantScopeClientLabel() : "Новый диалог",
    last_selected_client_id: state.selectedClientId || null,
    memory_summary: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function getAssistantInputValue() {
  return assistantInput?.value.trim() || "";
}

function populatePriorityModal(recommendation) {
  const scoreNode = document.getElementById("modal-priority-score");
  const labelNode = document.getElementById("modal-priority-label");
  const whyNode = document.getElementById("modal-why-list");
  const factorsNode = document.getElementById("modal-factor-grid");

  if (!recommendation) {
    scoreNode.textContent = "0";
    labelNode.textContent = "не рассчитан";
    whyNode.innerHTML = '<span class="why-pill">Нет объяснения</span>';
    factorsNode.innerHTML = "";
    return;
  }

  scoreNode.textContent = String(recommendation.priority_score);
  labelNode.textContent = recommendation.priority_label;
  whyNode.innerHTML = (recommendation.why || [])
    .map((item) => `<span class="why-pill">${item}</span>`)
    .join("");

  const factorLabels = {
    t_wait: "T_wait",
    c_value: "C_value",
    u_comm: "U_comm",
    p_sale: "P_sale",
    r_churn: "R_churn",
  };

  const factorOrder = ["t_wait", "c_value", "u_comm", "p_sale", "r_churn"];
  factorsNode.innerHTML = factorOrder
    .filter((key) => recommendation.factor_breakdown && key in recommendation.factor_breakdown)
    .map(
      (key) => `
        <article class="factor-tile">
          <span>${factorLabels[key] || key}</span>
          <strong>${Number(recommendation.factor_breakdown[key]).toFixed(2)}</strong>
        </article>
      `
    )
    .join("");
}

function openPriorityModal(recommendation) {
  populatePriorityModal(recommendation);
  priorityModal.classList.remove("hidden");
}

function closePriorityModal() {
  priorityModal.classList.add("hidden");
}

function setActiveContextTab(tabName) {
  contextTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.contextTab === tabName);
  });

  contextPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.contextPanel === tabName);
  });
}

function renderStats() {
  document.getElementById("active-task-count").textContent = String(state.dialogs.length);
  document.getElementById("focused-client-count").textContent = String(
    state.dialogs.filter((dialog) => dialog.priority_score >= 70).length
  );
  document.getElementById("app-stage").textContent = "stage-6 sales scripts";
  sortToggleLabel.textContent = getSortLabel(state.currentSortBy);
  managerToggleLabel.textContent = state.currentManagerId;
}

function renderWorkspaceMode() {
  const chatOpen = Boolean(state.selectedClientId);
  workspace.classList.toggle("is-chat-open", chatOpen);
}

function renderDialogList() {
  dialogList.innerHTML = "";

  if (!state.dialogs.length) {
    dialogList.innerHTML = '<div class="empty-card">Диалоги по выбранному менеджеру не найдены.</div>';
    return;
  }

  state.dialogs.forEach((dialog) => {
    const article = document.createElement("article");
    article.className = `dialog-card${dialog.client_id === state.selectedClientId ? " is-active" : ""}`;
    article.innerHTML = `
      <button class="dialog-card__priority" type="button" data-priority-open="true">${dialog.priority_score}</button>
      <div class="avatar">${initials(dialog.client_name)}</div>
      <div class="dialog-card__body">
        <h3>${dialog.client_name}</h3>
        <p class="dialog-card__summary">${dialog.last_message_preview}</p>
        <p class="dialog-card__meta">${dialog.mini_summary}</p>
      </div>
    `;
    article.addEventListener("click", (event) => {
      if (event.target.closest("[data-priority-open='true']")) {
        event.stopPropagation();
        openPriorityModal(dialog);
        return;
      }
      selectDialog(dialog.client_id).catch(console.error);
    });
    dialogList.appendChild(article);
  });
}

function renderMiniDialogList() {
  miniDialogList.innerHTML = state.dialogs
    .map(
      (dialog) => `
        <button class="mini-dialog-pill${dialog.client_id === state.selectedClientId ? " is-active" : ""}" type="button" data-client-id="${dialog.client_id}">
          <div class="avatar">${initials(dialog.client_name)}</div>
          <span class="mini-dialog-pill__name">${dialog.client_name}</span>
        </button>
      `
    )
    .join("");

  miniDialogList.querySelectorAll("[data-client-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectDialog(button.dataset.clientId).catch(console.error);
    });
  });
}

function renderAssistantWidget() {
  if (!assistantWidget) {
    return;
  }

  assistantWidget.classList.toggle("hidden", !state.assistantOpen);
  assistantLauncherButton?.classList.toggle("is-active", state.assistantOpen);

  if (assistantWidgetStatus) {
    assistantWidgetStatus.classList.toggle("hidden", !state.assistantStatus);
    assistantWidgetStatus.className = `assistant-status${state.assistantStatus ? ` assistant-status--${state.assistantStatus.type}` : ""}${state.assistantStatus ? "" : " hidden"}`;
    assistantWidgetStatus.textContent = state.assistantStatus ? state.assistantStatus.text : "";
  }

  const selectedThread = getSelectedAssistantThread();
  const showChatView = state.assistantView === "chat" && Boolean(selectedThread);
  const isInputEmpty = !getAssistantInputValue();

  assistantThreadRail?.classList.toggle("hidden", showChatView);
  assistantChatShell?.classList.toggle("hidden", !showChatView);

  if (assistantThreadList) {
    if (!state.assistantThreads.length) {
      assistantThreadList.innerHTML = `
        <div class="assistant-thread-list__empty">
          ${escapeHtml(
            state.assistantLoading
              ? "Загружаем диалоги ассистента..."
              : state.assistantStatus?.type === "error"
                ? state.assistantStatus.text
                : "Пока нет сохраненных диалогов."
          )}
        </div>
      `;
    } else {
      assistantThreadList.innerHTML = state.assistantThreads
        .map(
          (thread) => `
            <button
              class="assistant-thread-card${thread.id === state.assistantSelectedThreadId ? " is-active" : ""}"
              type="button"
              data-thread-id="${thread.id}"
            >
              <strong>${escapeHtml(thread.title)}</strong>
              <span>${formatDateTime(thread.updated_at)}</span>
            </button>
          `
        )
        .join("");

      assistantThreadList.querySelectorAll("[data-thread-id]").forEach((button) => {
        button.addEventListener("click", () => {
          loadAssistantThread(button.dataset.threadId).catch(console.error);
        });
      });
    }
  }

  const messages = state.assistantThreadDetail?.messages || [];
  const showMessages = showChatView;

  if (assistantChatTitle) {
    assistantChatTitle.textContent = selectedThread?.title || "Новый диалог";
  }

  const quickActions = document.querySelector(".assistant-quick-actions");
  quickActions?.classList.toggle("hidden", !showChatView || !isInputEmpty);

  if (assistantThreadEmpty) {
    assistantThreadEmpty.classList.toggle("hidden", showMessages);
    assistantThreadEmpty.innerHTML = showMessages
      ? ""
      : `
          <strong>Ассистент готов.</strong>
          <p>Откройте прошлый диалог или создайте новый, чтобы работать с базой знаний и текущим фокусом менеджера.</p>
        `;
  }

  if (assistantMessageList) {
    assistantMessageList.classList.toggle("hidden", !showMessages);
    if (showMessages) {
      assistantMessageList.innerHTML = messages.length
        ? messages.map((message) => renderAssistantMessage(message)).join("")
        : `
            <div class="assistant-thread-empty assistant-thread-empty--inline">
              <strong>${escapeHtml(selectedThread.title)}</strong>
              <p>Диалог создан. Задайте первый вопрос или воспользуйтесь quick action.</p>
            </div>
          `;
    } else {
      assistantMessageList.innerHTML = "";
    }
  }

  if (assistantInput) {
    assistantInput.disabled = state.assistantSending;
  }
  if (assistantSendButton) {
    assistantSendButton.disabled = state.assistantSending;
    assistantSendButton.textContent = state.assistantSending ? "Отправляем..." : "Отправить";
  }
  if (assistantNewThreadButton) {
    assistantNewThreadButton.disabled = state.assistantSending;
  }
  assistantQuickActionButtons.forEach((button) => {
    button.disabled = state.assistantSending;
  });
}

function renderAiPanel() {
  const detail = getSelectedDetail();
  const hasDetail = Boolean(detail);
  const draft = state.aiDraft;
  const editorDisabled = !draft || state.aiSaving || state.aiLoading;
  const hasSavedDraft = Boolean(detail?.saved_ai_draft);

  generateAiSummaryButton.disabled = !hasDetail || state.aiLoading;
  generateAiSummaryButton.textContent = state.aiLoading
    ? "Генерируем..."
    : draft || hasSavedDraft
      ? "Перегенерировать CRM-заметку"
      : "Сгенерировать CRM-заметку";

  const hasPersistedSummary = Boolean(detail?.client?.ai_summary_text);
  regenerateSummaryButton.disabled = !hasDetail || state.aiLoading;
  regenerateSummaryButton.textContent = hasPersistedSummary ? "Сгенерировать заново" : "Сгенерировать сводку";

  aiStatus.classList.toggle("hidden", !state.aiStatus);
  aiStatus.className = `assistant-status${state.aiStatus ? ` assistant-status--${state.aiStatus.type}` : ""}${state.aiStatus ? "" : " hidden"}`;
  aiStatus.textContent = state.aiStatus ? state.aiStatus.text : "";
  aiSaveStatus.classList.toggle("hidden", !state.aiSaveStatus);
  aiSaveStatus.className = `assistant-status assistant-status--inline${state.aiSaveStatus ? ` assistant-status--${state.aiSaveStatus.type}` : ""}${state.aiSaveStatus ? "" : " hidden"}`;
  aiSaveStatus.textContent = state.aiSaveStatus ? state.aiSaveStatus.text : "";

  aiEditor.classList.toggle("hidden", !draft);
  aiPlaceholderCopy.classList.toggle("hidden", Boolean(draft));

  if (!draft) {
    aiContactSummary.value = "";
    aiContactSummary.disabled = true;
    aiKeyPoints.innerHTML = "";
    aiOutcomeSelect.value = "follow_up";
    aiOutcomeSelect.disabled = true;
    aiCrmNoteText.value = "";
    aiCrmNoteText.disabled = true;
    aiFollowUpDate.value = "";
    aiFollowUpDate.disabled = true;
    aiFollowUpTime.value = "";
    aiFollowUpTime.disabled = true;
    aiFollowUpReason.value = "";
    aiFollowUpReason.disabled = true;
    saveAiDraftButton.disabled = true;
    saveAiDraftButton.textContent = "Сохранить в CRM";
    aiSaveStatus.textContent = "";
    return;
  }

  aiContactSummary.value = draft.contact_summary;
  aiKeyPoints.innerHTML = draft.key_points.length
    ? draft.key_points.map((point) => `<span class="ai-chip">${point}</span>`).join("")
    : '<span class="ai-gap-empty">Ключевые пункты отсутствуют.</span>';
  aiOutcomeSelect.value = draft.outcome;
  aiCrmNoteText.value = draft.crm_note_draft;
  const followUpValue = toFollowUpInputValue(draft.follow_up_date);
  aiFollowUpDate.value = followUpValue.date;
  aiFollowUpTime.value = followUpValue.time;
  aiFollowUpReason.value = draft.follow_up_reason || "";
  aiContactSummary.disabled = editorDisabled;
  aiOutcomeSelect.disabled = editorDisabled;
  aiCrmNoteText.disabled = editorDisabled;
  aiFollowUpDate.disabled = editorDisabled;
  aiFollowUpTime.disabled = editorDisabled;
  aiFollowUpReason.disabled = editorDisabled;
  saveAiDraftButton.disabled = editorDisabled;
  saveAiDraftButton.textContent = state.aiSaving ? "Сохраняем..." : "Сохранить в CRM";
}

function renderMiniSummaryStatus() {
  if (!miniSummaryStatus) {
    return;
  }

  const status = state.aiStatus;
  miniSummaryStatus.classList.toggle("hidden", !status);
  miniSummaryStatus.className = `summary-card__status${status ? ` summary-card__status--${status.type}` : ""}${status ? "" : " hidden"}`;
  miniSummaryStatus.textContent = status ? status.text : "";
}

function renderClientDetail() {
  const detail = getSelectedDetail();

  if (!detail) {
    detailView.classList.add("hidden");
    emptyState.classList.remove("hidden");
    regenerateSummaryButton.disabled = true;
    regenerateSummaryButton.textContent = "Сгенерировать сводку";
    renderWorkspaceMode();
    renderAiPanel();
    renderMiniSummaryStatus();
    renderAssistantWidget();
    return;
  }

  const { client, conversations, dialog_recommendation: recommendation } = detail;
  const conversation = conversations[0] || null;
  const messages = conversation ? conversation.messages : [];
  const selectedDialog = recommendation || getDialogByClientId(client.id);
  const nextContactAt = conversation?.insights?.next_contact_due_at || client.next_contact_due_at;

  detailView.classList.remove("hidden");
  emptyState.classList.add("hidden");
  renderWorkspaceMode();

  document.getElementById("client-name").textContent = client.full_name;
  document.getElementById("client-subtitle").textContent =
    `${client.city} • ${client.occupation} • менеджер ${client.manager_id}`;
  document.getElementById("mini-summary").textContent = getMiniSummaryCopy(detail);
  document.getElementById("portfolio-value").textContent = formatMoney(client.portfolio_value);
  document.getElementById("churn-risk").textContent = client.churn_risk;
  document.getElementById("next-contact").textContent = formatDateTime(nextContactAt);
  document.getElementById("next-best-action").textContent =
    selectedDialog?.next_best_action || "Следующее действие пока не рассчитано.";
  document.getElementById("client-summary").textContent =
    client.notes_summary || "Расширенный контекст клиента пока не заполнен.";
  regenerateSummaryButton.disabled = state.aiLoading;
  regenerateSummaryButton.textContent = client.ai_summary_text ? "Сгенерировать заново" : "Сгенерировать сводку";
  priorityOpenButton.textContent = String(selectedDialog?.priority_score ?? 0);

  document.getElementById("client-tags").innerHTML = client.tags
    .map((tag) => `<span class="badge">${tag}</span>`)
    .join("");

  document.getElementById("client-profile").innerHTML = [
    ["Возраст", client.age],
    ["Риск-профиль", client.risk_profile],
    ["Канал", client.preferred_channel],
    ["Доход", client.income_band],
    ["Свободный остаток", formatMoney(client.cash_balance)],
    ["Последний контакт", formatDateTime(client.last_contact_at)],
  ]
    .map(
      ([label, value]) => `
        <div class="meta-tile">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");

  document.getElementById("message-thread").innerHTML = messages.length
    ? messages
        .map(
          (message) => `
            <article class="message-bubble message-bubble--${message.sender === "manager" ? "manager" : "client"}">
              <div class="message-bubble__meta">
                <span>${message.sender === "manager" ? "Менеджер" : client.full_name}</span>
                <span>${formatDateTime(message.created_at)}</span>
              </div>
              <p>${message.text}</p>
            </article>
          `
        )
        .join("")
    : '<div class="empty-card">История сообщений пока отсутствует.</div>';

  document.getElementById("product-list").innerHTML = client.products.length
    ? client.products
        .map(
          (product) => `
            <article class="stack-item">
              <div class="section-title">
                <div>
                  <h3>${product.name}</h3>
                  <small>${product.category} • ${product.status}</small>
                </div>
                <span class="badge">${product.margin_level}</span>
              </div>
              <p>Баланс: ${formatMoney(product.balance, product.currency)}</p>
              <p>Риск: ${product.risk_level} • Открыт: ${formatDateTime(product.opened_at)}</p>
            </article>
          `
        )
        .join("")
    : '<div class="empty-card">Портфель пока пуст.</div>';

  populatePriorityModal(selectedDialog);
  renderAiPanel();
  renderMiniSummaryStatus();
  renderAssistantWidget();
}

async function loadDialogs() {
  const dialogsResponse = await apiGet(
    `/dialogs?manager_id=${encodeURIComponent(state.currentManagerId)}&sort_by=${encodeURIComponent(state.currentSortBy)}`
  );
  state.dialogs = dialogsResponse.items;
  state.clientDetails = {};

  if (state.selectedClientId && !state.dialogs.some((dialog) => dialog.client_id === state.selectedClientId)) {
    state.selectedClientId = null;
    resetAiState();
  }

  renderStats();
  renderDialogList();
  renderMiniDialogList();

  if (state.selectedClientId) {
    await selectDialog(state.selectedClientId);
  } else {
    renderClientDetail();
  }

  renderAssistantWidget();
}

async function selectDialog(clientId) {
  if (clientId !== state.selectedClientId) {
    resetAiState();
  }

  if (!state.clientDetails[clientId]) {
    state.clientDetails[clientId] = await apiGet(`/client/${clientId}`);
  }

  state.aiDraft = getPersistedDraft(state.clientDetails[clientId]);
  state.selectedClientId = clientId;
  renderDialogList();
  renderMiniDialogList();
  renderClientDetail();
  renderAssistantWidget();
}

function resetToDialogList() {
  state.selectedClientId = null;
  resetAiState();
  renderDialogList();
  renderMiniDialogList();
  renderClientDetail();
  renderAssistantWidget();
}

function handleComposerSubmit(event) {
  event.preventDefault();
  composerInput.value = "";
}

async function handleGenerateAiSummary() {
  const detail = getSelectedDetail();
  if (!detail) {
    return;
  }

  const conversation = detail.conversations?.[0];
  if (!conversation) {
    state.aiStatus = { type: "error", text: "Для клиента нет диалога, который можно обработать." };
    state.aiSaveStatus = null;
    renderAiPanel();
    renderMiniSummaryStatus();
    return;
  }

  state.aiLoading = true;
  state.aiStatus = { type: "loading", text: "Генерируем сводку и CRM-заметку..." };
  state.aiSaveStatus = null;
  renderAiPanel();

  try {
    const response = await apiPost("/ai/summarize-dialog", {
      client_id: detail.client.id,
      conversation_id: conversation.id,
      manager_id: detail.client.manager_id,
    });
    state.aiDraft = response.draft;
    state.aiMeta = {
      model_name: response.model_name,
      generated_at: response.generated_at,
    };
    state.clientDetails[detail.client.id] = await apiGet(`/client/${detail.client.id}`);
    state.aiDraft = cloneDraft(response.draft);
    state.dialogs = state.dialogs.map((dialog) =>
      dialog.client_id === detail.client.id
        ? { ...dialog, mini_summary: response.draft.contact_summary }
        : dialog
    );
    state.aiStatus = {
      type: "success",
      text: `Черновик готов (${response.model_name}). Проверьте и сохраните в CRM.`,
    };
  } catch (error) {
    console.error(error);
    state.aiStatus = {
      type: "error",
      text: error.message || "Не удалось сгенерировать сводку.",
    };
  } finally {
    state.aiLoading = false;
    renderDialogList();
    renderMiniDialogList();
    renderClientDetail();
  }
}

async function handleSaveAiDraft() {
  const detail = getSelectedDetail();
  if (!detail || !state.aiDraft) {
    return;
  }

  state.aiSaving = true;
  state.aiSaveStatus = { type: "loading", text: "Сохраняем..." };
  renderAiPanel();

  try {
    const conversation = detail.conversations?.[0];
    await apiPost("/crm-note", {
      client_id: detail.client.id,
      manager_id: detail.client.manager_id,
      note_text: state.aiDraft.crm_note_draft,
      outcome: state.aiDraft.outcome,
      channel: conversation?.channel,
      follow_up_date: state.aiDraft.follow_up_required ? state.aiDraft.follow_up_date : null,
      follow_up_reason: state.aiDraft.follow_up_reason,
      summary_text: state.aiDraft.contact_summary,
      source_conversation_id: conversation?.id || null,
      ai_generated: true,
      ai_draft_payload: state.aiDraft,
    });

    state.clientDetails[detail.client.id] = await apiGet(`/client/${detail.client.id}`);
    state.aiDraft = getPersistedDraft(state.clientDetails[detail.client.id]) || cloneDraft(state.aiDraft);
    state.aiSaveStatus = { type: "success", text: "CRM-заметка сохранена." };
  } catch (error) {
    console.error(error);
    state.aiSaveStatus = {
      type: "error",
      text: error.message || "Не удалось сохранить CRM-заметку.",
    };
  } finally {
    state.aiSaving = false;
    renderClientDetail();
  }
}

async function loadAssistantThread(threadId) {
  state.assistantSelectedThreadId = threadId;
  state.assistantView = "chat";
  renderAssistantWidget();
  const detail = await apiGet(`/assistant/threads/${encodeURIComponent(threadId)}`);
  state.assistantThreadDetail = detail;
  state.assistantThreads = state.assistantThreads.map((thread) =>
    thread.id === detail.thread.id ? detail.thread : thread
  );
  renderAssistantWidget();
}

async function loadAssistantThreads() {
  state.assistantLoading = true;
  state.assistantStatus = { type: "loading", text: "Загружаем историю ассистента..." };
  renderAssistantWidget();

  try {
    const response = await apiGet(`/assistant/threads?manager_id=${encodeURIComponent(state.currentManagerId)}`);
    state.assistantThreads = response.items || [];

    if (
      state.assistantSelectedThreadId &&
      !state.assistantThreads.some((thread) => thread.id === state.assistantSelectedThreadId)
    ) {
      state.assistantSelectedThreadId = null;
      state.assistantThreadDetail = null;
    }

    if (!state.assistantSelectedThreadId && state.assistantThreads.length) {
      state.assistantSelectedThreadId = state.assistantThreads[0].id;
    }

    if (state.assistantSelectedThreadId) {
      await loadAssistantThread(state.assistantSelectedThreadId);
    }

    state.assistantStatus = null;
  } catch (error) {
    console.error(error);
    state.assistantStatus = {
      type: "error",
      text: error.message || "Не удалось загрузить историю ассистента.",
    };
  } finally {
    state.assistantLoading = false;
    renderAssistantWidget();
  }
}

async function createAssistantThread() {
  const response = await apiPost("/assistant/threads", {
    manager_id: state.currentManagerId,
    selected_client_id: state.selectedClientId || null,
    title: state.selectedClientId ? getAssistantScopeClientLabel() : null,
  });
  const thread = response.thread;
  state.assistantThreads = [thread, ...state.assistantThreads.filter((item) => item.id !== thread.id)];
  state.assistantSelectedThreadId = thread.id;
  state.assistantThreadDetail = { thread, messages: [] };
  state.assistantView = "chat";
  state.assistantStatus = null;
  renderAssistantWidget();
  return thread.id;
}

function startAssistantDraftThread() {
  state.assistantSelectedThreadId = null;
  state.assistantThreadDetail = {
    thread: buildAssistantDraftThread(),
    messages: [],
  };
  state.assistantView = "chat";
  state.assistantStatus = null;
  renderAssistantWidget();
}

async function syncAssistantActionResult(actionResult) {
  if (!actionResult?.draft || !actionResult.client_id) {
    return;
  }

  const clientId = actionResult.client_id;
  state.clientDetails[clientId] = await apiGet(`/client/${clientId}`);
  state.aiDraft = cloneDraft(actionResult.draft);
  state.aiMeta = null;
  state.aiStatus = { type: "success", text: "Черновик подготовлен через AI-ассистента." };
  state.aiSaveStatus = null;
  state.dialogs = state.dialogs.map((dialog) =>
    dialog.client_id === clientId
      ? { ...dialog, mini_summary: actionResult.draft.contact_summary }
      : dialog
  );
}

async function sendAssistantMessage(messageText) {
  const message = (messageText || assistantInput?.value || "").trim();
  if (!message) {
    return;
  }

  state.assistantSending = true;
  state.assistantView = "chat";
  state.assistantStatus = { type: "loading", text: "Ассистент готовит ответ..." };
  renderAssistantWidget();

  try {
    const threadId = state.assistantSelectedThreadId || (await createAssistantThread());
    const response = await apiPost("/assistant/chat", {
      manager_id: state.currentManagerId,
      thread_id: threadId,
      message,
      selected_client_id: state.selectedClientId || null,
    });

    state.assistantThreads = [
      response.thread,
      ...state.assistantThreads.filter((thread) => thread.id !== response.thread.id),
    ];
    state.assistantSelectedThreadId = response.thread.id;
    state.assistantThreadDetail = await apiGet(`/assistant/threads/${encodeURIComponent(response.thread.id)}`);

    if (assistantInput && assistantInput.value.trim() === message) {
      assistantInput.value = "";
    }

    await syncAssistantActionResult(response.action_result);
    state.assistantStatus = {
      type: "success",
      text: response.action_result?.draft
        ? "Сводка и CRM-черновик готовы."
        : response.action_result?.sales_script_draft
          ? "Скрипт продажи готов."
          : "Ответ ассистента готов.",
    };
  } catch (error) {
    console.error(error);
    state.assistantStatus = {
      type: "error",
      text: error.message || "Не удалось получить ответ ассистента.",
    };
  } finally {
    state.assistantSending = false;
    renderDialogList();
    renderMiniDialogList();
    renderClientDetail();
    renderAssistantWidget();
  }
}

async function openAssistantWidget() {
  state.assistantOpen = true;
  state.assistantView = "list";
  renderAssistantWidget();
  await loadAssistantThreads();
}

function closeAssistantWidget() {
  state.assistantOpen = false;
  state.assistantView = "list";
  renderAssistantWidget();
}

async function bootstrap() {
  try {
    await apiGet("/health");
    updateFormulaPreview();
    await loadDialogs();
  } catch (error) {
    console.error(error);
  }
}

if (sortToggleButton) {
  sortToggleButton.addEventListener("click", () => {
    state.currentSortBy = getNextSortBy(state.currentSortBy);
    loadDialogs().catch(console.error);
  });
}

if (managerToggleButton) {
  managerToggleButton.addEventListener("click", () => {
    state.currentManagerId = getNextManagerId(state.currentManagerId);
    resetAssistantState();
    loadDialogs()
      .then(() => {
        if (state.assistantOpen) {
          return loadAssistantThreads();
        }
        return null;
      })
      .catch(console.error);
  });
}

backToListButton.addEventListener("click", resetToDialogList);
composerForm.addEventListener("submit", handleComposerSubmit);

if (generateAiSummaryButton) {
  generateAiSummaryButton.addEventListener("click", () => {
    handleGenerateAiSummary().catch(console.error);
  });
}

if (regenerateSummaryButton) {
  regenerateSummaryButton.addEventListener("click", () => {
    handleGenerateAiSummary().catch(console.error);
  });
}

if (saveAiDraftButton) {
  saveAiDraftButton.addEventListener("click", () => {
    handleSaveAiDraft().catch(console.error);
  });
}

if (aiOutcomeSelect) {
  aiOutcomeSelect.addEventListener("change", () => {
    if (!state.aiDraft) {
      return;
    }
    state.aiDraft.outcome = aiOutcomeSelect.value;
  });
}

if (aiCrmNoteText) {
  aiCrmNoteText.addEventListener("input", () => {
    if (!state.aiDraft) {
      return;
    }
    state.aiDraft.crm_note_draft = aiCrmNoteText.value;
  });
}

if (aiContactSummary) {
  aiContactSummary.addEventListener("input", () => {
    if (!state.aiDraft) {
      return;
    }
    state.aiDraft.contact_summary = aiContactSummary.value;
  });
}

if (aiFollowUpDate) {
  aiFollowUpDate.addEventListener("change", () => {
    if (!state.aiDraft) {
      return;
    }
    state.aiDraft.follow_up_date = fromFollowUpInputValue(aiFollowUpDate.value, aiFollowUpTime.value);
    state.aiDraft.follow_up_required = Boolean(state.aiDraft.follow_up_date);
  });
}

if (aiFollowUpTime) {
  aiFollowUpTime.addEventListener("input", () => {
    aiFollowUpTime.value = sanitizeTimeInput(aiFollowUpTime.value);
  });

  aiFollowUpTime.addEventListener("change", () => {
    if (!state.aiDraft) {
      return;
    }
    state.aiDraft.follow_up_date = fromFollowUpInputValue(aiFollowUpDate.value, aiFollowUpTime.value);
    state.aiDraft.follow_up_required = Boolean(state.aiDraft.follow_up_date);
  });
}

if (aiFollowUpReason) {
  aiFollowUpReason.addEventListener("input", () => {
    if (!state.aiDraft) {
      return;
    }
    state.aiDraft.follow_up_reason = aiFollowUpReason.value || null;
  });
}

if (priorityOpenButton) {
  priorityOpenButton.addEventListener("click", () => {
    const detail = getSelectedDetail();
    openPriorityModal(detail?.dialog_recommendation || getDialogByClientId(state.selectedClientId));
  });
}
if (closeModalButton) {
  closeModalButton.addEventListener("click", closePriorityModal);
}
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", closePriorityModal);
}

if (assistantLauncherButton) {
  assistantLauncherButton.addEventListener("click", () => {
    if (state.assistantOpen) {
      closeAssistantWidget();
      return;
    }
    openAssistantWidget().catch(console.error);
  });
}

if (assistantWidgetBackdrop) {
  assistantWidgetBackdrop.addEventListener("click", closeAssistantWidget);
}

if (assistantWidgetCloseButton) {
  assistantWidgetCloseButton.addEventListener("click", closeAssistantWidget);
}

if (assistantNewThreadButton) {
  assistantNewThreadButton.addEventListener("click", () => {
    startAssistantDraftThread();
  });
}

if (assistantBackButton) {
  assistantBackButton.addEventListener("click", () => {
    state.assistantView = "list";
    renderAssistantWidget();
  });
}

assistantQuickActionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sendAssistantMessage(button.dataset.assistantPrompt).catch(console.error);
  });
});

if (assistantForm) {
  assistantForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendAssistantMessage().catch(console.error);
  });
}

if (assistantInput) {
  assistantInput.addEventListener("input", () => {
    renderAssistantWidget();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePriorityModal();
    closeAssistantWidget();
  }
});

weightInputs.forEach((input) => {
  input.addEventListener("input", () => {
    state.weights[input.id.split("-")[1]] = Number(input.value || 0);
    updateFormulaPreview();
  });
});

contextTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveContextTab(button.dataset.contextTab);
  });
});

bootstrap();
