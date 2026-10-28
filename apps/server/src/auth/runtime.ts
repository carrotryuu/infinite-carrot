import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { UnauthorizedException } from '@nestjs/common';
import { IDENTITY_SCOPE, mockPeople, SESSION_SECONDS, type AuthConfig } from './config';
import { IdentityRepository } from './repository';
import { FeishuProvider, type Identity } from './provider';

const random = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class AuthRuntime {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly repository: IdentityRepository;
  readonly provider: FeishuProvider;
  constructor(
    readonly config: AuthConfig,
    readonly namespace = 'auth',
    identityScope = IDENTITY_SCOPE,
  ) {
    this.prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
    this.redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.redis.on('error', () => undefined);
    this.repository = new IdentityRepository(this.prisma, identityScope);
    this.provider = new FeishuProvider(config);
  }
  async start() {
    await this.prisma.$connect();
    await this.redis.connect();
  }
  async close() {
    this.redis.disconnect();
    await this.prisma.$disconnect();
  }
  private key(token: string) {
    return `${this.namespace}:session:${hash(token)}`;
  }
  async logout(token?: string) {
    if (token) await this.redis.del(this.key(token));
  }
  async login(identity: Identity, previous?: string) {
    const user = await this.repository.login(identity);
    await this.logout(previous);
    const token = random();
    await this.redis.set(
      this.key(token),
      JSON.stringify({ userId: user.id, version: user.sessionVersion }),
      'EX',
      SESSION_SECONDS,
    );
    return token;
  }
  async mockLogin(id: string, previous?: string) {
    if (this.config.MOCK_EXTERNAL !== '1') throw new UnauthorizedException();
    const person = mockPeople.find((candidate) => candidate.id === id);
    if (!person) throw new UnauthorizedException('Unknown mock identity');
    return this.login(
      { unionId: `${this.namespace}:mock:${id}`, name: person.name, avatarUrl: null },
      previous,
    );
  }
  async me(token?: string) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException('LOGIN_REQUIRED');
    const raw = await this.redis.get(this.key(token));
    if (!raw) throw new UnauthorizedException('LOGIN_REQUIRED');
    const session = JSON.parse(raw) as { userId: string; version: number };
    const user = await this.repository.get(session.userId);
    if (!user || user.status !== 'active' || user.sessionVersion !== session.version) {
      await this.logout(token);
      throw new UnauthorizedException('LOGIN_REQUIRED');
    }
    return {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      pendingAssignment: !user.assigned,
    };
  }
  async currentTeam(token: string) {
    await this.me(token);
    const raw = await this.redis.get(this.key(token));
    if (!raw) throw new UnauthorizedException();
    return (JSON.parse(raw) as { currentTeamId?: string }).currentTeamId ?? null;
  }
  async selectTeam(token: string, teamId: string) {
    await this.me(token);
    const changed = await this.redis.eval(
      "local v=redis.call('GET',KEYS[1]); if not v then return 0 end; local s=cjson.decode(v); s.currentTeamId=ARGV[1]; redis.call('SET',KEYS[1],cjson.encode(s),'KEEPTTL'); return 1",
      1,
      this.key(token),
      teamId,
    );
    if (!changed) throw new UnauthorizedException();
  }
  async begin() {
    if (this.config.MOCK_EXTERNAL !== '0') throw new UnauthorizedException();
    const state = random();
    const verifier = random();
    await this.redis.set(`${this.namespace}:oauth:${hash(state)}`, verifier, 'EX', 600);
    return { state, url: this.provider.authorize(state, verifier) };
  }
  async callback(code: string, state: string, browserState?: string, previous?: string) {
    if (
      this.config.MOCK_EXTERNAL !== '0' ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      state !== browserState ||
      !code ||
      code.length > 2048
    )
      throw new UnauthorizedException('INVALID_OAUTH_STATE');
    const verifier = await this.redis.getdel(`${this.namespace}:oauth:${hash(state)}`);
    if (!verifier) throw new UnauthorizedException('INVALID_OAUTH_STATE');
    let identity: Identity;
    try {
      identity = await this.provider.exchange(code, verifier);
    } catch {
      throw new UnauthorizedException('FEISHU_LOGIN_FAILED');
    }
    return this.login(identity, previous);
  }
}
