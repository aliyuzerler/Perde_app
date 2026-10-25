/**
 * Hesap silme servisi (Faz 3b — Teknik Kural 6).
 *
 * Süreç iki aşamalıdır:
 *  1) delete-request: parola teyidi → status=DELETED + deletedAt mührü,
 *     TÜM oturumlar kapatılır, nefallet tarihi (DELETION_GRACE_DAYS, 30 gün)
 *     hesaplanır, onay e-postası gider. Kullanıcı bu tarihe kadar restore
 *     edilebilir.
 *  2) purgeExpiredDeletions: nefallet süresi dolan taleplerde KİŞİSEL VERİ
 *     anonimleştirilir/silinir; FİNANSAL KAYITLAR KORUNUR.
 *
 * Silme/koruma matrisi (gerekçe: KVKK saklama yükümlülükleri + malvarlığı
 * kayıtları; ayrıntı: docs/ACCOUNT_DELETION.md):
 *   SİLİNİR/ANONİMLEŞİR: e-posta (hash'e çevrilir), parola hash'i, görünen
 *     ad, avatar (dosya+URL), doğum yılı, oturumlar, cihazlar, e-posta
 *     anahtarları, izleme geçmişi, favoriler, oynatma oturumları,
 *     bildirimler + tercihi.
 *   KORUNUR: store_transactions, credit_ledger, subscriptions, episode
 *     unlock hakları — yasal saklama (VUK uyarınca 10 yıl) ve ihtilaf
 *     savunması; kullanıcı kimliği anonim dövmezle (user_id FK) bağlantılı
 *     kalır, PII içermez.
 *
 * Not: purgeExpiredDeletions bu fazda servis yöntemi olarak yaşar; üretim
 * takvimi (cron/kuyruk) dağıtım fazında eklenir ( rapor + ROADMAP notu ).
 */
import { Inject, Injectable } from '@nestjs/common';
import { unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';
import { verify } from '@node-rs/argon2';
import type { AuthSessionResponse } from '@perdego/contracts';
import { MailerService } from '../mail/mailer.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Parola teyitli silme talebi: hesabı derhal kilitler, oturumları kapatır. */
  async requestDeletion(userId: string, password: string): Promise<{ purgeAt: string; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || user.status === 'DELETED') {
      throw DomainError.notFound('RECORD_NOT_FOUND', 'errors.notFound');
    }
    const ok = user.passwordHash
      ? await verify(user.passwordHash, password).catch(() => false)
      : false;
    if (!ok) {
      throw DomainError.badRequest('WRONG_PASSWORD', 'errors.wrongPassword');
    }

    const purgeAt = new Date(Date.now() + this.env.DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.accountDeletionRequest.upsert({
        where: { userId },
        create: { userId, purgeAt },
        update: { status: 'PENDING', purgeAt, purgedAt: null, requestedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { status: 'DELETED', deletedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.mailer
      .send(this.mailer.deletionScheduledEmail(user.email, user.displayName, purgeAt.toISOString()))
      .catch(() => undefined);

    return { purgeAt: purgeAt.toISOString(), email: user.email };
  }

  /**
   * Nefallet süresi içinde geri alma: parola doğrulanır, hesap yeniden
   * ACTIVE olur, tam bir oturum açılır (giriş akışının tamamı).
   */
  async restore(
    dto: { email: string; password: string },
    context: { ipHash?: string; userAgent?: string },
  ): Promise<AuthSessionResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    const restorable =
      user &&
      user.status === 'DELETED' &&
      user.deletedAt !== null &&
      user.passwordHash;
    if (!user || !restorable) {
      await verify(FAKE_HASH, dto.password).catch(() => undefined);
      throw DomainError.unauthorized('BAD_CREDENTIALS', 'errors.badCredentials');
    }

    const ok = await verify(user.passwordHash!, dto.password).catch(() => false);
    if (!ok) {
      throw DomainError.unauthorized('BAD_CREDENTIALS', 'errors.badCredentials');
    }

    const request = await this.prisma.accountDeletionRequest.findUnique({
      where: { userId: user.id },
    });
    if (!request || request.status !== 'PENDING' || request.purgeAt.getTime() <= Date.now()) {
      // Süre doldu / talep yok: hesap fiilen silinmiş sayılır.
      throw DomainError.unauthorized('BAD_CREDENTIALS', 'errors.badCredentials');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.accountDeletionRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELED' },
      }),
    ]);

    await this.mailer
      .send(this.mailer.deletionCanceledEmail(user.email, user.displayName))
      .catch(() => undefined);

    // emailVerifiedAt korunur: doğrulanmış hesap restore'da yeniden doğrulamaz.
    return this.auth.issueSessionForUser(user.id, context);
  }

  /**
   * Nefallet süresi dolan talepleri işler: PII silinir/anonimleşir.
   * Döner: işlenen talep sayısı (cron/job çıktısı için).
   */
  async purgeExpiredDeletions(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.accountDeletionRequest.findMany({
      where: { status: 'PENDING', purgeAt: { lte: now } },
      include: { user: true },
    });

    for (const request of due) {
      await this.purgeUser(request.userId, request.user, now);
      await this.prisma.accountDeletionRequest.update({
        where: { id: request.id },
        data: { status: 'COMPLETED', purgedAt: now },
      });
    }
    return due.length;
  }

  /** Tek kullanıcının PII temizliği (finansal kayıtlar bilinçli KORUNUR). */
  private async purgeUser(userId: string, user: User, now: Date): Promise<void> {
    // Avatar dosyası diskten de kaldırılır.
    if (user.avatarUrl) {
      this.deleteAvatarFileQuietly(user.avatarUrl);
    }

    const anonymizedEmail = `deleted-${createHash('sha256')
      .update(userId)
      .digest('hex')
      .slice(0, 24)}@anonymized.invalid`;

    await this.prisma.$transaction([
      // Kişisel veri: silinir.
      this.prisma.session.deleteMany({ where: { userId } }),
      this.prisma.emailToken.deleteMany({ where: { userId } }),
      this.prisma.device.deleteMany({ where: { userId } }),
      this.prisma.watchHistory.deleteMany({ where: { userId } }),
      this.prisma.favorite.deleteMany({ where: { userId } }),
      this.prisma.playbackSession.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.notificationPreference.deleteMany({ where: { userId } }),
      // Kimlik anonimleşir; FK bütünlüğü korunur (finansal kayıtlar bağlı kalır).
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          passwordHash: null,
          displayName: 'Silinmiş kullanıcı',
          avatarUrl: null,
          birthYear: null,
          deletedAt: now,
        },
      }),
    ]);
  }

  private deleteAvatarFileQuietly(avatarUrl: string): void {
    try {
      // URL şeması: {PUBLIC_BASE_URL}/uploads/avatars/<name> — yalnızca kendi
      // upload dizinimizdeki dosya silinir (path traversal engeli: basename).
      const marker = '/uploads/avatars/';
      const idx = avatarUrl.indexOf(marker);
      if (idx === -1) return;
      const name = avatarUrl.slice(idx + marker.length).split(/[?#]/)[0]!;
      if (!/^[A-Za-z0-9._-]+$/.test(name)) return;
      unlinkSync(resolve(process.cwd(), this.env.UPLOAD_DIR, 'avatars', name));
    } catch {
      // Dosya yoksa/taşınamazsa temizlik sessizce geçer (loglanmasına gerek yok).
    }
  }
}

const FAKE_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$tXzMfcjRxEZLaMLNwevvEB1fGYsTHsTcDCH9Q3fLcVw';
