import { describe, expect, it } from 'vitest';
import { readInfrastructureEnv } from './index';

describe('infrastructure configuration', () => {
  const valid = {
    DATABASE_URL: 'postgresql://user:secret@localhost/carrot',
    REDIS_URL: 'redis://localhost:6379',
    NAS_ROOT: '/nas',
  };
  it('defaults to mock external services', () => {
    expect(readInfrastructureEnv(valid).MOCK_EXTERNAL).toBe('1');
  });
  it('rejects missing storage and invalid ports without exposing credentials', () => {
    expect(() => readInfrastructureEnv({ ...valid, NAS_ROOT: '', SERVER_PORT: '65536' })).toThrow(
      'NAS_ROOT',
    );
    expect(() => readInfrastructureEnv({ ...valid, DATABASE_URL: 'secret' })).toThrow(
      'DATABASE_URL',
    );
    expect(() => readInfrastructureEnv({ ...valid, DATABASE_URL: 'secret' })).not.toThrow('secret');
  });
});
