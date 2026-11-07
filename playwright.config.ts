import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 180_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3418", actionTimeout: 15_000, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start -- --port 3418",
    url: "http://127.0.0.1:3418",
    timeout: 120_000,
    env: { POLICYDIFF_DATA_DIR: "memory://", DATABASE_URL: "", OPENROUTER_API_KEY: "", POLICYDIFF_DEMO_ONLY: "0" },
  },
});
