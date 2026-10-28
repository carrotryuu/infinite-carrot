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
