import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const base = process.env.E2E_BASE_URL || 'http://localhost';
const compose = (...args) =>
  execFileSync('docker', ['compose', ...args], { stdio: 'inherit' });
async function waitForDatabase(expected) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const report = await response.json();
      assert.equal(response.status, expected === 'ok' ? 200 : 503);
      assert.deepEqual(report.checks, {
        database: expected,
        redis: 'ok',
        nas: 'ok',
      });
      assert.equal(report.status, expected);
      console.log(`Health verified: database=${expected}, redis=ok, nas=ok`);
      return;
    } catch (error) {
      lastError = error;
      await setTimeout(1000);
    }
  }
  throw lastError;
}
await waitForDatabase('ok');
assert.equal((await fetch(base)).status, 200);
compose('exec', '-T', 'worker', 'ffmpeg', '-version');
try {
  compose('stop', 'postgres');
  await waitForDatabase('down');
} finally {
  compose('start', 'postgres');
}
await waitForDatabase('ok');
