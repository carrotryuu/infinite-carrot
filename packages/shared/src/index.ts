import { z } from 'zod';
export { Permission } from '../permissions';
export * from './gateway';

export const dependencyStatusSchema = z.enum(['ok', 'down']);
export const healthSchema = z.object({
  status: dependencyStatusSchema,
  database: dependencyStatusSchema,
  redis: dependencyStatusSchema,
  nas: dependencyStatusSchema,
});
export type Health = z.infer<typeof healthSchema>;

export const infrastructureEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => /^postgres(ql)?:/.test(value)),
  REDIS_URL: z
    .string()
    .url()
    .refine((value) => /^rediss?:/.test(value)),
  NAS_ROOT: z.string().min(1),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MOCK_EXTERNAL: z.enum(['0', '1']).default('1'),
});
export type InfrastructureEnv = z.infer<typeof infrastructureEnvSchema>;

export function readInfrastructureEnv(env: NodeJS.ProcessEnv): InfrastructureEnv {
  const result = infrastructureEnvSchema.safeParse(env);
  if (!result.success) {
    // Report variable names only: connection strings can contain passwords.
    throw new Error(
      `Invalid environment variables: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }
  return result.data;
}
