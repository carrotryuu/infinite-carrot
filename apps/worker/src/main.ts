import { readInfrastructureEnv } from '@carrot/shared';
import { Queue } from 'bullmq';
import { shutdownOnce } from './runtime';
import { GatewayRuntime } from '@carrot/server/gateway/runtime';
import { readGatewayConfig } from '@carrot/server/gateway/config';

const env = readInfrastructureEnv(process.env);
const redis = new URL(env.REDIS_URL);
// Infrastructure only. Business processors are introduced by their own tasks.
const queue = new Queue('system', {
  connection: {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: decodeURIComponent(redis.username) || undefined,
    password: decodeURIComponent(redis.password) || undefined,
    db: Number(redis.pathname.slice(1) || 0),
    ...(redis.protocol === 'rediss:' ? { tls: {} } : {}),
  },
});
queue.on('error', () => console.error('Worker Redis connection unavailable; retrying.'));
const gateway =
  process.env.POC_GATEWAY_ENABLED === '1'
    ? new GatewayRuntime(readGatewayConfig(), 'poc-worker')
    : undefined;
const shutdown = shutdownOnce({
  close: async () => {
    await gateway?.close();
    await queue.close();
  },
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().catch(() => {
      process.exitCode = 1;
    });
  });
}
void queue
  .waitUntilReady()
  .then(async () => {
    await gateway?.start(true);
    console.log(gateway ? 'Gateway worker ready.' : 'Worker ready (T00 infrastructure).');
  })
  .catch(() => {
    console.error('Worker initialization failed.');
    process.exitCode = 1;
  });
