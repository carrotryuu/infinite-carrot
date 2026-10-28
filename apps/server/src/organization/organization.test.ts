import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Permission, roleDefinitions } from '@carrot/shared';
import { AuthRuntime } from '../auth/runtime';
import { readAuthConfig, IDENTITY_SCOPE } from '../auth/config';
import { AuthService } from '../auth/http';
import { ServerAppModule } from '../app';
import { TeamScope } from '../gateway/team-scope';
import { seedOrganization } from './seed';
import { COMPANY_TEAM_ID } from './constants';
import { ACCESS_POLICY, GLOBAL_READABLE, type AccessPolicy } from './policy';

@Controller('missing-policy-test')
class MissingPolicyController {
  @Get() get() {
    return { unsafe: true };
  }
}
it('defines the exact seven-role matrix with no editor/owner writes or animator review', () => {
  expect(roleDefinitions).toHaveLength(7);
  expect(Object.values(Permission)).toHaveLength(12);
  expect(roleDefinitions.find((r) => r.key === 'editor')!.permissions).toEqual([
    Permission.CanvasView,
  ]);
  expect(roleDefinitions.find((r) => r.key === 'owner')!.permissions).toEqual([
    Permission.CanvasView,
    Permission.GlobalView,
  ]);
  expect(roleDefinitions.find((r) => r.key === 'hrbp')!.permissions).toContain(
    Permission.AccountManage,
  );
  expect(roleDefinitions.find((r) => r.key === 'animator')!.permissions).not.toContain(
    Permission.ReviewDecide,
  );
});

describe.runIf(process.env.ORGANIZATION_INTEGRATION_TESTS === '1')(
  'organization authorization',
  () => {
    let runtime: AuthRuntime;
    let app: INestApplication;
    let db: ReturnType<typeof TeamScope.accounts>;
    const a = randomUUID(),
      b = randomUUID(),
      x = randomUUID(),
      y = randomUUID(),
      z = randomUUID();
    const origin = 'http://127.0.0.1:5173';
    const users: Record<string, { id: string; token: string }> = {};
    const roleIds: Record<string, string> = {};
    beforeAll(async () => {
      runtime = new AuthRuntime(
        readAuthConfig({ ...process.env, MOCK_EXTERNAL: '1', AUTH_PUBLIC_ORIGIN: origin }),
        'organization-test-' + randomUUID(),
      );
      await runtime.start();
      await seedOrganization(runtime);
      db = TeamScope.accounts(runtime.prisma, {
        teamId: IDENTITY_SCOPE,
        tenantId: null,
        actor: 'fixture',
        permissions: [Permission.AccountManage],
      });
      for (const role of await db.role.findMany()) roleIds[role.key] = role.id;
      for (const [id, name] of [
        [a, 'Test A'],
        [b, 'Test B'],
      ])
        await db.team.create({ data: { id: id!, teamId: id!, tenantId: null, name: name! } });
      for (const [id, teamId, name] of [
        [x, a, 'Test X'],
        [y, a, 'Test Y'],
        [z, b, 'Test Z'],
      ])
        await db.project.create({
          data: { id: id!, teamId: teamId!, tenantId: null, name: name! },
        });
      for (const key of ['director', 'producer', 'animator', 'editor', 'owner', 'hrbp', 'new']) {
        const token = await runtime.login({
          unionId: randomUUID(),
          name: 'Test ' + key,
          avatarUrl: null,
        });
        const user = await runtime.me(token);
        users[key] = { id: user.id, token };
        if (key !== 'new') await grant(key, a, key);
        if (key === 'owner' || key === 'hrbp') await grant(key, IDENTITY_SCOPE, key);
      }
      await grant('director', a, 'animator', y);
      await grant('director', b, 'executive');
      await grant('hrbp', b, 'hrbp');
      const module = await Test.createTestingModule({
        imports: [ServerAppModule],
        controllers: [MissingPolicyController],
      })
        .overrideProvider(AuthService)
        .useValue({ runtime })
        .compile();
      app = module.createNestApplication();
      await app.init();
    }, 30000);
    async function grant(
      user: string,
      teamId: string,
      role: string,
      projectId: string | null = null,
    ) {
      await db.membership.create({
        data: {
          teamId,
          tenantId: null,
          userId: users[user]!.id,
          roleId: roleIds[role]!,
          projectId,
          scopeKey: projectId || 'team',
        },
      });
    }
    afterAll(async () => {
      await app?.close();
      await runtime?.close();
    });
    const get = (user: string, path: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Cookie', 'carrot_session=' + users[user]!.token);
    const post = (user: string, path: string, body: unknown) =>
      request(app.getHttpServer())
        .post(path)
        .set('Origin', origin)
        .set('Cookie', 'carrot_session=' + users[user]!.token)
        .send(body as object);
    it('enumerates every registered application route and fails closed for an unmarked route', async () => {
      const reflector = app.get(Reflector);
      let routes = 0;
      for (const module of app.get(ModulesContainer).values())
        for (const wrapper of module.controllers.values()) {
          const controller = wrapper.metatype;
          if (!controller || controller === MissingPolicyController) continue;
          for (const name of Object.getOwnPropertyNames(controller.prototype)) {
            const handler: unknown = Object.getOwnPropertyDescriptor(
              controller.prototype,
              name,
            )?.value;
            if (
              typeof handler !== 'function' ||
              Reflect.getMetadata(METHOD_METADATA, handler) === undefined
            )
              continue;
            const policy = reflector.getAllAndOverride<AccessPolicy>(ACCESS_POLICY, [
              handler,
              controller,
            ]);
            expect(policy, controller.name + '.' + name).toBeDefined();
            if (policy?.kind === 'public') expect(policy.reason.length).toBeGreaterThan(5);
            if (policy?.kind === 'permission' && policy.point === Permission.GlobalView)
              expect(reflector.get(GLOBAL_READABLE, handler)).toBe(true);
            routes++;
          }
        }
      expect(routes).toBeGreaterThan(15);
      await get('hrbp', '/missing-policy-test').expect(403);
      await request(app.getHttpServer()).get('/organization/context').expect(401);
    });
    it('returns 404 for other-team projects and people without trusting request headers or switch requests', async () => {
      await get('animator', '/organization/context').expect(200);
      await get('animator', '/teams/' + b + '/projects/' + z)
        .set('X-Team-Id', b)
        .expect(404);
      await get('animator', '/teams/' + b + '/members').expect(404);
      await get('animator', '/teams/' + b + '/members/' + users.director!.id).expect(404);
      await get('animator', '/teams/' + a + '/projects/' + z).expect(404);
      await post('animator', '/organization/current-team', { teamId: b }).expect(404);
      // File service is T05, so the unregistered path exposes no file data.
      await get('animator', '/files/' + randomUUID()).expect(404);
    });
    it('uses project overrides instead of unioning team roles and persists team selection in the session', async () => {
      await post('director', '/organization/current-team', { teamId: a }).expect(201);
      await get('director', '/teams/' + a + '/projects/' + x + '/members').expect(200);
      await get('director', '/teams/' + a + '/projects/' + y + '/members').expect(403);
      const context = await get('director', '/organization/context').expect(200);
      expect(context.body.projects.find((p: { id: string }) => p.id === x).permissions).toContain(
        Permission.SkillPublish,
      );
      expect(
        context.body.projects.find((p: { id: string }) => p.id === y).permissions,
      ).not.toContain(Permission.SkillPublish);
      await post('director', '/organization/current-team', { teamId: b }).expect(201);
      expect((await get('director', '/organization/context')).body.currentTeamId).toBe(b);
      await get('director', '/teams/' + a + '/projects/' + x).expect(404);
    });
    it('restricts global read to owner/HRBP, audits it, and rejects owner/editor management writes', async () => {
      await get('animator', '/organization/people').expect(403);
      const before = await db.auditLog.count({
        where: { actor: users.owner!.id, action: 'organization.people_read' },
      });
      await get('owner', '/organization/people').expect(200);
      expect(
        await db.auditLog.count({
          where: { actor: users.owner!.id, action: 'organization.people_read' },
        }),
      ).toBe(before + 1);
      for (const key of ['owner', 'editor', 'animator', 'director']) {
        await get(key, '/organization/administration').expect(403);
        await post(key, '/organization/users/' + users.new!.id + '/memberships', {
          memberships: [],
        }).expect(403);
      }
      await get('owner', '/teams/' + b + '/projects/' + z).expect(404);
      const editor = await get('editor', '/organization/context');
      expect(editor.body.permissions).toEqual([Permission.CanvasView]);
    });
    it('allows HRBP assignment and transfer with immediate revocation, audit and validation', async () => {
      const url = '/organization/users/' + users.new!.id + '/memberships';
      const assignment = { teamId: a, projectId: null, roleId: roleIds.animator };
      await post('hrbp', url, { memberships: [assignment] }).expect(201);
      const target = await get('new', '/organization/context').expect(200);
      expect(target.body.currentTeamId).toBe(a);
      expect(target.body.user.pendingAssignment).toBe(false);
      await post('hrbp', url, { memberships: [{ ...assignment, teamId: b, projectId: x }] }).expect(
        400,
      );
      await post('hrbp', url, { memberships: [{ ...assignment, teamId: IDENTITY_SCOPE }] }).expect(
        400,
      );
      await post('hrbp', url, { memberships: [assignment, assignment] }).expect(400);
      await post('hrbp', url, { memberships: [{ ...assignment, teamId: b }] }).expect(201);
      await get('new', '/teams/' + a + '/projects/' + x).expect(404);
      await get('new', '/teams/' + b + '/projects/' + z).expect(200);
      const audit = await db.auditLog.findMany({
        where: { objectId: users.new!.id, action: 'account.memberships_changed' },
      });
      expect(audit).toHaveLength(2);
      expect(audit[1]!.before).toBeTruthy();
      await post('hrbp', '/organization/users/' + users.hrbp!.id + '/memberships', {
        memberships: [],
      }).expect(400);
      await request(app.getHttpServer())
        .post(url)
        .set('Cookie', 'carrot_session=' + users.hrbp!.token)
        .set('Origin', 'https://evil.example')
        .send({ memberships: [] })
        .expect(403);
    });
    it('HRBP creates groups while director/producer create projects with server-enforced ownership', async () => {
      const name = '新建组-' + randomUUID();
      const created = await post('hrbp', '/organization/teams', { name }).expect(201);
      expect(await db.team.findFirst({ where: { id: created.body.id } })).toMatchObject({
        name,
        teamId: created.body.id,
      });
      await post('hrbp', '/organization/teams', { name }).expect(400);
      await post('director', '/organization/teams', { name: '不允许' }).expect(403);
      await post('owner', '/organization/teams', { name: '不允许' }).expect(403);
      await post('director', '/organization/current-team', { teamId: a }).expect(201);
      const direct = await post('director', '/teams/' + a + '/projects', {
        name: '导演项目',
      }).expect(201);
      expect(direct.body.teamId).toBe(a);
      await post('animator', '/teams/' + a + '/projects', { name: '无权创建' }).expect(403);
      await post('producer', '/teams/' + a + '/projects', { name: '伪造归属', teamId: a }).expect(
        400,
      );
      const produced = await post('producer', '/teams/' + a + '/projects', {
        name: '公司项目',
      }).expect(201);
      expect(produced.body.teamId).toBe(COMPANY_TEAM_ID);
      await post('producer', '/organization/current-team', { teamId: COMPANY_TEAM_ID }).expect(201);
      await get('producer', '/teams/' + COMPANY_TEAM_ID + '/projects/' + produced.body.id).expect(
        200,
      );
      await post('producer', '/teams/' + COMPANY_TEAM_ID + '/projects', {
        name: '第二个公司项目',
      }).expect(201);
      await grant('animator', COMPANY_TEAM_ID, 'animator');
      await post('animator', '/organization/current-team', { teamId: COMPANY_TEAM_ID }).expect(201);
      await get('animator', '/teams/' + COMPANY_TEAM_ID + '/projects/' + produced.body.id).expect(
        404,
      );
      expect((await get('animator', '/organization/context')).body.projects).toEqual([]);
      await grant('animator', COMPANY_TEAM_ID, 'animator', produced.body.id);
      await get('animator', '/teams/' + COMPANY_TEAM_ID + '/projects/' + produced.body.id).expect(
        200,
      );
      expect(
        await db.auditLog.count({ where: { objectId: created.body.id, action: 'team.created' } }),
      ).toBe(1);
      expect(
        await TeamScope.prototype.client
          .call(
            new TeamScope({
              teamId: COMPANY_TEAM_ID,
              tenantId: null,
              actor: 'test',
              permissions: [],
            }),
            runtime.prisma,
          )
          .auditLog.count({ where: { objectId: produced.body.id, action: 'project.created' } }),
      ).toBe(1);
    });
    it('HRBP disable invalidates existing sessions and re-enabling does not revive them', async () => {
      const url = '/organization/users/' + users.new!.id + '/status';
      await post('hrbp', url, { status: 'disabled' }).expect(201);
      await get('new', '/organization/context').expect(401);
      await post('hrbp', url, { status: 'active' }).expect(201);
      await get('new', '/organization/context').expect(401);
      expect(await db.user.findFirst({ where: { id: users.new!.id } })).not.toBeNull();
    });
  },
);
