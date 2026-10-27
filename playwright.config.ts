import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL, trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
        env: {
          DATABASE_URL:
            process.env.DATABASE_URL || 'postgresql://carrot:carrot@127.0.0.1:5432/carrot',
          REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
          NAS_ROOT: process.env.NAS_ROOT || '.local/nas',
          MOCK_EXTERNAL: '1',
        },
      },
});
