/**
 * Tek kullanımlık e-posta anahtarı servisi (doğrulama + parola sıfırlama).
 *
 * Güvenlik kuralları:
 *  - Ham token yalnızca e-postaya gider; DB'de SHA-256 hash tutulur
 *    (Session.refreshTokenHash ile aynı kural).
 *  - Yeni anahtar üretilince aynı türdeki tüketilmemiş eski anahtarlar
 *    consumedAt ile kapatılır (gelen kutusundaki eski bağlantılar ölü olur).
 *  - Tüketim tek transaction'da koşullu update: iki eşzamanlı istekten yalnız
 *    biri kazanır (race-safe), kaybeden TOKEN_INVALID alır.
 */
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors';
import type { EmailTokenKind } from '@prisma/client';

export interface IssuedEmailToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class EmailTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    kind: EmailTokenKind,
    ttlMinutes: number,
  ): Promise<IssuedEmailToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    await this.prisma.$transaction([
      // Eski tüketilmemiş anahtarları kapat (tek aktif anahtar kuralı).
      this.prisma.emailToken.updateMany({
        where: { userId, kind, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.emailToken.create({
        data: { userId, kind, tokenHash: hashToken(token), expiresAt },
      }),
    ]);
    return { token, expiresAt };
  }

  /**
   * Anahtarı doğrular ve tek kullanımlık olarak tüketir. Süre dolmuş /
   * tüketilmiş / bilinmeyen anahtar → 400 TOKEN_INVALID.
   */
  async consume(token: string, kind: EmailTokenKind): Promise<{ userId: string }> {
    const tokenHash = hashToken(token);
    const record = await this.prisma.emailToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.kind !== kind ||
      record.consumedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw DomainError.badRequest('TOKEN_INVALID', 'errors.tokenInvalid');
    }

    const consumed = await this.prisma.emailToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      // Eşzamanlı tüketim yarışını kaybetti.
      throw DomainError.badRequest('TOKEN_INVALID', 'errors.tokenInvalid');
    }
    return { userId: record.userId };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
