import { z } from 'zod';

export const IDENTITY_SCOPE = '00000000-0000-4000-8000-000000000003';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const mockPeople = [
  { id: 'director', name: '演示导演' },
  { id: 'executive', name: '演示执行导演' },
  { id: 'animator', name: '演示动画师' },
  { id: 'editor', name: '演示剪辑' },
  { id: 'producer', name: '演示制片' },
  { id: 'owner', name: '演示老板' },
  { id: 'hrbp', name: '演示 HRBP' },
] as const;

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  const schema = z.object({
    MOCK_EXTERNAL: z.enum(['0', '1']).default('1'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().url(),
    AUTH_PUBLIC_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
    FEISHU_APP_ID: z.string().default(''),
    FEISHU_APP_SECRET: z.string().default(''),
    FEISHU_TENANT_KEY: z.string().default(''),
    FEISHU_REDIRECT_URI: z.string().default(''),
    ALLOW_REAL_FEISHU: z.enum(['0', '1']).default('0'),
  });
  const result = schema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')),
  );
  if (!result.success) throw new Error('Invalid authentication environment');
  const config = result.data;
  const origin = new URL(config.AUTH_PUBLIC_ORIGIN);
  if (origin.origin !== config.AUTH_PUBLIC_ORIGIN)
    throw new Error('AUTH_PUBLIC_ORIGIN must be an origin');
  const redirectUri = config.FEISHU_REDIRECT_URI || `${origin.origin}/api/auth/feishu/callback`;
  if (
    new URL(redirectUri).origin !== origin.origin ||
    new URL(redirectUri).pathname !== '/api/auth/feishu/callback'
  )
    throw new Error('Feishu callback must use the public origin and /api/auth/feishu/callback');
  if (
    config.MOCK_EXTERNAL === '0' &&
    (config.ALLOW_REAL_FEISHU !== '1' ||
      !config.FEISHU_APP_ID ||
      !config.FEISHU_APP_SECRET ||
      !config.FEISHU_TENANT_KEY ||
      origin.protocol !== 'https:')
  )
    throw new Error('Real Feishu requires approval, credentials, tenant and HTTPS');
  return { ...config, redirectUri, secure: origin.protocol === 'https:' };
}
export type AuthConfig = ReturnType<typeof readAuthConfig>;
