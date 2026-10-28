import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AuthConfig } from './config';

export interface Identity {
  unionId: string;
  name: string;
  avatarUrl: string | null;
}
export class FeishuProvider {
  constructor(
    private readonly config: AuthConfig,
    private readonly request = fetch,
  ) {}
  authorize(state: string, verifier: string) {
    const url = new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');
    url.search = new URLSearchParams({
      client_id: this.config.FEISHU_APP_ID,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }
  async exchange(code: string, verifier: string): Promise<Identity> {
    if (this.config.MOCK_EXTERNAL !== '0' || this.config.ALLOW_REAL_FEISHU !== '1')
      throw new Error('Real Feishu is disabled');
    try {
      const tokenResponse = await this.request(
        'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: this.config.FEISHU_APP_ID,
            client_secret: this.config.FEISHU_APP_SECRET,
            code,
            redirect_uri: this.config.redirectUri,
            code_verifier: verifier,
          }),
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        },
      );
      if (!tokenResponse.ok) throw new Error();
      const token = z
        .object({ code: z.literal(0).optional(), access_token: z.string().min(1) })
        .parse(await tokenResponse.json());
      const response = await this.request('https://open.feishu.cn/open-apis/authen/v1/user_info', {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error();
      const profile = z
        .object({
          code: z.literal(0),
          data: z.object({
            union_id: z.string().min(1).max(255),
            name: z.string().min(1).max(200),
            avatar_url: z.string().url().optional(),
            tenant_key: z.string(),
          }),
        })
        .parse(await response.json());
      if (profile.data.tenant_key !== this.config.FEISHU_TENANT_KEY) throw new Error();
      return {
        unionId: profile.data.union_id,
        name: profile.data.name,
        avatarUrl: profile.data.avatar_url?.startsWith('https://') ? profile.data.avatar_url : null,
      };
    } catch {
      throw new Error('FEISHU_LOGIN_FAILED');
    }
  }
}
