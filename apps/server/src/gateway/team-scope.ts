import { PrismaClient } from '@prisma/client';
import { Permission } from '@carrot/shared';

export interface ScopeContext {
  teamId: string;
  tenantId: string | null;
  actor: string;
  permissions: Permission[];
}

// Central Prisma query middleware. Controllers never write team filters.
export class TeamScope {
  // Identity discovery can read ONLY the authenticated user's memberships.
  static memberships(prisma: PrismaClient, userId: string) {
    return prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (model !== 'Membership' || !['findFirst', 'findMany', 'count'].includes(operation))
              throw new Error('Identity scope is read-only');
            const p = args as Record<string, unknown>;
            p.where = { AND: [p.where || {}, { userId, tenantId: null }] };
            return query(args);
          },
        },
      },
    });
  }
  // The explicit company-wide account.manage exception from decisions.md §5.
  // Never use this client for files, generation tasks or business canvas writes.
  static accounts(prisma: PrismaClient, context: ScopeContext) {
    if (!context.permissions.includes(Permission.AccountManage))
      throw new Error('Account management permission required');
    const identityModels = ['User', 'Role', 'PermissionDefinition', 'RolePermission', 'AuditLog'];
    return prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (![...identityModels, 'Team', 'Project', 'Membership'].includes(model))
              throw new Error('Account scope rejects business model');
            if (
              model === 'AuditLog' &&
              !['create', 'findFirst', 'findMany', 'count'].includes(operation)
            )
              throw new Error('Audit logs are append-only');
            const p = args as Record<string, unknown>;
            const scope = identityModels.includes(model)
              ? { teamId: context.teamId, tenantId: context.tenantId }
              : { tenantId: context.tenantId };
            if (
              ['findFirst', 'findMany', 'count', 'updateMany', 'deleteMany'].includes(operation)
            ) {
              if (operation === 'deleteMany' && model !== 'Membership')
                throw new Error('Historical records cannot be deleted');
              p.where = { AND: [p.where || {}, scope] };
              if (
                operation === 'updateMany' &&
                ('teamId' in (p.data as object) || 'tenantId' in (p.data as object))
              )
                throw new Error('Scope fields are immutable');
            } else if (operation === 'create') p.data = { ...(p.data as object), ...scope };
            else throw new Error('Unsupported account operation');
            return query(args);
          },
        },
      },
    });
  }
  constructor(readonly context: ScopeContext) {}
  fields = () => ({ teamId: this.context.teamId, tenantId: this.context.tenantId });
  client(prisma: PrismaClient) {
    const scope = this.fields();
    return prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const parameters = args as Record<string, unknown>;
            if (
              model === 'AuditLog' &&
              !['create', 'findMany', 'findFirst', 'count'].includes(operation)
            )
              throw new Error('Audit logs are append-only');
            if (['findMany', 'findFirst', 'count', 'updateMany'].includes(operation)) {
              parameters.where = { AND: [parameters.where || {}, scope] };
              if (operation === 'updateMany') {
                const data = parameters.data as Record<string, unknown>;
                if ('teamId' in data || 'tenantId' in data)
                  throw new Error('Scope fields are immutable');
              }
            } else if (operation === 'create') {
              parameters.data = { ...(parameters.data as object), ...scope };
            } else {
              throw new Error(`Unscoped operation rejected: ${operation}`);
            }
            return query(args);
          },
        },
      },
    });
  }
}
