/**
 * Kimlik doğrulama uçları (API_CONTRACT §2):
 *   POST /api/v1/auth/register             → anonim (rate limit)
 *   POST /api/v1/auth/login                → anonim (rate limit)
 *   POST /api/v1/auth/refresh              → refresh token ile
 *   POST /api/v1/auth/logout               → access token ile
 *   POST /api/v1/auth/verify-email         → anahtar ile (anonim)
 *   POST /api/v1/auth/resend-verification  → anonim (rate limit)
 *   POST /api/v1/auth/forgot-password      → anonim (rate limit)
 *   POST /api/v1/auth/reset-password       → anahtar ile (anonim, rate limit)
 *   POST /api/v1/auth/change-password      → access token ile
 *   POST /api/v1/auth/step-up              → access token ile (kritik işlem öncesi
 *                                            parola yeniden doğrulama — FAZ 8)
 *   GET  /api/v1/auth/sessions             → aktif oturum listesi
 *   DELETE /api/v1/auth/sessions/:id       → tek oturum iptali
 *   POST /api/v1/auth/logout-all           → tüm oturumları iptal
 */
import { Body, Controller, Delete, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import {
  authLoginRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  refreshRequestSchema,
  resendVerificationRequestSchema,
  resetPasswordRequestSchema,
  authRegisterRequestSchema,
  verifyEmailRequestSchema,
  type AuthSessionListResponse,
  type AuthSessionResponse,
  type AuthLoginRequest,
  type AuthRegisterRequest,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type RefreshRequest,
  type ResetPasswordRequest,
  type VerifyEmailRequest,
  type StepUpRequest,
  type StepUpResponse,
  stepUpRequestSchema,
} from '@perdego/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../common/request-context';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { Public } from './guards';
import { RateLimiterService } from './rate-limit.service';
import { AuthService } from './auth.service';
import { StepUpService } from './step-up.service';

const hashIp = (ip: string | undefined): string | undefined =>
  ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : undefined;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly rateLimiter: RateLimiterService,
    private readonly stepUp: StepUpService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private context(req: Request): { ipHash?: string; userAgent?: string } {
    return { ipHash: hashIp(req.ip), userAgent: req.headers['user-agent'] };
  }

  /** Kayan pencere limiti. IP yoksa (beklenmedik ortam) sınır uygulanmaz. */
  private limit(
    req: Request,
    bucket: 'login' | 'register' | 'reset',
    max: number,
  ): void {
    const ip = req.ip ?? req.socket?.remoteAddress;
    if (!ip) return;
    this.rateLimiter.enforce(
      bucket,
      ip,
      max,
      this.env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
    );
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Kayıt: argon2id + doğrulama e-postası + oturum' })
  async register(
    @Req() req: Request,
    @Body(new ZodValidationPipe(authRegisterRequestSchema)) dto: AuthRegisterRequest,
  ): Promise<AuthSessionResponse> {
    this.limit(req, 'register', this.env.AUTH_RATE_LIMIT_REGISTER_MAX);
    return this.auth.register(dto, this.context(req));
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Giriş: doğrulanmamış e-postada 403 EMAIL_NOT_VERIFIED' })
  async login(
    @Req() req: Request,
    @Body(new ZodValidationPipe(authLoginRequestSchema)) dto: AuthLoginRequest,
  ): Promise<AuthSessionResponse> {
    this.limit(req, 'login', this.env.AUTH_RATE_LIMIT_LOGIN_MAX);
    return this.auth.login(dto, this.context(req));
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh rotasyonu (reuse detection ile aile iptali)' })
  async refresh(
    @Req() req: Request,
    @Body(new ZodValidationPipe(refreshRequestSchema)) dto: RefreshRequest,
  ): Promise<AuthSessionResponse> {
    return this.auth.refresh(dto.refreshToken, this.context(req));
  }

  @Post('logout')
  @ApiOperation({ summary: 'Mevcut oturumu kapat' })
  async logout(@CurrentUser() user: RequestUser): Promise<{ loggedOut: true }> {
    await this.auth.logout(user.sessionId);
    return { loggedOut: true };
  }

  @Public()
  @Post('verify-email')
  @ApiOperation({ summary: 'E-posta doğrulama anahtarını tüketir' })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailRequestSchema)) dto: VerifyEmailRequest,
  ): Promise<{ verified: true }> {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @ApiOperation({ summary: 'Doğrulama e-postasını yeniden gönder (yanıt daima olumlu)' })
  async resendVerification(
    @Req() req: Request,
    @Body(new ZodValidationPipe(resendVerificationRequestSchema)) dto: { email: string },
  ): Promise<{ sent: true }> {
    this.limit(req, 'reset', this.env.AUTH_RATE_LIMIT_RESET_MAX);
    return this.auth.resendVerification(dto.email);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Parola sıfırlama e-postası (yanıt daima olumlu)' })
  async forgotPassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) dto: ForgotPasswordRequest,
  ): Promise<{ sent: true }> {
    this.limit(req, 'reset', this.env.AUTH_RATE_LIMIT_RESET_MAX);
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Parolayı sıfırlar + tüm oturumları iptal eder' })
  async resetPassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) dto: ResetPasswordRequest,
  ): Promise<{ reset: true }> {
    this.limit(req, 'reset', this.env.AUTH_RATE_LIMIT_RESET_MAX);
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Parola değiştirir + diğer oturumları kapatır' })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) dto: ChangePasswordRequest,
  ): Promise<{ changed: true }> {
    return this.auth.changePassword(user, dto);
  }

  @Post('step-up')
  @ApiOperation({
    summary:
      'Kritik işlem öncesi parola yeniden doğrulama (5 dk geçerli step-up token — FAZ 8)',
  })
  async stepUpToken(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(stepUpRequestSchema)) dto: StepUpRequest,
  ): Promise<StepUpResponse> {
    // Parola hatalıysa auth servisi 401 BAD_CREDENTIALS fırlatır.
    await this.auth.verifyPassword(user.id, dto.password);
    return this.stepUp.issueToken(user.id);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Aktif oturum listesi' })
  async sessions(@CurrentUser() user: RequestUser): Promise<AuthSessionListResponse> {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Tek bir oturumu iptal eder' })
  async revokeSession(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
  ): Promise<{ revoked: boolean }> {
    return this.auth.revokeSession(user.id, sessionId);
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Tüm oturumları iptal eder (tüm cihazlardan çıkış)' })
  async logoutAll(@CurrentUser() user: RequestUser): Promise<{ revoked: number }> {
    return this.auth.logoutAll(user.id);
  }
}
