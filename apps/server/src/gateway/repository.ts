import { createHash } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, type GenerationTask } from '@prisma/client';
import { taskTransitions, type SubmitTask, type TaskStatus, type TaskView } from '@carrot/shared';
import { TeamScope } from './team-scope';

export function taskView(task: GenerationTask): TaskView {
  return {
    id: task.id,
    idempotencyKey: task.idempotencyKey,
    prompt: task.prompt,
    provider: task.provider,
    status: task.status,
    progress: task.progress,
    cancelRequested: task.cancelRequested,
    resultUrl: task.resultUrl,
    errorCode: task.errorCode,
    version: task.version,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
function auditSnapshot(task: GenerationTask) {
  return {
    status: task.status,
    progress: task.progress,
    cancelRequested: task.cancelRequested,
    providerTaskId: task.providerTaskId,
    version: task.version,
    errorCode: task.errorCode,
  };
}
type Patch = Partial<
  Pick<
    GenerationTask,
    | 'status'
    | 'progress'
    | 'cancelRequested'
    | 'providerTaskId'
    | 'submissionStartedAt'
    | 'submissionToken'
    | 'resultUrl'
    | 'errorCode'
  >
>;

export class TaskRepository {
  readonly db;
  constructor(
    prisma: PrismaClient,
    readonly scope: TeamScope,
  ) {
    this.db = scope.client(prisma);
  }
  list = () => this.db.generationTask.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  pending = () =>
    this.db.generationTask.findMany({
      where: { status: { in: ['queued', 'running'] } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
  async get(id: string) {
    const task = await this.db.generationTask.findFirst({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }
  async create(input: SubmitTask, provider: string) {
    const hash = createHash('sha256')
      .update(JSON.stringify({ prompt: input.prompt, provider }))
      .digest('hex');
    try {
      return await this.db.$transaction(async (transaction) => {
        const task = await transaction.generationTask.create({
          data: { ...this.scope.fields(), ...input, requestHash: hash, provider },
        });
        await transaction.auditLog.create({
          data: {
            ...this.scope.fields(),
            actor: this.scope.context.actor,
            action: 'generation.submit',
            objectType: 'generation_task',
            objectId: task.id,
            after: auditSnapshot(task),
          },
        });
        return task;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.db.generationTask.findFirst({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!existing || existing.requestHash !== hash)
        throw new ConflictException('Idempotency key already used with another request');
      return existing;
    }
  }
  async change(id: string, action: string, patch: (before: GenerationTask) => Patch | null) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await this.db.$transaction(async (transaction) => {
        const before = await transaction.generationTask.findFirst({ where: { id } });
        if (!before) throw new NotFoundException('Task not found');
        const data = patch(before);
        if (!data) return before;
        if (
          data.status &&
          data.status !== before.status &&
          !taskTransitions[before.status as TaskStatus].includes(data.status)
        )
          throw new Error('Illegal task transition');
        const changed = await transaction.generationTask.updateMany({
          where: { id, version: before.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (!changed.count) return null;
        const after = await transaction.generationTask.findFirst({ where: { id } });
        if (!after) throw new Error('Task disappeared');
        await transaction.auditLog.create({
          data: {
            ...this.scope.fields(),
            actor: this.scope.context.actor,
            action,
            objectType: 'generation_task',
            objectId: id,
            before: auditSnapshot(before),
            after: auditSnapshot(after),
          },
        });
        return after;
      });
      if (result) return result;
    }
    throw new ConflictException('Concurrent update; retry request');
  }
}
