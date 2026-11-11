import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The History tab and its safety rules. Every record here lives in the isolated test store that
 * playwright.config.ts creates for this run. Model calls are either absent (sandbox) or replaced by
 * route fakes (the live start), so no paid request can be sent from this file.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '0'));
});

const POWER_KEYS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];
const configs = (model = 'z-ai/glm-5.3-flash') =>
  Object.fromEntries(POWER_KEYS.map((p) => [p, { model, profile: 'strategist' }]));
const limits = (maxPhases: number) => ({ maxPhases, budgetUsd: 5, maxOutputTokens: 1800, diplomacyRounds: 2 });

const historyTab = (page: Page) =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'History', exact: true });

async function listGames(request: APIRequestContext) {
  return (await (await request.get('/api/matches')).json()) as {
    id: string;
    name: string;
    mode: string;
    status: string;
  }[];
}

/** Remove every non-sample record from this run's isolated store, so each test starts from a known state. */
async function clearUserGames(request: APIRequestContext) {
  for (const game of await listGames(request)) {
    if (game.mode === 'sample') continue;
    const res = await request.delete(`/api/matches/${game.id}`);
    expect(res.ok(), `clear ${game.name}`).toBe(true);
  }
}

async function createSandbox(request: APIRequestContext, name: string, maxPhases: number) {
  const res = await request.post('/api/matches', {
    data: { name, mode: 'sandbox', configs: configs(), limits: limits(maxPhases) },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string };
}

/** Plays a sandbox game to its limit through the server (no model calls) and waits until it settles. */
async function playToLimit(request: APIRequestContext, id: string) {
  await request.post(`/api/matches/${id}/run`, { data: { single: false } });
  for (let i = 0; i < 60; i++) {
    const m = await (await request.get(`/api/matches/${id}`)).json();
    if (m.status !== 'running') return m;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('The sandbox game did not settle');
}

test('with no saved games, History says so, offers Start game, and lists the sample separately', async ({ page, request }) => {
  await clearUserGames(request);
  await page.goto('/');
  await historyTab(page).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No games yet' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your saved games' })).toHaveCount(0);
  await expect(page.getByText('RECORDED SAMPLE · NOT COUNTED AS YOUR GAME')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open the recorded sample' })).toBeVisible();
  await page.locator('.saved-empty').getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Who plays?' })).toBeVisible();
});

test('saved games show their true result, opening one never plays it, and a limit is not a win', async ({ page, request }) => {
  await clearUserGames(request);
  const limited = await createSandbox(request, 'Limit game', 2);
  await playToLimit(request, limited.id);
  await createSandbox(request, 'Waiting game', 4);

  await page.goto('/');
  await historyTab(page).click();
  const rows = page.getByRole('listitem');
  await expect(rows.filter({ hasText: 'Limit game' })).toContainText('Stopped at the phase limit after 2 phases');
  await expect(rows.filter({ hasText: 'Limit game' })).not.toContainText(/won/i);
  await expect(rows.filter({ hasText: 'Waiting game' })).toContainText('Paused after 0 of 4 phases');

  // Opening a game loads it. No run request may be sent by selecting or opening it.
  let runs = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/run$/.test(r.url())) runs++;
  });
  await page.getByRole('button', { name: 'Open Waiting game' }).click();
  await expect(page.locator('.match-name')).toContainText('Waiting game');
  await expect(page.locator('.match-status')).toContainText('Ready · press Play first phase to begin');
  await expect(page.getByRole('button', { name: /^Play first phase/ })).toBeVisible();
  await page.waitForTimeout(800);
  expect(runs).toBe(0);
});

test('deleting asks first, removes the game for good, and an open game falls back to the sample', async ({ page, request }) => {
  await clearUserGames(request);
  const doomed = await createSandbox(request, 'Doomed game', 3);

  await page.goto('/');
  await historyTab(page).click();
  await page.getByRole('button', { name: 'Open Doomed game' }).click();
  await expect(page.locator('.match-name')).toContainText('Doomed game');

  await historyTab(page).click();
  await page.getByRole('button', { name: 'Delete Doomed game' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this saved game?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep game' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Doomed game' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete Doomed game' }).click();
  await page.getByRole('dialog', { name: 'Delete this saved game?' }).getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Doomed game' })).toHaveCount(0);
  await expect(page.locator('.match-name')).toContainText('The fragile peace');
  await expect(page.locator('.mode-label')).toContainText('RECORDED SAMPLE');
  expect((await request.get(`/api/matches/${doomed.id}`)).status()).toBe(404);
});

test('a deleted original leaves its alternate timeline playable and labelled, not broken', async ({ page, request }) => {
  await clearUserGames(request);
  const original = await createSandbox(request, 'Original game', 3);
  const branchRes = await request.post(`/api/matches/${original.id}/branch`, {
    data: {
      at: 0,
      mode: 'sandbox',
      intervention: { power: 'ENGLAND', profile: 'diplomat' },
      limits: limits(3),
    },
  });
  expect(branchRes.ok()).toBe(true);
  const branch = await branchRes.json();
  expect((await request.delete(`/api/matches/${original.id}`)).ok()).toBe(true);

  await page.goto('/');
  await historyTab(page).click();
  const row = page.getByRole('listitem').filter({ hasText: branch.name });
  await expect(row).toContainText('Its original game was deleted');
  await row.getByRole('button', { name: `Open ${branch.name}` }).click();
  await expect(page.locator('.match-name')).toContainText(branch.name);
  await expect(page.locator('.error-banner')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Alternate timeline' }).click();
  await expect(page.getByText('The original game was deleted, so this alternate timeline has nothing to compare against.')).toBeVisible();
});

test('switching to History stops the watch session: no further phase is requested after the switch', async ({ page, request }) => {
  await clearUserGames(request);
  await createSandbox(request, 'Watched game', 40);
  await page.goto('/');
  await historyTab(page).click();
  await page.getByRole('button', { name: 'Open Watched game' }).click();
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 2 of', { timeout: 20_000 });

  await historyTab(page).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  // One request may still be settling. After it does, the count must stop changing.
  await page.waitForTimeout(2500);
  const settled = await (await request.get(`/api/matches/${(await listGames(request)).find((g) => g.name === 'Watched game')!.id}`)).json();
  await page.waitForTimeout(3000);
  const after = await (await request.get(`/api/matches/${settled.id}`)).json();
  expect(after.turns.length).toBe(settled.turns.length);
  expect(after.status).not.toBe('running');
});

test('a live start creates the game once and requests its first phase once, however often Start is pressed', async ({ page, request }) => {
  await clearUserGames(request);
  const sample = (await listGames(request)).find((g) => g.mode === 'sample')!;
  const base = await (await request.get(`/api/matches/${sample.id}`)).json();
  let creates = 0;
  let runs = 0;
  const liveId = '00000000-0000-4000-8000-00000000abcd';

  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, liveConfigured: true, running: [] } }));
  await page.route('**/api/models', (r) =>
    r.fulfill({
      json: [
        { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', input: 0.00000004, output: 0.00000008, context: 200000 },
        { id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5', input: 0.000001, output: 0.000005, context: 200000 },
      ],
    }),
  );
  // The create call is fulfilled locally so no provider request is possible. The one-phase run returns a
  // single finished phase, so the test asserts requests, not gameplay.
  const fake = (status: string, phases: number) => ({
    ...base,
    id: liveId,
    name: 'Mocked live game',
    mode: 'live',
    status,
    createdAt: new Date().toISOString(),
    turns: base.turns.slice(0, phases),
    checkpoints: base.checkpoints.slice(0, phases + 1),
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0, actualUsd: 0, unpricedCalls: 0 },
    pending: undefined,
    parent: undefined,
    intervention: undefined,
  });
  await page.route('**/api/matches', async (route) => {
    if (route.request().method() === 'POST') {
      creates++;
      await route.fulfill({ status: 201, json: fake('paused', 0) });
    } else await route.continue();
  });
  await page.route(`**/api/matches/${liveId}/run`, async (route) => {
    runs++;
    await route.fulfill({ json: fake('complete', 1) });
  });

  await page.goto('/');
  // Nothing is requested while the viewer configures a game.
  await page.locator('.new-simulation').click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Who plays?' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  expect({ creates, runs }).toEqual({ creates: 0, runs: 0 });

  // Two rapid presses in one gesture: the second must not create or run anything.
  await page.getByRole('button', { name: 'Start game', exact: true }).dblclick();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 1 of 1');
  await page.waitForTimeout(2500);
  expect({ creates, runs }).toEqual({ creates: 1, runs: 1 });
});

test('when the first phase fails to start, the saved game is kept and only the start is retried', async ({ page, request }) => {
  await clearUserGames(request);
  const sample = (await listGames(request)).find((g) => g.mode === 'sample')!;
  const base = await (await request.get(`/api/matches/${sample.id}`)).json();
  let creates = 0;
  let runs = 0;
  const liveId = '00000000-0000-4000-8000-00000000beef';
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, liveConfigured: true, running: [] } }));
  await page.route('**/api/models', (r) =>
    r.fulfill({ json: [{ id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', input: 0.00000004, output: 0.00000008, context: 200000 }] }),
  );
  const record = {
    ...base,
    id: liveId,
    name: 'Retry game',
    mode: 'live',
    status: 'paused',
    createdAt: new Date().toISOString(),
    turns: [],
    checkpoints: base.checkpoints.slice(0, 1),
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0, actualUsd: 0, unpricedCalls: 0 },
    pending: undefined,
    parent: undefined,
  };
  await page.route('**/api/matches', async (route) => {
    if (route.request().method() === 'POST') {
      creates++;
      await route.fulfill({ status: 201, json: record });
    } else await route.continue();
  });
  await page.route(`**/api/matches/${liveId}/run`, async (route) => {
    runs++;
    if (runs === 1) await route.fulfill({ status: 400, json: { error: 'Provider timed out before the first phase.' } });
    else await route.fulfill({ json: { ...record, status: 'complete', turns: base.turns.slice(0, 1), checkpoints: base.checkpoints.slice(0, 2) } });
  });

  await page.goto('/');
  await page.locator('.new-simulation').click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Provider timed out');
  await expect(page.getByRole('button', { name: 'Try starting again' })).toBeVisible();
  await page.getByRole('button', { name: 'Try starting again' }).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 1 of 1');
  expect({ creates, runs }).toEqual({ creates: 1, runs: 2 });
});

test('mobile History: no horizontal overflow and the row actions stay reachable', async ({ page, request }) => {
  await clearUserGames(request);
  await createSandbox(request, 'A long name for a phone-sized history row that should wrap cleanly', 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await historyTab(page).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: /^Open A long name/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Delete A long name/ })).toBeVisible();
});
