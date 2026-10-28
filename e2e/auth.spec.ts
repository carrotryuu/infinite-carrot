import { expect, test } from '@playwright/test';
import { AuthRuntime } from '../apps/server/src/auth/runtime';
import { readAuthConfig, IDENTITY_SCOPE } from '../apps/server/src/auth/config';
import { Permission } from '../packages/shared/permissions';

test('mock login enters assigned workspace, survives reload and logout revokes the session', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '登录无限画布' })).toBeVisible();
  await page.getByRole('button', { name: '演示导演', exact: true }).click();
  await expect(page.getByRole('heading', { name: '工作空间' })).toBeVisible();
  await expect(page.locator('header')).toContainText('演示导演');
  const cookie = (await context.cookies()).find((value) => value.name === 'carrot_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('carrot_session');
  await page.reload();
  await expect(page.getByRole('heading', { name: '工作空间' })).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test('disabling an account makes its next request return 401 and redirects the open page', async ({
  page,
}) => {
  test.skip(process.env.AUTH_INTEGRATION_TESTS !== '1', 'Requires local PostgreSQL and Redis');
  const runtime = new AuthRuntime(readAuthConfig());
  expect(runtime.config.MOCK_EXTERNAL).toBe('1');
  await runtime.start();
  let id: string | undefined;
  const actor = {
    teamId: IDENTITY_SCOPE,
    tenantId: null,
    actor: 'playwright',
    permissions: [Permission.AccountManage],
  };
  try {
    await page.goto('/login');
    await page.getByRole('button', { name: '演示剪辑', exact: true }).click();
    await expect(page.getByRole('heading', { name: '工作空间' })).toBeVisible();
    const profile = await page.request.get('/api/auth/me');
    id = ((await profile.json()) as { id: string }).id;
    await runtime.repository.setStatus(id, 'disabled', actor);
    const unauthorized = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/organization/context') && response.status() === 401,
    );
    await page.reload();
    await unauthorized;
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: '演示剪辑', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('账号可能已停用');
  } finally {
    if (id) await runtime.repository.setStatus(id, 'active', actor);
    await runtime.close();
  }
});
