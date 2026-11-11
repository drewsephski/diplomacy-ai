import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// Documentation captures. Run deliberately with CAPTURE_SCREENSHOTS=1 so routine test runs do not
// rewrite the images in docs/. Every game shown is created in this run's isolated record store.
test.skip(!process.env.CAPTURE_SCREENSHOTS, 'Set CAPTURE_SCREENSHOTS=1 to refresh docs images.');
test.setTimeout(150_000);

const POWER_KEYS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];
const configs = Object.fromEntries(POWER_KEYS.map((p) => [p, { model: 'z-ai/glm-5.3-flash', profile: 'strategist' }]));
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1536, height: 1024 };

async function seedHistory(request: APIRequestContext) {
  const created = await request.post('/api/matches', {
    data: { name: 'Two-phase walkthrough', mode: 'sandbox', configs, limits: { maxPhases: 2, budgetUsd: 5, maxOutputTokens: 1800, diplomacyRounds: 2 } },
  });
  const { id } = await created.json();
  await request.post(`/api/matches/${id}/run`, { data: { single: false } });
  for (let i = 0; i < 60; i++) {
    const m = await (await request.get(`/api/matches/${id}`)).json();
    if (m.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await request.post('/api/matches', {
    data: { name: 'Waiting game', mode: 'sandbox', configs, limits: { maxPhases: 6, budgetUsd: 5, maxOutputTokens: 1800, diplomacyRounds: 2 } },
  });
}

/** Catalog-only fakes so the live setup (presets, prices) renders. No call reaches a provider. */
async function fakeCatalog(page: Page) {
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, liveConfigured: true, running: [] } }));
  await page.route('**/api/models', (r) =>
    r.fulfill({
      json: [
        { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', input: 0.00000004, output: 0.00000008, context: 200000 },
        { id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5', input: 0.0000001, output: 0.0000005, context: 200000 },
      ],
    }),
  );
}

const welcome = (page: Page) => page.getByRole('button', { name: /^Watch the first negotiation/ });
const card = (page: Page) => page.locator('.guide-card');
const next = (page: Page) => card(page).getByRole('button', { name: /^(Next|Reveal the orders|Phase summary)\s*$/ });

async function stepTo(page: Page, headline: string) {
  for (let i = 0; i < 14 && !(await card(page).locator('h3').first().innerText()).includes(headline); i++) await next(page).click();
  await expect(card(page).locator('h3').first()).toContainText(headline);
  await page.waitForTimeout(500);
}

async function openTab(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1536) <= 760) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
}

test('capture the first negotiation on a phone: welcome, talks, reveal, broken promise, conversations, What if?', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '1'));
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await welcome(page).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/mobile.png' });
  await welcome(page).click();
  await card(page).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/guided-mobile.png' });
  await stepTo(page, 'Britain and France');
  await page.screenshot({ path: 'docs/mobile-talks.png' });
  await stepTo(page, 'The orders are revealed');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'docs/mobile-reveal.png' });
  await stepTo(page, 'France broke its promise to Britain');
  await page.screenshot({ path: 'docs/mobile-broken-promise.png' });
  for (let i = 0; i < 10 && !(await card(page).locator('.guide-next').count()); i++) await next(page).click();
  await card(page).getByRole('button', { name: 'Explore this alternate timeline' }).click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/mobile-whatif.png' });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  if (await card(page).count()) await card(page).getByRole('button', { name: 'Close guide', exact: true }).click();
  await openTab(page, 'Conversations');
  await page.locator('.cv-row.pair').filter({ hasText: 'France' }).filter({ hasText: 'Britain' }).first().locator('.cv-row-main').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/mobile-conversations.png' });
});

test('capture the desktop stage, the walkthrough, conversations, the What if? dialog, and the comparison', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '1'));
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await welcome(page).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/desktop.png' });
  await welcome(page).click();
  await card(page).waitFor();
  await stepTo(page, 'Britain and France');
  await page.screenshot({ path: 'docs/guided-desktop.png' });
  await stepTo(page, 'France broke its promise to Britain');
  await page.screenshot({ path: 'docs/reveal-desktop.png' });
  for (let i = 0; i < 10 && !(await card(page).locator('.guide-next').count()); i++) await next(page).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/summary-desktop.png' });
  await card(page).getByRole('button', { name: 'Explore this alternate timeline' }).click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/whatif-desktop.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'Create alternate timeline', exact: true }).click();
  await page.locator('.comparison').waitFor();
  await page.getByRole('button', { name: /^Play next phase \(free\)/ }).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 1 of 1', { timeout: 20_000 });
  await openTab(page, 'Alternate timeline');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/comparison-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Open the original at the branch moment' }).click();
  await page.locator('.match-name').filter({ hasText: 'The fragile peace' }).waitFor();
  await openTab(page, 'Conversations');
  await page.locator('.cv-row.pair').filter({ hasText: 'France' }).filter({ hasText: 'Britain' }).first().locator('.cv-row-main').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/conversations-desktop.png' });
});

test('capture setup and history on desktop and phone', async ({ page, request }) => {
  await seedHistory(request);
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '0'));
  await fakeCatalog(page);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.locator('.new-simulation').click();
  await page.getByText('Advanced: models, behaviour, and each country').click();
  await page.getByRole('button', { name: /Economical mix/ }).click();
  await page.getByRole('combobox', { name: 'Germany model' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/setup-desktop.png' });
  await page.keyboard.press('Escape');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.screenshot({ path: 'docs/setup-start-desktop.png' });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await openTab(page, 'History');
  await page.getByRole('heading', { name: 'History', exact: true }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/history-desktop.png' });

  await page.setViewportSize(PHONE);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/history-mobile.png' });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: /^Set up a game/ }).click();
  await page.getByText('Advanced: models, behaviour, and each country').click();
  await page.getByRole('combobox', { name: 'Germany model' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/setup-mobile.png' });
});

test('capture a guided watch holding its first phase', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '1'));
  const created = await request.post('/api/matches', {
    data: { name: 'Guided watch', mode: 'sandbox', configs, limits: { maxPhases: 6, budgetUsd: 5, maxOutputTokens: 1800, diplomacyRounds: 2 } },
  });
  const { id } = await created.json();
  await page.addInitScript((v) => localStorage.setItem('seven-powers-match', v), id);
  await page.addInitScript(() => localStorage.setItem('seven-powers-intro-hidden', '1'));
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.getByRole('button', { name: /^Play first phase/ }).click();
  await card(page).waitFor({ timeout: 20_000 });
  for (let i = 0; i < 14 && !(await card(page).locator('.guide-next').count()); i++) await next(page).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/guided-watch-desktop.png' });
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'docs/guided-watch-mobile.png' });
  await card(page).getByRole('button', { name: 'Pause and close guide' }).click();
});
