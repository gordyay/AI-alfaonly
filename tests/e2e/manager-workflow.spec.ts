import { expect, test } from "@playwright/test";

test("manager can review a work item and save feedback loop state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Очередь кейсов" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Метрики использования" })).not.toBeVisible();
  await expect(page.getByRole("dialog", { name: "Помощник по кейсу" })).not.toBeVisible();

  const firstItem = page.locator(".work-item-card").first();
  await expect(firstItem).toBeVisible();
  await firstItem.click();

  await expect(page.locator(".focus-panel__header h2")).toBeVisible();
  await page.getByRole("button", { name: "Принять" }).click();
  await page.getByPlaceholder("Коротко зафиксируйте причину").fill("Берем кейс в работу через case workspace.");
  await page.getByRole("button", { name: "Зафиксировать решение" }).click();

  await expect(page.getByText("Решение менеджера сохранено.")).toBeVisible();
  await page.getByRole("button", { name: "Аналитика" }).click();

  const supervisorPanel = page.locator(".supervisor-panel");
  await expect(supervisorPanel.getByRole("heading", { name: "Метрики использования" })).toBeVisible();
  await expect(supervisorPanel.getByText("Показать аналитику")).toBeVisible();
});

test("search empty state is explicit and recoverable", async ({ page }) => {
  await page.goto("/");

  const search = page.getByPlaceholder("Клиент, кейс или продукт");
  await search.fill("несуществующий кейс");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();

  await search.fill("");
  await expect(page.locator(".work-item-card").first()).toBeVisible();
});

test("assistant opens only on demand", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("dialog", { name: "Помощник по кейсу" })).not.toBeVisible();
  await page.locator(".work-item-card").first().click();
  await page.getByRole("button", { name: "Помощник" }).click();

  await expect(page.getByRole("dialog", { name: "Помощник по кейсу" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть" }).click();
  await expect(page.getByRole("dialog", { name: "Помощник по кейсу" })).not.toBeVisible();
});

test("manager can send a reply from chat history and see it in history and CRM", async ({ page }) => {
  await page.goto("/");

  await page.locator(".work-item-card").first().click();
  await expect(page.getByRole("heading", { name: "Лента кейса" })).toBeVisible();

  const replyText = "Подтверждаю, сегодня до 18:00 пришлю короткое сравнение и следующий шаг.";
  await page.locator(".reply-composer textarea").fill(replyText);
  await page.getByRole("button", { name: "Отправить клиенту" }).click();
  await expect(page.locator(".message-thread--case")).toContainText(replyText);

  await page.locator(".focus-panel__tabs").getByRole("button", { name: "CRM", exact: true }).click();
  await expect(page.getByText("Исходящее сообщение клиенту")).toBeVisible();
  await expect(page.getByText(replyText)).toBeVisible();
});

test("guided tour can move across inbox, case, assistant and analytics from a case page", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("alfa_only_guided_tour_seen", "true");
  });
  await page.goto("/");
  const tour = page.getByLabel("Экскурсия по экрану");

  await page.locator(".work-item-card").first().click();
  await expect(page.locator(".focus-panel__header h2")).toBeVisible();

  await page.getByRole("button", { name: "Тур" }).click();
  await expect(tour.getByRole("heading", { name: "Верхняя навигация" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Очередь кейсов" })).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Очередь кейсов" })).toBeVisible();
  await expect(page.locator("main").getByRole("heading", { name: "Очередь кейсов" })).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Поиск и фильтры" })).toBeVisible();
  await expect(page.getByPlaceholder("Клиент, кейс или продукт")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Выбранный кейс" })).toBeVisible();
  await expect(page.locator("[data-tour='queue-selected-item']")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Работа по кейсу" })).toBeVisible();
  await expect(page.locator(".focus-panel__header h2")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Сводка по кейсу" })).toBeVisible();
  await expect(page.locator("[data-tour='case-summary-strip']")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Навигация внутри кейса" })).toBeVisible();
  await expect(page.locator("[data-tour='case-tabs']")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Ответ клиенту" })).toBeVisible();
  await expect(page.locator("[data-tour='case-reply']")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Сценарий контакта" })).toBeVisible();
  await expect(page.locator("[data-tour='case-actions-script']")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Черновик CRM" })).toBeVisible();
  await expect(page.locator("[data-tour='case-crm']")).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Помощник по запросу" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Помощник по кейсу" })).toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(tour.getByRole("heading", { name: "Отдельная аналитика" })).toBeVisible();
  await expect(page.locator(".supervisor-panel").getByRole("heading", { name: "Метрики использования" })).toBeVisible();

  await page.getByRole("button", { name: "Завершить" }).click();
  await expect(page.locator(".focus-panel__header h2")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Помощник по кейсу" })).not.toBeVisible();
});
