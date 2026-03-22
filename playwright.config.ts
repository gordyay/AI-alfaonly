import { defineConfig } from "@playwright/test";

const e2ePort = process.env.E2E_PORT ?? "8140";
const baseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `PORT=${e2ePort} bash scripts/run_e2e_server.sh`,
    url: `${baseURL}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
