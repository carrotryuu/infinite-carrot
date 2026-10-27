import { expect, test } from '@playwright/test';

test('a real box selection moves all 50 selected nodes together', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/poc/canvas');
  await expect(page.getByTestId('first-paint')).not.toHaveText('加载中');
  for (let click = 0; click < 2; click++) {
    await page.locator('.react-flow__controls-zoomout').click();
    await page.waitForTimeout(500);
  }
  const stage = (await page.locator('.poc-stage').boundingBox())!;
  const transform = await page.locator('.react-flow__viewport').evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { x: matrix.e, y: matrix.f, zoom: matrix.a };
  });
  expect(transform.zoom).toBeCloseTo(0.5, 2);
  await page.mouse.move(stage.x + 600, stage.y + 350);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(stage.x + 648 - transform.x, stage.y + 406 - transform.y, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  const first = page.locator('.react-flow__node[data-id="node-0"]');
  const last = page.locator('.react-flow__node[data-id="node-49"]');
  const firstBox = (await first.boundingBox())!;
  const lastBox = (await last.boundingBox())!;
  await page.mouse.move(firstBox.x - 8, firstBox.y - 8);
  await page.mouse.down();
  await page.mouse.move(lastBox.x + lastBox.width + 8, lastBox.y + lastBox.height + 8, {
    steps: 20,
  });
  await page.mouse.up();
  await expect(page.getByTestId('selection-count')).toHaveText('已选 50 个');
  await page.waitForTimeout(300);
  const positions = () =>
    page.locator('.react-flow__node.selected').evaluateAll((nodes) =>
      nodes.map((node) => {
        const matrix = new DOMMatrix(getComputedStyle(node).transform);
        return { id: node.getAttribute('data-id'), x: matrix.e, y: matrix.f };
      }),
    );
  const before = await positions();
  expect(before).toHaveLength(50);
  const dragBox = (await page.locator('.react-flow__node[data-id="node-22"]').boundingBox())!;
  await page.mouse.move(dragBox.x + 35, dragBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + 95, dragBox.y + 38, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByTestId('selection-count')).toHaveText('已选 50 个');
  const after = await positions();
  const reference = before[0]!;
  const moved = after.find((node) => node.id === reference.id)!;
  const delta = { x: moved.x - reference.x, y: moved.y - reference.y };
  // React Flow consumes the drag threshold before applying the group delta.
  expect(delta.x).toBeGreaterThan(100);
  expect(delta.y).toBeGreaterThan(40);
  for (const previous of before) {
    const current = after.find((node) => node.id === previous.id)!;
    expect(current.x - previous.x).toBeCloseTo(delta.x, 1);
    expect(current.y - previous.y).toBeCloseTo(delta.y, 1);
  }
  expect(await page.locator('video').count()).toBeLessThanOrEqual(4);
});

test('canvas loads the fixture, limits preview videos, and simplifies when zoomed out', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/poc/canvas');
  await expect(page.getByRole('heading', { name: '一集的规模，一张画布' })).toBeVisible();
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await expect(page.getByTestId('first-paint')).not.toHaveText('加载中', { timeout: 15000 });
  await expect(page.locator('video')).toHaveCount(0);
  expect(await page.locator('.react-flow__node').count()).toBeLessThan(150);
  await page.evaluate(() => {
    const history: number[] = [];
    const observer = new MutationObserver(() =>
      history.push(document.querySelectorAll('video').length),
    );
    observer.observe(document.querySelector('.poc-stage')!, { childList: true, subtree: true });
    Object.assign(window, { videoHistory: history });
  });
  await page.locator('.react-flow__node').first().hover();
  await expect(page.locator('video')).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluateAll((videos) =>
          videos.every(
            (video) =>
              video instanceof HTMLVideoElement &&
              video.readyState >= 2 &&
              video.videoWidth === 1280,
          ),
        ),
    )
    .toBe(true);
  await page.getByRole('heading', { name: '一集的规模，一张画布' }).hover();
  await expect(page.locator('video')).toHaveCount(0);
  for (let index = 0; index < 6; index++) {
    await page
      .locator('.react-flow__node')
      .nth(index)
      .click({ modifiers: ['Shift'] });
  }
  await page.getByRole('heading', { name: '一集的规模，一张画布' }).hover();
  await expect(page.getByTestId('selection-count')).toHaveText('已选 6 个');
  await expect(page.locator('video')).toHaveCount(4);
  await page.getByRole('button', { name: '查看全局' }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('.poc-card.simple')).toHaveCount(150);
  await page.getByRole('button', { name: '回到起点' }).click();
  await expect(page.locator('video')).toHaveCount(4);
  const history = await page.evaluate(
    () => (window as unknown as { videoHistory: number[] }).videoHistory,
  );
  expect(Math.max(...history)).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: '重置画布' }).click();
  await expect(page.getByTestId('selection-count')).toHaveText('已选 0 个');
  await expect(page.locator('video')).toHaveCount(0);
  expect(errors).toEqual([]);
});
