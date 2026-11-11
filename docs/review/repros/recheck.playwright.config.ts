import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
const dataDir = mkdtempSync(join(tmpdir(), 'seven-powers-recheck-'));
export default defineConfig({
  testDir: '.',
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3012', viewport: { width: 1536, height: 1024 } },
  webServer: {
    command: `cd /Users/drewsepeczi/.t3/projects/7powers && OPENROUTER_API_KEY= PORT=3012 DATA_DIR=${dataDir} npx tsx server/index.ts`,
    env: { PORT: '3012', DATA_DIR: dataDir, OPENROUTER_API_KEY: '' },
    url: 'http://127.0.0.1:3012/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
