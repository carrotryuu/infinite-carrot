import { randomUUID } from 'node:crypto';
import { Permission, roleDefinitions } from '@carrot/shared';
import { IDENTITY_SCOPE, mockPeople } from '../auth/config';
import type { AuthRuntime } from '../auth/runtime';
import { TeamScope } from '../gateway/team-scope';

export const DEMO = {
  a: '10000000-0000-4000-8000-000000000001',
  b: '10000000-0000-4000-8000-000000000002',
  x: '20000000-0000-4000-8000-000000000001',
  y: '20000000-0000-4000-8000-000000000002',
  z: '20000000-0000-4000-8000-000000000003',
};
export async function seedOrganization(runtime: AuthRuntime) {
  if (runtime.config.MOCK_EXTERNAL !== '1') throw new Error('Mock-only seed');
  const db = TeamScope.accounts(runtime.prisma, {
    teamId: IDENTITY_SCOPE,
    tenantId: null,
    actor: 'seed',
    permissions: [Permission.AccountManage],
  });
  for (const point of Object.values(Permission))
    if (!(await db.permissionDefinition.findFirst({ where: { point } })))
      await db.permissionDefinition.create({
        data: { point, teamId: IDENTITY_SCOPE, tenantId: null },
      });
  for (const definition of roleDefinitions) {
    let role = await db.role.findFirst({ where: { key: definition.key } });
    if (!role)
      role = await db.role.create({
        data: {
          key: definition.key,
          name: definition.name,
          teamId: IDENTITY_SCOPE,
          tenantId: null,
        },
      });
    for (const point of definition.permissions) {
      const permission = await db.permissionDefinition.findFirst({ where: { point } });
      if (
        permission &&
        !(await db.rolePermission.findFirst({
          where: { roleId: role.id, permissionId: permission.id },
        }))
      )
        await db.rolePermission.create({
          data: {
            teamId: IDENTITY_SCOPE,
            tenantId: null,
            roleId: role.id,
            permissionId: permission.id,
          },
        });
    }
  }
  for (const [id, name] of [
    [IDENTITY_SCOPE, '组织身份分区'],
    [DEMO.a, 'A 组'],
    [DEMO.b, 'B 组'],
  ] as const)
    if (!(await db.team.findFirst({ where: { id } })))
      await db.team.create({ data: { id, teamId: id, tenantId: null, name } });
  for (const [id, teamId, name] of [
    [DEMO.x, DEMO.a, 'X 项目'],
    [DEMO.y, DEMO.a, 'Y 项目'],
    [DEMO.z, DEMO.b, 'Z 项目'],
  ] as const)
    if (!(await db.project.findFirst({ where: { id } })))
      await db.project.create({ data: { id, teamId, tenantId: null, name } });
  const roles = await db.role.findMany();
  for (const person of mockPeople) {
    const user = await runtime.repository.login({
      unionId: `auth:mock:${person.id}`,
      name: person.name,
      avatarUrl: null,
    });
    if (
      await db.auditLog.findFirst({
        where: { objectId: user.id, action: 'account.demo_initialized' },
      })
    )
      continue;
    const role = roles.find((r) => r.key === person.id)!;
    const grants = [
      {
        teamId: person.id === 'executive' ? DEMO.b : DEMO.a,
        projectId: null as string | null,
        roleId: role.id,
      },
    ];
    if (['owner', 'hrbp', 'producer', 'director'].includes(person.id))
      grants.push({ teamId: DEMO.b, projectId: null, roleId: role.id });
    if (person.id === 'director')
      grants.push({
        teamId: DEMO.a,
        projectId: DEMO.y,
        roleId: roles.find((r) => r.key === 'animator')!.id,
      });
    if (person.id === 'owner' || person.id === 'hrbp')
      grants.push({ teamId: IDENTITY_SCOPE, projectId: null, roleId: role.id });
    await db.$transaction(async (tx) => {
      // Never overwrite assignments already made manually before seeding.
      if ((await tx.membership.count({ where: { userId: user.id } })) === 0 && !user.assigned) {
        for (const grant of grants)
          await tx.membership.create({
            data: {
              id: randomUUID(),
              ...grant,
              tenantId: null,
              userId: user.id,
              scopeKey: grant.projectId || 'team',
            },
          });
        await tx.user.updateMany({ where: { id: user.id }, data: { assigned: true } });
      }
      await tx.auditLog.create({
        data: {
          teamId: IDENTITY_SCOPE,
          tenantId: null,
          actor: 'seed',
          action: 'account.demo_initialized',
          objectType: 'user',
          objectId: user.id,
          after: { initialized: true },
        },
      });
    });
  }
}
