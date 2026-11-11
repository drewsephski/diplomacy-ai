import { test, expect, type Page } from '@playwright/test';
import { clearUserGames, createSandbox, guideCard, openFromHistory, statusLine } from './helpers';

/**
 * Guided-card layout (review finding M6). Measured at the scroll position the viewer is really at,
 * not just by width: the card must be on screen, the focused province must stay visible above it,
 * every card action must be reachable, and the page must not scroll sideways.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '1'));
});

const overflow = (page: Page) =>
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > document.documentElement.clientWidth + 1;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
      .slice(0, 6),
  }));

/** Geometry in the current viewport (after any scrolling the page did). */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector('.guide-card')!.getBoundingClientRect();
    const map = document.querySelector('.stage .europe-map')!.getBoundingClientRect();
    const target = document.querySelector('.europe-map .guide-target');
    const t = target?.getBoundingClientRect();
    // Only controls that are rendered (the phone sheet moves Turn guidance off into the menu).
    const buttons = [...document.querySelectorAll('.guide-card .guide-foot button')].filter((b) => b.getClientRects().length > 0).map((b) => {
      const r = b.getBoundingClientRect();
      return { text: (b.textContent ?? '').trim(), top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
    return {
      vh: innerHeight,
      vw: innerWidth,
      card: { top: card.top, bottom: card.bottom, left: card.left, right: card.right, height: card.height },
      map: { top: map.top, bottom: map.bottom },
      target: t ? { cx: t.left + t.width / 2, cy: t.top + t.height / 2 } : undefined,
      buttons,
      headingFocused: document.activeElement?.tagName === 'H3' && !!document.activeElement.closest('.guide-card'),
    };
  });

test('phone: the guide opened from the dock is a visible sheet that takes the dock’s place, with the focused province above it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^You watch\. Seven independent countries decide/ })).toBeVisible();
  // The viewer has scrolled down to the story, far below the map. The dock stays in reach.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(400);
  await expect(page.locator('.play-button')).toBeInViewport();
  await page.locator('.play-button').click();
  const card = guideCard(page);
  await expect(card).toBeVisible();
  await page.waitForTimeout(400);
  const g = await geometry(page);
  // The sheet is fully on screen and takes at most about half of it.
  expect(g.card.top).toBeGreaterThanOrEqual(0);
  expect(g.card.bottom).toBeLessThanOrEqual(g.vh + 1);
  expect(g.card.left).toBeGreaterThanOrEqual(0);
  expect(g.card.right).toBeLessThanOrEqual(g.vw + 1);
  expect(g.card.height).toBeLessThanOrEqual(g.vh * 0.5 + 1);
  // The map was brought to the top of the screen, and the province in focus sits above the sheet.
  expect(g.map.top).toBeGreaterThanOrEqual(-2);
  expect(g.map.top).toBeLessThan(120);
  expect(g.target, 'the first beat highlights a province').toBeDefined();
  expect(g.target!.cy).toBeGreaterThan(0);
  expect(g.target!.cy).toBeLessThan(g.card.top);
  expect(g.target!.cx).toBeGreaterThan(0);
  expect(g.target!.cx).toBeLessThan(g.vw);
  // Every action in the card is on screen and at least 44px tall, and focus is in the card.
  for (const b of g.buttons) {
    expect(b.top, b.text).toBeGreaterThanOrEqual(0);
    expect(b.bottom, b.text).toBeLessThanOrEqual(g.vh + 1);
    expect(b.right, b.text).toBeLessThanOrEqual(g.vw + 1);
    expect(b.bottom - b.top, b.text).toBeGreaterThanOrEqual(44);
  }
  expect(g.headingFocused).toBe(true);
  // Never two bottom overlays: the dock is hidden while the sheet is open.
  await expect(page.locator('.playback')).toBeHidden();
  const o = await overflow(page);
  expect(o.scrollWidth, o.offenders.join(', ')).toBeLessThanOrEqual(o.innerWidth);
  // Moving through the walkthrough keeps the sheet and its province in view.
  await card.getByRole('button', { name: /^(Next|Reveal the orders|Phase summary)/ }).click();
  const g2 = await geometry(page);
  expect(g2.card.top).toBeGreaterThanOrEqual(0);
  expect(g2.card.bottom).toBeLessThanOrEqual(g2.vh + 1);
  if (g2.target) expect(g2.target.cy).toBeLessThan(g2.card.top);
  // The sheet collapses to a peek bar so the map is free, and expands again.
  await card.getByRole('button', { name: 'Hide the details to see the map' }).click();
  expect((await card.boundingBox())!.height).toBeLessThan(120);
  await card.getByRole('button', { name: 'Show the details of this card' }).click();
  // Closing the guide brings the dock back.
  await card.getByRole('button', { name: 'Close guide', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.play-button')).toBeInViewport();
});

test('phone: the compact top bar fits while reading during a watch, with no sideways overflow', async ({ page, request }) => {
  await clearUserGames(request);
  await createSandbox(request, 'Phone watch', 40);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openFromHistory(page, 'Phone watch');
  await page.getByRole('button', { name: /^Play first phase \(free\)/ }).click();
  await expect(guideCard(page)).toBeVisible({ timeout: 20_000 });
  await expect(statusLine(page)).toContainText('Reading');
  await page.evaluate(() => window.scrollTo(0, 0));
  const o = await overflow(page);
  expect(o.scrollWidth, o.offenders.join(', ')).toBeLessThanOrEqual(o.innerWidth);
  for (const sel of ['.brand-mark', '.match-name', '.mode-label', '.menu-button', '.match-status .status-text']) {
    const box = (await page.locator(sel).boundingBox())!;
    expect(box.x, sel).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, sel).toBeLessThanOrEqual(390);
  }
  // Nothing plays while reading; closing the card pauses the held watch.
  await guideCard(page).getByRole('button', { name: 'Pause and close guide' }).click();
  await expect(statusLine(page)).toContainText('Paused');
});

for (const [width, height] of [
  [1536, 1024],
  [1280, 800],
]) {
  test(`desktop ${width}×${height}: the card sits over the map, in view, with its actions reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('.play-button').click();
    await expect(guideCard(page)).toBeVisible();
    const g = await geometry(page);
    expect(g.card.top).toBeGreaterThanOrEqual(0);
    expect(g.card.bottom).toBeLessThanOrEqual(g.vh + 1);
    for (const b of g.buttons) expect(b.bottom, b.text).toBeLessThanOrEqual(g.vh + 1);
    // On desktop the card stays inside the map, not a sheet over the page.
    expect(await guideCard(page).evaluate((el) => !!el.closest('.europe-map'))).toBe(true);
    const o = await overflow(page);
    expect(o.scrollWidth).toBeLessThanOrEqual(o.innerWidth);
    // While the card is open there is no second, dead launch button: the footer closes the guide.
    await expect(page.locator('.play-button')).toHaveText('Close guide');
    await expect(page.locator('.guide-launch')).toHaveCount(0);
  });
}
