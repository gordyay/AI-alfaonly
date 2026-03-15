const state = {
  dialogs: [],
  clientDetails: {},
  selectedClientId: null,
  weights: {
    w1: 0.25,
    w2: 0.3,
    w3: 0.2,
    w4: 0.15,
    w5: 0.1,
  },
};

const mockPriorityByClient = {
  c1: 76,
  c2: 88,
  c3: 73,
  c4: 91,
  c5: 82,
  c6: 69,
};

const workspace = document.querySelector(".workspace");
const dialogList = document.getElementById("dialog-list");
const miniDialogList = document.getElementById("mini-dialog-list");
const managerSelect = document.getElementById("manager-select");
const refreshButton = document.getElementById("refresh-button");
const filtersForm = document.getElementById("filters-form");
const detailView = document.getElementById("detail-view");
const emptyState = document.getElementById("empty-state");
const priorityModal = document.getElementById("priority-modal");
const priorityOpenButton = document.getElementById("priority-open-button");
const closeModalButton = document.getElementById("close-modal-button");
const modalBackdrop = document.getElementById("modal-backdrop");
const backToListButton = document.getElementById("back-to-list-button");
const composerForm = document.getElementById("composer-form");
const composerInput = document.getElementById("composer-input");
const assistantComposerForm = document.getElementById("assistant-composer-form");
const assistantInput = document.getElementById("assistant-input");
const weightInputs = ["w1", "w2", "w3", "w4", "w5"].map((key) => document.getElementById(`weight-${key}`));

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

function lastName(name) {
  const parts = name.split(" ");
  return parts.length > 1 ? parts[1] : parts[0];
}

function getSelectedDetail() {
  return state.selectedClientId ? state.clientDetails[state.selectedClientId] || null : null;
}

async function apiGet(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function updateFormulaPreview() {
  document.getElementById("formula-weights").textContent =
    `PriorityScore = ${state.weights.w1.toFixed(2)}*T_wait + ${state.weights.w2.toFixed(2)}*C_value + ` +
    `${state.weights.w3.toFixed(2)}*U_comm + ${state.weights.w4.toFixed(2)}*P_sale + ${state.weights.w5.toFixed(2)}*R_churn`;
}

function openPriorityModal() {
  priorityModal.classList.remove("hidden");
}

function closePriorityModal() {
  priorityModal.classList.add("hidden");
}

function renderStats() {
  document.getElementById("active-task-count").textContent = "0";
  document.getElementById("focused-client-count").textContent = String(state.dialogs.length);
  document.getElementById("app-stage").textContent = "dialogs";
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
    article.className = `dialog-card${dialog.client.id === state.selectedClientId ? " is-active" : ""}`;
    article.innerHTML = `
      <button class="dialog-card__priority" type="button" data-priority-open="true">${dialog.priority}</button>
      <div class="avatar">${initials(dialog.client.full_name)}</div>
      <div class="dialog-card__body">
        <h3>${dialog.client.full_name}</h3>
        <p class="dialog-card__summary">${dialog.lastMessagePreview}</p>
        <p class="dialog-card__meta">${dialog.miniSummary}</p>
      </div>
    `;
    article.addEventListener("click", (event) => {
      if (event.target.closest("[data-priority-open='true']")) {
        event.stopPropagation();
        openPriorityModal();
        return;
      }
      selectDialog(dialog.client.id).catch(console.error);
    });
    dialogList.appendChild(article);
  });
}

function renderMiniDialogList() {
  miniDialogList.innerHTML = state.dialogs
    .map(
      (dialog) => `
        <button class="mini-dialog-pill${dialog.client.id === state.selectedClientId ? " is-active" : ""}" type="button" data-client-id="${dialog.client.id}">
          <div class="avatar">${initials(dialog.client.full_name)}</div>
          <span class="mini-dialog-pill__name">${lastName(dialog.client.full_name)}</span>
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

function renderClientDetail() {
  const detail = getSelectedDetail();

  if (!detail) {
    detailView.classList.add("hidden");
    emptyState.classList.remove("hidden");
    renderWorkspaceMode();
    return;
  }

  const { client, conversations } = detail;
  const conversation = conversations[0] || null;
  const messages = conversation ? conversation.messages : [];
  const priority = mockPriorityByClient[client.id] ?? 70;

  detailView.classList.remove("hidden");
  emptyState.classList.add("hidden");
  renderWorkspaceMode();

  document.getElementById("client-name").textContent = client.full_name;
  document.getElementById("client-subtitle").textContent =
    `${client.city} • ${client.occupation} • manager ${client.manager_id}`;
  document.getElementById("mini-summary").textContent = client.notes_summary || "Мини-summary пока не заполнен";
  document.getElementById("portfolio-value").textContent = formatMoney(client.portfolio_value);
  document.getElementById("churn-risk").textContent = client.churn_risk;
  document.getElementById("next-contact").textContent = formatDateTime(client.next_contact_due_at);
  document.getElementById("client-summary").textContent =
    client.notes_summary || "Расширенный контекст клиента пока не заполнен.";
  priorityOpenButton.textContent = String(priority);

  document.getElementById("client-tags").innerHTML = client.tags
    .map((tag) => `<span class="badge">${tag}</span>`)
    .join("");

  document.getElementById("client-profile").innerHTML = [
    ["Возраст", client.age],
    ["Risk profile", client.risk_profile],
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
}

function buildDialogs(clients) {
  state.dialogs = clients
    .map((client) => {
      const detail = state.clientDetails[client.id];
      const conversation = detail?.conversations?.[0] || null;
      const lastMessage = conversation?.messages?.[conversation.messages.length - 1] || null;
      return {
        client,
        priority: mockPriorityByClient[client.id] ?? 70,
        miniSummary: client.notes_summary || "Mock mini summary пока не заполнен",
        lastMessagePreview: lastMessage
          ? `${lastMessage.sender === "manager" ? "Вы" : "Клиент"}: ${lastMessage.text}`
          : "Нет недавних сообщений",
      };
    })
    .sort((left, right) => right.priority - left.priority);
}

async function loadDialogs() {
  const managerId = managerSelect.value;
  const clientsResponse = await apiGet(`/clients?manager_id=${encodeURIComponent(managerId)}`);
  const clients = clientsResponse.items;
  const details = await Promise.all(clients.map((client) => apiGet(`/client/${client.id}`)));
  state.clientDetails = Object.fromEntries(details.map((detail) => [detail.client.id, detail]));

  buildDialogs(clients);
  renderStats();
  renderDialogList();
  renderMiniDialogList();
  renderClientDetail();
}

async function selectDialog(clientId) {
  if (!state.clientDetails[clientId]) {
    state.clientDetails[clientId] = await apiGet(`/client/${clientId}`);
  }

  state.selectedClientId = clientId;
  renderDialogList();
  renderMiniDialogList();
  renderClientDetail();
}

function resetToDialogList() {
  state.selectedClientId = null;
  renderDialogList();
  renderMiniDialogList();
  renderClientDetail();
}

function handleComposerSubmit(event) {
  event.preventDefault();
  composerInput.value = "";
}

function handleAssistantComposerSubmit(event) {
  event.preventDefault();
  assistantInput.value = "";
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

filtersForm.addEventListener("change", () => {
  loadDialogs().catch(console.error);
});

refreshButton.addEventListener("click", () => {
  loadDialogs().catch(console.error);
});

backToListButton.addEventListener("click", resetToDialogList);
composerForm.addEventListener("submit", handleComposerSubmit);
assistantComposerForm.addEventListener("submit", handleAssistantComposerSubmit);

if (priorityOpenButton) {
  priorityOpenButton.addEventListener("click", openPriorityModal);
}
if (closeModalButton) {
  closeModalButton.addEventListener("click", closePriorityModal);
}
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", closePriorityModal);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePriorityModal();
  }
});

weightInputs.forEach((input) => {
  input.addEventListener("input", () => {
    state.weights[input.id.split("-")[1]] = Number(input.value || 0);
    updateFormulaPreview();
  });
});

bootstrap();
