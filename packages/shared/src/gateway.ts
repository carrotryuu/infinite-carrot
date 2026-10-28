import { z } from 'zod';

export const taskStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export const submitTaskSchema = z
  .object({
    idempotencyKey: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-zA-Z0-9_-]+$/),
    prompt: z.string().trim().min(1).max(2000),
  })
  .strict();
export type SubmitTask = z.infer<typeof submitTaskSchema>;
export const terminalStatuses: TaskStatus[] = ['succeeded', 'failed', 'canceled'];
export const taskTransitions: Record<TaskStatus, TaskStatus[]> = {
  queued: ['running', 'canceled', 'failed'],
  running: ['succeeded', 'failed', 'canceled'],
  succeeded: [],
  failed: [],
  canceled: [],
};
export interface TaskView {
  id: string;
  idempotencyKey: string;
  prompt: string;
  provider: string;
  status: TaskStatus;
  progress: number;
  cancelRequested: boolean;
  resultUrl: string | null;
  errorCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ModelInput {
  requestId: string;
  prompt: string;
}
export interface ModelStatus {
  status: TaskStatus;
  progress?: number;
  result?: unknown;
  errorCode?: string;
}
export interface ModelAdapter {
  readonly provider: string;
  readonly idempotentSubmit: boolean;
  submit(input: ModelInput): Promise<string>;
  getStatus(id: string): Promise<ModelStatus>;
  cancel(id: string): Promise<boolean>;
  parseResult(result: unknown): string;
  estimateCost(input: ModelInput): { amount: number | null; unit: string; estimated: true };
}
