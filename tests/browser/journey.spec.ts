import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  clearUserGames,
  createSandbox,
  expectNoRunsFor,
  guideCard,
  historyTab,
  limits,
  listGames,
  moment,
  navTab,
  openFromHistory,
  openTab,
  playSandbox,
  primary,
  seekMoment,
  statusLine,
  trackTraffic,
} from './helpers';

/**
 * The newcomer journey and the observer-experience guarantees: the first negotiation from the
 * welcome to an alternate timeline, the moment rule, conversations, playback, states, touch,
 * keyboard, reduced motion, and billing. Nothing here can bill: the test server has no provider key.
 */
test.setTimeout(60_000);

const PHONES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;
const DESKTOP = { width: 1536, height: 1024 };

type Rec = {
  id: string;
  turns: { phase: string; title: string; messages: { id: string; to: string[]; text: string; promise?: string; replyTo?: string }[]; decisions: Record<string, { orders: string[] }> }[];
};

/** The newest edition of the authored sample, read through the API. */
async function sampleRecord(request: APIRequestContext): Promise<Rec> {
  const rows = (await listGames(request)) as unknown as { id: string; mode: string; sampleVersion?: number }[];
  const newest = rows.filter((g) => g.mode === 'sample').sort((a, b) => (b.sampleVersion ?? 1) - (a.sampleVersion ?? 1))[0];
  return (await (await request.get(`/api/matches/${newest.id}`)).json()) as Rec;
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const nextBeat = (page: Page) => guideCard(page).getByRole('button', { name: /^(Next|Reveal the orders|Phase summary)\s*$/ });
const headline = (page: Page) => guideCard(page).locator('h3').first();
const setGuided = (page: Page, on: boolean) => page.addInitScript((v) => localStorage.setItem('seven-powers-guided', v), on ? '1' : '0');

/** Steps the open card forward until its headline matches, at most `max` beats. */
async function stepUntil(page: Page, text: string | RegExp, max = 12) {
  for (let i = 0; i < max; i++) {
    const h = await headline(page).innerText();
    if (typeof text === 'string' ? h.includes(text) : text.test(h)) return;
    await nextBeat(page).click();
  }
  await expect(headline(page)).toContainText(text);
}

test.beforeEach(async ({ request }) => {
  await clearUserGames(request);
});

// ---------- The first negotiation, from the welcome to an alternate timeline ----------

for (const viewport of [DESKTOP, ...PHONES]) {
  test(`beginner journey at ${viewport.width}px: welcome → the France–Britain promise → reveal → consequences → What if? → comparison`, async ({ page }) => {
    const t = trackTraffic(page);
    const phone = viewport.width <= 760;
    await page.setViewportSize(viewport);
    await page.goto('/');

    // The welcome: one role line and ONE primary action; it is a panel, the map stays visible.
    await expect(page.getByRole('heading', { name: 'You watch. Seven independent countries decide. Nothing waits for your orders.' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.stage .europe-map')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await page.getByRole('button', { name: /^Watch the first negotiation/ }).click();

    // Sample at moment 0, France followed, the walkthrough of Spring 1901 open on its stakes.
    const card = guideCard(page);
    await expect(card).toBeVisible();
    await expect(page.getByRole('button', { name: /^France: .*followed$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator('.guide-label')).toHaveText(/what is at stake/i);
    await expect(headline(page)).toContainText('France and Britain');
    await expect(headline(page)).toContainText('English Channel');
    if (phone) {
      // On a phone the card is a bottom sheet that takes the dock's place; its controls are full size.
      await expect(card).toHaveClass(/sheet/);
      await expect(page.locator('.playback')).toBeHidden();
      for (const b of await card.locator('.guide-foot button').all()) {
        const box = await b.boundingBox();
        if (box) expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(44);
      }
    } else {
      expect(await card.evaluate((el) => !!el.closest('.europe-map'))).toBe(true);
    }

    // Talks: the France–Britain thread, summarized, with the original words a tap away.
    await nextBeat(page).click();
    await expect(card.locator('.guide-label')).toHaveText(/private talks/i);
    await expect(headline(page)).toHaveText(/Britain and France/);
    await expect(card).toContainText('France');
    // Before the reveal no Spring 1901 order is shown anywhere on the page.
    await expect(page.locator('body')).not.toContainText('F BRE - ENG');

    // The question, with an optional local guess.
    await stepUntil(page, 'Will France send its fleet from Brest into the Mid-Atlantic Ocean');
    const guess = card.getByRole('group', { name: 'Your guess (optional)' });
    await guess.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(guess.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toContainText('The countries never see them.');

    // Sealed, then the reveal.
    await stepUntil(page, 'Seven countries write their orders in secret');
    await expect(card.getByRole('button', { name: /^Reveal the orders/ })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('F BRE - ENG');
    await card.getByRole('button', { name: /^Reveal the orders/ }).click();
    await expect(headline(page)).toHaveText('The orders are revealed');
    await expect(page.locator('.europe-map .order-line').first()).toBeAttached();

    // France's broken promise, in plain words, with the exact orders as detail.
    await stepUntil(page, 'France broke its promise to Britain');
    await expect(card).toContainText('English Channel');
    await card.locator('.guide-exact summary').click();
    await expect(card.locator('.guide-exact')).toContainText('F BRE - ENG');

    // A kept promise can still fail: Russia and Turkey, one event, never called a betrayal.
    await stepUntil(page, 'Russia and Turkey both kept their word, and their moves bounced in the Black Sea');
    await expect(card).not.toContainText(/betray/i);

    // The summary answers the question, remembers the guess, and offers the What if? right under What changed.
    await stepUntil(page, 'The price of a promise.', 8);
    const answers = card.locator('.guide-answers');
    await expect(answers).toContainText('Will France send its fleet from Brest into the Mid-Atlantic Ocean');
    await expect(answers).toContainText('You guessed yes.');
    const whatIf = card.getByRole('complementary', { name: 'Try a different decision' });
    await expect(whatIf).toContainText('What if France had kept its promise?');
    await whatIf.getByRole('button', { name: 'Explore this alternate timeline' }).click();

    // The dialog opens at the checkpoint before the decision, prefilled, with the honest sandbox caveat.
    const dialog = page.getByRole('dialog', { name: 'What if France had kept its promise?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('WHAT CHANGES');
    await expect(dialog).toContainText('The fleet in Brest moves to the Mid-Atlantic Ocean');
    await expect(dialog).toContainText('WHAT THE ORIGINAL RECORD SHOWS');
    await expect(dialog).toContainText('the start of Spring 1901, before the orders were sealed');
    await expect(dialog.getByRole('button', { name: /^Free sandbox/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: /^Free sandbox/ })).toContainText('will not react to the change strategically');
    await expect(dialog.getByRole('button', { name: /^AI countries/ })).toBeDisabled();
    expect(await noOverflow(page)).toBe(true);
    await dialog.getByRole('button', { name: 'Create alternate timeline', exact: true }).click();

    // The comparison: the question, the change, and the way back to the original.
    const view = page.locator('.comparison');
    await expect(view).toContainText('What if France had kept its promise?');
    await expect(view.locator('.whatif-change')).toContainText('France’s order is replaced: Fleet Brest moves to Mid-Atlantic Ocean.');
    await expect(view.getByRole('button', { name: 'Open the original at the branch moment' })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    // Nothing was played or billed on the way.
    await expectNoRunsFor(page, t, 1000);
    expect(t.runs.length).toBe(0);
  });
}

test('the comparison of a played alternate timeline shows the shared past and the first phase played differently', async ({ page, request }) => {
  const original = await createSandbox(request, 'Compare original', 4);
  await playSandbox(request, original.id, true);
  const res = await request.post(`/api/matches/${original.id}/branch`, {
    data: { at: 0, mode: 'sandbox', intervention: { power: 'FRANCE', order: 'F BRE - MAO' }, question: 'What if France had sailed for the Atlantic?', limits: limits(4) },
  });
  expect(res.status()).toBe(201);
  const branch = await res.json();
  expect(branch.parent).toMatchObject({ id: original.id, at: 0, question: 'What if France had sailed for the Atlantic?', intervention: { power: 'FRANCE', order: 'F BRE - MAO' } });
  expect(branch.status).toBe('paused');
  expect(branch.turns).toHaveLength(0);
  await playSandbox(request, branch.id, true);
  const t = trackTraffic(page);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await historyTab(page).click();
  // History names the alternate timeline by the question that started it.
  const row = page.getByRole('listitem').filter({ hasText: branch.name });
  await expect(row.locator('.saved-question')).toHaveText('What if France had sailed for the Atlantic?');
  await openFromHistory(page, branch.name);
  await navTab(page, 'Alternate timeline').click();
  const view = page.locator('.comparison');
  await expect(view.locator('.whatif-change')).toContainText('France’s order is replaced: Fleet Brest moves to Mid-Atlantic Ocean.');
  await expect(view).toContainText('They share only the opening position.');
  await expect(view.getByRole('heading', { name: 'Where they split: Spring 1901' })).toBeVisible();
  const france = view.locator('.order-diffs > li').filter({ hasText: 'France' });
  await expect(france).toContainText('Fleet Brest moves to English Channel');
  await expect(france).toContainText('Fleet Brest moves to Mid-Atlantic Ocean');
  await expect(france.locator('code', { hasText: 'F BRE - MAO' })).toBeVisible();
  await expect(view.getByRole('heading', { name: /^Standings at moment 1/ })).toBeVisible();
  // The original opens at the branch moment, as recorded.
  await view.getByRole('button', { name: 'Open the original at the branch moment' }).click();
  await expect(page.locator('.match-name')).toHaveText('Compare original');
  expect((await moment(page))[0]).toBe(0);
  await expectNoRunsFor(page, t, 1000);
});

// ---------- Pacing ----------

test('a quiet phase stays short: Spring 1903 reaches its summary in a few steps', async ({ page, request }) => {
  const sample = await sampleRecord(request);
  const quiet = sample.turns.findIndex((t) => t.phase === 'S1903M');
  expect(quiet).toBeGreaterThan(0);
  await setGuided(page, true);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await seekMoment(page, quiet);
  await primary(page).click(); // Watch with a guide: phase `quiet` from its start
  const card = guideCard(page);
  await expect(card).toBeVisible();
  await expect(card.locator('.guide-kicker')).toContainText(/Spring 1903/i);
  const total = Number((await card.locator('.guide-kicker').innerText()).match(/OF (\d+)/i)![1]);
  expect(total).toBeLessThanOrEqual(5);
  let steps = 0;
  while (!(await card.locator('.guide-next').count()) && steps < 10) {
    await nextBeat(page).click();
    steps++;
  }
  expect(steps).toBeLessThanOrEqual(5);
  await expect(card.locator('.guide-next')).toBeVisible();
});

// ---------- Conversations and the moment rule ----------

test('bilateral and group threads stay separate; the group keeps its three participants; replies are linked', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await seekMoment(page, 1);
  await navTab(page, 'Conversations').click();
  await expect(page.getByRole('heading', { name: 'Who is talking to whom' })).toBeVisible();
  const group = page.locator('.cv-row.group').filter({ hasText: 'Germany' }).filter({ hasText: 'Italy' }).first();
  await expect(group).toContainText('Group');
  await group.locator('.cv-row-main').click();
  const thread = page.locator('.cv-pane .cv-thread');
  await expect(thread.locator('.cv-participants')).toHaveText(/Group of 3: .*Germany.*Italy|Group of 3: .*Italy.*Germany/);
  await expect(thread.locator('.cv-participants')).toContainText('Austria-Hungary');
  // The France–Britain thread holds only messages between those two countries, with a recorded reply link.
  await page.locator('.cv-row.pair').filter({ hasText: 'France' }).filter({ hasText: 'Britain' }).first().locator('.cv-row-main').click();
  await expect(thread.locator('.cv-participants')).toHaveText(/^Between (France and Britain|Britain and France)$/);
  await expect(thread.locator('.cv-from')).not.toContainText(['Germany']);
  await expect(thread.locator('.cv-reply-link.recorded').first()).toContainText('In reply to France’s proposal');
  await thread.locator('.cv-reply-link.recorded .cv-link').first().click();
  expect(await noOverflow(page)).toBe(true);
});

test('earlier moments show no later facts: Spring 1901 promises are sealed at moment 0 and revealed at moment 1', async ({ page, request }) => {
  const sample = await sampleRecord(request);
  const spring = sample.turns[0];
  const springOrders = Object.values(spring.decisions).flatMap((d) => d.orders);
  const promised = new Set(spring.messages.map((m) => m.promise).filter(Boolean));
  // Orders that were never promised appear only once the phase is revealed.
  const unpromised = springOrders.filter((o) => !promised.has(o));
  await page.setViewportSize(DESKTOP);
  await page.goto('/');

  await seekMoment(page, 0);
  await navTab(page, 'Conversations').click();
  await page.locator('.cv-row.pair').filter({ hasText: 'France' }).filter({ hasText: 'Britain' }).first().locator('.cv-row-main').click();
  const thread = page.locator('.cv-pane .cv-thread');
  await expect(thread.locator('.cv-status').first()).toHaveText('Sealed · orders not revealed yet');
  await expect(thread).not.toContainText('Broken');
  const text0 = await page.locator('main').innerText();
  for (const o of unpromised) expect(text0, o).not.toContain(o);
  // Autumn 1901's talks are not part of moment 0.
  for (const m of sample.turns[1].messages) expect(text0).not.toContain(m.text.slice(0, 40));
  // Country details at moment 0: talks so far, no resolved orders.
  await navTab(page, 'Watch').click();
  await page.getByRole('button', { name: /^France: / }).click();
  await page.getByRole('button', { name: 'Country details' }).click();
  await page.getByRole('button', { name: 'Orders & promises' }).click();
  const dossier = page.getByRole('dialog');
  await expect(dossier).toContainText('This phase: Spring 1901 · talks so far, orders sealed');
  await expect(dossier).toContainText('No phase has resolved yet');
  await expect(dossier).not.toContainText('Promise broken');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await seekMoment(page, 1);
  await navTab(page, 'Conversations').click();
  await page.locator('.cv-row.pair').filter({ hasText: 'France' }).filter({ hasText: 'Britain' }).first().locator('.cv-row-main').click();
  await expect(thread.locator('.cv-commitment.broken')).toContainText('Ordered instead:');
  await expect(page.locator('.cv-moment')).toContainText('As of Autumn 1901');
  await navTab(page, 'Watch').click();
  await page.getByRole('button', { name: 'Country details' }).click();
  await page.getByRole('button', { name: 'Orders & promises' }).click();
  await expect(dossier).toContainText('Last resolved phase: Spring 1901');
  await expect(dossier).toContainText('Promise broken');
});

// ---------- Playback on a sandbox game ----------

test('pause, resume, and replay on a sandbox game: each request is explicit, and a replay sends none', async ({ page, request }) => {
  const game = await createSandbox(request, 'Playback game', 6);
  await setGuided(page, false);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, game.name);
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 2 of', { timeout: 20_000 });
  await primary(page).click(); // Pause game
  await expect(statusLine(page)).toContainText('Paused', { timeout: 15_000 });
  const paused = t.runsFor(game.id);
  await expectNoRunsFor(page, t, 2500);
  await page.getByRole('button', { name: /^Resume game from the latest phase/ }).click();
  await expect.poll(() => t.runsFor(game.id)).toBeGreaterThan(paused);
  await primary(page).click(); // Pause game
  await expect(statusLine(page)).toContainText('Paused', { timeout: 15_000 });
  const before = t.runs.length;
  await seekMoment(page, 0);
  await expect(primary(page)).toHaveText('Play replay');
  await page.getByRole('combobox', { name: 'Replay speed' }).click();
  await page.getByRole('option', { name: '4×' }).click();
  await primary(page).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 2 of', { timeout: 10_000 });
  await primary(page).click(); // Pause replay
  expect(t.runs.length).toBe(before);
});

// ---------- Loading, empty, and error states ----------

test('loading, empty, and error states say what is happening', async ({ page, request }) => {
  const game = await createSandbox(request, 'Empty talks', 3);
  // Loading: a slow record shows the preparing screen, then the board.
  const sample = await sampleRecord(request);
  await page.route(`**/api/matches/${sample.id}`, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Preparing the European board…' })).toBeVisible();
  await expect(page.locator('.stage .europe-map')).toBeVisible({ timeout: 10_000 });
  await page.unroute(`**/api/matches/${sample.id}`);

  // Empty: a new game has no talks yet, and both talk views say so.
  await openFromHistory(page, game.name);
  await page.locator('.side-tabs').getByRole('button', { name: 'Talks' }).click();
  await expect(page.locator('.talks-panel')).toContainText('No messages yet. The first phase begins with private talks.');
  await navTab(page, 'Conversations').click();
  await expect(page.locator('main')).toContainText('No private messages are visible at this moment.');

  // Error: a failed run is shown in the banner and nothing keeps playing.
  await page.route(`**/api/matches/${game.id}/run`, (r) => r.fulfill({ status: 500, json: { error: 'Simulated run failure.' } }));
  await navTab(page, 'Watch').click();
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect(page.locator('.error-banner')).toContainText('Simulated run failure.');

  // Error: the saved-games list cannot load; the page says so and offers a retry.
  const fresh = await page.context().newPage();
  await fresh.route('**/api/matches', (r) => r.fulfill({ status: 500, json: { error: 'Simulated list failure.' } }));
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { name: 'The game could not load.' })).toBeVisible();
  await expect(fresh.getByText('Simulated list failure.')).toBeVisible();
  await expect(fresh.getByRole('button', { name: 'Try again' })).toBeVisible();
  await fresh.close();
});

// ---------- Touch, keyboard, and motion ----------

test('touch: a one-finger vertical swipe over the map scrolls the page; moving the map is an explicit choice', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONES[1], hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide this introduction' }).click();
  const map = page.locator('.stage .europe-map');
  await map.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await map.boundingBox())!;
  const before = await page.evaluate(() => scrollY);
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = Math.min(box.y + box.height * 0.8, 700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 25 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
  // Moving the map with one finger is a labelled toggle, off by default.
  const move = page.getByRole('button', { name: 'Move map with one finger' });
  await expect(move).toHaveAttribute('aria-pressed', 'false');
  await move.click();
  await expect(move).toHaveAttribute('aria-pressed', 'true');
  await context.close();
});

test('keyboard: the guide opens, steps, and closes from the keyboard, with visible focus', async ({ page }) => {
  await setGuided(page, true);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await primary(page).focus();
  await page.keyboard.press('Enter'); // Watch with a guide
  const card = guideCard(page);
  await expect(card).toBeVisible();
  // Focus moves into the card, on its heading.
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.guide-card') !== null)).toBe(true);
  const first = await headline(page).innerText();
  await nextBeat(page).focus();
  await page.keyboard.press('Enter');
  await expect(headline(page)).not.toHaveText(first);
  // Every focused control shows a visible focus ring.
  await page.keyboard.press('Shift+Tab');
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement!);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThan(0);
  await headline(page).focus();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});

test('reduced motion: the reveal shows final positions without unit travel or animations', async ({ browser }) => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const context = await browser.newContext({ reducedMotion, viewport: DESKTOP });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: /^Watch the first negotiation/ }).click();
    await stepUntil(page, 'Seven countries write their orders in secret');
    await guideCard(page).getByRole('button', { name: /^Reveal the orders/ }).click();
    await expect(headline(page)).toHaveText('The orders are revealed');
    const travel = await page.locator('.unit-travel').count();
    if (reducedMotion === 'reduce') {
      expect(travel).toBe(0);
      const animated = await page.evaluate(() =>
        [...document.querySelectorAll('.stage *')].filter((el) => {
          const s = getComputedStyle(el);
          return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01;
        }).length,
      );
      expect(animated).toBe(0);
    } else expect(travel).toBeGreaterThan(0);
    await context.close();
  }
});

// ---------- Billing ----------

test('no billing anywhere in the journey: no run request, no live game, nothing resumes after a reload', async ({ page, request }) => {
  const t = trackTraffic(page);
  const health = await (await request.get('/api/health')).json();
  expect(health.liveConfigured).toBe(false);
  await page.setViewportSize(PHONES[0]);
  await page.goto('/');
  await page.getByRole('button', { name: /^Watch the first negotiation/ }).click();
  const card = guideCard(page);
  for (let i = 0; i < 16 && !(await card.locator('.guide-next').count()); i++) await nextBeat(page).click();
  await card.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Close guide', exact: true }).click();
  await openTab(page, 'Conversations');
  await openTab(page, 'History');
  await page.reload();
  await expect(page.locator('.match-name')).toBeVisible();
  await expectNoRunsFor(page, t, 2000);
  expect(t.runs.length).toBe(0);
  expect((await listGames(request)).filter((g) => g.mode === 'live')).toHaveLength(0);
});
