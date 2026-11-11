import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 40_000,
  use: {
    baseURL: 'http://127.0.0.1:3012',
    viewport: { width: 1536, height: 1024 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && PORT=3012 DATA_DIR=.test-data pnpm start',
    url: 'http://127.0.0.1:3012/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
