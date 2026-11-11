import { test, expect, type Page } from '@playwright/test';
import {
  clearUserGames,
  createSandbox,
  getGame,
  guideCard,
  listGames,
  openFromHistory,
  playSandbox,
  primary,
  settle,
  statusLine,
  trackTraffic,
} from '/Users/drewsepeczi/.t3/projects/7powers/tests/browser/helpers';

const setGuided = (page: Page, on: boolean) =>
  page.addInitScript((v) => localStorage.setItem('seven-powers-guided', v), on ? '1' : '0');
const log = (k: string, v: unknown) => console.log(`RECHECK ${k} ${JSON.stringify(v)}`);

test.beforeEach(async ({ request }) => {
  await clearUserGames(request);
});

async function setupSandbox(page: Page, name: string) {
  await page.locator('.new-simulation').click();
  await page.getByRole('button', { name: /No-cost sandbox/ }).click();
  await page.getByLabel('Game name').fill(name);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
}

// N1: Setup Start game while the previous game's run response is still in transit.
test('N1 setup start while another run response is pending', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Game A', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Game A');
  await page.route(`**/api/matches/${a.id}/run`, async (route) => {
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 5000));
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect.poll(() => t.runsFor(a.id)).toBe(1);
  await setupSandbox(page, 'Game B');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  const samples: unknown[] = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    const dialogs = await page.getByRole('dialog').count();
    const alert = dialogs ? await page.getByRole('dialog').getByRole('alert').allInnerTexts() : [];
    if (i === 2) await page.screenshot({ path: 'n1-stuck.png' });
    const games = await listGames(request);
    const b = games.find((g) => g.name === 'Game B');
    samples.push({
      s: i + 1,
      dialogs,
      alert,
      status: await statusLine(page).innerText(),
      primary: await primary(page).innerText(),
      runsA: t.runsFor(a.id),
      runsB: b ? t.runsFor(b.id) : 0,
      phasesB: b?.phases,
      bStatus: b?.status,
      phasesA: games.find((g) => g.name === 'Game A')?.phases,
    });
  }
  for (const x of samples) log('N1', x);
  // Close the dialog: does anything start afterwards?
  if (await page.getByRole('dialog').count()) await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.waitForTimeout(5000);
  const bb = (await listGames(request)).find((g) => g.name === 'Game B')!;
  log('N1-after-close', { runsB: t.runsFor(bb.id), status: await statusLine(page).innerText(), primary: await primary(page).innerText(), phasesB: bb.phases });
  log('N1-pauses', t.pauses);
});

// N2: a late run response that still reports "running" after Pause gets a second pause with the same ticket.
test('N2 late running response after pause sends the pause again', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Late running', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Late running');
  await page.route(`**/api/matches/${a.id}/run`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({ response, json: { ...body, status: 'running' } });
  });
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect.poll(() => t.runsFor(a.id)).toBe(1);
  await primary(page).click();
  await page.waitForTimeout(4000);
  log('N2', {
    runs: t.runsFor(a.id),
    pauses: t.pausesFor(a.id),
    sameTicket: t.pauses.every((p) => p.ticket === t.runs[0].ticket),
    primary: await primary(page).innerText(),
  });
  await page.waitForTimeout(3000);
  log('N2b', { runs: t.runsFor(a.id), primary: await primary(page).innerText(), status: await statusLine(page).innerText() });
});

// N3: Continue watching, then How to watch inside the 1.6 s pace window.
test('N3 continue watching then a dialog inside the pace window', async ({ page, request }) => {
  await setGuided(page, true);
  const a = await createSandbox(request, 'Pace race', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Pace race');
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  const card = guideCard(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 12 && !(await card.locator('.guide-next').count()); i++)
    await card.getByRole('button', { name: /^(Next event|Phase summary)/ }).click();
  const runsBefore = t.runsFor(a.id);
  await card.getByRole('button', { name: /^Continue watching/ }).click();
  await page.waitForTimeout(150);
  const runsAfterContinue = t.runsFor(a.id);
  await page.getByRole('button', { name: 'How to watch' }).click();
  await page.waitForTimeout(4000);
  log('N3', { runsBefore, runsAfterContinue, runsLater: t.runsFor(a.id), status: await statusLine(page).innerText() });
});

// N4: double click on the primary control.
test('N4 double click on Play first phase', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Double click', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Double click');
  await primary(page).dblclick();
  await page.waitForTimeout(5000);
  const s = await settle(request, a.id);
  log('N4', { runs: t.runsFor(a.id), pauses: t.pausesFor(a.id), phases: s.turns.length, status: await statusLine(page).innerText(), primary: await primary(page).innerText() });
});

// N5: a second page that merely views a game another page is watching.
test('N5 passive second page opening Help while another page watches', async ({ page, context, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Two pages', 40);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Two pages');
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect.poll(() => t.runsFor(a.id)).toBeGreaterThan(0);
  const b = await context.newPage();
  const tb = trackTraffic(b);
  await b.goto('/');
  await expect(b.locator('.match-name')).toContainText('Two pages');
  await b.waitForTimeout(300);
  const runsBeforeHelp = t.runsFor(a.id);
  // Wait until the server reports running so the passive page sees a running match.
  for (let i = 0; i < 40 && (await getGame(request, a.id)).status !== 'running'; i++) await b.waitForTimeout(50);
  await b.getByRole('button', { name: 'How to watch' }).click();
  await page.waitForTimeout(4000);
  log('N5pre', { runsBeforeHelp });
  log('N5', { pausesFromPassive: tb.pausesFor(a.id), runsFromPassive: tb.runsFor(a.id), runsA: t.runsFor(a.id), statusA: await statusLine(page).innerText() });
});

// N6: mobile guided hold geometry at two phone sizes.
for (const vp of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test(`N6 mobile guided hold ${vp.width}x${vp.height}`, async ({ browser, request }) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await setGuided(page, true);
    await createSandbox(request, 'Phone hold', 40);
    await page.goto('/');
    await openFromHistory(page, 'Phone hold');
    await page.locator('.play-button').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
    const card = guideCard(page);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    const geo = await page.evaluate(() => {
      const c = document.querySelector('.guide-card')!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.guide-card button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { t: (b.textContent || '').trim().slice(0, 30), visible: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
      });
      const hi = document.querySelector('.province.focus, [data-focus="true"], .focused, .highlight');
      return {
        card: { top: Math.round(c.top), bottom: Math.round(c.bottom), h: Math.round(c.height) },
        vh: innerHeight,
        scrollW: document.documentElement.scrollWidth,
        vw: innerWidth,
        buttons,
        focusEl: hi ? (hi as Element).getBoundingClientRect().top : null,
        active: document.activeElement?.closest('.guide-card') ? 'in-card' : document.activeElement?.tagName,
      };
    });
    log(`N6-${vp.width}`, geo);
    await page.screenshot({ path: `/private/tmp/claude-501/-Users-drewsepeczi--t3-projects-7powers/e96d2418-9b89-4894-a7e4-b171a64cfc23/scratchpad/recheck/m${vp.width}-hold.png` });
    // Read to the summary on the phone and check Continue watching is reachable.
    for (let i = 0; i < 12 && !(await card.locator('.guide-next').count()); i++)
      await card.getByRole('button', { name: /^(Next event|Phase summary)/ }).click();
    const cont = card.getByRole('button', { name: /^Continue watching/ });
    const box = await cont.boundingBox();
    log(`N6-${vp.width}-continue`, { box, vh: vp.height });
    await page.screenshot({ path: `/private/tmp/claude-501/-Users-drewsepeczi--t3-projects-7powers/e96d2418-9b89-4894-a7e4-b171a64cfc23/scratchpad/recheck/m${vp.width}-summary.png` });
    await ctx.close();
  });
}

// N7: a saved, finished sandbox game replays free from History "From the start".
test('N7 finished sandbox replay from History', async ({ page, request }) => {
  await setGuided(page, false);
  const a = await createSandbox(request, 'Finished game', 2);
  await playSandbox(request, a.id);
  const t = trackTraffic(page);
  await page.goto('/');
  await openFromHistory(page, 'Finished game', true);
  const label = await primary(page).innerText();
  await primary(page).click();
  await page.waitForTimeout(5500);
  const m = await page.locator('.timeline-labels').innerText();
  log('N7', { label, moment: m, runs: t.runs.length });
});
