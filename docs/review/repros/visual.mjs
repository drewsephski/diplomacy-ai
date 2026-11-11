// Captures review screenshots from the isolated server (sample + sandbox only).
import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3012';
const out = 'docs/review/evidence';
const browser = await chromium.launch();
for (const [w, h, tag] of [[1536, 1024, 'd1536'], [1280, 800, 'd1280'], [390, 844, 'm390']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: tag === 'm390' ? 2 : 1, isMobile: tag === 'm390', hasTouch: tag === 'm390' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.locator('.match-name').waitFor();
  await page.screenshot({ path: `${out}/${tag}-first-load.png` });
  // Sample: primary control starts the guided walkthrough.
  await page.locator('.play-button').click();
  await page.locator('.guide-card').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${tag}-guide-card.png` });
  const card = await page.locator('.guide-card').boundingBox();
  const play = await page.locator('.play-button').boundingBox();
  const next = await page.locator('.guide-foot .guide-nav .button').last().boundingBox();
  const term = page.locator('.guide-card .term').first();
  let termShown = '';
  if (await term.count()) {
    await term.focus();
    await page.keyboard.press('Enter');
    termShown = await page.locator('.guide-term').innerText();
  }
  const focusInCard = await page.evaluate(() => !!document.activeElement?.closest('.guide-card'));
  console.log(tag, JSON.stringify({ viewport: [w, h], card, play, next, nextInViewport: next ? next.y + next.height <= h : null, termShown, focusInCard,
    scrollW: await page.evaluate(() => document.documentElement.scrollWidth) }));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.screenshot({ path: `${out}/${tag}-history.png`, fullPage: true });
  await ctx.close();
}
// Brand at small sizes
const ctx = await browser.newContext({ viewport: { width: 400, height: 200 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(BASE);
const links = await page.evaluate(() => [...document.querySelectorAll('link[rel*=icon], link[rel=manifest], link[rel=apple-touch-icon]')].map((l) => `${l.rel} ${l.getAttribute('sizes') ?? ''} ${l.getAttribute('href')}`));
console.log('icons', JSON.stringify(links));
await page.setContent(`<body style="margin:0;background:#0d1b2a;display:flex;gap:16px;padding:16px;align-items:center">
 <img src="${BASE}/favicon.ico" width=16 height=16><img src="${BASE}/brand/seven-powers-mark-256.png?v=2" width=16 height=16>
 <img src="${BASE}/brand/seven-powers-mark-256.png?v=2" width=38 height=38><div style="background:#f4efe6;padding:8px"><img src="${BASE}/brand/seven-powers-mark-256.png?v=2" width=38 height=38></div></body>`);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/brand-small.png`, clip: { x: 0, y: 0, width: 220, height: 80 } });
await browser.close();
