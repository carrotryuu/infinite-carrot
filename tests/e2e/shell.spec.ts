import { expect, test } from '@playwright/test';
test('loads the empty application without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('AI 视频无限画布');
  await expect(page.getByRole('main')).toBeVisible();
  expect(errors).toEqual([]);
});
