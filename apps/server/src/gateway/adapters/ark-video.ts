import { z } from 'zod';
import type { ModelAdapter, ModelInput, ModelStatus } from '@carrot/shared';
import type { GatewayConfig } from '../config';

const taskSchema = z.object({
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired']),
  content: z.object({ video_url: z.string().url().optional() }).optional(),
});
export class ArkVideoAdapter implements ModelAdapter {
  readonly provider = 'ark';
  // No provider idempotency guarantee has been established for POST. Never replay
  // an ambiguous submission: keep it visible for manual provider reconciliation.
  readonly idempotentSubmit = false;
  constructor(
    private readonly config: GatewayConfig,
    private readonly http: typeof fetch = fetch,
  ) {}
  private async request(method: string, path: string, body?: object): Promise<unknown> {
    try {
      const response = await this.http(
        `${this.config.ARK_BASE_URL.replace(/\/$/, '')}/contents/generations/tasks${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${this.config.ARK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('PROVIDER_HTTP_ERROR');
      if (method === 'DELETE') return {};
      return await response.json();
    } catch {
      throw new Error('PROVIDER_REQUEST_FAILED');
    }
  }
  async submit(input: ModelInput) {
    const response = await this.request('POST', '', {
      model: this.config.ARK_VIDEO_MODEL,
      content: [{ type: 'text', text: input.prompt }],
      resolution: '720p',
      duration: 5,
    });
    return z.object({ id: z.string().min(1) }).parse(response).id;
  }
  async getStatus(id: string): Promise<ModelStatus> {
    const task = taskSchema.parse(await this.request('GET', `/${encodeURIComponent(id)}`));
    if (task.status === 'cancelled') return { status: 'canceled' };
    if (task.status === 'expired' || task.status === 'failed')
      return {
        status: 'failed',
        errorCode: task.status === 'expired' ? 'PROVIDER_EXPIRED' : 'PROVIDER_FAILED',
      };
    return { status: task.status, result: task.content?.video_url };
  }
  async cancel(id: string) {
    const before = await this.getStatus(id);
    if (before.status === 'canceled') return true;
    // DELETE on a completed task deletes its record; never do that for cancel.
    if (before.status !== 'queued') return false;
    await this.request('DELETE', `/${encodeURIComponent(id)}`);
    return (await this.getStatus(id)).status === 'canceled';
  }
  parseResult(result: unknown) {
    const value = z.string().url().parse(result);
    if (new URL(value).protocol !== 'https:') throw new Error('INVALID_PROVIDER_RESULT');
    return value;
  }
  estimateCost() {
    return { amount: null, unit: 'provider-unconfirmed', estimated: true as const };
  }
}
