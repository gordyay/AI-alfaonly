import { expect, test } from "@playwright/test";

// Сквозной пользовательский путь менеджера (UC-01 → UC-06), отчёт §6.5.
// Проверяет, что фронтенд получает данные и ИИ-результаты с бэкенда по API.

test("очередь приоритизирована и кейс открывается", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Очередь на сегодня")).toBeVisible();
  // Очередь загрузилась с бэкенда.
  await expect(page.locator(".queue-card").first()).toBeVisible();
  // Верхний кейс выбран автоматически — видно рекомендуемое действие и объяснение.
  await expect(page.getByText("Рекомендуемое действие")).toBeVisible();
  await page.getByRole("button", { name: /Почему этот приоритет/ }).click();
  await expect(page.getByText(/Приоритет = 0,25/)).toBeVisible();
});

test("черновик ответа генерируется и отправляется после подтверждения (FR11)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".queue-card").first()).toBeVisible();
  const composer = page.getByLabel("Ответ клиенту");
  await page.getByRole("button", { name: /Черновик ассистента/ }).click();
  await expect(composer).not.toHaveValue("");
  await page.getByRole("button", { name: /Отправить/ }).click();
  await expect(page.getByText("Сообщение отправлено клиенту")).toBeVisible();
});

test("сценарий продаж даёт три варианта (FR3/FR5)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".queue-card").first()).toBeVisible();
  await page.getByRole("tab", { name: /Сценарий/ }).click();
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect(page.locator(".variant-tab")).toHaveCount(3);
  await expect(page.getByText("Структурный")).toBeVisible();
});

test("сводка контакта и черновик CRM формируются (FR6)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".queue-card").first()).toBeVisible();
  await page.getByRole("tab", { name: /Итог и CRM/ }).click();
  await page.getByRole("button", { name: /Сформировать сводку/ }).click();
  await expect(page.getByText("Черновик заметки в CRM")).toBeVisible();
});

test("ассистент отвечает на ограниченном контексте с источниками (NFR4)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".queue-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Ассистент", exact: true }).click();
  // Спрашиваем вводом (устойчиво к наличию истории: подсказки-чипы скрываются,
  // как только в кейсе уже есть переписка с ассистентом).
  const ask = page.getByLabel("Вопрос по кейсу");
  await ask.fill("Что предложить этому клиенту?");
  await ask.press("Enter");
  await expect(page.locator(".chat-turn--assistant").first()).toBeVisible();
  await expect(page.locator(".chat-turn__sources").first()).toBeVisible();
});

test("подбор под продукт ранжирует клиентов (UC-02)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Подбор под продукт/ }).click();
  await expect(page.getByText("Кому предложить продукт")).toBeVisible();
  await expect(page.locator(".ranked-item").first()).toBeVisible();
});

test("аналитика руководителя показывает метрики (UC-07)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Аналитика/ }).click();
  await expect(page.getByText("Использование рекомендаций")).toBeVisible();
  await expect(page.locator(".kpi-card")).toHaveCount(4);
});
