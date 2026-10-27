import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

// Run against a production build. Pointer/wheel input drives the real UI;
// no node/viewport state is changed through a test-only application API.
const baseURL = process.env.POC_BASE_URL || 'http://127.0.0.1:4173';
const headless = process.env.POC_HEADLESS === '1';
const channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const runs = Number(process.env.POC_RUNS || 3);
const output = process.env.POC_OUTPUT || '.local/poc-canvas-results.json';
mkdirSync('.local', { recursive: true });
const browser = await chromium.launch({ channel, headless });
const browserSession = await browser.newBrowserCDPSession();
const system = await browserSession.send('SystemInfo.getInfo');
const results = [];
let activePage;
try {
  for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseURL}/poc/canvas`);
    await page.bringToFront();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="first-paint"]')?.textContent !== '加载中' &&
        document.querySelector('.poc-metrics'),
    );
    await page.evaluate(() => {
      const state = { maxMounted: document.querySelectorAll('video').length, maxPlaying: 0 };
      const sample = () => {
        state.maxMounted = Math.max(state.maxMounted, document.querySelectorAll('video').length);
        state.maxPlaying = Math.max(
          state.maxPlaying,
          [...document.querySelectorAll('video')].filter((video) => !video.paused).length,
        );
      };
      new MutationObserver(sample).observe(document.querySelector('.poc-stage'), {
        subtree: true,
        childList: true,
      });
      document.addEventListener('play', sample, true);
      Object.assign(window, { pocVideoSample: state });
    });
    const stage = await page.locator('.poc-stage').boundingBox();
    assert(stage);
    const report = () => page.locator('.poc-metrics').getAttribute('data-report').then(JSON.parse);
    const start = async (name) => {
      await page.getByRole('button', { name: `记录${name}`, exact: true }).click();
    };
    const stop = async (name) => {
      await page.getByRole('button', { name: `停止${name}记录`, exact: true }).click();
    };
    const reset = async () => {
      await page.getByRole('button', { name: '重置画布' }).click();
      await page.waitForTimeout(400);
    };
    // Pan across multiple rows/columns, with the return journey included.
    await start('平移');
    const panX = stage.x + stage.width * 0.6;
    const panY = stage.y + stage.height * 0.65;
    await page.mouse.move(panX, panY);
    await page.mouse.down({ button: 'middle' });
    for (let step = 0; step <= 240; step++) {
      const phase = (step / 240) * Math.PI * 2;
      await page.mouse.move(panX - (700 * (1 - Math.cos(phase))) / 2, panY - 320 * Math.sin(phase));
      await page.waitForTimeout(16);
    }
    await page.mouse.up({ button: 'middle' });
    await stop('平移');
    await reset();
    // Zoom crosses the 0.4 simplification boundary in both directions.
    await start('缩放');
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    for (let step = 0; step < 100; step++) {
      await page.mouse.wheel(0, step % 40 < 20 ? 24 : -24);
      await page.waitForTimeout(40);
    }
    await stop('缩放');
    await reset();
    await page.locator('.react-flow__controls-zoomout').click();
    await page.waitForTimeout(500);
    await page.locator('.react-flow__controls-zoomout').click();
    await page.waitForTimeout(500);
    // Zoom buttons zoom around the viewport centre. Pan back to a fixed inset
    // through real pointer input so all ten columns fit at the same 50% scale.
    const transform = await page.locator('.react-flow__viewport').evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return { x: matrix.e, y: matrix.f, zoom: matrix.a };
    });
    assert(Math.abs(transform.zoom - 0.5) < 0.01);
    await page.mouse.move(stage.x + 600, stage.y + 350);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(stage.x + 600 + 48 - transform.x, stage.y + 350 + 56 - transform.y, {
      steps: 20,
    });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(300);
    const first = page.locator('.react-flow__node[data-id="node-0"]');
    const last = page.locator('.react-flow__node[data-id="node-49"]');
    const firstBox = await first.boundingBox();
    const lastBox = await last.boundingBox();
    assert(firstBox && lastBox, '50-node selection must be visible at 50% zoom');
    await start('框选拖动');
    await page.mouse.move(firstBox.x - 8, firstBox.y - 8);
    await page.mouse.down();
    await page.mouse.move(lastBox.x + lastBox.width + 8, lastBox.y + lastBox.height + 8, {
      steps: 30,
    });
    await page.mouse.up();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="selection-count"]')?.textContent === '已选 50 个',
    );
    const before = {
      first: await first.getAttribute('style'),
      last: await last.getAttribute('style'),
    };
    const dragBox = await first.boundingBox();
    assert(dragBox);
    await page.mouse.move(dragBox.x + 35, dragBox.y + 8);
    await page.mouse.down();
    for (let step = 0; step <= 240; step++) {
      const fraction = step / 240;
      await page.mouse.move(
        dragBox.x + 35 + fraction * 120,
        dragBox.y + 8 + 45 * Math.sin(fraction * Math.PI * 3),
      );
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await stop('框选拖动');
    assert.equal(await page.getByTestId('selection-count').textContent(), '已选 50 个');
    assert.notEqual(
      await first.getAttribute('style'),
      before.first,
      'First selected node must move',
    );
    assert.notEqual(await last.getAttribute('style'), before.last, 'Last selected node must move');
    const videoSample = await page.evaluate(() => window.pocVideoSample);
    assert(videoSample.maxMounted <= 4 && videoSample.maxPlaying <= 4);
    const metrics = await report();
    assert.equal(metrics.recordings.length, 3);
    assert(
      metrics.recordings.every((record) => record.valid),
      'Keep the browser visible throughout recording',
    );
    assert.deepEqual(errors, []);
    const cdp = await context.newCDPSession(page);
    const heap = await cdp.send('Runtime.getHeapUsage');
    let workingSetBytes = null;
    if (process.platform === 'win32') {
      const processes = await browserSession.send('SystemInfo.getProcessInfo');
      const ids = processes.processInfo.map((process) => process.id).filter(Number.isInteger);
      const memory = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum`,
        ],
        { encoding: 'utf8', windowsHide: true },
      );
      if (memory.status === 0) workingSetBytes = Number(memory.stdout.trim()) || null;
    }
    results.push({ run, ...metrics, videoSample, heap, workingSetBytes });
    await page.getByRole('button', { name: '重置画布' }).click();
    await page.screenshot({ path: '.local/poc-canvas.png' });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: '.local/poc-failure.png' });
    console.error(await activePage.locator('.react-flow__viewport').getAttribute('style'));
    console.error(await activePage.getByTestId('selection-count').textContent());
  }
  throw error;
} finally {
  const artifact = {
    timestamp: new Date().toISOString(),
    baseURL,
    channel,
    browserVersion: browser.version(),
    headless,
    viewport: { width: 1600, height: 900 },
    devicePixelRatio: 1,
    gpu: system.gpu,
    runs: results,
  };
  writeFileSync(output, JSON.stringify(artifact, null, 2));
  await browser.close();
}
