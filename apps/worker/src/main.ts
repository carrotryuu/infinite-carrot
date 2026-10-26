import Redis from 'ioredis';
// T00 establishes the worker process; business queues are added in T02.
const connection = new Redis(
  process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  { maxRetriesPerRequest: null },
);
connection.on('ready', () => console.log('Worker infrastructure ready'));
connection.on('error', () =>
  console.error('Worker Redis unavailable; reconnecting'),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    connection.disconnect();
    process.exit(0);
  });
}
