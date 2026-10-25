/**
 * JWT doğrulama guard'ı: global olarak bağlanır; @Public() işaretli uçlar
 * anonimdir. Token geçerliyse kullanıcıyı DB'den yükler (askıya alınmış /
 * silinmiş hesaplar tokenla dolaşamaz) ve request.user'a bağlar.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors';
import { toRequestUser, type RequestUser } from '../common/request-context';
import { JwtService } from './jwt.service';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles =
  (...roles: Array<'EDITOR' | 'ADMIN'>): MethodDecorator & ClassDecorator =>
    SetMetadata(ROLES_KEY, roles);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (isPublic) {
      // Anonim uçlarda token VARS kişiselleştirme için çözümlenir; geçersiz
      // token sessizce yok sayılır (katalog anonim açıktır — BR-08).
      request.user = token ? await this.resolveUser(token) : null;
      return true;
    }

    if (!token) {
      throw DomainError.unauthorized('TOKEN_MISSING', 'errors.unauthorized');
    }
    const user = await this.resolveUser(token);
    request.user = user;
    return true;
  }

  private async resolveUser(token: string): Promise<RequestUser> {
    const payload = this.jwt.verifyAccessToken(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status === 'DELETED' || user.deletedAt) {
      throw DomainError.unauthorized('TOKEN_INVALID', 'errors.tokenInvalid');
    }
    if (user.status === 'SUSPENDED') {
      throw DomainError.forbidden('ACCOUNT_SUSPENDED', 'errors.accountSuspended');
    }
    return toRequestUser(user, payload.sid);
  }
}

/** Rol guard'ı: @Roles(ADMIN) vb. — EDITOR/ADMIN hiyerarşisi. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      Array<'EDITOR' | 'ADMIN'>
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as RequestUser | null | undefined;
    if (!user) {
      throw DomainError.unauthorized('TOKEN_MISSING', 'errors.unauthorized');
    }
    const rank: Record<string, number> = { USER: 0, EDITOR: 1, ADMIN: 2 };
    const userRank = rank[user.role] ?? 0;
    const minRank = required.length > 0 ? Math.min(...required.map((r) => rank[r] ?? 0)) : 0;
    if (userRank < minRank) {
      throw DomainError.forbidden('ADMIN_ONLY', 'errors.adminOnly');
    }
    return true;
  }
}
