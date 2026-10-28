import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { Permission, type OrganizationContext } from '@carrot/shared';
import { z } from 'zod';
import { AuthService } from '../auth/http';
import { IDENTITY_SCOPE } from '../auth/config';
import { TeamScope, type ScopeContext } from '../gateway/team-scope';
import { randomUUID } from 'node:crypto';
import { COMPANY_TEAM_ID } from './constants';

const assignmentSchema = z
  .object({
    memberships: z
      .array(
        z
          .object({
            teamId: z.string().uuid(),
            projectId: z.string().uuid().nullable(),
            roleId: z.string().uuid(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type Principal = Awaited<ReturnType<OrganizationService['principal']>>;
@Injectable()
export class OrganizationService {
  async createTeam(p: Principal, body: unknown) {
    if (!p.organizationPermissions.includes(Permission.TeamCreate)) throw new ForbiddenException();
    const parsed = z
      .object({ name: z.string().trim().min(1).max(100) })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('请填写 1～100 字的组名');
    const db = this.admin(p);
    return db.$transaction(async (tx) => {
      await tx.role.updateMany({ where: { key: 'hrbp' }, data: { updatedAt: new Date() } });
      const actor = await tx.user.findFirst({ where: { id: p.user.id, status: 'active' } });
      const role = await tx.role.findFirst({ where: { key: 'hrbp' } });
      if (
        !actor ||
        !role ||
        !(await tx.membership.findFirst({
          where: { userId: p.user.id, roleId: role.id, teamId: IDENTITY_SCOPE, projectId: null },
        }))
      )
        throw new ForbiddenException();
      if (await tx.team.findFirst({ where: { name: parsed.data.name } }))
        throw new BadRequestException('组名已存在');
      const id = randomUUID();
      const team = await tx.team.create({
        data: { id, teamId: id, tenantId: null, name: parsed.data.name },
      });
      await tx.auditLog.create({
        data: {
          teamId: IDENTITY_SCOPE,
          tenantId: null,
          actor: p.user.id,
          action: 'team.created',
          objectType: 'team',
          objectId: id,
          after: { name: team.name },
        },
      });
      return { id: team.id, name: team.name };
    });
  }
  constructor(@Inject(AuthService) readonly auth: AuthService) {}
  get prisma() {
    return this.auth.runtime.prisma;
  }
  private identity(actor: string) {
    return new TeamScope({ teamId: IDENTITY_SCOPE, tenantId: null, actor, permissions: [] }).client(
      this.prisma,
    );
  }
  team(teamId: string, actor: string) {
    return new TeamScope({ teamId, tenantId: null, actor, permissions: [] }).client(this.prisma);
  }
  scope(actor: string, permissions: Permission[]): ScopeContext {
    return { teamId: IDENTITY_SCOPE, tenantId: null, actor, permissions };
  }
  private admin(principal: Principal) {
    return TeamScope.accounts(
      this.prisma,
      this.scope(principal.user.id, principal.organizationPermissions),
    );
  }
  async principal(token: string) {
    const user = await this.auth.runtime.me(token);
    const memberships = await TeamScope.memberships(this.prisma, user.id).membership.findMany();
    const db = this.identity(user.id);
    const [roles, links, definitions] = await Promise.all([
      db.role.findMany(),
      db.rolePermission.findMany(),
      db.permissionDefinition.findMany(),
    ]);
    const rolePoints = (roleId: string): Permission[] =>
      definitions
        .filter((p) => links.some((l) => l.roleId === roleId && l.permissionId === p.id))
        .map((p) => p.point as Permission);
    const organizationRole = memberships.find(
      (m) => m.teamId === IDENTITY_SCOPE && m.projectId === null,
    );
    const role = roles.find((r) => r.id === organizationRole?.roleId);
    const organizationPermissions =
      role && ['owner', 'hrbp'].includes(role.key) ? rolePoints(role.id) : [];
    const teamIds = [
      ...new Set(memberships.filter((m) => m.teamId !== IDENTITY_SCOPE).map((m) => m.teamId)),
    ];
    const storedTeam = await this.auth.runtime.currentTeam(token);
    const currentTeamId = teamIds.includes(storedTeam || '') ? storedTeam : (teamIds[0] ?? null);
    if (currentTeamId && storedTeam !== currentTeamId)
      await this.auth.runtime.selectTeam(token, currentTeamId);
    const creationRole = (teamId: string) => {
      const member =
        memberships.find((m) => m.teamId === teamId && m.projectId === null) ??
        (teamId === COMPANY_TEAM_ID
          ? memberships.find(
              (m) =>
                m.teamId === teamId && roles.some((r) => r.id === m.roleId && r.key === 'producer'),
            )
          : undefined);
      return roles.find((r) => r.id === member?.roleId);
    };
    const points = (teamId: string, projectId?: string) => {
      const projectRole = projectId
        ? memberships.find((m) => m.teamId === teamId && m.projectId === projectId)
        : undefined;
      const membership =
        projectRole ??
        (teamId === COMPANY_TEAM_ID && projectId
          ? undefined
          : memberships.find((m) => m.teamId === teamId && m.projectId === null));
      if (teamId === COMPANY_TEAM_ID && !projectId)
        return creationRole(teamId) && ['director', 'producer'].includes(creationRole(teamId)!.key)
          ? [Permission.ProjectCreate]
          : [];
      return membership
        ? rolePoints(membership.roleId).filter(
            (p) =>
              p !== Permission.AccountManage &&
              p !== Permission.GlobalView &&
              p !== Permission.TeamCreate,
          )
        : [];
    };
    return {
      user,
      memberships,
      organizationPermissions,
      teamIds,
      currentTeamId,
      points,
      creationRole,
    };
  }
  async createProject(p: Principal, teamId: string, body: unknown) {
    await this.assertTeam(p, teamId);
    const role = p.creationRole(teamId);
    if (
      !role ||
      !['director', 'producer'].includes(role.key) ||
      !p.points(teamId).includes(Permission.ProjectCreate)
    )
      throw new ForbiddenException();
    const parsed = z
      .object({ name: z.string().trim().min(1).max(100) })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('请填写 1～100 字的项目名');
    const target = role.key === 'producer' ? COMPANY_TEAM_ID : teamId;
    const db = this.team(target, p.user.id);
    return db.$transaction(async (tx) => {
      if (!(await tx.team.findFirst({ where: { id: target } })))
        throw new BadRequestException('公司组尚未初始化');
      const project = await tx.project.create({
        data: { teamId: target, tenantId: null, name: parsed.data.name },
      });
      await tx.membership.create({
        data: {
          teamId: target,
          tenantId: null,
          userId: p.user.id,
          roleId: role.id,
          projectId: project.id,
          scopeKey: project.id,
        },
      });
      await tx.auditLog.create({
        data: {
          teamId: target,
          tenantId: null,
          actor: p.user.id,
          action: 'project.created',
          objectType: 'project',
          objectId: project.id,
          after: { name: project.name, teamId: target, creatorRole: role.key },
        },
      });
      return { id: project.id, name: project.name, teamId: target };
    });
  }
  async context(p: Principal): Promise<OrganizationContext> {
    const teams = (
      await Promise.all(
        p.teamIds.map((id) => this.team(id, p.user.id).team.findFirst({ where: { id } })),
      )
    )
      .filter((t) => t !== null)
      .map((t) => ({ id: t.id, name: t.name }));
    const projects = p.currentTeamId
      ? await this.team(p.currentTeamId, p.user.id).project.findMany({ orderBy: { name: 'asc' } })
      : [];
    return {
      user: { ...p.user, pendingAssignment: p.memberships.length === 0 },
      teams,
      currentTeamId: p.currentTeamId,
      organizationPermissions: p.organizationPermissions,
      permissions: p.currentTeamId ? p.points(p.currentTeamId) : [],
      projects: projects
        .filter((project) => p.points(project.teamId, project.id).length > 0)
        .map((project) => ({
          id: project.id,
          name: project.name,
          permissions: p.points(project.teamId, project.id),
        })),
    };
  }
  async switchTeam(p: Principal, token: string, id: unknown) {
    if (typeof id !== 'string' || !p.teamIds.includes(id)) throw new NotFoundException();
    await this.auth.runtime.selectTeam(token, id);
    await this.identity(p.user.id).auditLog.create({
      data: {
        teamId: IDENTITY_SCOPE,
        tenantId: null,
        actor: p.user.id,
        action: 'account.team_switched',
        objectType: 'user',
        objectId: p.user.id,
        before: { teamId: p.currentTeamId },
        after: { teamId: id },
      },
    });
    return this.context(await this.principal(token));
  }
  async assertTeam(p: Principal, teamId: string) {
    if (
      !z.string().uuid().safeParse(teamId).success ||
      p.currentTeamId !== teamId ||
      !p.teamIds.includes(teamId)
    )
      throw new NotFoundException();
  }
  async project(p: Principal, teamId: string, projectId: string) {
    await this.assertTeam(p, teamId);
    if (!z.string().uuid().safeParse(projectId).success) throw new NotFoundException();
    const project = await this.team(teamId, p.user.id).project.findFirst({
      where: { id: projectId },
    });
    if (!project || p.points(teamId, projectId).length === 0) throw new NotFoundException();
    return { id: project.id, name: project.name, permissions: p.points(teamId, projectId) };
  }
  async members(p: Principal, teamId: string, projectId?: string) {
    await this.assertTeam(p, teamId);
    if (projectId) await this.project(p, teamId, projectId);
    const memberships = await this.team(teamId, p.user.id).membership.findMany({
      where: projectId
        ? teamId === COMPANY_TEAM_ID
          ? { projectId }
          : { OR: [{ projectId }, { projectId: null }] }
        : {},
    });
    const users = await this.identity(p.user.id).user.findMany({
      where: { id: { in: memberships.map((m) => m.userId) } },
      select: { id: true, name: true, status: true },
    });
    return users;
  }
  async person(p: Principal, teamId: string, userId: string) {
    await this.assertTeam(p, teamId);
    if (!z.string().uuid().safeParse(userId).success) throw new NotFoundException();
    const member = await this.team(teamId, p.user.id).membership.findFirst({ where: { userId } });
    if (!member) throw new NotFoundException();
    return this.identity(p.user.id).user.findFirst({
      where: { id: userId },
      select: { id: true, name: true, status: true },
    });
  }
  async globalPeople(p: Principal) {
    if (!p.organizationPermissions.includes(Permission.GlobalView)) throw new ForbiddenException();
    // Only called from @GlobalReadable; record every company-wide read before returning data.
    const db = this.identity(p.user.id);
    await db.auditLog.create({
      data: {
        teamId: IDENTITY_SCOPE,
        tenantId: null,
        actor: p.user.id,
        action: 'organization.people_read',
        objectType: 'organization',
        objectId: IDENTITY_SCOPE,
        after: { crossTeam: true },
      },
    });
    return db.user.findMany({
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
    });
  }
  async administration(p: Principal) {
    const db = this.admin(p);
    const [users, memberships, teams, projects, roles] = await Promise.all([
      db.user.findMany({
        select: { id: true, name: true, status: true, assigned: true },
        orderBy: { name: 'asc' },
      }),
      db.membership.findMany(),
      db.team.findMany({ where: { id: { not: IDENTITY_SCOPE } } }),
      db.project.findMany(),
      db.role.findMany(),
    ]);
    await db.auditLog.create({
      data: {
        teamId: IDENTITY_SCOPE,
        tenantId: null,
        actor: p.user.id,
        action: 'account.management_read',
        objectType: 'organization',
        objectId: IDENTITY_SCOPE,
        after: { crossTeam: true },
      },
    });
    return { users, memberships, teams, projects, roles, organizationScope: IDENTITY_SCOPE };
  }
  async manage(p: Principal, userId: string, body: unknown, status?: 'active' | 'disabled') {
    if (!z.string().uuid().safeParse(userId).success) throw new NotFoundException();
    if (userId === p.user.id)
      throw new BadRequestException('不能修改自己的账号，请由另一位 HRBP 操作');
    const parsed = status ? undefined : assignmentSchema.safeParse(body);
    if (!status && !parsed?.success) throw new BadRequestException('Invalid memberships');
    const rows = parsed?.success ? parsed.data.memberships : undefined;
    const db = this.admin(p);
    await db.$transaction(async (tx) => {
      // Serializes account-management changes; recheck actor after taking the lock.
      await tx.role.updateMany({ where: { key: 'hrbp' }, data: { updatedAt: new Date() } });
      const actor = await tx.user.findFirst({ where: { id: p.user.id, status: 'active' } });
      const hrbp = await tx.role.findFirst({ where: { key: 'hrbp' } });
      const grant = hrbp
        ? await tx.membership.findFirst({
            where: { userId: p.user.id, roleId: hrbp.id, teamId: IDENTITY_SCOPE, projectId: null },
          })
        : null;
      if (!actor || !grant) throw new ForbiddenException();
      const target = await tx.user.findFirst({ where: { id: userId } });
      if (!target) throw new NotFoundException();
      const before = await tx.membership.findMany({ where: { userId } });
      if (rows) {
        const distinct = new Set<string>();
        for (const row of rows) {
          const role = await tx.role.findFirst({ where: { id: row.roleId } });
          const team = await tx.team.findFirst({ where: { id: row.teamId } });
          if (!role || !team) throw new BadRequestException('Unknown role or team');
          if (
            row.teamId === IDENTITY_SCOPE &&
            (row.projectId || !['hrbp', 'owner'].includes(role.key))
          )
            throw new BadRequestException('Only owner/HRBP may hold organization roles');
          if (row.projectId) {
            const project = await tx.project.findFirst({ where: { id: row.projectId } });
            if (!project || project.teamId !== row.teamId)
              throw new BadRequestException('Project does not belong to selected team');
          }
          const key = `${row.teamId}:${row.projectId || 'team'}`;
          if (distinct.has(key)) throw new BadRequestException('Duplicate role scope');
          distinct.add(key);
        }
        await tx.membership.deleteMany({ where: { userId } });
        for (const row of rows)
          await tx.membership.create({
            data: { ...row, userId, tenantId: null, scopeKey: row.projectId || 'team' },
          });
      }
      await tx.user.updateMany({
        where: { id: userId },
        data: {
          ...(status ? { status, sessionVersion: { increment: 1 } } : { assigned: !!rows?.length }),
        },
      });
      await tx.auditLog.create({
        data: {
          teamId: IDENTITY_SCOPE,
          tenantId: null,
          actor: p.user.id,
          action: status ? 'account.status_changed' : 'account.memberships_changed',
          objectType: 'user',
          objectId: userId,
          before: {
            status: target.status,
            memberships: before.map((m) => ({
              teamId: m.teamId,
              projectId: m.projectId,
              roleId: m.roleId,
            })),
          },
          after: {
            status: status || target.status,
            memberships:
              rows ||
              before.map((m) => ({ teamId: m.teamId, projectId: m.projectId, roleId: m.roleId })),
          },
        },
      });
    });
    return { ok: true };
  }
}
