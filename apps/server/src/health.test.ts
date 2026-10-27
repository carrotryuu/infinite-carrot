import 'reflect-metadata';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule, checkNas, HealthService, PROBES, type Probes } from './health';

describe('health endpoint', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    vi.useRealTimers();
  });
  async function start(probes: Probes) {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PROBES)
      .useValue(probes)
      .compile();
    app = module.createNestApplication();
    await app.init();
    return app.getHttpServer();
  }
  it('reports real dependency probe outcomes and recovers after a database outage', async () => {
    const database = vi.fn().mockResolvedValue(undefined);
    const server = await start({ database, redis: async () => {}, nas: async () => {} });
    await request(server)
      .get('/health')
      .expect(200, { status: 'ok', database: 'ok', redis: 'ok', nas: 'ok' });
    database.mockRejectedValueOnce(new Error('password=must-not-leak'));
    await request(server)
      .get('/health')
      .expect(503, { status: 'down', database: 'down', redis: 'ok', nas: 'ok' });
    await request(server).get('/health').expect(200);
  });
  it('reports independent failures without converting them to HTTP 500', async () => {
    const fail = async () => {
      throw new Error('private NAS path');
    };
    const server = await start({ database: fail, redis: fail, nas: fail });
    await request(server)
      .get('/health')
      .expect(503, { status: 'down', database: 'down', redis: 'down', nas: 'down' });
  });
  it('bounds hanging probes', async () => {
    vi.useFakeTimers();
    const service = new HealthService({
      database: () => new Promise(() => {}),
      redis: async () => {},
      nas: async () => {},
    });
    const pending = service.check();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toEqual({ status: 'down', database: 'down', redis: 'ok', nas: 'ok' });
  });
  it('checks NAS writes, cleans probe files and rejects absent mounts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'carrot-health-'));
    try {
      await checkNas(directory);
      expect(await readdir(directory)).toEqual([]);
      await expect(checkNas(join(directory, 'missing'))).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
