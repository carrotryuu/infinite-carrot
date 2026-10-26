import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './controller';
import { HealthService, probe } from './service';
describe('GET /health', () => {
  it.each(['ok', 'down'] as const)(
    'keeps responding when database is %s',
    async (database) => {
      const report = {
        status: database,
        checks: { database, redis: 'ok', nas: 'ok' },
      };
      const module = await Test.createTestingModule({
        controllers: [HealthController],
        providers: [
          {
            provide: HealthService,
            useValue: { check: vi.fn().mockResolvedValue(report) },
          },
        ],
      }).compile();
      const app = module.createNestApplication();
      await app.init();
      try {
        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(database === 'ok' ? 200 : 503);
        expect(response.body).toEqual(report);
      } finally {
        await app.close();
      }
    },
  );
  it('bounds a hung dependency and reports failures', async () => {
    expect(await probe(() => new Promise(() => {}), 10)).toBe('down');
    expect(await probe(() => Promise.reject(new Error('offline')), 10)).toBe(
      'down',
    );
  });
});
