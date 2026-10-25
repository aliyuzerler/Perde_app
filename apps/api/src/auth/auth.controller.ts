/**
 * Kimlik doğrulama uçları (API_CONTRACT §2):
 *   POST /api/v1/auth/register  → anonim
 *   POST /api/v1/auth/login     → anonim
 *   POST /api/v1/auth/refresh   → refresh token ile
 *   POST /api/v1/auth/logout    → access token ile
 */
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import {
  authLoginRequestSchema,
  refreshRequestSchema,
  authRegisterRequestSchema,
  type AuthSessionResponse,
  type AuthLoginRequest,
  type RefreshRequest,
  type AuthRegisterRequest,
} from '@perdego/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../common/request-context';
import { Public } from './guards';
import { AuthService } from './auth.service';

const hashIp = (ip: string | undefined): string | undefined =>
  ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : undefined;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private context(req: Request): { ipHash?: string; userAgent?: string } {
    return { ipHash: hashIp(req.ip), userAgent: req.headers['user-agent'] };
  }

  @Public()
  @Post('register')
  async register(
    @Req() req: Request,
    @Body(new ZodValidationPipe(authRegisterRequestSchema)) dto: AuthRegisterRequest,
  ): Promise<AuthSessionResponse> {
    return this.auth.register(dto, this.context(req));
  }

  @Public()
  @Post('login')
  async login(
    @Req() req: Request,
    @Body(new ZodValidationPipe(authLoginRequestSchema)) dto: AuthLoginRequest,
  ): Promise<AuthSessionResponse> {
    return this.auth.login(dto, this.context(req));
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Body(new ZodValidationPipe(refreshRequestSchema)) dto: RefreshRequest,
  ): Promise<AuthSessionResponse> {
    return this.auth.refresh(dto.refreshToken, this.context(req));
  }

  @Post('logout')
  async logout(@CurrentUser() user: RequestUser): Promise<{ loggedOut: true }> {
    await this.auth.logout(user.sessionId);
    return { loggedOut: true };
  }
}
