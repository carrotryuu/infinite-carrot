import { expect, test } from '@playwright/test';

test('starter page loads without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'AI 视频无限画布' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('API proxy preserves dependency health status', async ({ request }) => {
  const response = await request.get('/api/health');
  expect([200, 503]).toContain(response.status());
  const report = await response.json();
  for (const key of ['database', 'redis', 'nas']) expect(['ok', 'down']).toContain(report[key]);
  expect(report.status).toBe(response.status() === 200 ? 'ok' : 'down');
  if (process.env.E2E_REQUIRE_HEALTHY === '1') expect(response.status()).toBe(200);
});
