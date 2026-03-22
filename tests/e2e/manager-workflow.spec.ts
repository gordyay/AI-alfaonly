import { expect, test } from "@playwright/test";

test("manager can review a work item and save feedback loop state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Пропустить" }).click();

  await expect(page.getByRole("heading", { name: "План дня менеджера" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Полная очередь кейсов" })).toBeVisible();

  const firstItem = page.locator(".work-item-card").first();
  await expect(firstItem).toBeVisible();
  await firstItem.click();

  await expect(page.locator(".focus-panel__header h2")).toBeVisible();
  await page.getByRole("button", { name: "Принять" }).click();
  await page.getByPlaceholder("Почему рекомендация принята, доработана или отклонена").fill("Берем кейс в работу через cockpit.");
  await page.getByRole("button", { name: "Зафиксировать решение" }).click();

  await expect(page.getByText("Решение менеджера сохранено.")).toBeVisible();
  const supervisorPanel = page.locator(".supervisor-panel");
  await expect(supervisorPanel.getByText("Как используется помощник")).toBeVisible();
  await expect(supervisorPanel.getByText("Рекомендация менеджеру", { exact: true }).first()).toBeVisible();
});

test("search empty state is explicit and recoverable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Пропустить" }).click();

  const search = page.getByPlaceholder("Например, премиум карта, ликвидность или Елена Смирнова");
  await search.fill("несуществующий кейс");
  await expect(page.getByText("Очередь по текущему фильтру пуста")).toBeVisible();

  await search.fill("");
  await expect(page.locator(".work-item-card").first()).toBeVisible();
});
