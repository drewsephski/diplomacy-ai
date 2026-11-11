import { test, type APIRequestContext, type Page } from '@playwright/test';

// Documentation captures. Run deliberately with CAPTURE_SCREENSHOTS=1 so routine test runs do not
// rewrite the images in docs/. Every game shown is created in this run's isolated record store.
test.skip(!process.env.CAPTURE_SCREENSHOTS, 'Set CAPTURE_SCREENSHOTS=1 to refresh docs images.');
test.setTimeout(150_000);

const POWER_KEYS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];
const configs = Object.fromEntries(POWER_KEYS.map((p) => [p, { model: 'z-ai/glm-5.3-flash', profile: 'strategist' }]));

async function seedHistory(request: APIRequestContext) {
  const created = await request.post('/api/matches', {
    data: {
      name: 'Two-phase walkthrough',
      mode: 'sandbox',
      configs,
      limits: { maxPhases: 2, budgetUsd: 5, maxOutputTokens: 1800, diplomacyRounds: 2 },
    },
  });
  const { id } = await created.json();
  await request.post(`/api/matches/${id}/run`, { data: { single: false } });
  for (let i = 0; i < 60; i++) {
    const m = await (await request.get(`/api/matches/${id}`)).json();
    if (m.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await request.post('/api/matches', {
    data: {
      name: 'Waiting game',
      mode: 'sandbox',
      configs,
      limits: { maxPhases: 6, budgetUsd: 5, maxOutputTokens: 1800, diplomacyRounds: 2 },
    },
  });
}

async function openHistory(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('heading', { name: 'History', exact: true }).waitFor();
}

test('capture setup, guided card, and history on desktop and mobile', async ({ page, request }) => {
  await seedHistory(request);
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '0'));
  // Catalog-only fakes so the live setup (presets, prices) renders. No call reaches a provider.
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, liveConfigured: true, running: [] } }));
  await page.route('**/api/models', (r) =>
    r.fulfill({
      json: [
        { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', input: 0.00000004, output: 0.00000008, context: 200000 },
        { id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5', input: 0.0000001, output: 0.0000005, context: 200000 },
      ],
    }),
  );

  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Europe, on the brink.' }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/desktop.png' });

  await page.locator('.new-simulation').click();
  await page.getByText('Advanced: models, behaviour, and each country').click();
  await page.getByRole('button', { name: /Economical mix/ }).click();
  await page.getByRole('combobox', { name: 'Germany model' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/setup-desktop.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.screenshot({ path: 'docs/setup-start-desktop.png' });
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await openHistory(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/history-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'docs/history-mobile.png' });

  await page.goto('/');
  await page.getByRole('heading', { name: 'Europe, on the brink.' }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/mobile.png' });
  await page.locator('.new-simulation').click();
  await page.getByText('Advanced: models, behaviour, and each country').click();
  await page.getByRole('combobox', { name: 'Germany model' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/setup-mobile.png' });
});

test('capture a guided card on a recorded phase', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '1'));
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Europe, on the brink.' }).waitFor();
  await page.getByRole('button', { name: /Watch a labelled sample with a guide/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/guided-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/guided-mobile.png' });
});
