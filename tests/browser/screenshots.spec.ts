import { test } from '@playwright/test';

// Documentation captures. Run deliberately with CAPTURE_SCREENSHOTS=1 so routine test runs
// do not rewrite the images in docs/.
test.skip(!process.env.CAPTURE_SCREENSHOTS, 'Set CAPTURE_SCREENSHOTS=1 to refresh docs images.');

test('capture desktop and mobile documentation screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Europe, on the brink.' }).waitFor();
  await page.locator('.power-row').filter({ hasText: 'France' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/desktop.png' });

  await page.getByRole('button', { name: 'New simulation' }).click();
  await page.getByRole('button', { name: /Economical mix/ }).click();
  await page.getByRole('combobox', { name: 'Germany model' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/setup-desktop.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Europe, on the brink.' }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/mobile.png', fullPage: false });
  await page.getByRole('button', { name: 'New simulation' }).click();
  await page.getByRole('combobox', { name: 'Germany model' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/setup-mobile.png' });
});
