import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import { AuthRuntime } from './runtime';
import { mockPeople, readAuthConfig, SESSION_SECONDS } from './config';
import { Public, Authenticated } from '../organization/policy';

interface AuthRequest {
  headers: IncomingHttpHeaders;
}
interface AuthResponse {
  setHeader(name: string, value: string | string[]): void;
  redirect(url: string): void;
}
export function cookie(headers: IncomingHttpHeaders, name: string) {
  const entry = headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}
@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  readonly runtime = new AuthRuntime(readAuthConfig());
  onModuleInit() {
    return this.runtime.start();
  }
  onModuleDestroy() {
    return this.runtime.close();
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly service: AuthService) {}
  async canActivate(context: ExecutionContext) {
    await this.service.runtime.me(
      cookie(context.switchToHttp().getRequest<AuthRequest>().headers, 'carrot_session'),
    );
    return true;
  }
}
@Controller('auth')
@Public('Login bootstrap and OAuth callbacks; mutations verify origin/state')
export class AuthController {
  constructor(@Inject(AuthService) private readonly service: AuthService) {}
  private get runtime() {
    return this.service.runtime;
  }
  private writeCookie(name: string, value: string, seconds: number) {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${this.runtime.config.secure ? '; Secure' : ''}`;
  }
  private origin(request: AuthRequest) {
    if (request.headers.origin !== this.runtime.config.AUTH_PUBLIC_ORIGIN)
      throw new UnauthorizedException('Same-origin request required');
  }
  @Get('config')
  config() {
    return {
      mode: this.runtime.config.MOCK_EXTERNAL === '1' ? 'mock' : 'feishu',
      people: this.runtime.config.MOCK_EXTERNAL === '1' ? mockPeople : [],
    };
  }
  @Post('mock/login')
  async mock(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: AuthResponse,
    @Body() body: unknown,
  ) {
    this.origin(req);
    if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string')
      throw new UnauthorizedException();
    const token = await this.runtime.mockLogin(body.id, cookie(req.headers, 'carrot_session'));
    res.setHeader('Set-Cookie', this.writeCookie('carrot_session', token, SESSION_SECONDS));
    res.setHeader('Cache-Control', 'no-store');
    return { ok: true };
  }
  @Get('me')
  @Authenticated()
  @UseGuards(SessionGuard)
  me(@Req() req: AuthRequest, @Res({ passthrough: true }) res: AuthResponse) {
    res.setHeader('Cache-Control', 'no-store');
    return this.runtime.me(cookie(req.headers, 'carrot_session'));
  }
  @Post('logout')
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: AuthResponse) {
    this.origin(req);
    await this.runtime.logout(cookie(req.headers, 'carrot_session'));
    res.setHeader('Set-Cookie', this.writeCookie('carrot_session', '', 0));
    return { ok: true };
  }
  @Get('feishu/start')
  async start(@Res() res: AuthResponse) {
    const { state, url } = await this.runtime.begin();
    res.setHeader('Set-Cookie', this.writeCookie('carrot_oauth', state, 600));
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(url);
  }
  @Get('feishu/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: AuthRequest,
    @Res() res: AuthResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const token = await this.runtime.callback(
        typeof code === 'string' ? code : '',
        typeof state === 'string' ? state : '',
        cookie(req.headers, 'carrot_oauth'),
        cookie(req.headers, 'carrot_session'),
      );
      res.setHeader('Set-Cookie', [
        this.writeCookie('carrot_session', token, SESSION_SECONDS),
        this.writeCookie('carrot_oauth', '', 0),
      ]);
      res.redirect('/auth/callback');
    } catch {
      res.setHeader('Set-Cookie', this.writeCookie('carrot_oauth', '', 0));
      res.redirect('/login?error=login_failed');
    }
  }
}
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
