import { expect, test, type Page } from '@playwright/test';
async function login(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name: '工作空间', exact: true })).toBeVisible();
}
test('project-specific role controls buttons and switching team persists after reload', async ({
  page,
}) => {
  await login(page, '演示导演');
  await page.getByLabel('当前组').selectOption({ label: 'A 组' });
  await expect(
    page.getByRole('article', { name: 'X 项目' }).getByRole('button', { name: '查看项目成员' }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Y 项目' }).getByRole('button', { name: '查看项目成员' }),
  ).toHaveCount(0);
  await page
    .getByRole('article', { name: 'X 项目' })
    .getByRole('button', { name: '查看项目成员' })
    .click();
  await expect(page.getByRole('article', { name: 'X 项目' })).toContainText('演示动画师');
  await page.getByLabel('当前组').selectOption({ label: 'B 组' });
  await expect(page.getByRole('article', { name: 'Z 项目' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'X 项目' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('article', { name: 'Z 项目' })).toBeVisible();
});
test('owner can read global people but has no account-management or project-member controls', async ({
  page,
}) => {
  await login(page, '演示老板');
  await expect(page.getByRole('button', { name: '账号管理', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看项目成员' })).toHaveCount(0);
  await page.getByRole('button', { name: '全公司人员（只读）' }).click();
  await expect(page.getByRole('heading', { name: '全公司人员', exact: true })).toBeVisible();
  await expect(page.getByRole('list')).toContainText('演示 HRBP');
  expect((await page.request.get('/api/organization/administration')).status()).toBe(403);
});

test('HRBP can create a group and producers create projects in the private company group', async ({
  page,
}) => {
  await login(page, '演示 HRBP');
  await page.getByRole('button', { name: '账号管理', exact: true }).click();
  const group = '验收组-' + Date.now();
  await page.getByLabel('新组名称').fill(group);
  await page.getByRole('button', { name: '创建组', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(group);
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, '演示制片');
  const project = '验收项目-' + Date.now();
  await page.getByLabel('新项目名称').fill(project);
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByRole('article', { name: project })).toBeVisible();
  await expect(page.getByLabel('当前组').locator('option:checked')).toHaveText('公司组');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, '演示老板');
  await expect(page.getByRole('button', { name: '创建项目', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article', { name: project })).toHaveCount(0);
});
test('HRBP transfers a user and disables their active session through the management page', async ({
  page,
  browser,
}) => {
  await login(page, '演示 HRBP');
  const response = await page.request.get('/api/organization/administration');
  const snapshot = (await response.json()) as {
    users: { id: string; name: string }[];
    memberships: { userId: string; teamId: string; projectId: string | null; roleId: string }[];
  };
  const target = snapshot.users.find((user) => user.name === '演示执行导演')!;
  const original = snapshot.memberships
    .filter((m) => m.userId === target.id)
    .map(({ teamId, projectId, roleId }) => ({ teamId, projectId, roleId }));
  const origin = new URL(page.url()).origin;
  const targetContext = await browser.newContext({ baseURL: origin });
  const targetPage = await targetContext.newPage();
  try {
    await page.getByRole('button', { name: '账号管理', exact: true }).click();
    await page.getByLabel('选择账号').selectOption(target.id);
    await page.getByLabel('范围 1', { exact: true }).selectOption({ label: 'A 组' });
    await page.getByLabel('角色 1', { exact: true }).selectOption({ label: '动画师' });
    await page.getByRole('button', { name: '保存组和角色' }).click();
    await expect(page.getByRole('status')).toContainText('已保存');
    await login(targetPage, '演示执行导演');
    await expect(targetPage.getByRole('article', { name: 'X 项目' })).toBeVisible();
    await expect(targetPage.getByRole('article', { name: 'Z 项目' })).toHaveCount(0);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: '停用账号', exact: true }).click();
    await expect(page.getByRole('button', { name: '启用账号', exact: true })).toBeVisible();
    await targetPage.reload();
    await expect(targetPage).toHaveURL(/\/login$/);
  } finally {
    const headers = { Origin: origin };
    expect(
      (
        await page.request.post('/api/organization/users/' + target.id + '/status', {
          headers,
          data: { status: 'active' },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await page.request.post('/api/organization/users/' + target.id + '/memberships', {
          headers,
          data: { memberships: original },
        })
      ).ok(),
    ).toBe(true);
    await targetContext.close();
  }
});
