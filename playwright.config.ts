import { defineConfig, devices } from "@playwright/test";

// Сквозные сценарии интерфейса (отчёт §6.5, Табл. 27). Поднимает бэкенд (FastAPI)
// и собранный фронтенд (vite preview), затем прогоняет пользовательский путь
// менеджера в браузере. Запуск: npm run e2e (нужны установленные браузеры:
// npx playwright install chromium).

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Чистая база на каждый прогон — детерминированность E2E.
      command: "sh -c 'rm -f alfa_only.db alfa_only.db-wal alfa_only.db-shm; .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000'",
      cwd: "backend",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npm run preview",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
