/**
 * Kimlik doğrulama servisi: kayıt, giriş, refresh rotasyonu ve çıkış.
 *
 * Güvenlik kararları (SECURITY.md):
 *  - Şifreler argon2id ile hash'lenir (@node-rs/argon2 varsayılan
 *    parametreleri OWASP önerisiyle uyumlu: m=19456, t=2, p=1).
 *  - Refresh token 256 bit rastgele; DB'de yalnızca SHA-256 hash'i tutulur.
 *  - Refresh rotasyonu: eski token tek kullanımlık; yeniden kullanım
 *    denemesi (reuse detection) oturum AİLESİNİN tamamını iptal eder ve
 *    401 REFRESH_REUSED döner.
 *  - Kullanıcı adı sayımına karşı giriş, bilinmeyen e-postada da sabit bir
 *    argon2 doğrulaması yapar (zaman farkı minimize).
 */
import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';
import { toRequestUser, type RequestUser } from '../common/request-context';
import type { AuthSessionResponse, AuthRegisterRequest, AuthLoginRequest } from '@perdego/contracts';
import { JwtService } from './jwt.service';

/** Bilinmeyen kullanıcı için sabit sahte hash (timing dengeleme). */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$tXzMfcjRxEZLaMLNwevvEB1fGYsTHsTcDCH9Q3fLcVw';

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(dto: AuthRegisterRequest, context: { ipHash?: string; userAgent?: string }): Promise<AuthSessionResponse> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw DomainError.conflict('EMAIL_ALREADY_EXISTS', 'errors.emailExists');
    }

    const passwordHash = await hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: dto.displayName,
        locale: dto.locale,
        role: 'USER',
        // Cüzdan satırını baştan aç: bakiye 0 ama ledger temelidir.
        creditWallet: { create: { purchasedBalance: 0, grantedBalance: 0 } },
        notificationPreference: { create: {} },
      },
    });

    return this.createSessionResponse(user, context);
  }

  async login(dto: AuthLoginRequest, context: { ipHash?: string; userAgent?: string }): Promise<AuthSessionResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      await verify(DUMMY_HASH, dto.password).catch(() => undefined);
      throw DomainError.unauthorized('BAD_CREDENTIALS', 'errors.badCredentials');
    }
    if (user.status === 'SUSPENDED') {
      throw DomainError.forbidden('ACCOUNT_SUSPENDED', 'errors.accountSuspended');
    }
    if (user.status === 'DELETED' || user.deletedAt) {
      throw DomainError.unauthorized('BAD_CREDENTIALS', 'errors.badCredentials');
    }

    const ok = user.passwordHash
      ? await verify(user.passwordHash, dto.password).catch(() => false)
      : false;
    if (!ok) {
      throw DomainError.unauthorized('BAD_CREDENTIALS', 'errors.badCredentials');
    }

    return this.createSessionResponse(user, context);
  }

  /**
   * Refresh rotasyonu. reuse detection: zaten iptal edilmiş bir token yeniden
   * gelirse ailenin tüm oturumları iptal edilir (SECURITY.md akışı).
   */
  async refresh(refreshToken: string, context: { ipHash?: string; userAgent?: string }): Promise<AuthSessionResponse> {
    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw DomainError.unauthorized('TOKEN_INVALID', 'errors.tokenInvalid');
    }

    if (session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw DomainError.unauthorized('REFRESH_REUSED', 'errors.refreshReused');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw DomainError.unauthorized('TOKEN_EXPIRED', 'errors.refreshExpired');
    }

    const user = session.user;
    if (user.status === 'SUSPENDED') {
      throw DomainError.forbidden('ACCOUNT_SUSPENDED', 'errors.accountSuspended');
    }
    if (user.status === 'DELETED' || user.deletedAt) {
      throw DomainError.unauthorized('BAD_CREDENTIALS', 'errors.badCredentials');
    }

    // Rotasyon: eski oturumu kapat (replacedById zinciri), yeni oturum aç.
    return this.prisma.$transaction(async (tx) => {
      const next = await this.openSession(tx, user, session.familyId, context);
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), replacedById: next.sessionId },
      });
      return this.buildSessionResponse(user, next);
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Public uçlarda opsiyonel kimlik çözümü (kişiselleştirme için). */
  async resolveOptionalUser(token: string | undefined): Promise<RequestUser | null> {
    if (!token) return null;
    try {
      const payload = this.jwt.verifyAccessToken(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== 'ACTIVE' || user.deletedAt) return null;
      return toRequestUser(user, payload.sid);
    } catch {
      return null;
    }
  }

  // --- iç yardımcılar --------------------------------------------------------

  private async createSessionResponse(
    user: User,
    context: { ipHash?: string; userAgent?: string },
  ): Promise<AuthSessionResponse> {
    const familyId = randomBytes(16).toString('hex');
    return this.prisma.$transaction(async (tx) => {
      const next = await this.openSession(tx, user, familyId, context);
      return this.buildSessionResponse(user, next);
    });
  }

  private async openSession(
    tx: Pick<PrismaService, 'session' | 'user'>,
    user: User,
    familyId: string,
    context: { ipHash?: string; userAgent?: string },
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const session = await tx.session.create({
      data: {
        userId: user.id,
        familyId,
        refreshTokenHash: hashToken(refreshToken),
        ipHash: context.ipHash,
        userAgent: context.userAgent?.slice(0, 200),
        expiresAt,
      },
    });
    return { sessionId: session.id, refreshToken };
  }

  private buildSessionResponse(
    user: User,
    next: { sessionId: string; refreshToken: string },
  ): AuthSessionResponse {
    const { token, expiresIn } = this.jwt.signAccessToken({
      sub: user.id,
      role: user.role,
      sid: next.sessionId,
      locale: user.locale,
    });
    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        locale: user.locale,
        role: user.role,
        joinedAt: user.createdAt.toISOString(),
      },
      tokens: {
        accessToken: token,
        refreshToken: next.refreshToken,
        expiresIn,
      },
    };
  }
}
