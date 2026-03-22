import { expect, test } from "@playwright/test";

test("manager can review a work item and save feedback loop state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "План дня менеджера" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Полная очередь кейсов" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сводка по использованию и качеству решений" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Помощь по текущему кейсу" })).not.toBeVisible();

  const firstItem = page.locator(".work-item-card").first();
  await expect(firstItem).toBeVisible();
  await firstItem.click();

  await expect(page.locator(".case-workspace-bar").getByText("Case Workspace")).toBeVisible();
  await expect(page.locator(".focus-panel__header h2")).toBeVisible();
  await page.getByRole("button", { name: "Принять" }).click();
  await page.getByPlaceholder("Почему рекомендация принята, доработана или отклонена").fill("Берем кейс в работу через cockpit.");
  await page.getByRole("button", { name: "Зафиксировать решение" }).click();

  await expect(page.getByText("Решение менеджера сохранено.")).toBeVisible();
  await page.getByRole("button", { name: "Аналитика" }).click();

  const supervisorPanel = page.locator(".supervisor-panel");
  await expect(supervisorPanel.getByRole("heading", { name: "Сводка по использованию и качеству решений" })).toBeVisible();
  await expect(supervisorPanel.getByText("Показать аналитику")).toBeVisible();
});

test("search empty state is explicit and recoverable", async ({ page }) => {
  await page.goto("/");

  const search = page.getByPlaceholder("Например, премиум карта, ликвидность или Елена Смирнова");
  await search.fill("несуществующий кейс");
  await expect(page.getByText("Очередь по текущему фильтру пуста")).toBeVisible();

  await search.fill("");
  await expect(page.locator(".work-item-card").first()).toBeVisible();
});

test("assistant opens only on demand", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Помощь по текущему кейсу" })).not.toBeVisible();
  await page.locator(".work-item-card").first().click();
  await page.getByRole("button", { name: "Открыть помощника" }).click();

  await expect(page.getByRole("heading", { name: "Помощь по текущему кейсу" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть" }).click();
  await expect(page.getByRole("heading", { name: "Помощь по текущему кейсу" })).not.toBeVisible();
});

test("manager can send a reply from chat history and see it in history and CRM", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Отправить клиенту компактное сравнение сценариев/i }).click();
  await page.locator(".focus-panel__tabs").getByRole("button", { name: "Обзор", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Чат с клиентом" })).toBeVisible();

  const replyText = "Подтверждаю, сегодня до 18:00 пришлю короткое сравнение и следующий шаг.";
  await page.locator(".reply-composer textarea").fill(replyText);
  await page.getByRole("button", { name: "Отправить клиенту" }).click();
  await expect(page.locator(".message-thread")).toContainText(replyText);

  await page.locator(".focus-panel__tabs").getByRole("button", { name: "CRM", exact: true }).click();
  await expect(page.getByText("Исходящее сообщение клиенту")).toBeVisible();
  await expect(page.getByText(replyText)).toBeVisible();
});

test("guided tour can move across inbox, case, assistant and analytics from a case page", async ({ page }) => {
  await page.goto("/");

  await page.locator(".work-item-card").first().click();
  await expect(page.locator(".case-workspace-bar").getByText("Case Workspace")).toBeVisible();

  await page.getByRole("button", { name: "Тур" }).click();
  await expect(page.getByRole("heading", { name: "Это новая верхняя навигация" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Полная очередь кейсов" })).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Inbox теперь отделён от рабочего места" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Полная очередь кейсов" })).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Выбранный кейс можно открыть отдельно" })).toBeVisible();
  await expect(page.getByText("Предвыбранный кейс")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Здесь находится рабочее место по кейсу" })).toBeVisible();
  await expect(page.locator(".case-workspace-bar").getByText("Case Workspace")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Помощник больше не живёт на экране постоянно" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Помощь по текущему кейсу" })).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Аналитика вынесена в отдельный режим" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supervisor-сводка вынесена из рабочего потока" })).toBeVisible();

  await page.getByRole("button", { name: "Завершить" }).click();
  await expect(page.locator(".case-workspace-bar").getByText("Case Workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Помощь по текущему кейсу" })).not.toBeVisible();
});
