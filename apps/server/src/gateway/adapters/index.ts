import type Redis from 'ioredis';
import type { ModelAdapter } from '@carrot/shared';
import type { GatewayConfig } from '../config';
import { MockVideoAdapter } from './mock-video';
import { ArkVideoAdapter } from './ark-video';

export function createAdapter(config: GatewayConfig, redis: Redis): ModelAdapter {
  return config.provider === 'mock'
    ? new MockVideoAdapter(redis, config)
    : new ArkVideoAdapter(config);
}
