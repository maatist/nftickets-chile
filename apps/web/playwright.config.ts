import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the web app's happy-path E2E test (Requirement R13.4).
 *
 * The test runs entirely over the MOCK providers, so no external services or
 * credentials are needed. `webServer` builds and starts the Next app with the
 * mock provider flags forced on, regardless of any local `.env`, so the E2E
 * run is deterministic.
 *
 * E2E specs live in `apps/web/e2e/**` — deliberately OUTSIDE `src/**`, so the
 * vitest `test` script (which globs `src/**\/*.test.{ts,tsx}`) never picks them
 * up and `turbo run test` stays a pure unit-test gate.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Mock provider flags forced on for a deterministic, credential-free E2E run. */
const MOCK_ENV = {
  NEXT_PUBLIC_AUTH_PROVIDER: "mock",
  NEXT_PUBLIC_DATA_PROVIDER: "mock",
  NEXT_PUBLIC_STORAGE_PROVIDER: "mock",
} as const;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Build once, then serve the production build for a fast, stable run.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...MOCK_ENV,
      PORT: String(PORT),
    },
  },
});
