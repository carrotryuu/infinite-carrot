import { randomUUID } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { readInfrastructureEnv, type Health } from '@carrot/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';

export const PROBES = Symbol('infrastructure probes');
export interface Probes {
  database(): Promise<void>;
  redis(): Promise<void>;
  nas(): Promise<void>;
}

export async function checkNas(root: string): Promise<void> {
  // Do not create a missing mount point: that would hide a disconnected NAS.
  const path = join(root, `.health-${randomUUID()}`);
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile('health');
    await handle.sync();
  } finally {
    await handle.close();
    await unlink(path);
  }
}

@Injectable()
export class InfrastructureProbes implements Probes, OnModuleDestroy {
  private readonly env = readInfrastructureEnv(process.env);
  private readonly pool = new Pool({
    connectionString: this.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 1500,
    query_timeout: 1500,
  });
  private readonly client = new Redis(this.env.REDIS_URL, {
    connectTimeout: 1500,
    commandTimeout: 1500,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => 1000,
  });

  constructor() {
    // Dependency failures are reported via /health, not uncaught EventEmitter errors.
    this.pool.on('error', () => undefined);
    this.client.on('error', () => undefined);
  }
  async database(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
  async redis(): Promise<void> {
    await this.client.ping();
  }
  async nas(): Promise<void> {
    await checkNas(this.env.NAS_ROOT);
  }
  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
    await this.pool.end();
  }
}

async function probeStatus(probe: () => Promise<void>): Promise<'ok' | 'down'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(probe),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 2000);
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
  constructor(@Inject(PROBES) private readonly probes: Probes) {}
  async check(): Promise<Health> {
    const [database, redis, nas] = await Promise.all([
      probeStatus(() => this.probes.database()),
      probeStatus(() => this.probes.redis()),
      probeStatus(() => this.probes.nas()),
    ]);
    return {
      status: [database, redis, nas].every((value) => value === 'ok') ? 'ok' : 'down',
      database,
      redis,
      nas,
    };
  }
}

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}
  @Get()
  async get(): Promise<Health> {
    const report = await this.health.check();
    if (report.status === 'down') throw new ServiceUnavailableException(report);
    return report;
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService, { provide: PROBES, useClass: InfrastructureProbes }],
})
export class AppModule {}
