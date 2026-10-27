import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { writeFileSync, mkdirSync } from 'node:fs';

// Only run against the local isolated Mock stack: this deliberately kills its worker.
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1';
const url = new URL(base);
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Local Mock acceptance only');
function compose(...args) {
  const result = spawnSync('docker', ['compose', ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
async function api(path, body) {
  const response = await fetch(`${base}/api/poc/gateway/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  assert(response.ok, `API ${path}: ${response.status}`);
  return response.json();
}
const config = await api('config');
assert.equal(config.mode, 'mock', 'Never run crash acceptance against real providers');
const prefix = `crash_${randomUUID()}`;
const started = Date.now();
const input = { idempotencyKey: `${prefix}_0`, prompt: 'Worker crash recovery sample' };
const replies = await Promise.all(Array.from({ length: 8 }, () => api('tasks', input)));
assert.equal(new Set(replies.map((task) => task.id)).size, 1);
const task = replies[0];
const providerId = `mock-${createHash('sha256').update(task.id).digest('hex')}`;
const submissionKey = `poc-provider-submissions:${providerId}`;
const deadline = Date.now() + 20000;
while (compose('exec', '-T', 'redis', 'redis-cli', 'GET', submissionKey) !== '1') {
  assert(Date.now() < deadline, 'Provider submission did not happen');
  await setTimeout(100);
}
let killed = false;
try {
  compose('kill', '-s', 'KILL', 'worker');
  killed = true;
  compose('up', '-d', '--no-deps', 'worker');
  killed = false;
  const end = Date.now() + 90000;
  let recovered;
  while (Date.now() < end) {
    recovered = (await api('tasks')).find((row) => row.id === task.id);
    if (['succeeded', 'failed', 'canceled'].includes(recovered?.status)) break;
    await setTimeout(1000);
  }
  assert.equal(recovered?.status, 'succeeded');
  assert.equal(compose('exec', '-T', 'redis', 'redis-cli', 'GET', submissionKey), '1');
  const batch = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      api('tasks', {
        idempotencyKey: `${prefix}_${index + 1}`,
        prompt: `Twenty concurrent tasks ${index + 1}`,
      }),
    ),
  );
  const ids = new Set(batch.map((row) => row.id));
  assert.equal(ids.size, 20);
  const endBatch = Date.now() + 180000;
  let done = [];
  while (Date.now() < endBatch) {
    done = (await api('tasks')).filter((row) => ids.has(row.id));
    if (
      done.length === 20 &&
      done.every((row) => ['succeeded', 'failed', 'canceled'].includes(row.status))
    )
      break;
    await setTimeout(1000);
  }
  assert.equal(done.filter((row) => row.status === 'succeeded').length, 20);
  mkdirSync('.local', { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    mode: config.mode,
    providerConcurrency: config.concurrency,
    duplicateRequests: replies.length,
    uniqueTaskCount: 1,
    forcedWorkerKill: true,
    recoveredStatus: recovered.status,
    providerSubmissionCount: 1,
    batchTasks: 20,
    batchSucceeded: 20,
    elapsedMs: Date.now() - started,
  };
  writeFileSync('.local/poc-gateway-acceptance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (killed) compose('up', '-d', '--no-deps', 'worker');
}
