import { expect, test } from '@playwright/test';

test('unpaired visitors see only the pairing screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByText(/Setup secret|Six-digit code|proxy/i).first()).toBeVisible();
  await expect(page.getByText(/Not financial advice/i).first()).toBeVisible();
  await expect(page.locator('.workspace')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('no restricted branding anywhere on the page', async ({ page }) => {
  await page.goto('./');
  const html = (await page.content()).toLowerCase();
  expect(html).not.toContain('bloomberg');
  expect(await page.title()).not.toMatch(/bloomberg/i);
});

test('footer disclaimer and no horizontal scroll', async ({ page }) => {
  await page.goto('./');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('static supply chain data is served', async ({ request }) => {
  const r = await request.get('supply/edges.json');
  expect(r.ok()).toBe(true);
  const j = (await r.json()) as { companies: number; edges: unknown[] };
  expect(j.companies).toBeGreaterThan(100);
});
