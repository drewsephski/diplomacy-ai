import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Every run gets a fresh, isolated record store in the OS temp folder: no saved game from a
// previous run, and nothing written under the project's real data/ directory.
const dataDir = mkdtempSync(join(tmpdir(), 'seven-powers-e2e-'));

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
    command: `pnpm build && PORT=3012 DATA_DIR=${dataDir} pnpm start`,
    url: 'http://127.0.0.1:3012/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
