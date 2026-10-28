import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Inject,
  Injectable,
  Module,
  ForbiddenException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Permission } from '@carrot/shared';
import type { IncomingHttpHeaders } from 'node:http';
import { AuthModule, cookie } from '../auth/http';
import { OrganizationService, type Principal } from './service';
import {
  ACCESS_POLICY,
  GLOBAL_READABLE,
  type AccessPolicy,
  Authenticated,
  RequirePermission,
  GlobalReadable,
} from './policy';

interface OrganizationRequest {
  headers: IncomingHttpHeaders;
  method: string;
  params: Record<string, string>;
  principal: Principal;
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(OrganizationService) private readonly service: OrganizationService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const policy = this.reflector.getAllAndOverride<AccessPolicy>(ACCESS_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!policy) throw new ForbiddenException('Route access policy is required');
    if (policy.kind === 'public') return true;
    const req = context.switchToHttp().getRequest<OrganizationRequest>();
    const token = cookie(req.headers, 'carrot_session');
    if (!token) throw new UnauthorizedException();
    const principal = await this.service.principal(token);
    req.principal = principal;
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin !== this.service.auth.runtime.config.AUTH_PUBLIC_ORIGIN
    )
      throw new ForbiddenException('Same-origin request required');
    if (policy.kind === 'session') return true;
    let points = principal.organizationPermissions;
    if (policy.scope !== 'organization') {
      const teamId = req.params.teamId || principal.currentTeamId || '';
      await this.service.assertTeam(principal, teamId);
      if (policy.scope === 'project')
        await this.service.project(principal, teamId, req.params.projectId || '');
      points = principal.points(
        teamId,
        policy.scope === 'project' ? req.params.projectId : undefined,
      );
    }
    if (
      policy.point === Permission.GlobalView &&
      (req.method !== 'GET' || !this.reflector.get<boolean>(GLOBAL_READABLE, context.getHandler()))
    )
      throw new ForbiddenException();
    if (!points.includes(policy.point)) throw new ForbiddenException();
    return true;
  }
}
@Controller('organization')
export class OrganizationController {
  constructor(@Inject(OrganizationService) readonly service: OrganizationService) {}
  @Post('teams')
  @RequirePermission(Permission.TeamCreate, 'organization')
  createTeam(@Req() req: OrganizationRequest, @Body() body: unknown) {
    return this.service.createTeam(req.principal, body);
  }
  @Get('context')
  @Authenticated()
  context(@Req() req: OrganizationRequest) {
    return this.service.context(req.principal);
  }
  @Post('current-team')
  @Authenticated()
  switch(@Req() req: OrganizationRequest, @Body() body: { teamId?: unknown }) {
    return this.service.switchTeam(
      req.principal,
      cookie(req.headers, 'carrot_session')!,
      body?.teamId,
    );
  }
  @Get('people')
  @GlobalReadable()
  @RequirePermission(Permission.GlobalView, 'organization')
  people(@Req() req: OrganizationRequest) {
    return this.service.globalPeople(req.principal);
  }
  @Get('administration')
  @RequirePermission(Permission.AccountManage, 'organization')
  administration(@Req() req: OrganizationRequest) {
    return this.service.administration(req.principal);
  }
  @Post('users/:userId/memberships')
  @RequirePermission(Permission.AccountManage, 'organization')
  memberships(@Req() req: OrganizationRequest, @Param('userId') id: string, @Body() body: unknown) {
    return this.service.manage(req.principal, id, body);
  }
  @Post('users/:userId/status')
  @RequirePermission(Permission.AccountManage, 'organization')
  status(
    @Req() req: OrganizationRequest,
    @Param('userId') id: string,
    @Body() body: { status?: string },
  ) {
    if (!body || !['active', 'disabled'].includes(body.status || ''))
      throw new BadRequestException();
    return this.service.manage(req.principal, id, undefined, body.status as 'active' | 'disabled');
  }
}
@Controller('teams/:teamId')
export class TeamController {
  constructor(@Inject(OrganizationService) readonly service: OrganizationService) {}
  @Post('projects')
  @RequirePermission(Permission.ProjectCreate)
  createProject(
    @Req() req: OrganizationRequest,
    @Param('teamId') team: string,
    @Body() body: unknown,
  ) {
    return this.service.createProject(req.principal, team, body);
  }
  @Get('projects/:projectId')
  @RequirePermission(Permission.CanvasView, 'project')
  project(
    @Req() req: OrganizationRequest,
    @Param('teamId') team: string,
    @Param('projectId') project: string,
  ) {
    return this.service.project(req.principal, team, project);
  }
  @Get('projects/:projectId/members')
  @RequirePermission(Permission.MemberManage, 'project')
  projectMembers(
    @Req() req: OrganizationRequest,
    @Param('teamId') team: string,
    @Param('projectId') project: string,
  ) {
    return this.service.members(req.principal, team, project);
  }
  @Get('members')
  @RequirePermission(Permission.CanvasView)
  members(@Req() req: OrganizationRequest, @Param('teamId') team: string) {
    return this.service.members(req.principal, team);
  }
  @Get('members/:userId')
  @RequirePermission(Permission.CanvasView)
  person(
    @Req() req: OrganizationRequest,
    @Param('teamId') team: string,
    @Param('userId') user: string,
  ) {
    return this.service.person(req.principal, team, user);
  }
}
@Module({
  imports: [AuthModule],
  controllers: [OrganizationController, TeamController],
  providers: [OrganizationService, { provide: APP_GUARD, useClass: AccessGuard }],
  exports: [OrganizationService],
})
export class OrganizationModule {}
