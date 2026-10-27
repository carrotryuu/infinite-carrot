import { readInfrastructureEnv } from '@carrot/shared';
import { Queue } from 'bullmq';
import { shutdownOnce } from './runtime';

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
const shutdown = shutdownOnce(queue);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().catch(() => {
      process.exitCode = 1;
    });
  });
}
void queue
  .waitUntilReady()
  .then(() => console.log('Worker ready (T00 infrastructure).'))
  .catch(() => {
    console.error('Worker initialization failed.');
    process.exitCode = 1;
  });
