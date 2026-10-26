import { describe, expect, it } from 'vitest';
import { overallStatus } from './index';
describe('health status', () => {
  it('reports a partial outage as down', () => {
    expect(overallStatus({ database: 'down', redis: 'ok', nas: 'ok' })).toBe(
      'down',
    );
    expect(overallStatus({ database: 'ok', redis: 'ok', nas: 'ok' })).toBe(
      'ok',
    );
  });
});
