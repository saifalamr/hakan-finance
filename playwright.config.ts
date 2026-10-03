import { defineConfig } from "@playwright/test";
const production = process.env.E2E_PRODUCTION === "true";
export default defineConfig({
  testDir: "./tests",
  testMatch: production ? "production.spec.ts" : "browser.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      args: process.env.CHROMIUM_EXECUTABLE_PATH
        ? [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--single-process",
            "--no-zygote",
            "--in-process-gpu",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ]
        : [],
    },
  },
  webServer: {
    command: production
      ? "npm run start -- --port 3000"
      : "npm run dev -- --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      NEXT_PUBLIC_ENABLE_DEMO: "true",
      ...(!production
        ? {
            NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-placeholder",
          }
        : {}),
    },
  },
});
