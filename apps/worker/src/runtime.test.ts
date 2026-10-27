import { expect, it, vi } from 'vitest';
import { shutdownOnce } from './runtime';

it('closes queue connections once when shutdown signals overlap', async () => {
  const close = vi.fn(async () => {});
  const shutdown = shutdownOnce({ close });
  await Promise.all([shutdown(), shutdown()]);
  expect(close).toHaveBeenCalledTimes(1);
});
