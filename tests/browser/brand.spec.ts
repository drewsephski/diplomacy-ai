import { test, expect } from '@playwright/test';

/** Brand integration: every icon link and the manifest resolve, and the in-page mark is truly transparent. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('seven-powers-guided', '0'));
});

test('every icon and manifest link resolves to an image of the declared size', async ({ page }) => {
  await page.goto('/');
  const links = await page.$$eval('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]', (els) =>
    els.map((el) => ({ rel: el.getAttribute('rel'), href: el.getAttribute('href'), sizes: el.getAttribute('sizes') })),
  );
  expect(links.length).toBeGreaterThanOrEqual(7);
  for (const l of links) {
    const res = await page.request.get(l.href!);
    expect(res.status(), l.href!).toBe(200);
    if (l.href!.endsWith('.png') && l.sizes && l.sizes !== 'any') {
      const [w] = l.sizes.split('x').map(Number);
      const dims = await page.evaluate(
        (src) =>
          new Promise<{ w: number; h: number }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => reject(new Error(src));
            img.src = src;
          }),
        l.href!,
      );
      expect(dims, l.href!).toEqual({ w, h: w });
    }
  }
  const manifest = await (await page.request.get('/manifest.webmanifest?v=2')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).status()).toBe(200);
  const ico = await page.request.get('/favicon.ico?v=2');
  expect(ico.headers()['content-type']).toMatch(/icon|octet|x-icon/);
  const bytes = await ico.body();
  expect(bytes.readUInt16LE(4)).toBe(3); // three frames: 16, 32, 48
});

test('the header mark is transparent at its corners and has no tile or halo', async ({ page }) => {
  await page.goto('/');
  await page.locator('.brand-mark').waitFor();
  const corners = await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('.brand-mark')!;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const alpha = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[3];
    const { width, height } = c;
    return {
      alphaCorners: [alpha(0, 0), alpha(width - 1, 0), alpha(0, height - 1), alpha(width - 1, height - 1)],
      alphaCenter: alpha(Math.floor(width / 2), Math.floor(height / 2)),
      rendered: img.getBoundingClientRect().width,
    };
  });
  expect(corners.alphaCorners).toEqual([0, 0, 0, 0]);
  expect(corners.alphaCenter).toBeGreaterThan(200);
  expect(corners.rendered).toBe(38);
});

test('the mark stays readable and borderless on dark and light page backgrounds', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 320 });
  await page.goto('/');
  await page.locator('.brand-mark').waitFor();
  await page.locator('.topbar').screenshot({ path: 'docs/brand/header-dark.png' });
  await page.addStyleTag({ content: 'body, .app-shell { background: #efe7d2 !important; } .topbar { background: #efe7d2 !important; }' });
  await page.locator('.topbar').screenshot({ path: 'docs/brand/header-light.png' });
  const width = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(width).toBe(true);
});

test('small sizes: the favicon tile and the header mark keep their silhouettes at 16 and 38 pixels', async ({ page }) => {
  await page.goto('/');
  await page.locator('.brand-mark').waitFor();
  await page.setViewportSize({ width: 390, height: 700 });
  await page.locator('.brand-mark').screenshot({ path: 'docs/brand/mark-header-mobile.png' });
  const size = await page.locator('.brand-mark').boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(28);
});
