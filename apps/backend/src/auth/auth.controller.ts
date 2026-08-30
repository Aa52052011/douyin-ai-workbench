import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { AuthService } from './auth.service.js';
import type { AuthSession } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { clearRefreshCookie, readRefreshToken, setRefreshCookie } from './refresh-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register(dto);
    return this.finishSession(session, req, res);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(dto, { ip: clientIp(req) });
    return this.finishSession(session, req, res);
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = readRefreshToken(req, dto.refreshToken);
    const session = await this.auth.refresh(raw);
    return this.finishSession(session, req, res);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readRefreshToken(req, dto.refreshToken));
    clearRefreshCookie(res);
    return { ok: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() currentUser: { userId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(currentUser.userId);
    clearRefreshCookie(res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() currentUser: { userId: string; tenantId: string; workspaceId: string; role: string }) {
    return this.auth.me(currentUser);
  }

  private async finishSession(
    session: AuthSession & { refreshRaw?: string },
    req: Request,
    res: Response,
  ) {
    if (!session.refreshRaw) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
    }
    setRefreshCookie(res, session.refreshRaw);
    void req;
    return sanitizeSession(session);
  }
}

function sanitizeSession(session: AuthSession & { refreshRaw?: string }) {
  const { refreshRaw: _refreshRaw, ...safe } = session;
  return safe;
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip ?? '0.0.0.0';
}
