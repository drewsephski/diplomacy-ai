import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { clearUserGames, createSandbox, expectNoRunsFor, historyTab, limits, listGames, navTab, openFromHistory, playSandbox, trackTraffic } from './helpers';

/**
 * The newcomer journey and the observer-experience guarantees (see the verification plan). Tests
 * that only use the History list, the server API, or pages owned by the integration agent run now.
 * Tests whose selectors depend on the final Watch-stage markup (welcome panel, country strip, phone
 * dock, guide beats, Conversations page) are `test.fixme` drafts: their steps are complete, and stage 2
 * confirms the selectors in `S` against the built app and turns them on.
 *
 * Nothing here can bill: the test server has no provider key, and live games are browser fakes only.
 */
test.setTimeout(60_000);

const PHONES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;
const DESKTOP = { width: 1536, height: 1024 };

/** Selectors owned by the Watch stage. Stage 2: verify each one against the final markup. */
const S = {
  welcome: (p: Page) => p.locator('.welcome'),
  watchFirst: (p: Page) => p.getByRole('button', { name: /^Watch the first negotiation/ }),
  exploreOwn: (p: Page) => p.getByRole('button', { name: 'Explore on my own' }),
  strip: (p: Page) => p.getByRole('group', { name: /^Follow a country/ }),
  chip: (p: Page, country: string) => S.strip(p).getByRole('button', { name: new RegExp(`^${country}`) }),
  guide: (p: Page) => p.locator('.guide-card'),
  guideNext: (p: Page) => S.guide(p).getByRole('button', { name: /^Next/ }),
  dock: (p: Page) => p.locator('.mobile-dock'),
  primary: (p: Page) => p.locator('.play-button'),
  menu: (p: Page) => p.getByRole('button', { name: /^Menu/ }),
  storyTabs: (p: Page) => p.getByRole('group', { name: /story/i }),
  conversations: (p: Page) => navTab(p, 'Conversations'),
  countryDetails: (p: Page) => p.getByRole('button', { name: /country details/i }).first(),
  more: (p: Page) => p.getByRole('button', { name: 'Timeline and more playback options' }),
  tryDifferent: (p: Page) => p.getByRole('button', { name: 'Try a different decision' }),
  seekOpening: (p: Page) => p.getByRole('button', { name: /^Seek moment 0:/ }),
  moveMap: (p: Page) => p.getByRole('button', { name: /move map/i }),
  map: (p: Page) => p.locator('.theater .europe-map'),
};

type Rec = {
  id: string;
  turns: { phase: string; title: string; messages: { id: string; to: string[]; promise?: string }[]; decisions: Record<string, { orders: string[] }>; promises: { kept: boolean; actual: string }[]; results: Record<string, string[]> }[];
};

/** The newest edition of the authored sample, read through the API. */
async function sampleRecord(request: APIRequestContext): Promise<Rec> {
  const rows = (await listGames(request)) as unknown as { id: string; mode: string; sampleVersion?: number }[];
  const newest = rows.filter((g) => g.mode === 'sample').sort((a, b) => (b.sampleVersion ?? 1) - (a.sampleVersion ?? 1))[0];
  return (await (await request.get(`/api/matches/${newest.id}`)).json()) as Rec;
}

/** Moves the current game to its opening moment through the Timeline page (no Watch-stage selectors). */
async function openingMoment(page: Page) {
  await navTab(page, 'Timeline').click();
  await page.locator('.chronicle-entry').first().click();
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test.beforeEach(async ({ request }) => {
  await clearUserGames(request);
});

// ---------- Runs now: server contract, History, Timeline, and the comparison page ----------

test('a branch request keeps its question and its one change, and plays nothing by itself', async ({ request }) => {
  const original = await createSandbox(request, 'Question source', 4);
  const res = await request.post(`/api/matches/${original.id}/branch`, {
    data: {
      at: 0,
      mode: 'sandbox',
      intervention: { power: 'FRANCE', order: 'F BRE - MAO' },
      question: 'What if France had kept its promise?',
      limits: limits(4),
    },
  });
  expect(res.status()).toBe(201);
  const branch = await res.json();
  expect(branch.parent).toMatchObject({ id: original.id, at: 0, question: 'What if France had kept its promise?' });
  expect(branch.parent.intervention).toEqual({ power: 'FRANCE', order: 'F BRE - MAO' });
  expect(branch.status).toBe('paused');
  expect(branch.turns).toHaveLength(0);
  // The question is optional: older clients still create alternate timelines.
  const plain = await request.post(`/api/matches/${original.id}/branch`, {
    data: { at: 0, mode: 'sandbox', intervention: { power: 'ENGLAND', profile: 'diplomat' }, limits: limits(4) },
  });
  expect(plain.status()).toBe(201);
});

test('History shows an alternate timeline with the question that started it', async ({ page, request }) => {
  const original = await createSandbox(request, 'Question original', 4);
  const branch = await (
    await request.post(`/api/matches/${original.id}/branch`, {
      data: { at: 0, mode: 'sandbox', intervention: { power: 'FRANCE', order: 'F BRE - MAO' }, question: 'What if France had kept its promise?', limits: limits(4) },
    })
  ).json();
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await historyTab(page).click();
  const row = page.getByRole('listitem').filter({ hasText: branch.name });
  await expect(row.locator('.saved-question')).toHaveText('What if France had kept its promise?');
  await expect(row).toContainText('Alternate timeline from “Question original” at moment 0');
});

test('the comparison names the change, the shared past, and the first phase played differently', async ({ page, request }) => {
  const original = await createSandbox(request, 'Compare original', 4);
  await playSandbox(request, original.id, true);
  const branch = await (
    await request.post(`/api/matches/${original.id}/branch`, {
      data: { at: 0, mode: 'sandbox', intervention: { power: 'FRANCE', order: 'F BRE - MAO' }, question: 'What if France had sailed for the Atlantic?', limits: limits(4) },
    })
  ).json();
  await playSandbox(request, branch.id, true);
  const t = trackTraffic(page);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await openFromHistory(page, branch.name);
  await navTab(page, 'Alternate timeline').click();
  const view = page.locator('.comparison');
  await expect(view.getByRole('heading', { name: 'A different decision. A different Europe.' })).toBeVisible();
  await expect(view).toContainText('What if France had sailed for the Atlantic?');
  await expect(view.locator('.whatif-change')).toContainText('France’s order is replaced: Fleet Brest moves to Mid-Atlantic Ocean.');
  await expect(view.locator('.whatif-change')).toContainText('the start of Spring 1901, before the orders were sealed');
  await expect(view).toContainText('They share only the opening position.');
  await expect(view.getByRole('heading', { name: 'Where they split: Spring 1901' })).toBeVisible();
  const france = view.locator('.order-diffs > li').filter({ hasText: 'France' });
  await expect(france).toContainText('Fleet Brest moves to Mid-Atlantic Ocean');
  await expect(france.locator('code', { hasText: 'F BRE - MAO' })).toBeVisible();
  await expect(view.getByRole('heading', { name: /^Standings at moment 1/ })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await expectNoRunsFor(page, t, 1000);
});

test('the Timeline at the opening lists later phases without their outcomes until asked', async ({ page, request }) => {
  const sample = await sampleRecord(request);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await openingMoment(page);
  await navTab(page, 'Timeline').click();
  const later = page.locator('.chronicle-entry.later');
  await expect(later).toHaveCount(sample.turns.length);
  await expect(page.locator('.chronicle-list')).not.toContainText(/broken promise/);
  await page.getByRole('button', { name: 'Show later outcomes' }).click();
  await expect(later).toHaveCount(0);
  await expect(page.locator('.chronicle-entry').nth(1).locator('h2')).toHaveText(sample.turns[0].title);
});

// ---------- Drafts: depend on the final Watch-stage markup (stage 2 enables them) ----------

for (const viewport of [DESKTOP, ...PHONES]) {
  test.fixme(`beginner journey at ${viewport.width}px: welcome, stakes, the France–Britain talks, the reveal, and the consequence`, async ({ page }) => {
    const t = trackTraffic(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    // One role line and ONE primary action; the map stays visible (the welcome is not a modal).
    await expect(S.welcome(page)).toContainText('You watch. Seven independent countries decide. Nothing waits for your orders.');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(S.map(page)).toBeVisible();
    await S.watchFirst(page).click();
    // Sample at moment 0, France followed, walkthrough of Spring 1901 open on its stakes.
    await expect(S.chip(page, 'France')).toHaveAttribute('aria-pressed', 'true');
    const guide = S.guide(page);
    await expect(guide).toContainText(/Channel/);
    // Talks: the France–Britain thread with its plain-language summary and the original words.
    for (let i = 0; i < 6 && !(await guide.getByText(/Britain/).count()); i++) await S.guideNext(page).click();
    await expect(guide).toContainText('France');
    await expect(guide).toContainText('Britain');
    // Before the reveal no order text of Spring 1901 is on the page.
    await expect(page.locator('body')).not.toContainText('F BRE - ENG');
    for (let i = 0; i < 8 && !(await guide.getByText(/reveal/i).count()); i++) await S.guideNext(page).click();
    // After the reveal: the promise against the order, in plain words first, exact text as detail.
    for (let i = 0; i < 8 && !(await guide.getByText(/broken/i).count()); i++) await S.guideNext(page).click();
    await expect(guide).toContainText('Fleet Brest moves to English Channel');
    await expect(guide.locator('code', { hasText: 'F BRE - ENG' })).toBeVisible();
    if (viewport.width < 760) {
      // Phone: the sheet takes the dock's place; never two bottom overlays; every target ≥44px.
      await expect(S.dock(page)).toBeHidden();
      for (const b of await guide.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await noOverflow(page)).toBe(true);
    expect(t.runs.length).toBe(0);
  });
}

test.fixme('a kept promise whose move still fails is explained as kept, not as betrayal', async ({ page, request }) => {
  const sample = await sampleRecord(request);
  const turn = sample.turns.findIndex((t) => t.promises.some((p) => p.kept && (t.results[p.actual.split(' ').slice(0, 2).join(' ')] ?? []).some(Boolean)));
  expect(turn).toBeGreaterThanOrEqual(0);
  await page.goto('/');
  await S.exploreOwn(page).click();
  await S.more(page).click();
  await page.getByRole('button', { name: new RegExp(`^Seek moment ${turn + 1}:`) }).click();
  await S.primary(page).click(); // opens the walkthrough of that phase
  const guide = S.guide(page);
  for (let i = 0; i < 12 && !(await guide.getByText(/kept/i).count()); i++) await S.guideNext(page).click();
  await expect(guide).toContainText(/kept/i);
  await expect(guide).toContainText(/Bounced|failed/);
  await expect(guide).not.toContainText(/betray/i);
});

test.fixme('a quiet phase stays short: no stakes or question beats, straight to the summary', async ({ page, request }) => {
  const sample = await sampleRecord(request);
  const quiet = sample.turns.findIndex((t) => t.messages.length === 0 && t.phase.endsWith('A'));
  expect(quiet).toBeGreaterThan(0);
  await page.goto('/');
  await S.exploreOwn(page).click();
  await S.more(page).click();
  await page.getByRole('button', { name: new RegExp(`^Seek moment ${quiet}:`) }).click();
  await S.primary(page).click();
  let steps = 0;
  while (steps < 10 && !(await S.guide(page).locator('.guide-next').count())) {
    await S.guideNext(page).click();
    steps++;
  }
  expect(steps).toBeLessThanOrEqual(3);
});

test.fixme('bilateral and group conversations are separate threads that keep their real participants', async ({ page, request }) => {
  const sample = await sampleRecord(request);
  const group = sample.turns[0].messages.find((m) => m.to.length > 1);
  expect(group, 'the sample has a group message in Spring 1901').toBeDefined();
  await page.goto('/');
  await S.exploreOwn(page).click();
  await S.conversations(page).click();
  const threads = page.locator('.thread');
  await expect(threads.filter({ hasText: /group/i }).first()).toBeVisible();
  // The France–Britain thread holds only messages between those two countries.
  const fb = threads.filter({ hasText: 'France' }).filter({ hasText: 'Britain' }).first();
  await expect(fb).toBeVisible();
  await expect(fb).not.toContainText(/Germany|Italy|Austria|Russia|Turkey/);
});

test.fixme('no earlier moment shows a later fact: talks visible, orders and outcomes of the phase on screen sealed', async ({ page, request }) => {
  const sample = await sampleRecord(request);
  await page.goto('/');
  await S.exploreOwn(page).click();
  for (const index of [0, 1, 3]) {
    await S.more(page).click();
    await page.getByRole('button', { name: new RegExp(`^Seek moment ${index}:`) }).click();
    for (const surface of ['Watch', 'Conversations'] as const) {
      await navTab(page, surface).click();
      const text = await page.locator('main, .theater').first().innerText();
      // Orders of this and later phases never appear; commitments of this phase read as sealed.
      for (const later of sample.turns.slice(index)) for (const orders of Object.values(later.decisions)) for (const o of orders.orders) expect(text).not.toContain(o);
      if (sample.turns[index]?.messages.some((m) => m.promise)) expect(text).toMatch(/not revealed yet|sealed/i);
    }
    await S.countryDetails(page).click();
    await page.getByRole('button', { name: 'Orders & promises' }).click();
    await expect(page.getByRole('dialog')).toContainText(index === 0 ? 'No phase has resolved yet' : 'Last resolved phase:');
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
});

test.fixme('phone: pause, resume, replay, and branch from the dock without hunting for controls', async ({ page, request }) => {
  const game = await createSandbox(request, 'Dock game', 6);
  const t = trackTraffic(page);
  await page.setViewportSize(PHONES[1]);
  await page.goto('/');
  await openFromHistory(page, game.name);
  const dock = S.dock(page);
  await expect(dock).toBeInViewport();
  await dock.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect.poll(() => t.runs.length).toBeGreaterThan(0);
  await S.primary(page).click(); // Pause
  await expectNoRunsFor(page, t, 2000);
  await S.more(page).click();
  await S.seekOpening(page).click();
  await S.tryDifferent(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.getByRole('button', { name: 'Close dialog' }).click();
});

test.fixme('What if? from a phase summary opens the dialog at the right checkpoint, prefilled, and creates the timeline', async ({ page }) => {
  await page.goto('/');
  await S.watchFirst(page).click();
  const guide = S.guide(page);
  for (let i = 0; i < 16 && !(await guide.locator('.guide-next').count()); i++) await S.guideNext(page).click();
  await guide.getByRole('button', { name: /^What if France had kept its promise\?/ }).click();
  const dialog = page.getByRole('dialog', { name: 'What if France had kept its promise?' });
  await expect(dialog).toContainText('WHAT CHANGES');
  await expect(dialog).toContainText('WHAT THE ORIGINAL RECORD SHOWS');
  await expect(dialog).toContainText('the start of Spring 1901, before the orders were sealed');
  await expect(dialog.getByRole('button', { name: /^Free sandbox/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: /^AI countries/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Create alternate timeline', exact: true }).click();
  await expect(page.locator('.comparison')).toContainText('What if France had kept its promise?');
  // App wires Comparison.onOpenOriginal: the original opens at the branch moment.
  await page.getByRole('button', { name: 'Open the original at the branch moment' }).click();
  await expect(page.locator('.match-name')).toContainText('The fragile peace');
});

test.fixme('the free-form branch at the viewed moment hides that phase’s original orders and refuses unread sandbox messages', async ({ page }) => {
  await page.goto('/');
  await S.exploreOwn(page).click();
  await openingMoment(page);
  await navTab(page, 'Watch').click();
  await S.more(page).click();
  await S.tryDifferent(page).click();
  const dialog = page.getByRole('dialog', { name: 'What if one decision changed?' });
  await expect(dialog.getByText('In the original, France ordered')).toBeHidden();
  await dialog.getByText(/reveals this phase’s orders/).click();
  await expect(dialog.getByText('In the original, France ordered')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add a message' })).toBeDisabled();
  await expect(dialog).toContainText('never read it or answer it');
});

test.fixme('loading, empty, and error states say what is happening', async ({ page, request }) => {
  const sample = await sampleRecord(request);
  await page.route(`**/api/matches/${sample.id}`, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto('/');
  await expect(page.getByText(/loading/i).first()).toBeVisible();
  await expect(S.map(page)).toBeVisible({ timeout: 10_000 });
  // Empty: the opening of a fresh sandbox game has no talks yet and says so.
  const game = await createSandbox(request, 'Empty talks', 3);
  await openFromHistory(page, game.name);
  await S.conversations(page).click();
  await expect(page.locator('main')).toContainText(/no messages|no conversations/i);
  // Error: a failed open is shown and the previous game stays on screen.
  await page.route('**/api/matches/00000000-0000-4000-8000-0000000000ee', (r) => r.fulfill({ status: 500, json: { error: 'Simulated open failure.' } }));
  await page.evaluate(() => localStorage.setItem('seven-powers-match', '00000000-0000-4000-8000-0000000000ee'));
  await page.reload();
  await expect(page.locator('.error-banner, [role="alert"]').first()).toBeVisible();
});

test.fixme('phone: a one-finger drag on the map scrolls the page unless the viewer chose to move the map', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONES[1], hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/');
  await S.exploreOwn(page).click();
  const box = (await S.map(page).boundingBox())!;
  const before = await page.evaluate(() => scrollY);
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.7;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 30 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await S.moveMap(page).click();
  await expect(S.moveMap(page)).toHaveAttribute('aria-pressed', 'true');
  await context.close();
});

test.fixme('keyboard: the country strip, threads, dock, and sheets are reachable and Escape closes the top layer', async ({ page }) => {
  await page.goto('/');
  await S.exploreOwn(page).click();
  await S.chip(page, 'Britain').focus();
  await page.keyboard.press('Enter');
  await expect(S.chip(page, 'Britain')).toHaveAttribute('aria-pressed', 'true');
  await S.primary(page).focus();
  await page.keyboard.press('Enter');
  await expect(S.guide(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(S.guide(page)).toHaveCount(0);
  // Every focused control shows a visible focus ring.
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});

test.fixme('reduced motion: the reveal shows final positions without unit travel', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: DESKTOP });
  const page = await context.newPage();
  await page.goto('/');
  await S.watchFirst(page).click();
  const guide = S.guide(page);
  for (let i = 0; i < 10 && !(await guide.getByText(/reveal/i).count()); i++) await S.guideNext(page).click();
  const animated = await page.evaluate(() =>
    [...document.querySelectorAll('.europe-map *')].some((el) => {
      const s = getComputedStyle(el);
      return parseFloat(s.animationDuration) > 0.01 || parseFloat(s.transitionDuration) > 0.01;
    }),
  );
  expect(animated).toBe(false);
  await context.close();
});

test.fixme('no billing anywhere in the journey: no run request, no live game, nothing resumes on return', async ({ page, request }) => {
  const t = trackTraffic(page);
  const health = await (await request.get('/api/health')).json();
  expect(health.liveConfigured).toBe(false);
  await page.setViewportSize(PHONES[0]);
  await page.goto('/');
  await S.watchFirst(page).click();
  for (let i = 0; i < 20 && !(await S.guide(page).locator('.guide-next').count()); i++) await S.guideNext(page).click();
  await S.conversations(page).click();
  await historyTab(page).click();
  await page.reload();
  await expectNoRunsFor(page, t, 2000);
  expect(t.runs.length).toBe(0);
  const live = (await listGames(request)).filter((g) => g.mode === 'live');
  expect(live).toHaveLength(0);
});
