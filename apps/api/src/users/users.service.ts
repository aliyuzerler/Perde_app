/**
 * Kullanıcı servisi: profil görünümleri ve güncelleme.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors';
import type { PublicUserProfile, UpdateProfileRequest } from '@perdego/contracts';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(userId: string): Promise<PublicUserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw DomainError.notFound('RECORD_NOT_FOUND', 'errors.notFound');
    }
    return {
      id: user.id,
      displayName: user.displayName,
      maskedEmail: maskEmail(user.email),
      avatarUrl: user.avatarUrl,
      preferredLocale: user.locale,
      joinedAt: user.createdAt.toISOString(),
    };
  }

  async update(userId: string, dto: UpdateProfileRequest): Promise<PublicUserProfile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
    });
    return {
      id: user.id,
      displayName: user.displayName,
      maskedEmail: maskEmail(user.email),
      avatarUrl: user.avatarUrl,
      preferredLocale: user.locale,
      joinedAt: user.createdAt.toISOString(),
    };
  }
}

/** E-posta maskeleme: "a***@ornek.com" (gizlilik — contracts notu). */
export function maskEmail(email: string): string {
  const parts = email.split('@');
  const local = parts[0];
  const domain = parts[1];
  if (!local || !domain) return email;
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
