/**
 * Kullanıcı servisi: profil görünümleri, güncelleme, avatar yaşam döngüsü.
 * Gizlilik kuralı (Teknik Kural 4): e-posta maskeli döner; parola hash'i,
 * oturum/veri detayları asla profile yanıtına girmez.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors';
import type { PublicUserProfile, UpdateProfileRequest } from '@perdego/contracts';
import { AvatarStorageService } from './avatar-storage.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: AvatarStorageService,
  ) {}

  async profile(userId: string): Promise<PublicUserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw DomainError.notFound('RECORD_NOT_FOUND', 'errors.notFound');
    }
    return this.toProfile(user);
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
    return this.toProfile(user);
  }

  /**
   * Avatar yükleme: eski dosya diskten de kaldırılır (çöp birikmez), yeni
   * dosya rastgele adla kaydedilir.
   */
  async setAvatar(userId: string, buffer: Buffer, declaredMime?: string): Promise<PublicUserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw DomainError.notFound('RECORD_NOT_FOUND', 'errors.notFound');
    }
    const saved = this.avatars.save(buffer, declaredMime);
    if (user.avatarUrl) {
      this.avatars.remove(user.avatarUrl);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: saved.publicPath },
    });
    return this.toProfile(updated);
  }

  async removeAvatar(userId: string): Promise<PublicUserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw DomainError.notFound('RECORD_NOT_FOUND', 'errors.notFound');
    }
    if (user.avatarUrl) {
      this.avatars.remove(user.avatarUrl);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });
    return this.toProfile(updated);
  }

  private toProfile(user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    locale: 'tr' | 'en';
    createdAt: Date;
  }): PublicUserProfile {
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
