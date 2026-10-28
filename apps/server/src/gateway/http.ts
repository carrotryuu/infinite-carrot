import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Inject,
  Injectable,
  MiddlewareConsumer,
  Module,
  NestMiddleware,
  NestModule,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Post,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, submitTaskSchema } from '@carrot/shared';
import { readGatewayConfig, type GatewayConfig } from './config';
import { GatewayRuntime } from './runtime';
import { taskView } from './repository';
import type { ScopeContext } from './team-scope';

interface PocRequest {
  headers: IncomingHttpHeaders;
  scope?: ScopeContext;
}
export const RequirePermission = (permission: Permission) => SetMetadata('permission', permission);
export function authorizePoc(config: GatewayConfig, headers: IncomingHttpHeaders, token?: string) {
  if (config.POC_GATEWAY_ENABLED !== '1') throw new NotFoundException('PoC gateway disabled');
  if (headers.origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(headers.origin).host === headers.host;
    } catch {
      /* invalid origin */
    }
    if (!sameOrigin) throw new UnauthorizedException('Same-origin access required');
  }
  if (config.MOCK_EXTERNAL === '0') {
    const provided = token || headers['x-poc-access-token'];
    if (
      typeof provided !== 'string' ||
      Buffer.byteLength(provided) !== Buffer.byteLength(config.POC_ACCESS_TOKEN) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(config.POC_ACCESS_TOKEN))
    )
      throw new UnauthorizedException('PoC access token required');
  }
  return {
    teamId: config.POC_TEAM_ID,
    tenantId: config.POC_TENANT_ID ?? null,
    actor: 'poc-operator',
    permissions: [Permission.CanvasView, Permission.CanvasUse],
  };
}
@Injectable()
export class GatewayService implements OnModuleInit, OnModuleDestroy {
  readonly config = readGatewayConfig();
  runtime?: GatewayRuntime;
  async onModuleInit() {
    if (this.config.POC_GATEWAY_ENABLED === '1') {
      this.runtime = new GatewayRuntime(this.config);
      await this.runtime.start();
    }
  }
  async onModuleDestroy() {
    await this.runtime?.close();
  }
  get active() {
    if (!this.runtime) throw new NotFoundException('PoC gateway disabled');
    return this.runtime;
  }
}
@Injectable()
export class TeamScopeMiddleware implements NestMiddleware {
  constructor(@Inject(GatewayService) private readonly service: GatewayService) {}
  use(request: PocRequest, _response: unknown, next: () => void) {
    request.scope = authorizePoc(this.service.config, request.headers);
    next();
  }
}
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<PocRequest>();
    const permission = this.reflector.getAllAndOverride<Permission>('permission', [
      context.getHandler(),
      context.getClass(),
    ]);
    return !!permission && !!request.scope?.permissions.includes(permission);
  }
}
@Controller('poc/gateway')
@UseGuards(PermissionGuard)
export class GatewayController {
  constructor(@Inject(GatewayService) private readonly service: GatewayService) {}
  @Get('config')
  @RequirePermission(Permission.CanvasView)
  configuration() {
    return {
      mode: this.service.config.MOCK_EXTERNAL === '1' ? 'mock' : 'real',
      provider: this.service.config.provider,
      concurrency: this.service.config.MODEL_CONCURRENCY,
      permissions: [Permission.CanvasView, Permission.CanvasUse],
    };
  }
  @Get('tasks')
  @RequirePermission(Permission.CanvasView)
  async list() {
    return (await this.service.active.repository.list()).map(taskView);
  }
  @Post('tasks')
  @RequirePermission(Permission.CanvasUse)
  async submit(@Body() body: unknown) {
    const input = submitTaskSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid prompt or idempotency key');
    return taskView(await this.service.active.submit(input.data));
  }
  @Post('tasks/:id/cancel')
  @RequirePermission(Permission.CanvasUse)
  async cancel(@Param('id') id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new BadRequestException('Invalid task ID');
    return taskView(await this.service.active.cancel(id));
  }
}
@Module({
  controllers: [GatewayController],
  providers: [GatewayService, PermissionGuard],
  exports: [GatewayService],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TeamScopeMiddleware).forRoutes(GatewayController);
  }
}
