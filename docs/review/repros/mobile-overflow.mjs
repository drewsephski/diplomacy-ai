import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3012';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE);
await page.locator('.match-name').waitFor();
const wide = () => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.width > 0) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(r.right)}`);
  }
  return { vw, scrollW: document.documentElement.scrollWidth, offenders: out.slice(0, 8) };
});
console.log('load', JSON.stringify(await wide()));
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.locator('.play-button').tap();
await page.waitForTimeout(700);
const card = await page.locator('.guide-card').boundingBox();
console.log('after tapping Watch with a guide', JSON.stringify({ card, scrollY: await page.evaluate(() => scrollY), cardVisible: card && card.y + card.height > 0 && card.y < 844 }), JSON.stringify(await wide()));
await page.locator('.guide-card').scrollIntoViewIfNeeded();
await page.screenshot({ path: 'docs/review/evidence/m390-guide-card-scrolled-to.png' });
await browser.close();
// (appended) matchbar while reading
{
  const b = await (await import('@playwright/test')).chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.goto(BASE); await p.locator('.match-name').waitFor();
  await p.locator('.play-button').tap(); await p.waitForTimeout(500);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  await p.screenshot({ path: 'docs/review/evidence/m390-matchbar-reading.png', clip: { x: 0, y: 0, width: 390, height: 240 } });
  await b.close();
}
