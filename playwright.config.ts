import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Every run gets a fresh, isolated record store in the OS temp folder: no saved game from a
// previous run, and nothing written under the project's real data/ directory.
const dataDir = mkdtempSync(join(tmpdir(), 'seven-powers-e2e-'));

// The test server can never bill. The key is set to an empty string before the server starts, and
// dotenv never overrides a variable that is already set, so a developer's .env key is not loaded.
// Tests that need the live setup UI fake /api/health and /api/models in the browser instead.
const serverEnv = { PORT: '3012', DATA_DIR: dataDir, OPENROUTER_API_KEY: '' };

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
    command: `pnpm build && OPENROUTER_API_KEY= PORT=3012 DATA_DIR=${dataDir} pnpm start`,
    env: serverEnv,
    url: 'http://127.0.0.1:3012/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
