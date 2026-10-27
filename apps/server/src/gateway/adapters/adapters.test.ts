import { describe, expect, it, vi } from 'vitest';
import { Permission } from '@carrot/shared';
import { ArkVideoAdapter } from './ark-video';
import { readGatewayConfig } from '../config';
import { authorizePoc } from '../http';

const base = {
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  REDIS_URL: 'redis://localhost',
  NAS_ROOT: '/tmp',
  POC_GATEWAY_ENABLED: '1',
};
describe('provider contract and gates', () => {
  it('defaults to mock, ignores client team headers, and requires explicit real-mode gates', () => {
    const config = readGatewayConfig({ ...base, MODEL_POC_PROVIDER: 'ark' });
    expect(config.provider).toBe('mock');
    expect(() => readGatewayConfig({ ...base, MOCK_EXTERNAL: '0' })).toThrow(
      'Real model calls require',
    );
    const scope = authorizePoc(config, { host: 'localhost', 'x-team-id': 'attacker' });
    expect(scope.teamId).toBe(config.POC_TEAM_ID);
    expect(scope.permissions).toContain(Permission.CanvasUse);
    expect(() =>
      authorizePoc(config, { host: 'localhost', origin: 'https://other.example' }),
    ).toThrow();
    expect(() => authorizePoc({ ...config, POC_GATEWAY_ENABLED: '0' }, {})).toThrow();
  });
  it('submits, polls, parses and cancels queued tasks using the Ark contract', async () => {
    const responses = [
      { id: 'provider-123' },
      { status: 'succeeded', content: { video_url: 'https://example.test/result.mp4' } },
      { status: 'queued' },
      {},
      { status: 'cancelled' },
    ];
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify(responses.shift()), { status: 200 }),
      );
    const adapter = new ArkVideoAdapter(
      readGatewayConfig({ ...base, ARK_API_KEY: 'server-only-key' }),
      http,
    );
    expect(await adapter.submit({ requestId: 'local-123', prompt: 'A forest' })).toBe(
      'provider-123',
    );
    expect(http.mock.calls[0]?.[0]).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    );
    const request = http.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: 'doubao-seedance-2-5-260628',
      content: [{ type: 'text', text: 'A forest' }],
    });
    expect(adapter.parseResult((await adapter.getStatus('provider-123')).result)).toBe(
      'https://example.test/result.mp4',
    );
    expect(await adapter.cancel('provider-123')).toBe(true);
    expect(http.mock.calls[3]?.[1]?.method).toBe('DELETE');
    expect(adapter.estimateCost().amount).toBeNull();
    expect(adapter.idempotentSubmit).toBe(false);
  });
  it('does not delete running/completed records or expose upstream errors and secrets', async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ status: 'running' })));
    const adapter = new ArkVideoAdapter(readGatewayConfig(base), http);
    expect(await adapter.cancel('running')).toBe(false);
    expect(http).toHaveBeenCalledTimes(1);
    const failed = new ArkVideoAdapter(
      readGatewayConfig(base),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('SECRET-UPSTREAM-DETAILS', { status: 500 })),
    );
    await expect(failed.submit({ requestId: 'x', prompt: 'test' })).rejects.toThrow(
      'PROVIDER_REQUEST_FAILED',
    );
    expect(() => adapter.parseResult('file:///nas/private.mp4')).toThrow();
  });
});
