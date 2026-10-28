import { z } from 'zod';
import { readInfrastructureEnv } from '@carrot/shared';

const schema = z.object({
  POC_GATEWAY_ENABLED: z.enum(['0', '1']).default('0'),
  POC_TEAM_ID: z.string().uuid().default('00000000-0000-4000-8000-000000000002'),
  POC_TENANT_ID: z.string().uuid().optional(),
  MODEL_POC_PROVIDER: z.enum(['mock', 'ark']).default('mock'),
  MODEL_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(4),
  POC_QUEUE_NAMESPACE: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .default('poc-generation'),
  MODEL_POLL_MS: z.coerce.number().int().min(100).max(30000).default(1000),
  MODEL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(86400000).default(600000),
  MOCK_MIN_MS: z.coerce.number().int().min(100).default(10000),
  MOCK_MAX_MS: z.coerce.number().int().min(100).default(30000),
  MOCK_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  ALLOW_REAL_MODEL_CALLS: z.enum(['0', '1']).default('0'),
  POC_ACCESS_TOKEN: z.string().default(''),
  ARK_API_KEY: z.string().default(''),
  ARK_BASE_URL: z.string().url().default('https://ark.cn-beijing.volces.com/api/v3'),
  ARK_VIDEO_MODEL: z.string().default('doubao-seedance-2-5-260628'),
});
export function readGatewayConfig(env: NodeJS.ProcessEnv = process.env) {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success)
    throw new Error(
      `Invalid gateway variables: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const config = { ...readInfrastructureEnv(env), ...parsed.data };
  if (config.MOCK_MAX_MS < config.MOCK_MIN_MS)
    throw new Error('MOCK_MAX_MS must be >= MOCK_MIN_MS');
  if (config.POC_GATEWAY_ENABLED === '1' && config.MOCK_EXTERNAL === '0') {
    if (
      config.MODEL_POC_PROVIDER !== 'ark' ||
      config.ALLOW_REAL_MODEL_CALLS !== '1' ||
      !config.ARK_API_KEY ||
      config.POC_ACCESS_TOKEN.length < 32
    ) {
      throw new Error(
        'Real model calls require explicit provider, approval gate, key and PoC access token',
      );
    }
    if (new URL(config.ARK_BASE_URL).protocol !== 'https:')
      throw new Error('ARK_BASE_URL requires HTTPS');
  }
  return {
    ...config,
    provider: config.MOCK_EXTERNAL === '1' ? ('mock' as const) : ('ark' as const),
  };
}
export type GatewayConfig = ReturnType<typeof readGatewayConfig>;
export function redisConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: decodeURIComponent(parsed.username) || undefined,
    password: decodeURIComponent(parsed.password) || undefined,
    db: Number(parsed.pathname.slice(1) || 0),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
