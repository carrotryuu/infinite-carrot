import { PrismaClient, type User } from '@prisma/client';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TeamScope, type ScopeContext } from '../gateway/team-scope';
import { IDENTITY_SCOPE } from './config';
import { Permission } from '@carrot/shared';
import type { Identity } from './provider';

// User identity belongs to the organization identity partition, NOT a membership team.
// T04 memberships determine actual business scopes. This client is private to auth.
export class IdentityRepository {
  private readonly db;
  constructor(
    prisma: PrismaClient,
    private readonly scopeId = IDENTITY_SCOPE,
  ) {
    this.db = new TeamScope({
      teamId: scopeId,
      tenantId: null,
      actor: 'auth',
      permissions: [],
    }).client(prisma);
  }
  private audit(user: User, action: string, actor: string, before: object | null) {
    return {
      teamId: this.scopeId,
      tenantId: null,
      actor,
      action,
      objectType: 'user',
      objectId: user.id,
      ...(before ? { before } : {}),
      after: {
        name: user.name,
        status: user.status,
        assigned: user.assigned,
        sessionVersion: user.sessionVersion,
      },
    };
  }
  async login(identity: Identity): Promise<User> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.db.$transaction(async (tx) => {
          const existing = await tx.user.findFirst({ where: { unionId: identity.unionId } });
          if (existing?.status === 'disabled') throw new UnauthorizedException('ACCOUNT_DISABLED');
          if (!existing) {
            const user = await tx.user.create({
              data: { ...identity, teamId: this.scopeId, tenantId: null },
            });
            await tx.auditLog.create({ data: this.audit(user, 'account.created', user.id, null) });
            return user;
          }
          const changed = await tx.user.updateMany({
            where: { id: existing.id, status: 'active', sessionVersion: existing.sessionVersion },
            data: { name: identity.name, avatarUrl: identity.avatarUrl },
          });
          if (!changed.count) throw new UnauthorizedException('ACCOUNT_DISABLED');
          const user = { ...existing, name: identity.name, avatarUrl: identity.avatarUrl };
          await tx.auditLog.create({
            data: this.audit(user, 'account.login', user.id, {
              name: existing.name,
              status: existing.status,
            }),
          });
          return user;
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002' && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error('Identity conflict');
  }
  get(id: string) {
    return this.db.user.findFirst({ where: { id } });
  }
  // Called by the future T04 account-management service. No public mutation route in T03.
  async setStatus(id: string, status: 'active' | 'disabled', actor: ScopeContext) {
    if (!actor.permissions.includes(Permission.AccountManage)) throw new ForbiddenException();
    return this.db.$transaction(async (tx) => {
      const before = await tx.user.findFirst({ where: { id } });
      if (!before) throw new UnauthorizedException();
      await tx.user.updateMany({
        where: { id },
        data: { status, sessionVersion: { increment: 1 } },
      });
      const after = await tx.user.findFirst({ where: { id } });
      if (!after) throw new UnauthorizedException();
      await tx.auditLog.create({
        data: this.audit(after, 'account.status_changed', actor.actor, {
          status: before.status,
          sessionVersion: before.sessionVersion,
        }),
      });
    });
  }
}
