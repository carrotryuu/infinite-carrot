import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

// Run only against the isolated T00 development stack, not a production deployment.
const base = process.env.E2E_BASE_URL || 'http://localhost';
function compose(...args) {
  const result = spawnSync('docker', ['compose', ...args], { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `docker compose ${args.join(' ')} failed`);
}
async function waitHealth(expected) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      if (body.database === expected && body.redis === 'ok' && body.nas === 'ok') {
        assert.equal(response.status, expected === 'ok' ? 200 : 503);
        return;
      }
    } catch {
      /* Container startup and reconnection may take several seconds. */
    }
    await setTimeout(1000);
  }
  throw new Error(`Health check did not reach database=${expected}`);
}
compose('up', '-d', '--build');
await waitHealth('ok');
assert.equal((await fetch(base)).status, 200);
try {
  compose('stop', 'postgres');
  await waitHealth('down');
} finally {
  compose('start', 'postgres');
}
await waitHealth('ok');
console.log('PASS: page, all dependencies, PostgreSQL outage and recovery.');
