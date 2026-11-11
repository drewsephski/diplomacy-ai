import { test, expect, type Page } from '@playwright/test';
import {
  clearUserGames,
  createSandbox,
  expectNoRunsFor,
  fakeLive,
  getGame,
  guideCard,
  historyTab,
  listGames,
  moment,
  navTab,
  openFromHistory,
  playSandbox,
  primary,
  samplePhases,
  settle,
  statusLine,
  trackTraffic,
  type Traffic,
} from './helpers';

/**
 * Watch-session regressions from docs/review/independent-review.md (H1-H4, M1-M7, L3). Each test
 * counts the run requests (one phase each; in a live game up to 21 billed model calls) and pause
 * requests the page sends, and asserts the session state the viewer sees. Sandbox games run on the
 * isolated test server for free; live games are browser-side fakes, so nothing here can bill.
 */
test.setTimeout(60_000);

const setGuided = (page: Page, on: boolean) =>
  page.addInitScript((v) => localStorage.setItem('seven-powers-guided', v), on ? '1' : '0');

/** Steps a card to its phase summary with the Next buttons only, as a reader would. */
async function readToSummary(page: Page) {
  const card = guideCard(page);
  for (let i = 0; i < 12; i++) {
    if (await card.locator('.guide-next').count()) return;
    await card.getByRole('button', { name: /^(Next|Reveal the orders|Phase summary)\s*$/ }).click();
  }
  throw new Error('The card never reached its summary');
}

/** Opens a sandbox game and starts watching it from the footer. Guided: waits for the first popup. */
async function startWatching(page: Page, name: string, guided: boolean) {
  await openFromHistory(page, name);
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  if (guided) {
    await expect(guideCard(page)).toBeVisible({ timeout: 20_000 });
    await expect(statusLine(page)).toContainText('Reading');
  } else {
    await expect(page.locator('.timeline-labels')).toContainText('Moment 2 of', { timeout: 20_000 });
  }
}

/** After an action that must end automatic play: no new run, the server goes idle, and the record stops growing. */
async function expectStopped(page: Page, traffic: Traffic, request: Parameters<typeof settle>[0], id: string) {
  await expectNoRunsFor(page, traffic, 3500);
  const settled = await settle(request, id);
  await page.waitForTimeout(1500);
  const after = await getGame(request, id);
  expect(after.turns.length).toBe(settled.turns.length);
  expect(after.status).not.toBe('running');
  expect(traffic.runs.filter((r) => r.id === id).length).toBeGreaterThan(0);
}

test.beforeEach(async ({ request }) => {
  await clearUserGames(request);
});

// N1: a rejected start must not leave an active session waiting behind another game's request.
for (const entry of ['Setup', 'footer'] as const) {
  test(`${entry} start during another pending response stops cleanly and requires an explicit retry`, async ({ page, request }) => {
    await setGuided(page, false);
    const a = await createSandbox(request, 'Pending response', 40);
    if (entry === 'footer') await createSandbox(request, 'New game', 40);
    const t = trackTraffic(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let delivered = false;
    await page.route(`**/api/matches/${a.id}/run`, async (route) => {
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
      delivered = true;
    });
    try {
      await page.goto('/');
      await openFromHistory(page, 'Pending response');
      await primary(page).click();
      await expect.poll(() => t.runsFor(a.id)).toBe(1);
      if (entry === 'Setup') {
        await page.locator('.new-simulation').click();
        await page.getByRole('button', { name: /No-cost sandbox/ }).click();
        await page.getByLabel('Game name').fill('New game');
        for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
        await page.getByRole('button', { name: 'Start game', exact: true }).click();
      } else {
        await openFromHistory(page, 'New game');
        await primary(page).click();
      }
      await expect(page.getByRole('alert')).toContainText('The previous request is still finishing.');
      await expect(statusLine(page)).not.toContainText('Playing');
      if (entry === 'Setup') await page.getByRole('button', { name: 'Close dialog' }).click();
      await expect(primary(page)).toHaveText('Play first phase (free)');
      const b = (await listGames(request)).find((g) => g.name === 'New game')!;
      expect(t.runsFor(b.id)).toBe(0);
      release();
      await expect.poll(() => delivered).toBe(true);
      await expectNoRunsFor(page, t, 2500);
      await expect(statusLine(page)).toHaveText(
        entry === 'Setup' ? 'Ready · press Play first phase to begin' : 'Stopped · see the message above',
      );
      expect((await getGame(request, b.id)).turns).toHaveLength(0);
      await primary(page).click();
      await expect.poll(() => t.runsFor(b.id)).toBe(1);
      await primary(page).click();
      await settle(request, b.id);
    } finally {
      release();
    }
  });
}

// ---------- H3: guided live play opens each phase, holds it, and continues only on request ----------

test('guided Start game: the first phase opens by itself, holds, and Continue watching asks for exactly one more phase', async ({ page }) => {
  await setGuided(page, true);
  const t = trackTraffic(page);
  await page.goto('/');
  await page.locator('.new-simulation').click();
  await page.getByRole('button', { name: /No-cost sandbox/ }).click();
  await page.getByLabel('Game name').fill('Guided start');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();

  // The first phase's walkthrough opens on its own; the game waits, and the status says so.
  const card = guideCard(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(statusLine(page)).toHaveText('Reading · the next phase waits for Continue watching');
  expect(t.runs.length).toBe(1);
  await expectNoRunsFor(page, t, 3500);

  // Back and Next move at the reader's pace.
  const kicker = () => card.locator('.guide-kicker').evaluate((el) => el.textContent ?? '');
  const first = await kicker();
  if (await card.getByRole('button', { name: /^(Next|Reveal the orders)\s*$/ }).count()) {
    await card.getByRole('button', { name: /^(Next|Reveal the orders)\s*$/ }).click();
    await card.getByRole('button', { name: 'Back' }).click();
    await expect.poll(kicker).toBe(first);
  }
  await readToSummary(page);
  await expect(card.locator('.guide-next')).toContainText('waits until you press Continue watching');
  await expect(card).not.toContainText('Nothing runs until you choose');
  await card.getByRole('button', { name: /^Continue watching/ }).click();

  // Exactly one more phase, then the next popup opens and holds again.
  await expect.poll(() => t.runs.length).toBe(2);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(statusLine(page)).toContainText('Reading');
  await expect.poll(kicker).not.toBe(first);
  await expectNoRunsFor(page, t, 3000);
  expect(t.runs.length).toBe(2);

  // An explicit Pause is never undone by finishing the card: the summary offers Resume, not Continue.
  await expect(primary(page)).toHaveText('Pause game');
  await primary(page).click();
  await expect(statusLine(page)).toHaveText('Reading · nothing is playing');
  await readToSummary(page);
  await expect(card.getByRole('button', { name: /^Continue watching/ })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /^Resume game: keep playing/ })).toBeVisible();
  await card.getByRole('button', { name: 'Done' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.guide-ready')).toHaveCount(0);
  await expectNoRunsFor(page, t, 3500);
  await expect(statusLine(page)).toHaveText('Paused · press Resume game to keep playing');
});

test('guided watch: the final phase opens its card, offers See the result, and nothing more is requested', async ({ page, request }) => {
  await setGuided(page, true);
  await createSandbox(request, 'One phase game', 1);
  const t = trackTraffic(page);
  await page.goto('/');
  await startWatching(page, 'One phase game', true);
  await readToSummary(page);
  await expect(guideCard(page).locator('.guide-next')).toContainText('final phase');
  await guideCard(page).getByRole('button', { name: /^See the result/ }).click();
  await expect(page.locator('.end-screen')).toContainText('Stopped at the phase limit');
  await expectNoRunsFor(page, t, 3000);
  expect(t.runs.length).toBe(1);
});

test('expert watch: plays continuously to the limit, one request per phase, and no popups', async ({ page, request }) => {
  await setGuided(page, false);
  await createSandbox(request, 'Expert game', 3);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Expert game');
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 3 of 3', { timeout: 30_000 });
  await expect(page.locator('.end-screen')).toContainText('Stopped at the phase limit');
  await expect(guideCard(page)).toHaveCount(0);
  await expectNoRunsFor(page, t, 2500);
  expect(t.runs.length).toBe(3);
});

// ---------- H2 / M1 / M2: every dialog, toggle, tab, hidden page, and seek ends automatic play ----------

type Interrupt = { name: string; act: (page: Page) => Promise<void>; after?: (page: Page) => Promise<void> };
const interrupts: Interrupt[] = [
  { name: 'How to watch dialog', act: (p) => p.getByRole('button', { name: 'How to watch' }).click(), after: (p) => p.keyboard.press('Escape') },
  { name: 'Country details dialog', act: (p) => p.getByRole('button', { name: 'Country details' }).click(), after: (p) => p.getByRole('button', { name: 'Close dialog' }).click() },
  { name: 'Set up a game dialog', act: (p) => p.locator('.new-simulation').click(), after: (p) => p.getByRole('button', { name: 'Close dialog' }).click() },
  { name: 'Guided view toggle', act: (p) => p.getByRole('switch', { name: 'Guided view' }).click() },
  { name: 'Conversations tab', act: (p) => navTab(p, 'Conversations').click(), after: (p) => navTab(p, 'Watch').click() },
  { name: 'Timeline tab', act: (p) => navTab(p, 'Timeline').click(), after: (p) => navTab(p, 'Watch').click() },
  { name: 'Compared with history tab', act: (p) => navTab(p, 'Compared with history').click(), after: (p) => navTab(p, 'Watch').click() },
  { name: 'History tab', act: (p) => historyTab(p).click(), after: (p) => navTab(p, 'Watch').click() },
  {
    name: 'hidden browser tab',
    act: (p) =>
      p.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }),
    after: (p) =>
      p.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }),
  },
  { name: 'seek to the opening', act: (p) => p.getByRole('button', { name: /^Seek moment 0:/ }).click() },
];
const cardInterrupts: Interrupt[] = [
  { name: 'card close button', act: (p) => guideCard(p).getByRole('button', { name: 'Pause and close guide' }).click() },
  { name: 'Escape on the card', act: async (p) => {
    await guideCard(p).locator('h3').focus();
    await p.keyboard.press('Escape');
  } },
  { name: 'Turn guidance off', act: (p) => guideCard(p).getByRole('button', { name: 'Turn guidance off and pause' }).click() },
];

for (const guided of [true, false]) {
  for (const it of guided ? [...interrupts, ...cardInterrupts] : interrupts) {
    test(`${guided ? 'guided hold' : 'expert watch'}: ${it.name} ends automatic play, and returning needs Resume`, async ({ page, request }) => {
      await setGuided(page, guided);
      const game = await createSandbox(request, `Interrupt ${it.name}`, 40);
      const t = trackTraffic(page);
      await page.goto('/');
      await startWatching(page, game.name, guided);
      await it.act(page);
      await expectStopped(page, t, request, game.id);
      if (it.after) await it.after(page);
      await expectNoRunsFor(page, t, 2500);
      await expect(statusLine(page)).not.toContainText('Playing');
      await expect(statusLine(page)).not.toContainText('Reading · the next');
    });
  }
}

// ---------- H1: a stopped session never comes back ----------

test('a watch survives nothing: failed Setup start, then reopening the old game from History sends no request', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Game A', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await startWatching(page, 'Game A', false);
  // Any other game's start fails (as when the server refuses a second active job, or the network drops).
  await page.route('**/run', (route) =>
    route.request().url().includes(a.id) ? route.continue() : route.fulfill({ status: 500, json: { error: 'Simulated start failure.' } }),
  );
  await page.locator('.new-simulation').click();
  await page.getByRole('button', { name: /No-cost sandbox/ }).click();
  const aRuns = t.runsFor(a.id);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Simulated start failure');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await settle(request, a.id);
  await openFromHistory(page, 'Game A');
  await expectNoRunsFor(page, t, 5000);
  expect(t.runsFor(a.id)).toBe(aRuns);
  await expect(statusLine(page)).toHaveText('Paused · press Resume game to keep playing');
});

test('a late run response for a game you left is ignored and paused with its ticket; reopening it plays nothing', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Left game', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Left game');
  await page.route(`**/api/matches/${a.id}/run`, async (route) => {
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect.poll(() => t.runsFor(a.id)).toBe(1);
  await historyTab(page).click();
  await page.getByRole('button', { name: 'Open the recorded sample' }).click();
  await expect(page.locator('.match-name')).toContainText('The fragile peace');
  await page.waitForTimeout(4000);
  // The run's own ticket was used to pause it, and the old response did not bring the game back.
  expect(t.pausesFor(a.id)).toBeGreaterThanOrEqual(1);
  expect(t.pauses.filter((p) => p.id === a.id).every((p) => p.ticket === t.runs[0].ticket)).toBe(true);
  await expect(page.locator('.match-name')).toContainText('The fragile peace');
  const settled = await settle(request, a.id);
  expect(settled.turns.length).toBeLessThanOrEqual(1);
  await openFromHistory(page, 'Left game');
  await expectNoRunsFor(page, t, 4000);
  expect(t.runsFor(a.id)).toBe(1);
});

test('a refresh during a watch never resumes it', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Refreshed game', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await startWatching(page, 'Refreshed game', false);
  await page.reload();
  await expect(page.locator('.match-name')).toContainText('Refreshed game');
  const runs = t.runs.length;
  await page.waitForTimeout(4000);
  expect(t.runs.length).toBe(runs);
  const settled = await settle(request, a.id);
  await page.waitForTimeout(1500);
  expect((await getGame(request, a.id)).turns.length).toBe(settled.turns.length);
});

// ---------- H4: Pause always reaches the server and wins ----------

test('Pause pressed before the run reaches the server cancels that run: no phase is played', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Pause first game', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Pause first game');
  // The run request is held in transit; the pause overtakes it.
  await page.route(`**/api/matches/${a.id}/run`, async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect.poll(() => t.runsFor(a.id)).toBe(1);
  await expect(primary(page)).toHaveText('Pause game');
  await primary(page).click();
  expect(t.pausesFor(a.id)).toBe(1);
  expect(t.pauses[0].ticket).toBe(t.runs[0].ticket);
  await expect(primary(page)).toHaveText('Pausing…');
  await expect(primary(page)).toBeDisabled();
  await expect(primary(page)).toHaveText('Play first phase (free)', { timeout: 10_000 });
  const after = await settle(request, a.id);
  expect(after.turns.length).toBe(0);
  await expectNoRunsFor(page, t, 3000);
  expect(t.runs.length).toBe(1);
  await expect(statusLine(page)).toHaveText('Ready · press Play first phase to begin');
});

test('Pause pressed while the run response is pending pauses the job, shows Pausing until idle, and nothing more plays', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Pause pending game', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Pause pending game');
  // The server has the run; only its response is late.
  await page.route(`**/api/matches/${a.id}/run`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await new Promise((r) => setTimeout(r, 2500));
    // A live job can still be running when the delayed response reaches the viewer.
    await route.fulfill({ response, json: { ...body, status: 'running' } });
  });
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect.poll(() => t.runsFor(a.id)).toBe(1);
  await primary(page).click();
  expect(t.pausesFor(a.id)).toBe(1);
  await expect(primary(page)).toHaveText('Pausing…');
  await expect(statusLine(page)).toContainText('Pausing');
  // Once the response arrives, the pause is sent again for the job that now exists.
  await expect.poll(() => t.pausesFor(a.id), { timeout: 8000 }).toBe(2);
  expect(t.pauses.every((p) => p.ticket === t.runs[0].ticket)).toBe(true);
  await expect(primary(page)).not.toHaveText('Pausing…', { timeout: 10_000 });
  const settled = await settle(request, a.id);
  expect(settled.turns.length).toBeLessThanOrEqual(1);
  await expectNoRunsFor(page, t, 3500);
  expect(t.runs.length).toBe(1);
  expect((await getGame(request, a.id)).turns.length).toBe(settled.turns.length);
});

// ---------- M3: dismissing Setup cancels the rest of a start ----------

test('closing Setup before the game is created: it is saved for History, never started, never shown', async ({ page, request }) => {
  await setGuided(page, true);
  const t = trackTraffic(page);
  await page.goto('/');
  await page.route('**/api/matches', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ response });
  });
  await page.locator('.new-simulation').click();
  await page.getByRole('button', { name: /No-cost sandbox/ }).click();
  await page.getByLabel('Game name').fill('Dismissed early');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.info-banner')).toContainText('was saved without starting', { timeout: 5000 });
  await page.waitForTimeout(2500);
  expect(t.runs.length).toBe(0);
  await expect(page.locator('.match-name')).toContainText('The fragile peace');
  const saved = (await (await request.get('/api/matches')).json()).filter((g: { name: string }) => g.name === 'Dismissed early');
  expect(saved).toHaveLength(1);
  expect(saved[0].phases).toBe(0);
});

for (const how of ['close button', 'backdrop'] as const) {
  test(`closing Setup (${how}) after its run was sent pauses that run and starts no watch`, async ({ page, request }) => {
    await setGuided(page, true);
    const t = trackTraffic(page);
    await page.goto('/');
    await page.route('**/run', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.locator('.new-simulation').click();
    await page.getByRole('button', { name: /No-cost sandbox/ }).click();
    await page.getByLabel('Game name').fill(`Dismissed late ${how}`);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await expect.poll(() => t.runs.length).toBe(1);
    if (how === 'close button') await page.getByRole('button', { name: 'Close dialog' }).click();
    else await page.mouse.click(4, 4);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(t.pauses).toHaveLength(1);
    expect(t.pauses[0].ticket).toBe(t.runs[0].ticket);
    await expect(page.locator('.info-banner')).toContainText('Start cancelled');
    await expect(page.locator('.match-name')).toContainText(`Dismissed late ${how}`);
    await expectNoRunsFor(page, t, 4000);
    const game = (await (await request.get('/api/matches')).json()).find((g: { name: string }) => g.name === `Dismissed late ${how}`);
    const settled = await settle(request, game.id);
    expect(settled.turns.length).toBe(0);
    await expect(statusLine(page)).toHaveText('Ready · press Play first phase to begin');
    await expect(guideCard(page)).toHaveCount(0);
  });
}

// ---------- M4: every record replays from its recorded positions, guided and timed, with no run ----------

type Record = { label: string; open: (page: Page, request: Parameters<typeof settle>[0]) => Promise<{ unfinished: boolean; live: boolean }> };
const LIVE_ID = '00000000-0000-4000-8000-0000000c0de1';
/** Adds a browser-side fake live record to the saved-games list the page loads. */
async function listFake(page: Page, fake: { id: string; name: string; status: string; turns: unknown[]; limits: { maxPhases: number }; createdAt: string }) {
  await page.route('**/api/matches', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const list = await response.json();
    list.push({
      id: fake.id,
      name: fake.name,
      mode: 'live',
      phases: fake.turns.length,
      phaseLimit: fake.limits.maxPhases,
      createdAt: fake.createdAt,
      status: fake.status,
      parentMissing: false,
      result: { kind: fake.status === 'complete' ? 'limit' : 'paused' },
      calls: 0,
      costUsd: 0,
    });
    await route.fulfill({ response, json: list });
  });
}
async function openFake(page: Page, request: Parameters<typeof settle>[0], status: string, phases: number) {
  const fake = await fakeLive(request, { id: LIVE_ID, name: `Live ${status}`, status, phases });
  await listFake(page, fake);
  await page.route(`**/api/matches/${LIVE_ID}`, (r) => r.fulfill({ json: fake }));
  await page.route(`**/api/matches/${LIVE_ID}/run`, (r) => r.fulfill({ status: 500, json: { error: 'A replay must never run.' } }));
  await page.addInitScript((id) => localStorage.setItem('seven-powers-match', id), LIVE_ID);
  await page.goto('/');
  await expect(page.locator('.match-name')).toContainText(`Live ${status}`);
  await page.getByRole('button', { name: /^Seek moment 0:/ }).click();
}
const records: Record[] = [
  {
    label: 'recorded sample',
    open: async (page) => {
      await page.goto('/');
      await page.getByRole('button', { name: /^Seek moment 0:/ }).click();
      return { unfinished: false, live: false };
    },
  },
  {
    label: 'completed sandbox game',
    open: async (page, request) => {
      const g = await createSandbox(request, 'Finished sandbox', 3);
      await playSandbox(request, g.id);
      await page.goto('/');
      await openFromHistory(page, 'Finished sandbox', true);
      return { unfinished: false, live: false };
    },
  },
  {
    label: 'paused sandbox game',
    open: async (page, request) => {
      const g = await createSandbox(request, 'Paused sandbox', 40);
      for (let i = 0; i < 3; i++) await playSandbox(request, g.id, true);
      await page.goto('/');
      await openFromHistory(page, 'Paused sandbox', true);
      return { unfinished: true, live: false };
    },
  },
  { label: 'completed live game', open: async (page, request) => (await openFake(page, request, 'complete', 9), { unfinished: false, live: true }) },
  { label: 'paused live game', open: async (page, request) => (await openFake(page, request, 'paused', 3), { unfinished: true, live: true }) },
];

for (const record of records) {
  test(`${record.label}: guided replay from moment 0 walks recorded phases with no run request`, async ({ page, request }) => {
    await setGuided(page, true);
    const t = trackTraffic(page);
    const { unfinished, live } = await record.open(page, request);
    expect(await moment(page)).toEqual([0, expect.any(Number)]);
    await expect(primary(page)).toHaveText('Watch with a guide');
    if (unfinished)
      await expect(page.getByRole('button', { name: /^Resume at latest/ })).toContainText(live ? 'billed' : 'free');
    else await expect(page.getByRole('button', { name: /^Resume at latest/ })).toHaveCount(0);
    await primary(page).click();
    const card = guideCard(page);
    await expect(card).toBeVisible();
    // The walkthrough of phase 0 starts at its start (moment 0) and shows the board after it from the reveal on.
    expect((await moment(page))[0]).toBe(0);
    await readToSummary(page);
    expect((await moment(page))[0]).toBe(1);
    await card.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(card).toBeVisible();
    // The next phase also starts from its own start: moment 1, orders not revealed.
    expect((await moment(page))[0]).toBe(1);
    await readToSummary(page);
    expect((await moment(page))[0]).toBe(2);
    await expect(primary(page)).toHaveText('Close guide');
    await primary(page).click();
    await expect(card).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(t.runs.length).toBe(0);
  });

  test(`${record.label}: timed replay from moment 0 advances recorded phases with no run request`, async ({ page, request }) => {
    await setGuided(page, false);
    const t = trackTraffic(page);
    const { unfinished } = await record.open(page, request);
    expect((await moment(page))[0]).toBe(0);
    await expect(primary(page)).toHaveText('Play replay');
    if (unfinished) await expect(page.getByRole('button', { name: /^Resume at latest/ })).toBeVisible();
    await page.getByRole('combobox', { name: 'Replay speed' }).click();
    await page.getByRole('option', { name: '4×' }).click();
    await primary(page).click();
    await expect(page.locator('.timeline-labels')).toContainText('Moment 2 of', { timeout: 8000 });
    // L3: the free replay timer also stops behind a dialog.
    await page.getByRole('button', { name: 'How to watch' }).click();
    const [held] = await moment(page);
    await page.waitForTimeout(2000);
    expect((await moment(page))[0]).toBe(held);
    await page.keyboard.press('Escape');
    await expect(primary(page)).not.toHaveText('Pause replay');
    expect(t.runs.length).toBe(0);
  });
}

// ---------- M5: request and connection errors are shown, stop automatic play, and retry cleanly ----------

test('a failed run request during a watch is shown, stops automatic play, and Resume retries once and clears it', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Failing game', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Failing game');
  let n = 0;
  await page.route(`**/api/matches/${a.id}/run`, (route) =>
    ++n === 2 ? route.fulfill({ status: 500, json: { error: 'Simulated network failure.' } }) : route.continue(),
  );
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  const banner = page.locator('.error-banner');
  await expect(banner).toContainText('The next phase could not be requested: Simulated network failure.', { timeout: 15_000 });
  await expect(banner).toContainText('Nothing further was sent');
  expect(t.runs.length).toBe(2);
  await expectNoRunsFor(page, t, 3500);
  await expect(statusLine(page)).toHaveText('Stopped · see the message above');
  // The message belongs to this game only.
  await historyTab(page).click();
  await page.getByRole('button', { name: 'Open the recorded sample' }).click();
  await expect(page.locator('.error-banner')).toHaveCount(0);
  await openFromHistory(page, 'Failing game');
  await expect(page.locator('.error-banner')).toHaveCount(0);
  await expectNoRunsFor(page, t, 1500);
  await page.getByRole('button', { name: /^Resume game/ }).click();
  await expect.poll(() => t.runs.length).toBe(3);
  await expect(page.locator('.error-banner')).toHaveCount(0);
  await primary(page).click();
});

test('after a Setup start, a later failed request is still shown in the banner and stops automatic play', async ({ page }) => {
  await setGuided(page, false);
  const t = trackTraffic(page);
  await page.goto('/');
  let n = 0;
  await page.route('**/run', (route) =>
    ++n === 2 ? route.fulfill({ status: 500, json: { error: 'Simulated second-phase failure.' } }) : route.continue(),
  );
  await page.locator('.new-simulation').click();
  await page.getByRole('button', { name: /No-cost sandbox/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.locator('.error-banner')).toContainText('Simulated second-phase failure.', { timeout: 15_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(t.runs.length).toBe(2);
  await expectNoRunsFor(page, t, 3000);
});

test('losing contact while a phase plays stops automatic play, asks the server to pause, and says so', async ({ page, request }) => {
  await setGuided(page, false);
  const paused = await fakeLive(request, { id: LIVE_ID, name: 'Unreachable game', status: 'paused', phases: 1 });
  const running = { ...paused, status: 'running', pending: { round: 0, messages: [], negotiated: [], decisions: {}, sealedCount: 0 } };
  let loaded = false;
  await listFake(page, paused);
  await page.route(`**/api/matches/${LIVE_ID}`, (r) => {
    if (!loaded) {
      loaded = true;
      return r.fulfill({ json: paused });
    }
    return r.abort('internetdisconnected');
  });
  await page.route(`**/api/matches/${LIVE_ID}/run`, (r) => r.fulfill({ json: running }));
  await page.route(`**/api/matches/${LIVE_ID}/pause`, (r) => r.fulfill({ json: { ok: true, settling: true } }));
  await page.addInitScript((id) => localStorage.setItem('seven-powers-match', id), LIVE_ID);
  const t = trackTraffic(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Resume game/ }).click();
  await expect(page.locator('.error-banner')).toContainText('Lost contact with the server', { timeout: 10_000 });
  await expect.poll(() => t.pausesFor(LIVE_ID)).toBeGreaterThanOrEqual(1);
  expect(t.pauses[0].ticket).toBe(t.runs[0].ticket);
  await expectNoRunsFor(page, t, 4000);
  expect(t.runs.length).toBe(1);
});

// ---------- M7: a late response never replaces the game on screen ----------

test('a late single-phase response for the previous game never replaces the game now on screen', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Stepped game', 40);
  await playSandbox(request, a.id, true);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Stepped game');
  await page.route(`**/api/matches/${a.id}/run`, async (route) => {
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: /^Play next phase \(free\)/ }).click();
  await expect.poll(() => t.runsFor(a.id)).toBe(1);
  await historyTab(page).click();
  await page.getByRole('button', { name: 'Open the recorded sample' }).click();
  await expect(page.locator('.match-name')).toContainText('The fragile peace');
  await page.waitForTimeout(4000);
  await expect(page.locator('.match-name')).toContainText('The fragile peace');
  await expect(page.locator('.timeline-labels')).toContainText(`of ${await samplePhases(request)}`);
  expect(t.pausesFor(a.id)).toBeGreaterThanOrEqual(1);
  await openFromHistory(page, 'Stepped game');
  await expectNoRunsFor(page, t, 3000);
  expect(t.runsFor(a.id)).toBe(1);
});

test('a slow open is superseded by a newer one: only the latest game opened is shown', async ({ page, request }) => {
  await setGuided(page, false);
  const slow = await createSandbox(request, 'Slow game', 4);
  await page.goto('/');
  await page.route(`**/api/matches/${slow.id}`, async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await historyTab(page).click();
  await page.getByRole('button', { name: 'Open Slow game' }).click();
  // The Watch tab shows while the slow game loads; a newer open (the sample card) wins.
  await page.getByRole('button', { name: /^Watch the first negotiation/ }).click();
  await page.waitForTimeout(3000);
  await expect(page.locator('.match-name')).toContainText('The fragile peace');
});

// ---------- Full real-sandbox flow ----------

test('full flow on a real sandbox: Start, first guided phase, Continue, Pause, History, saved replay, and a branch', async ({ page }) => {
  await setGuided(page, true);
  const t = trackTraffic(page);
  await page.goto('/');
  await page.locator('.new-simulation').click();
  await page.getByRole('button', { name: /No-cost sandbox/ }).click();
  await page.getByLabel('Game name').fill('Full flow game');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  const card = guideCard(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await readToSummary(page);
  await card.getByRole('button', { name: /^Continue watching/ }).click();
  await expect.poll(() => t.runs.length).toBe(2);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await primary(page).click(); // Pause game
  await expect(statusLine(page)).toHaveText('Reading · nothing is playing');
  await guideCard(page).getByRole('button', { name: 'Close guide' }).click();
  await expect(statusLine(page)).toHaveText('Paused · press Resume game to keep playing');

  await historyTab(page).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Full flow game' });
  await expect(row).toContainText('2 of 6 phases');
  await row.getByRole('button', { name: 'Replay Full flow game from the start' }).click();
  await expect(primary(page)).toHaveText('Watch with a guide');
  await primary(page).click();
  await readToSummary(page);
  await card.getByRole('button', { name: 'Continue', exact: true }).click();
  await readToSummary(page);
  await expect(card.getByRole('button', { name: /^Resume game: keep playing/ })).toBeVisible();
  await card.getByRole('button', { name: 'Done' }).click();
  expect(t.runs.length).toBe(2);

  await page.getByRole('button', { name: /^Seek moment 0:/ }).click();
  await page.getByRole('button', { name: 'Try a different decision' }).click();
  await page.getByRole('combobox', { name: 'Replace one legal order' }).click();
  await page.getByRole('option', { name: 'Fleet Brest moves to Mid-Atlantic Ocean' }).click();
  await page.getByRole('button', { name: 'Create alternate timeline', exact: true }).click();
  await expect(page.getByText('A different decision. A different Europe.')).toBeVisible();
  await expectNoRunsFor(page, t, 2000);
  expect(t.runs.length).toBe(2);
});
