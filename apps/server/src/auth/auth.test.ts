import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Permission } from '@carrot/shared';
import { AuthModule, AuthService } from './http';
import { AuthRuntime } from './runtime';
import { readAuthConfig, SESSION_SECONDS } from './config';
import { FeishuProvider } from './provider';

const infrastructure = { DATABASE_URL: 'postgresql://unused', REDIS_URL: 'redis://127.0.0.1:6379' };
const real = {
  ...infrastructure,
  MOCK_EXTERNAL: '0',
  ALLOW_REAL_FEISHU: '1',
  AUTH_PUBLIC_ORIGIN: 'https://canvas.example',
  FEISHU_APP_ID: 'app',
  FEISHU_APP_SECRET: 'secret-value',
  FEISHU_TENANT_KEY: 'our-company',
};
describe('Feishu authentication contract', () => {
  it('fails closed before explicit real integration and requires HTTPS and tenant binding', () => {
    expect(() => readAuthConfig({ ...infrastructure, MOCK_EXTERNAL: '0' })).toThrow();
    expect(() => readAuthConfig({ ...real, FEISHU_TENANT_KEY: '' })).toThrow();
    expect(() =>
      readAuthConfig({ ...real, FEISHU_REDIRECT_URI: 'https://attacker.example/callback' }),
    ).toThrow();
  });
  it('uses state and PKCE, exchanges code only server-side and checks the tenant', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, access_token: 'user-token' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              union_id: 'union',
              name: 'User',
              tenant_key: 'our-company',
              avatar_url: 'https://example.com/avatar.png',
            },
          }),
        ),
      );
    const provider = new FeishuProvider(readAuthConfig(real), fetcher);
    const authorize = new URL(provider.authorize('state', 'verifier'));
    expect(authorize.searchParams.get('state')).toBe('state');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.href).not.toContain('secret-value');
    expect(await provider.exchange('one-time-code', 'verifier')).toEqual({
      unionId: 'union',
      name: 'User',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).code_verifier).toBe('verifier');
    expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe('Bearer user-token');
  });
  it('rejects another enterprise and masks provider errors or tokens', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'user-token' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: { union_id: 'union', name: 'User', tenant_key: 'someone-else' },
          }),
        ),
      );
    await expect(
      new FeishuProvider(readAuthConfig(real), fetcher).exchange('code', 'verifier'),
    ).rejects.toThrow('FEISHU_LOGIN_FAILED');
    await expect(
      new FeishuProvider(
        readAuthConfig(real),
        vi.fn().mockRejectedValue(new Error('secret-value')),
      ).exchange('code', 'verifier'),
    ).rejects.toThrow('FEISHU_LOGIN_FAILED');
    const unused = vi.fn();
    await expect(
      new FeishuProvider(readAuthConfig(infrastructure), unused).exchange('code', 'verifier'),
    ).rejects.toThrow('disabled');
    expect(unused).not.toHaveBeenCalled();
  });
});

describe.runIf(process.env.AUTH_INTEGRATION_TESTS === '1')(
  'auth with real PostgreSQL/Redis',
  () => {
    let runtime: AuthRuntime;
    let app: INestApplication;
    const scopeId = randomUUID();
    const origin = 'http://127.0.0.1:5173';
    beforeAll(async () => {
      runtime = new AuthRuntime(
        readAuthConfig({ ...process.env, MOCK_EXTERNAL: '1', AUTH_PUBLIC_ORIGIN: origin }),
        `test-${randomUUID()}`,
        scopeId,
      );
      await runtime.start();
      const module = await Test.createTestingModule({ imports: [AuthModule] })
        .overrideProvider(AuthService)
        .useValue({ runtime })
        .compile();
      app = module.createNestApplication();
      await app.init();
    });
    afterAll(async () => {
      await app?.close();
      await runtime?.close();
    });
    const login = (id: string) =>
      request(app.getHttpServer()).post('/auth/mock/login').set('Origin', origin).send({ id });
    const sessionCookie = (response: { headers: Record<string, unknown> }) =>
      (response.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
    it('creates one pending user even with concurrent first logins and rotates seven-day HttpOnly sessions', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => login('director').expect(201)),
      );
      const identities = await Promise.all(
        responses.map((r) =>
          request(app.getHttpServer()).get('/auth/me').set('Cookie', sessionCookie(r)).expect(200),
        ),
      );
      expect(new Set(identities.map((r) => r.body.id)).size).toBe(1);
      expect(identities[0]!.body.pendingAssignment).toBe(true);
      expect(identities[0]!.body.unionId).toBeUndefined();
      const header = (responses[0]!.headers['set-cookie'] as unknown as string[])[0]!;
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
      expect(header).toContain(`Max-Age=${SESSION_SECONDS}`);
      const old = sessionCookie(responses[0]!);
      const replacement = await login('director').set('Cookie', old).expect(201);
      expect(sessionCookie(replacement)).not.toBe(old);
      await request(app.getHttpServer()).get('/auth/me').set('Cookie', old).expect(401);
      const current = sessionCookie(replacement);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', current)
        .set('Origin', origin)
        .expect(201);
      await request(app.getHttpServer()).get('/auth/me').set('Cookie', current).expect(401);
    });
    it('disables all existing sessions immediately and old cookies stay invalid after reactivation', async () => {
      const first = await login('animator').expect(201);
      const second = await login('animator').expect(201);
      const identity = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', sessionCookie(first))
        .expect(200);
      const actor = {
        teamId: scopeId,
        tenantId: null,
        actor: 'test-hrbp',
        permissions: [Permission.AccountManage],
      };
      await expect(
        runtime.repository.setStatus(identity.body.id, 'disabled', { ...actor, permissions: [] }),
      ).rejects.toThrow();
      await runtime.repository.setStatus(identity.body.id, 'disabled', actor);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', sessionCookie(first))
        .expect(401);
      await login('animator').expect(401);
      await runtime.repository.setStatus(identity.body.id, 'active', actor);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', sessionCookie(second))
        .expect(401);
      await login('animator').expect(201);
      expect(await runtime.repository.get(identity.body.id)).not.toBeNull();
    });
    it('rejects forged identities, cross-origin writes, missing sessions and expired sessions', async () => {
      await login('not-a-seed-user').expect(401);
      await request(app.getHttpServer())
        .post('/auth/mock/login')
        .set('Origin', 'https://attacker.example')
        .send({ id: 'owner' })
        .expect(401);
      await request(app.getHttpServer()).get('/auth/me').expect(401);
      const logged = await login('editor').expect(201);
      const keys = await runtime.redis.keys(`${runtime.namespace}:session:*`);
      for (const key of keys) await runtime.redis.pexpire(key, 1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', sessionCookie(logged))
        .expect(401);
    });
    it('binds OAuth state to the browser and consumes it once, including failure cases', async () => {
      const oauth = new AuthRuntime(
        readAuthConfig({
          ...process.env,
          ...real,
          DATABASE_URL: runtime.config.DATABASE_URL,
          REDIS_URL: runtime.config.REDIS_URL,
        }),
        `oauth-${randomUUID()}`,
        scopeId,
      );
      await oauth.start();
      try {
        const exchange = vi
          .spyOn(oauth.provider, 'exchange')
          .mockResolvedValue({ unionId: randomUUID(), name: 'Feishu test', avatarUrl: null });
        const flow = await oauth.begin();
        await expect(oauth.callback('code', flow.state, 'wrong-browser')).rejects.toThrow();
        expect(exchange).not.toHaveBeenCalled();
        const token = await oauth.callback('code', flow.state, flow.state);
        expect((await oauth.me(token)).pendingAssignment).toBe(true);
        await expect(oauth.callback('code', flow.state, flow.state)).rejects.toThrow();
        expect(exchange).toHaveBeenCalledTimes(1);
        await expect(oauth.mockLogin('owner')).rejects.toThrow();
        const broken = await oauth.begin();
        exchange.mockRejectedValueOnce(new Error('secret'));
        await expect(oauth.callback('code', broken.state, broken.state)).rejects.toThrow(
          'FEISHU_LOGIN_FAILED',
        );
        await expect(oauth.callback('code', broken.state, broken.state)).rejects.toThrow(
          'INVALID_OAUTH_STATE',
        );
      } finally {
        await oauth.close();
      }
    });
  },
);
