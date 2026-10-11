import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Lets environments with a preinstalled Chromium skip `playwright install`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: [
    {
      // Real API with in-memory storage and the fake receipt parser.
      command: 'pnpm --filter @bill-splitter/api exec tsx src/index.ts',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      env: { PORT: '3000', NODE_ENV: 'test', RECEIPT_PARSER: 'fake' },
    },
    {
      command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
      port: PORT,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
