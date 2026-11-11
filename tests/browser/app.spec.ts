import { test, expect, type Page } from '@playwright/test';
import { mockLiveCatalog } from './helpers';

/**
 * The expert view (guided view off) keeps the detailed story, timeline controls, and the replay
 * timer. Guided and watch-session behaviour has its own spec in watch.spec.ts.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '0'));
});

/** Opens a custom listbox by its accessible label and picks an option by visible text. */
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: false }).click();
  // Options may carry exact-order detail text, so match the readable label as a prefix.
  await page.getByRole('option', { name: option }).click();
}

const playRecorded = (page: Page) => page.getByRole('button', { name: /^Play recorded phases/ });
const nextCheckpoint = (page: Page) => page.getByRole('button', { name: 'Show the next recorded moment' });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const setupButton = (page: Page) => page.locator('.new-simulation');

test('sample is explorable; country details, commitments, private filters, history, and playback work', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('YOU ARE THE OBSERVER')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Europe, on the brink.' })).toBeVisible();
  await expect(page.getByText('RECORDED SAMPLE', { exact: true })).toBeVisible();
  await expect(page.locator('.europe-map .province')).toHaveCount(80);
  await page.locator('.europe-map .country-label').filter({ hasText: 'BRITAIN' }).click();
  await expect(page.locator('.country-preview h2')).toHaveText('The British Empire');
  await page.locator('.power-row').filter({ hasText: 'France' }).click();
  await page.getByRole('button', { name: 'Country details' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Orders & promises' }).click();
  await expect(page.getByText('Promise broken', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('F BRE - MAO', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Memory', exact: true }).click();
  await expect(page.getByText('We promised Britain an Atlantic move', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  await choose(page, 'View channels', 'France only');
  await expect(page.locator('.dispatch')).toHaveCount(4);
  await expect(page.locator('.diplomacy-columns').getByText('SECRET')).toHaveCount(0);
  await page.getByRole('button', { name: 'Compared with history', exact: true }).click();
  await expect(page.getByText('A strategic experiment, not a historical forecast.')).toBeVisible();
  await expect(page.locator('.history-context a')).toHaveCount(3);
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await page.getByRole('button', { name: 'Show revealed movement orders' }).click();
  await expect(page.getByRole('button', { name: 'Show revealed movement orders' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Seek moment 0: before Spring 1901' }).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 0 of 9');
  await choose(page, 'Replay speed', '4×');
  await playRecorded(page).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 1 of 9');
  await page.getByRole('button', { name: /^Pause the replay/ }).click();
  await nextCheckpoint(page).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 2 of 9');
  expect(errors).toEqual([]);
});

test('a first-time observer sees the role and the next safe action; the card can be hidden and returns from help', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Seven countries compete for')).toBeVisible();
  await expect(setupButton(page)).toBeVisible();
  await page.getByRole('button', { name: 'Hide this introduction' }).click();
  await expect(page.getByText('YOU ARE THE OBSERVER')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('YOU ARE THE OBSERVER')).toHaveCount(0);
  await page.getByRole('button', { name: 'How to watch' }).click();
  await page.getByRole('button', { name: 'Show the welcome card again' }).click();
  await expect(page.getByText('YOU ARE THE OBSERVER')).toBeVisible();
});

test('recorded history never shows future messages, and the phase guide says so', async ({ page }) => {
  await page.goto('/');
  // Opening at moment 1 shows the phase that resolved from moment 0.
  await expect(page.locator('.timeline-labels')).toContainText('Moment 1 of 9');
  await expect(page.locator('.phase-guide.history')).toContainText('EARLIER IN THE RECORD');
  await page.getByRole('button', { name: 'Seek moment 0: before Spring 1901' }).click();
  await expect(page.getByText('Nothing has happened yet.')).toBeVisible();
  await page.locator('.side-tabs').getByRole('button', { name: /^Messages/ }).click();
  await expect(page.getByText('No messages yet.')).toBeVisible();
  await expect(page.locator('.dispatch')).toHaveCount(0);
  await page.getByRole('button', { name: 'What happened' }).click();
  await page.getByRole('button', { name: 'Jump to the latest phase' }).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 9 of 9');
  // The finished sample shows its end screen instead of the status strip.
  await expect(page.locator('.end-screen')).toContainText('The recorded sample has ended');
  await expect(page.locator('.phase-guide')).toHaveCount(0);
});

test('the story explains a broken commitment, links it to the map and messages, and the exact order stays visible', async ({
  page,
}) => {
  await page.goto('/');
  const moment = page.locator('.moment.broken').first();
  await expect(moment).toContainText('Broken commitment');
  await expect(moment.locator('.moment-compare')).toContainText('F BRE - MAO');
  await expect(moment.locator('.moment-compare')).toContainText('F BRE - ENG');
  await moment.getByRole('button', { name: /^Find Brest on map/ }).click();
  await expect(page.locator('.province-info b')).toHaveText('BRE');
  await page.locator('.all-orders summary').click();
  await expect(page.locator('.all-orders').getByText('F BRE - ENG', { exact: true })).toBeVisible();
});

/** Geometry of the first moment inside the story's own scroll viewport, with no scrolling. */
const momentGeometry = (page: Page) =>
  page.evaluate(() => {
    const scroll = document.querySelector('.dispatch-scroll')!;
    const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const view = scroll.getBoundingClientRect();
    const within = (r: DOMRect) => r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5 && r.height > 0;
    const focus = box('.country-preview');
    return {
      scrollTop: scroll.scrollTop,
      viewHeight: view.height,
      innerHeight,
      headline: within(box('.moment.broken h4')),
      promiseAction: within(box('.moment.broken .moment-compare')),
      actions: within(box('.moment.broken .moment-actions')),
      stripClear: focus.top >= view.bottom - 0.5,
      headlineSize: parseFloat(getComputedStyle(document.querySelector('.moment.broken h4')!).fontSize),
      bodySize: parseFloat(getComputedStyle(document.querySelector('.moment.broken p')!).fontSize),
      labelSize: parseFloat(getComputedStyle(document.querySelector('.moment-label')!).fontSize),
    };
  });

test('desktop: the first moment and its promise-versus-action are visible without scrolling the story', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('/');
  await expect(page.locator('.moment.broken h4')).toBeVisible();
  const g = await momentGeometry(page);
  expect(g.scrollTop).toBe(0);
  expect(g.viewHeight).toBeGreaterThanOrEqual(320);
  expect(g.headline).toBe(true);
  expect(g.promiseAction).toBe(true);
  expect(g.actions).toBe(true);
  expect(g.stripClear).toBe(true);
  // Readable sizes: body at least 12px, moment labels and eyebrows at least 9px.
  expect(g.bodySize).toBeGreaterThanOrEqual(12);
  expect(g.headlineSize).toBeGreaterThanOrEqual(18);
  expect(g.labelSize).toBeGreaterThanOrEqual(9);
  expect(await noOverflow(page)).toBe(true);
});

test('shorter desktop: headline and promise row stay in view, and the actions are one scroll away', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('.moment.broken h4')).toBeVisible();
  const before = await momentGeometry(page);
  expect(before.headline).toBe(true);
  expect(before.promiseAction).toBe(true);
  // The region scrolls rather than clipping; the actions are reachable inside it.
  await page.locator('.moment.broken .moment-actions').scrollIntoViewIfNeeded();
  const after = await momentGeometry(page);
  expect(after.actions).toBe(true);
  expect(after.scrollTop).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Country details' })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
});

test('a live phase in progress shows only observed progress: talk counts and sealed count, never order text', async ({
  page,
}) => {
  // Serve the sample's real record as a running live match with a partially negotiated phase.
  // The spectator projection shares only the sealed count, so `decisions` stays empty here.
  await page.route(/\/api\/matches\/[0-9a-f-]{36}$/, async (route) => {
    const response = await route.fetch();
    const m = await response.json();
    if (m.mode !== 'sample') {
      await route.fulfill({ response, json: m });
      return;
    }
    await route.fulfill({
      response,
      json: {
        ...m,
        mode: 'live',
        status: 'running',
        pending: {
          round: 0,
          messages: m.turns.at(-1).messages.slice(0, 2),
          negotiated: ['0:ENGLAND', '0:FRANCE', '0:GERMANY', '0:ITALY'],
          decisions: {},
          sealedCount: 2,
        },
      },
    });
  });
  await page.goto('/');
  const guide = page.locator('.phase-guide.live');
  await expect(guide).toContainText('HAPPENING NOW');
  await expect(guide).toContainText('Agents are working on this phase');
  await expect(guide).toContainText('Round 1 of 2 · 4 of 14 conversations');
  await expect(guide).toContainText('2 of 7 sealed · contents stay secret until the phase resolves');
  await expect(page.getByRole('button', { name: /^Pause game/ })).toBeVisible();
  // No sealed order text appears anywhere in the live phase view.
  await expect(page.locator('.dispatch-panel')).not.toContainText('Committed order');
});

test('the pivotal event leads to advancing the moment and trying a different decision from that exact moment', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Seek moment 0: before Spring 1901' }).click();
  await page.getByRole('button', { name: 'Try a different decision' }).click();
  await expect(page.getByRole('dialog').getByText('ORIGINAL', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('In the original, France ordered')).toBeVisible();
  await choose(page, 'Replace one legal order', 'Fleet Brest moves to Mid-Atlantic Ocean');
  await page.getByRole('button', { name: 'Create alternate timeline', exact: true }).click();
  await expect(page.getByText('A different decision. A different Europe.')).toBeVisible();
  await page.getByRole('button', { name: /^Play next phase \(free\)/ }).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 1 of 1');
  await expect(page.locator('.match-status')).toContainText('Paused');
});

test('custom listbox keyboard flow: arrows, Enter, Escape closes only the list, focus stays on the trigger', async ({
  page,
}) => {
  await page.goto('/');
  const speed = page.getByRole('combobox', { name: 'Replay speed' });
  // The control keeps its width in the playback strip, so its value is never truncated.
  expect(
    await speed.evaluate((el) => {
      const value = el.querySelector('.select-value') as HTMLElement;
      return value.scrollWidth <= value.clientWidth && el.getBoundingClientRect().width >= 76;
    }),
  ).toBe(true);
  await speed.focus();
  await page.keyboard.press('Enter');
  await expect(speed).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox')).toBeVisible();
  // Opens on the current value (1×), so one ArrowDown highlights 2×.
  await page.keyboard.press('ArrowDown');
  await expect(speed).toHaveAttribute('aria-activedescendant', /option-2$/);
  await page.keyboard.press('Enter');
  await expect(speed).toHaveAttribute('aria-expanded', 'false');
  await expect(speed).toContainText('2×');
  await expect(speed).toBeFocused();
  // ArrowUp on a closed control opens the list again; Escape closes it and keeps the value.
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(speed).toBeFocused();
  await expect(speed).toContainText('2×');
  // Home jumps to the first option while the list is open; Escape cancels without choosing.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await expect(speed).toHaveAttribute('aria-activedescendant', /option-0$/);
  await page.keyboard.press('Escape');
  await expect(speed).toContainText('2×');
});

test('dialog keeps Escape for open listboxes, closes on Escape, and returns focus to its opener', async ({ page }) => {
  await page.goto('/');
  const opener = setupButton(page);
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Game name')).toBeFocused();
  // Open the France profile listbox from the keyboard, then Escape: list closes, dialog stays.
  await page.getByText('Advanced: models, behaviour, and each country').click();
  const profile = page.getByRole('combobox', { name: 'France behavioral profile' });
  await profile.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  // Escape again closes the dialog and restores focus to the button that opened it.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('click outside an open listbox closes it without changing the value', async ({ page }) => {
  await page.goto('/');
  const speed = page.getByRole('combobox', { name: 'Replay speed' });
  await speed.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.mouse.click(700, 150);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(speed).toContainText('1×');
});

test('setup defaults to GLM 5.3 Flash, offers economical presets, and filters the model catalog', async ({ page }) => {
  // The live setup needs a configured server; it is faked in the browser, so no key is needed.
  await mockLiveCatalog(page);
  await page.goto('/');
  await setupButton(page).click();
  await page.getByText('Advanced: models, behaviour, and each country').click();
  await expect(page.getByRole('combobox', { name: 'Britain model' })).toHaveValue('z-ai/glm-5.3-flash');
  await page.getByRole('button', { name: /Economical mix/ }).click();
  await expect(page.getByRole('combobox', { name: 'Britain model' })).toHaveValue('z-ai/glm-5.3-flash');
  await expect(page.getByRole('combobox', { name: 'France model' })).toHaveValue('anthropic/claude-haiku-5.5');
  await page.getByRole('button', { name: /Haiku 5.5 only/ }).click();
  await expect(page.getByRole('combobox', { name: 'Turkey model' })).toHaveValue('anthropic/claude-haiku-5.5');
  // Free text is accepted and Escape restores the last committed value.
  const germany = page.getByRole('combobox', { name: 'Germany model' });
  await germany.fill('vendor/custom-model');
  await page.keyboard.press('Escape');
  await expect(germany).toHaveValue('anthropic/claude-haiku-5.5');
  await germany.fill('vendor/custom-model');
  await page.keyboard.press('Enter');
  await expect(germany).toHaveValue('vendor/custom-model');
  // Stepper: on the Length step, typing a value and using the increment control keep the limit in range.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const phases = page.getByLabel('Phase limit', { exact: true });
  await phases.fill('12');
  await page.getByRole('button', { name: 'Increase phase limit' }).click();
  await expect(phases).toHaveValue('13');
  await page.getByRole('button', { name: 'Close dialog' }).click();
});

test('branch an exact moment, replace an order, play one phase, compare, reload, and export', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Seek moment 0: before Spring 1901' }).click();
  await page.getByRole('button', { name: 'Try a different decision' }).click();
  await choose(page, 'Replace one legal order', 'Fleet Brest moves to Mid-Atlantic Ocean');
  await page.getByRole('button', { name: 'Create alternate timeline', exact: true }).click();
  await expect(page.getByText('A different decision. A different Europe.')).toBeVisible();
  await page.getByRole('button', { name: /^Play next phase \(free\)/ }).click();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 1 of 1');
  await expect(page.locator('.match-status')).toContainText('Paused');
  const id = await page.evaluate(() => localStorage.getItem('seven-powers-match'));
  const match = await (await request.get(`/api/matches/${id}`)).json();
  expect(match.checkpoints[1].state.board.units.FRANCE).toContain('F MAO');
  expect(match.turns[0].promises.find((p: { from: string }) => p.from === 'FRANCE').kept).toBe(true);
  const original = await (await request.get(`/api/matches/${match.parent.id}`)).json();
  expect(original.checkpoints[1].state.board.units.FRANCE).toContain('F ENG');
  await page.reload();
  await expect(page.locator('.timeline-labels')).toContainText('Moment 1 of 1');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export complete replay' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/seven-powers-.*\.json/);
});

test('sandbox is labelled as free local policies: start game plays to the phase limit, then says why it stopped', async ({
  page,
}) => {
  await page.goto('/');
  await setupButton(page).click();
  await page.getByRole('button', { name: /No-cost sandbox/ }).click();
  const gameName = `Browser flow verification ${Date.now()}`;
  await page.getByLabel('Game name').fill(gameName);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // The guidance step explains that the sandbox does not read written guidance.
  await expect(page.getByText('cannot read written guidance', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Phase limit', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByText('LOCAL SANDBOX', { exact: true })).toBeVisible();
  // Start game plays on, one phase at a time, to the limit the viewer chose.
  await expect(page.locator('.timeline-labels')).toContainText('Moment 3 of 3', { timeout: 30_000 });
  await expect(page.locator('.end-screen')).toContainText('Stopped at the phase limit');
  // A finished game's primary control is a free recorded replay, never a request for more phases.
  await expect(page.getByRole('button', { name: /^Replay recorded phases from the opening/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'The game is over: no further phases to play' })).toBeDisabled();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: gameName })).toBeVisible();
});

test('opening the app never starts a model run or changes the record', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('.timeline-labels')).toContainText('Moment 1 of 9');
  await page.waitForTimeout(1500);
  await expect(page.locator('.match-status')).not.toContainText('working');
  const id = await page.evaluate(() => localStorage.getItem('seven-powers-match'));
  const match = await (await request.get(`/api/matches/${id}`)).json();
  expect(match.status).toBe('complete');
  expect(match.turns.length).toBe(9);
});

test('mobile has no horizontal overflow, guidance stacks, and custom listboxes stay on screen', async ({ page }) => {
  await mockLiveCatalog(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Europe, on the brink.' })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await expect(page.locator('.phase-guide')).toBeVisible();
  // The first moment reads in full on a phone: its headline and promise row sit inside the
  // screen width, and the in-focus strip begins only after the story ends.
  const phone = await page.evaluate(() => {
    const row = document.querySelector('.moment.broken .moment-compare')!.getBoundingClientRect();
    const story = document.querySelector('.dispatch-scroll')!.getBoundingClientRect();
    const focus = document.querySelector('.country-preview')!.getBoundingClientRect();
    const headline = document.querySelector('.moment.broken h4')!.getBoundingClientRect();
    return {
      headlineInScreen: headline.left >= 0 && headline.right <= innerWidth,
      rowInScreen: row.left >= 0 && row.right <= innerWidth,
      stripAfterStory: focus.top >= story.bottom - 0.5,
      headlineSize: parseFloat(getComputedStyle(document.querySelector('.moment.broken h4')!).fontSize),
    };
  });
  expect(phone.headlineInScreen).toBe(true);
  expect(phone.rowInScreen).toBe(true);
  expect(phone.stripAfterStory).toBe(true);
  expect(phone.headlineSize).toBeGreaterThanOrEqual(18);
  expect(
    await page.evaluate(
      () =>
        document.querySelector('.playback-panel')!.getBoundingClientRect().top >=
        document.querySelector('.dispatch-panel')!.getBoundingClientRect().bottom - 1,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Country details' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await setupButton(page).click();
  await expect(page.getByLabel('Game name')).toBeVisible();
  expect(await noOverflow(page)).toBe(true);

  // Presets and a custom model listbox both fit the phone width.
  await page.getByText('Advanced: models, behaviour, and each country').click();
  await page.getByRole('button', { name: /Haiku 5.5 only/ }).click();
  const germany = page.getByRole('combobox', { name: 'Germany model' });
  await germany.click();
  const list = page.getByRole('listbox');
  await expect(list).toBeVisible();
  const box = await list.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('combobox', { name: 'Italy behavioral profile' }).click();
  await expect(page.getByRole('option', { name: 'Opportunist' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
