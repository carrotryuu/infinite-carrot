import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Permission, terminalStatuses } from '@carrot/shared';
import { GatewayRuntime } from './runtime';
import { readGatewayConfig } from './config';
import { GatewayModule, GatewayService } from './http';
import { TaskRepository } from './repository';
import { TeamScope } from './team-scope';

const enabled = process.env.GATEWAY_INTEGRATION_TESTS === '1';
describe.runIf(enabled)('gateway with real PostgreSQL and Redis', () => {
  let runtime: GatewayRuntime;
  let worker: GatewayRuntime | undefined;
  let app: INestApplication;
  beforeAll(async () => {
    const config = readGatewayConfig({
      ...process.env,
      POC_GATEWAY_ENABLED: '1',
      MOCK_EXTERNAL: '1',
      POC_TEAM_ID: randomUUID(),
      POC_QUEUE_NAMESPACE: `test-${randomUUID()}`,
      MOCK_MIN_MS: '500',
      MOCK_MAX_MS: '800',
      MODEL_POLL_MS: '100',
      MODEL_CONCURRENCY: '4',
      NAS_ROOT: process.env.NAS_ROOT || '/tmp',
    });
    runtime = new GatewayRuntime(config);
    await runtime.start();
    const module = await Test.createTestingModule({ imports: [GatewayModule] })
      .overrideProvider(GatewayService)
      .useValue({ config, runtime, active: runtime })
      .compile();
    app = module.createNestApplication();
    await app.init();
  }, 20000);
  afterAll(async () => {
    await app?.close();
    await worker?.close();
    await runtime?.close();
  });
  const waitTerminal = async (ids: string[]) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      const tasks = await Promise.all(ids.map((id) => runtime.repository.get(id)));
      if (tasks.every((task) => terminalStatuses.includes(task.status))) return tasks;
      await delay(100);
    }
    throw new Error('Tasks did not reach terminal states');
  };
  it('deduplicates concurrent HTTP requests, rejects conflicting keys and blocks cross-team reads', async () => {
    const input = { idempotencyKey: randomUUID(), prompt: 'Idempotency test' };
    const replies = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app.getHttpServer()).post('/poc/gateway/tasks').send(input).expect(201),
      ),
    );
    const ids = new Set(replies.map((reply) => reply.body.id));
    expect(ids.size).toBe(1);
    await request(app.getHttpServer())
      .post('/poc/gateway/tasks')
      .send({ ...input, prompt: 'Changed' })
      .expect(409);
    const other = new TaskRepository(
      runtime.prisma,
      new TeamScope({
        teamId: randomUUID(),
        tenantId: null,
        actor: 'other',
        permissions: [Permission.CanvasView],
      }),
    );
    expect(await other.list()).toEqual([]);
    await expect(other.get(replies[0]!.body.id)).rejects.toThrow('Task not found');
    await request(app.getHttpServer())
      .post('/poc/gateway/tasks')
      .send({ ...input, teamId: 'forged' })
      .expect(400);
    const audits = await runtime.repository.db.auditLog.findMany({
      where: { objectId: replies[0]!.body.id },
    });
    expect(audits).toHaveLength(1);
    await expect(
      runtime.repository.db.auditLog.updateMany({ data: { actor: 'changed' } }),
    ).rejects.toThrow('append-only');
  });
  it('cancels queued tasks and processes 20 tasks within the provider global concurrency', async () => {
    const canceled = await runtime.submit({
      idempotencyKey: randomUUID(),
      prompt: 'Cancel before provider',
    });
    expect((await runtime.cancel(canceled.id)).status).toBe('canceled');
    const tasks = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        runtime.submit({ idempotencyKey: randomUUID(), prompt: `Batch ${index}` }),
      ),
    );
    worker = new GatewayRuntime(runtime.config, 'test-worker');
    await worker.start(true);
    let maximum = 0;
    const timer = setInterval(() => {
      void runtime.queue.getActiveCount().then((count) => {
        maximum = Math.max(maximum, count);
      });
    }, 30);
    try {
      expect(
        (await waitTerminal(tasks.map((task) => task.id))).every(
          (task) => task.status === 'succeeded',
        ),
      ).toBe(true);
    } finally {
      clearInterval(timer);
    }
    expect(maximum).toBeGreaterThan(0);
    expect(maximum).toBeLessThanOrEqual(4);
    expect((await runtime.repository.get(canceled.id)).providerTaskId).toBeNull();
  }, 25000);
  it('resumes a persisted provider task after worker replacement without a second submit', async () => {
    await worker!.close();
    worker = new GatewayRuntime(
      { ...runtime.config, MOCK_MIN_MS: 3000, MOCK_MAX_MS: 3000 },
      'test-worker',
    );
    await worker.start(true);
    const task = await runtime.submit({ idempotencyKey: randomUUID(), prompt: 'Restart me' });
    const deadline = Date.now() + 5000;
    while (!(await runtime.repository.get(task.id)).providerTaskId) {
      if (Date.now() > deadline) throw new Error('Provider not submitted');
      await delay(50);
    }
    await worker.close();
    worker = new GatewayRuntime(runtime.config, 'replacement-worker');
    await worker.start(true);
    expect((await waitTerminal([task.id]))[0]?.status).toBe('succeeded');
    const providerId = `mock-${createHash('sha256').update(task.id).digest('hex')}`;
    expect(await runtime.redis.get(`poc-provider-submissions:${providerId}`)).toBe('1');
  }, 25000);
  it('records provider failures and cancels an in-flight mock task', async () => {
    await worker!.close();
    worker = new GatewayRuntime(
      { ...runtime.config, MOCK_FAILURE_RATE: 1, MOCK_MIN_MS: 1000, MOCK_MAX_MS: 1000 },
      'test-worker',
    );
    await worker.start(true);
    const failed = await runtime.submit({
      idempotencyKey: randomUUID(),
      prompt: 'Forced mock failure',
    });
    expect((await waitTerminal([failed.id]))[0]).toMatchObject({
      status: 'failed',
      errorCode: 'MOCK_GENERATION_FAILED',
    });
    const canceled = await runtime.submit({
      idempotencyKey: randomUUID(),
      prompt: 'Cancel running task',
    });
    const deadline = Date.now() + 5000;
    while (!(await runtime.repository.get(canceled.id)).providerTaskId) {
      if (Date.now() > deadline) throw new Error('Provider not submitted');
      await delay(30);
    }
    await runtime.cancel(canceled.id);
    expect((await waitTerminal([canceled.id]))[0]?.status).toBe('canceled');
  }, 15000);
  it('never re-submits an ambiguous real-provider request after recovery', async () => {
    const isolated = new GatewayRuntime({ ...runtime.config, provider: 'ark' });
    const submit = vi
      .spyOn(isolated.adapter, 'submit')
      .mockRejectedValue(new Error('must not call provider'));
    try {
      const task = await isolated.repository.create(
        { idempotencyKey: randomUUID(), prompt: 'Ambiguous response window' },
        'ark',
      );
      await isolated.repository.change(task.id, 'test.interrupted_submit', () => ({
        status: 'running',
        submissionStartedAt: new Date(),
        submissionToken: randomUUID(),
      }));
      await isolated.process(task.id);
      expect(submit).not.toHaveBeenCalled();
      expect(await isolated.repository.get(task.id)).toMatchObject({
        status: 'failed',
        errorCode: 'SUBMISSION_UNCERTAIN_RECONCILE_PROVIDER',
      });
    } finally {
      await isolated.close();
    }
  });
});
