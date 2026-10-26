import { Injectable } from '@nestjs/common';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { Pool } from 'pg';
import Redis from 'ioredis';
import {
  overallStatus,
  type HealthReport,
  type HealthStatus,
} from '@carrot/shared';

export async function probe(
  check: () => Promise<unknown>,
  timeout: number,
): Promise<HealthStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeout);
      }),
    ]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  private readonly timeout = Number(process.env.HEALTH_TIMEOUT_MS || 2000);
  private readonly database = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: this.timeout,
    query_timeout: this.timeout,
    max: 2,
  });
  private readonly redis = new Redis(
    process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: this.timeout,
    },
  );
  constructor() {
    this.database.on('error', () => {
      /* The next health probe reports down. */
    });
    this.redis.on('error', () => {
      /* Avoid logging connection details. */
    });
    void this.redis.connect().catch(() => undefined);
  }
  async check(): Promise<HealthReport> {
    const [database, redis, nas] = await Promise.all([
      probe(() => this.database.query('SELECT 1'), this.timeout),
      probe(() => this.redis.ping(), this.timeout),
      probe(async () => {
        const root = process.env.NAS_ROOT;
        if (!root || !(await stat(root)).isDirectory())
          throw new Error('NAS unavailable');
        await access(root, constants.R_OK | constants.W_OK);
      }, this.timeout),
    ]);
    const checks = { database, redis, nas };
    return { status: overallStatus(checks), checks };
  }
  async onModuleDestroy() {
    this.redis.disconnect();
    await this.database.end();
  }
}
