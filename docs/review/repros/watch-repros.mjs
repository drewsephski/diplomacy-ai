// Independent-review repros. Run against an isolated server only:
//   PORT=3012 DATA_DIR=<temp> OPENROUTER_API_KEY= npx tsx server/index.ts
//   node docs/review/repros/watch-repros.mjs
// Uses sandbox games only (no model calls). Each POST /run is counted as "one phase requested";
// in a live game the same request would be up to 7 x (rounds + 1) billed model calls.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3012';
const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];
const configs = Object.fromEntries(POWERS.map((p) => [p, { model: 'z-ai/glm-5.3-flash', profile: 'strategist' }]));
const results = [];
const log = (name, ok, detail) => {
  results.push({ name, reproduced: ok, detail });
  console.log(`${ok ? 'REPRODUCED' : 'not reproduced'} · ${name} · ${JSON.stringify(detail)}`);
};

async function j(path, body, method) {
  const r = await fetch(`${BASE}/api${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}
async function create(name, maxPhases = 40) {
  return j('/matches', { name, mode: 'sandbox', configs, limits: { maxPhases, budgetUsd: 1, maxOutputTokens: 1800, diplomacyRounds: 2 } });
}
async function settle(id) {
  for (let i = 0; i < 60; i++) {
    const m = await j(`/matches/${id}`);
    if (m.status !== 'running') return m;
    await new Promise((r) => setTimeout(r, 250));
  }
}
async function cleanup() {
  for (const g of await j('/matches')) if (g.mode !== 'sample') await settle(g.id).then(() => j(`/matches/${g.id}`, undefined, 'DELETE'));
}

const browser = await chromium.launch();
async function freshPage(id) {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
  const page = await ctx.newPage();
  const runs = [];
  const pauses = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/run$/.test(r.url())) runs.push(Date.now());
    if (r.method() === 'POST' && /\/pause$/.test(r.url())) pauses.push(Date.now());
  });
  if (id) await ctx.addInitScript((v) => localStorage.setItem('seven-powers-match', v), id);
  await page.goto(BASE);
  await page.locator('.match-name').waitFor();
  return { ctx, page, runs, pauses };
}
const primary = (page) => page.locator('.play-button');
const status = (page) => page.locator('.match-status [aria-live]').innerText();
const moment = async (page) => (await page.locator('.timeline-labels').innerText()).match(/Moment (\d+) of (\d+)/).slice(1).map(Number);

if (!process.env.FROM_R5) {
// R1 + R2 + R3: reading pause, then any other dialog silently ends it and play resumes behind the modal.
{
  await cleanup();
  const m = await create('R1 reading then help');
  const { ctx, page, runs } = await freshPage(m.id);
  await primary(page).click(); // Play first phase (free)
  await page.locator('.guide-ready button').waitFor({ timeout: 20000 });
  const autoCard = await page.locator('.guide-card').count();
  log('R7 live/sandbox phase arrival does not open a guide card automatically', autoCard === 0, { guideCardsOpenAfterPhase: autoCard });
  await page.locator('.guide-ready button').click(); // Start the guide -> reading
  await settle(m.id);
  const s = await status(page);
  log('R3 status line while reading says "Playing · the next phase starts in a moment"', /Playing/.test(s), { status: s });
  const before = runs.length;
  await page.waitForTimeout(4000);
  log('reading pause holds while card open (expected behaviour)', runs.length === before, { runsDuringReading: runs.length - before });
  await page.screenshot({ path: 'docs/review/evidence/r1-reading-desktop.png' });
  await page.getByRole('button', { name: 'How to watch' }).click();
  await page.waitForTimeout(5000);
  const help = await page.locator('dialog[open]').count();
  log('R1 opening Help while reading closes the guide and resumes paid play behind the modal', runs.length > before && help === 1, {
    runsWhileHelpOpen: runs.length - before,
    helpDialogOpen: help,
  });
  await page.screenshot({ path: 'docs/review/evidence/r1-help-open-while-running.png' });
  await page.keyboard.press('Escape');
  // R2: other tabs do not pause.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Messages' }).click();
  const b2 = runs.length;
  await page.waitForTimeout(5000);
  log('R2 Messages tab keeps the watch session requesting phases while the board is hidden', runs.length > b2, { runsOnMessagesTab: runs.length - b2 });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Watch' }).click();
  // R9: scrubbing to an earlier moment does not pause.
  await page.getByRole('button', { name: /^Seek moment 0:/ }).click();
  const b3 = runs.length;
  await page.waitForTimeout(5000);
  const [at, of] = await moment(page);
  log('R9 seeking to an earlier moment keeps requesting phases while viewer looks back', runs.length > b3, { runsAfterSeek: runs.length - b3, at, of, status: await status(page) });
  await primary(page).click();
  await ctx.close();
}

// R11: finishing the walkthrough of the latest phase during a watch never clears the "ready" banner.
{
  await cleanup();
  const m = await create('R11 summary close');
  const { ctx, page } = await freshPage(m.id);
  await primary(page).click();
  await page.locator('.guide-ready button').waitFor({ timeout: 20000 });
  await page.locator('.guide-ready button').click();
  await page.getByRole('button', { name: 'Skip to phase summary' }).click().catch(() => {});
  const summaryNext = await page.locator('.guide-next').innerText().catch(() => '');
  const footButtons = await page.locator('.guide-foot button').allInnerTexts();
  await page.screenshot({ path: 'docs/review/evidence/r11-summary-during-watch.png' });
  await page.getByRole('button', { name: 'Close guide' }).click();
  await page.waitForTimeout(300);
  const ready = await page.locator('.guide-ready').count();
  log('R11 summary during watch claims "Nothing runs until you choose" yet closing resumes play; banner stays', /Nothing runs until you choose/.test(summaryNext), {
    summaryNext,
    footButtons,
    readyBannerAfterClose: ready,
  });
  await page.waitForTimeout(500);
  await primary(page).click().catch(() => {});
  await ctx.close();
}

}
if (!process.env.FROM_R4) {
// R5: Pause pressed while the /run response is still in flight sends no /pause; the server plays the whole phase.
{
  await cleanup();
  const m = await create('R5 pause in flight');
  const { ctx, page, runs, pauses } = await freshPage(m.id);
  await page.route('**/run', async (route) => {
    const response = await route.fetch(); // server has already started the phase
    await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({ response });
  });
  await primary(page).click();
  await page.waitForTimeout(2000); // the watch waits PACE_MS (1.6 s) before its first request
  const label = await primary(page).innerText();
  await primary(page).click(); // Pause while response pending
  await page.waitForTimeout(6000);
  const after = await j(`/matches/${m.id}`);
  log('R5 Pause during an in-flight /run sends no /pause; the full phase still resolves', pauses.length === 0 && after.turns.length >= 1, {
    labelWhenPausing: label,
    runRequests: runs.length,
    pauseRequests: pauses.length,
    turnsResolvedAfterPause: after.turns.length,
  });
  await ctx.close();
}

}
// R4: a switched-away watch session survives in state, and re-opening that game resumes it with no Resume press.
{
  await cleanup();
  const a = await create('R4 game A');
  const { ctx, page, runs } = await freshPage(a.id);
  await primary(page).click(); // watch A
  await page.locator('.guide-ready button').waitFor({ timeout: 20000 });
  // Setup a second game while A is watched; its first-phase start fails (simulated network/provider error).
  await page.route('**/run', async (route) => {
    const body = route.request().url();
    if (!body.includes(a.id)) return route.fulfill({ status: 500, json: { error: 'Simulated start failure' } });
    return route.continue();
  });
  await page.getByRole('banner').getByRole('button', { name: 'Set up a game' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /Start game/ }).click();
  await page.locator('.form-error').waitFor();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await settle(a.id);
  await page.waitForTimeout(2500);
  const aTurns = (await j(`/matches/${a.id}`)).turns.length;
  const r0 = runs.length;
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Open R4 game A' }).click();
  await page.waitForTimeout(6000);
  const aAfter = (await j(`/matches/${a.id}`)).turns.length;
  log('R4 opening a saved game from History resumes its old watch session without Resume', runs.length > r0 && aAfter > aTurns, {
    runsAfterOpening: runs.length - r0,
    turnsBefore: aTurns,
    turnsAfter: aAfter,
    status: await status(page),
  });
  await primary(page).click().catch(() => {});
  await ctx.close();
}

// R8: closing Setup while Start game is in flight still starts the game and the watch session.
{
  await cleanup();
  const { ctx, page, runs } = await freshPage();
  await page.route('**/api/matches', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({ response });
  });
  await page.getByRole('banner').getByRole('button', { name: 'Set up a game' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /Start game/ }).click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); // dismiss while "Starting…"
  await page.waitForTimeout(6000);
  const games = (await j('/matches')).filter((g) => g.mode !== 'sample');
  log('R8 dismissing Setup during Start still creates, runs, and keeps watching', runs.length >= 1, {
    dialogsOpen: await page.locator('dialog[open]').count(),
    runRequests: runs.length,
    games: games.map((g) => ({ name: g.name, phases: g.phases })),
    status: await status(page),
  });
  await primary(page).click().catch(() => {});
  await ctx.close();
}

// R6: a person's completed game opened "From the start" cannot be replayed from the primary control.
{
  await cleanup();
  const m = await create('R6 finished game', 3);
  await j(`/matches/${m.id}/run`, { single: false });
  await settle(m.id);
  const paused = await create('R6 paused game', 40);
  await j(`/matches/${paused.id}/run`, { single: true });
  await settle(paused.id);
  const { ctx, page, runs } = await freshPage();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Replay R6 finished game from the start' }).click();
  await page.waitForTimeout(800);
  const p1 = { label: await primary(page).innerText(), disabled: await primary(page).isDisabled() };
  const storyText = (await page.locator('.dispatch-scroll .empty-state').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const guideLaunch = await page.locator('.guide-launch').count();
  await page.screenshot({ path: 'docs/review/evidence/r6-finished-from-start.png' });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Replay R6 paused game from the start' }).click();
  await page.waitForTimeout(800);
  const p2 = { label: await primary(page).innerText(), aria: await primary(page).getAttribute('aria-label') };
  log('R6 History "From the start" gives no replay control for a person\'s game', /Game over/.test(p1.label) && p1.disabled, {
    finished: p1,
    storyAtStart: storyText,
    guideLaunchVisible: guideLaunch,
    paused: p2,
    runRequests: runs.length,
  });
  await ctx.close();
}

await cleanup();
await browser.close();
const fs = await import('node:fs');
fs.writeFileSync('docs/review/evidence/watch-repros.json', JSON.stringify(results, null, 2));
