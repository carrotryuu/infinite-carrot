import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import type { ModelAdapter, ModelInput, ModelStatus } from '@carrot/shared';
import type { GatewayConfig } from '../config';

interface MockRecord {
  started: number;
  duration: number;
  failed: boolean;
  canceled: boolean;
  sample: number;
}
export class MockVideoAdapter implements ModelAdapter {
  readonly provider = 'mock';
  readonly idempotentSubmit = true;
  constructor(
    private readonly redis: Redis,
    private readonly config: GatewayConfig,
    private readonly now = Date.now,
    private readonly random = Math.random,
  ) {}
  async submit(input: ModelInput) {
    const id = `mock-${createHash('sha256').update(input.requestId).digest('hex')}`;
    const value: MockRecord = {
      started: this.now(),
      duration:
        this.config.MOCK_MIN_MS +
        Math.floor(this.random() * (this.config.MOCK_MAX_MS - this.config.MOCK_MIN_MS + 1)),
      failed: this.random() < this.config.MOCK_FAILURE_RATE,
      canceled: false,
      sample: (Number.parseInt(id.slice(-2), 16) % 5) + 1,
    };
    // The provider simulation is durable across worker restarts and duplicate submits.
    await this.redis.eval(
      "if redis.call('EXISTS', KEYS[1]) == 0 then redis.call('SET', KEYS[1], ARGV[1]); redis.call('SET', KEYS[2], '1'); end; return 1",
      2,
      `poc-provider:${id}`,
      `poc-provider-submissions:${id}`,
      JSON.stringify(value),
    );
    return id;
  }
  private async record(id: string): Promise<MockRecord> {
    const raw = await this.redis.get(`poc-provider:${id}`);
    if (!raw) throw new Error('MOCK_TASK_NOT_FOUND');
    return JSON.parse(raw) as MockRecord;
  }
  async getStatus(id: string): Promise<ModelStatus> {
    const record = await this.record(id);
    if (record.canceled) return { status: 'canceled' };
    const progress = Math.min(
      99,
      Math.floor(((this.now() - record.started) / record.duration) * 100),
    );
    if (this.now() - record.started < record.duration) return { status: 'running', progress };
    return record.failed
      ? { status: 'failed', errorCode: 'MOCK_GENERATION_FAILED' }
      : { status: 'succeeded', progress: 100, result: `/poc-media/sample-${record.sample}.mp4` };
  }
  async cancel(id: string) {
    const record = await this.record(id);
    if (this.now() - record.started >= record.duration) return false;
    record.canceled = true;
    await this.redis.set(`poc-provider:${id}`, JSON.stringify(record));
    return true;
  }
  parseResult(result: unknown) {
    if (typeof result !== 'string' || !/^\/poc-media\/sample-[1-5]\.mp4$/.test(result))
      throw new Error('INVALID_MOCK_RESULT');
    return result;
  }
  estimateCost() {
    return { amount: 0, unit: 'mock', estimated: true as const };
  }
}
