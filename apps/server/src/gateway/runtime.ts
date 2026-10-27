import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type GenerationTask } from '@prisma/client';
import Redis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { Permission, terminalStatuses, type ModelAdapter, type SubmitTask } from '@carrot/shared';
import { readGatewayConfig, redisConnection, type GatewayConfig } from './config';
import { TeamScope } from './team-scope';
import { TaskRepository } from './repository';
import { createAdapter } from './adapters';

export const TASK_EVENTS = 'poc-generation-events';
export class GatewayRuntime {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly repository: TaskRepository;
  readonly queue: Queue;
  readonly adapter: ModelAdapter;
  private worker?: Worker;
  private reconcileTimer?: ReturnType<typeof setInterval>;
  private reconciling = false;
  private closing = false;
  constructor(
    readonly config: GatewayConfig = readGatewayConfig(),
    actor = 'poc-operator',
  ) {
    this.prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
    this.redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    this.redis.on('error', () => undefined);
    const scope = new TeamScope({
      teamId: config.POC_TEAM_ID,
      tenantId: config.POC_TENANT_ID ?? null,
      actor,
      permissions: [Permission.CanvasView, Permission.CanvasUse],
    });
    this.repository = new TaskRepository(this.prisma, scope);
    this.adapter = createAdapter(config, this.redis);
    this.queue = new Queue(`${config.POC_QUEUE_NAMESPACE}-${config.provider}`, {
      connection: redisConnection(config.REDIS_URL),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
    this.queue.on('error', () => undefined);
  }
  async start(withWorker = false) {
    await this.prisma.$connect();
    await this.redis.connect();
    await this.queue.setGlobalConcurrency(this.config.MODEL_CONCURRENCY);
    if (withWorker) {
      this.worker = new Worker(
        this.queue.name,
        async (job) => {
          const id: unknown = job.data.id;
          if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))
            throw new Error('INVALID_JOB_ID');
          await this.process(id);
        },
        {
          connection: redisConnection(this.config.REDIS_URL),
          concurrency: this.config.MODEL_CONCURRENCY,
          lockDuration: 10000,
          stalledInterval: 5000,
          maxStalledCount: 3,
        },
      );
      this.worker.on('error', () =>
        console.error('Gateway worker connection unavailable; retrying.'),
      );
      this.worker.on('failed', (job) => {
        if (job && job.attemptsMade >= 5)
          void this.fail(String(job.data.id), 'WORKER_RETRIES_EXHAUSTED').catch(() => undefined);
      });
    }
    await this.reconcile();
    this.reconcileTimer = setInterval(
      () =>
        void this.reconcile().catch(() =>
          console.error('Gateway dispatch reconciliation will retry.'),
        ),
      2000,
    );
  }
  async emit(task: GenerationTask) {
    // Notifications are hints; the database is authoritative and the API resyncs.
    await this.redis
      .publish(
        TASK_EVENTS,
        JSON.stringify({ id: task.id, teamId: task.teamId, tenantId: task.tenantId }),
      )
      .catch(() => undefined);
    return task;
  }
  private async enqueue(task: GenerationTask) {
    if (task.provider !== this.config.provider) return;
    const existing = await this.queue.getJob(task.id);
    if (existing) {
      const state = await existing.getState();
      if (state === 'failed') {
        await this.fail(task.id, 'QUEUE_RETRIES_EXHAUSTED');
        return;
      }
      if (state === 'completed') await existing.remove();
    }
    await this.queue.add('generate', { id: task.id }, { jobId: task.id });
  }
  private async reconcile() {
    if (this.reconciling || this.closing) return;
    this.reconciling = true;
    try {
      for (const task of await this.repository.pending()) await this.enqueue(task);
    } finally {
      this.reconciling = false;
    }
  }
  async submit(input: SubmitTask) {
    const task = await this.repository.create(input, this.config.provider);
    if (!terminalStatuses.includes(task.status)) await this.enqueue(task).catch(() => undefined);
    return this.emit(task);
  }
  async cancel(id: string) {
    return this.emit(
      await this.repository.change(id, 'generation.cancel_requested', (task) => {
        if (terminalStatuses.includes(task.status) || task.cancelRequested) return null;
        if (task.status === 'queued') return { status: 'canceled' };
        return { cancelRequested: true };
      }),
    );
  }
  private async fail(id: string, errorCode: string) {
    return this.emit(
      await this.repository.change(id, 'generation.failed', (task) =>
        terminalStatuses.includes(task.status)
          ? null
          : { status: 'failed', errorCode, cancelRequested: false },
      ),
    );
  }
  async process(id: string) {
    let task = await this.repository.get(id);
    if (terminalStatuses.includes(task.status)) return;
    if (task.provider !== this.adapter.provider) throw new Error('PROVIDER_MISMATCH');
    const submissionToken = randomUUID();
    task = await this.repository.change(id, 'generation.started', (current) =>
      current.status === 'queued'
        ? { status: 'running', submissionStartedAt: new Date(), submissionToken }
        : null,
    );
    await this.emit(task);
    if (terminalStatuses.includes(task.status)) return;
    if (!task.providerTaskId) {
      if (task.submissionToken !== submissionToken && !this.adapter.idempotentSubmit) {
        await this.fail(id, 'SUBMISSION_UNCERTAIN_RECONCILE_PROVIDER');
        return;
      }
      try {
        const providerTaskId = await this.adapter.submit({
          requestId: task.id,
          prompt: task.prompt,
        });
        task = await this.repository.change(id, 'generation.provider_accepted', (current) =>
          current.status === 'running' && !current.providerTaskId ? { providerTaskId } : null,
        );
        await this.emit(task);
      } catch (error) {
        if (!this.adapter.idempotentSubmit) {
          await this.fail(id, 'SUBMISSION_UNCERTAIN_RECONCILE_PROVIDER');
          return;
        }
        throw error;
      }
    }
    while (!this.closing) {
      task = await this.repository.get(id);
      if (terminalStatuses.includes(task.status)) return;
      if (!task.providerTaskId) throw new Error('MISSING_PROVIDER_ID');
      const providerId = task.providerTaskId;
      if (
        Date.now() - (task.submissionStartedAt?.getTime() ?? task.createdAt.getTime()) >
        this.config.MODEL_TIMEOUT_MS
      ) {
        await this.fail(id, 'POLL_TIMEOUT_RECONCILE_PROVIDER');
        return;
      }
      if (task.cancelRequested) {
        const canceled = await this.adapter.cancel(providerId);
        task = await this.repository.change(
          id,
          canceled ? 'generation.canceled' : 'generation.cancel_rejected',
          (current) =>
            current.status === 'running'
              ? {
                  ...(canceled
                    ? { status: 'canceled' as const }
                    : { errorCode: 'CANCEL_NOT_SUPPORTED_AT_PROVIDER_STATE' }),
                  cancelRequested: false,
                }
              : null,
        );
        await this.emit(task);
        if (terminalStatuses.includes(task.status)) return;
      }
      const state = await this.adapter.getStatus(providerId);
      if (state.status === 'succeeded') {
        const resultUrl = this.adapter.parseResult(state.result);
        await this.emit(
          await this.repository.change(id, 'generation.succeeded', (current) =>
            current.status === 'running'
              ? {
                  status: 'succeeded',
                  resultUrl,
                  progress: 100,
                  cancelRequested: false,
                  errorCode: null,
                }
              : null,
          ),
        );
        return;
      }
      if (state.status === 'failed') {
        await this.fail(id, state.errorCode || 'PROVIDER_FAILED');
        return;
      }
      if (state.status === 'canceled') {
        await this.emit(
          await this.repository.change(id, 'generation.canceled', (current) =>
            current.status === 'running' ? { status: 'canceled', cancelRequested: false } : null,
          ),
        );
        return;
      }
      const progress = Math.min(99, Math.max(0, state.progress ?? task.progress));
      if (progress !== task.progress)
        await this.emit(
          await this.repository.change(id, 'generation.progress', (current) =>
            current.status === 'running' && progress > current.progress ? { progress } : null,
          ),
        );
      await delay(this.config.MODEL_POLL_MS);
    }
    // During graceful shutdown leave the queue job retryable, not completed.
    throw new Error('WORKER_SHUTDOWN_RETRY');
  }
  async close() {
    this.closing = true;
    clearInterval(this.reconcileTimer);
    await this.worker?.close();
    await this.queue.close();
    this.redis.disconnect();
    await this.prisma.$disconnect();
  }
}
