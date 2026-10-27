import { expect, test } from '@playwright/test';

test('20 mock tasks reach terminal states through live updates and survive a page reload', async ({
  page,
}) => {
  test.skip(process.env.POC_GATEWAY_ENABLED !== '1', 'PoC gateway is explicitly disabled');
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/poc/gateway');
  await expect(page.getByRole('heading', { name: '模型任务调试台' })).toBeVisible();
  await expect(page.getByTestId('socket-status')).toHaveText('实时连接正常');
  const prefix = `browser_${Date.now()}`;
  await page.getByLabel('幂等键（重复提交使用相同键）').fill(prefix);
  await page.getByRole('button', { name: '提交 20 个测试任务' }).click();
  const rows = page.locator('tbody tr').filter({ hasText: prefix });
  await expect(rows).toHaveCount(20);
  await expect
    .poll(async () => Number(await page.getByTestId('socket-updates').textContent()))
    .toBeGreaterThan(0);
  await page.reload();
  await expect(rows).toHaveCount(20);
  await expect
    .poll(
      async () =>
        rows.evaluateAll((elements) =>
          elements.every((element) =>
            ['succeeded', 'failed', 'canceled'].includes(element.getAttribute('data-status') || ''),
          ),
        ),
      { timeout: 150000 },
    )
    .toBe(true);
  await expect(rows.locator('a', { hasText: '打开视频' })).toHaveCount(20);
  // The same batch keys/payloads must not create more database tasks.
  await page.getByLabel('幂等键（重复提交使用相同键）').fill(prefix);
  await page.getByRole('button', { name: '提交 20 个测试任务' }).click();
  await expect(page.getByRole('button', { name: '提交 20 个测试任务' })).toBeEnabled();
  await expect(rows).toHaveCount(20);
  expect(errors).toEqual([]);
});
