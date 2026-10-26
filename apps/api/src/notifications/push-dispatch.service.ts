/**
 * Push gönderim ve olay bildirimi servisi (FAZ 9).
 *
 * Sorumluluklar (görev gereksinimleriyle eşleşir):
 *  1. Olay → bildirim kaydı: tercihe göre süzülmüş alıcılara in-app bildirim
 *     yazar (tercihle çelişen kullanıcıya SATIR DAHI AÇILMAZ) ve dedupKey ile
 *     aynı olayın aynı kullanıcıya iki kez düşmesini engeller.
 *  2. Push fan-out: her bildirim için kullanıcının TÜM geçerli cihazlarına
 *     NotificationSend (PENDING) satırı açar (çoklu cihaz desteği).
 *  3. Dispatch çevrimi: PENDING gönderimleri sağlayıcıya parçalı gönderir;
 *     her satır SENT/FAILED olarak izlenir (başarılı/başarısız/bekleyen).
 *  4. Geçersiz token: sağlayıcı DeviceNotRegistered döndüğünde token
 *     invalidAt ile işaretlenir; TTL aşanlar süpürmeyle silinir.
 *  5. Zamanlanmış görevler: tek örnek in-process çevrimler (DB destekli
 *     kuyruk + koşullu claim). Redis/BullMQ yatay ölçeklemede gerektiğinde
 *     aynı tablolar üzerinden takılabilir (docs/PUSH_SETUP.md §6).
 *
 * Güvenlik: push payload'ına YALNIZCA izin listesindeki derin bağlantı
 * alanları girer; parola/token/ödeme verisi payload'a asla taşınmaz.
 */
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NotificationSendStatus, Prisma } from '@prisma/client';
import { pickLang } from '../common/request-context';
import type { Lang } from '../common/request-context';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import {
  PushProviderUnreachableError,
  PushProviderPort,
  type PushMessage,
  type PushTicket,
} from './push.provider';
import { ExpoPushProvider, NoopPushProvider, SimulatedPushProvider } from './push.provider';

const DISPATCH_BATCH = 200;
const MAX_ATTEMPTS = 5;

export type NotificationPrefField = 'newEpisode' | 'newContent' | 'promo';

export interface NotifyEventInput {
  type: 'NEW_EPISODE' | 'NEW_CONTENT' | 'PROMO' | 'SYSTEM';
  titleTr: string;
  titleEn: string;
  bodyTr: string;
  bodyEn: string;
  /** Derin bağlantı verisi (izin listesi dışı alanlar burada zaten yok). */
  dataJson?: Record<string, string>;
  /** Olay anahtarı; kullanıcıya `:${userId}` eklenerek dedupKey olur. */
  dedupKeyBase: string;
  userIds: string[];
  /** null → SYSTEM (herkese; tercih salt okunur true). */
  prefField?: NotificationPrefField | null;
}

export interface NotifyEventResult {
  created: number;
  skipped: number;
  notificationIds: string[];
}

@Injectable()
export class PushDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushDispatchService.name);
  private provider: PushProviderPort;
  private dispatchTimer: ReturnType<typeof setInterval> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private dispatchRunning = false;
  private sweepRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.provider = createPushProvider(env);
  }

  /** Admin izleme/manüel tetikleme için sağlayıcı adı. */
  get providerName(): 'expo' | 'simulated' | 'none' {
    return this.provider.name;
  }

  onModuleInit(): void {
    // Testlerde deterministiklik: çevrimler yalnız gerçek koşumlarda açılır.
    if (this.env.NODE_ENV === 'test') return;
    this.dispatchTimer = setInterval(() => {
      void this.dispatchPending().catch((err) =>
        this.logger.warn(`dispatch çevrimi hata: ${String(err)}`),
      );
    }, this.env.PUSH_DISPATCH_INTERVAL_MS);
    this.sweepTimer = setInterval(() => {
      void this.runSweeps().catch((err) =>
        this.logger.warn(`süpürme çevrimi hata: ${String(err)}`),
      );
    }, this.env.PUSH_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ───────────────────────── Olay → bildirim ─────────────────────────────

  /**
   * Tercih süzülmüş alıcılara in-app bildirim yazar (dedup'lı) ve cihaz
   * gönderimlerini kuyruğa alır. Tercihle çelişen kullanıcıya satır bile
   * açılmaz; dedup çakışanlar `skipped`'ta sayılır.
   */
  async notifyUsersOfEvent(input: NotifyEventInput): Promise<NotifyEventResult> {
    if (input.userIds.length === 0) {
      return { created: 0, skipped: 0, notificationIds: [] };
    }

    let allowed = input.userIds;
    if (input.prefField) {
      const prefs = await this.prisma.notificationPreference.findMany({
        where: { userId: { in: input.userIds }, [input.prefField]: true },
        select: { userId: true },
      });
      const prefSet = new Set(prefs.map((p) => p.userId));
      allowed = allowed.filter((id) => prefSet.has(id));
    }

    if (allowed.length === 0) {
      return { created: 0, skipped: input.userIds.length, notificationIds: [] };
    }

    const rows = allowed.map((userId) => ({
      userId,
      type: input.type,
      titleTr: input.titleTr,
      titleEn: input.titleEn,
      bodyTr: input.bodyTr,
      bodyEn: input.bodyEn,
      dataJson: (input.dataJson ?? undefined) as never,
      dedupKey: `${input.dedupKeyBase}:${userId}`,
    }));

    const createdRows: Array<{ id: string }> = [];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const result = await this.prisma.notification.createManyAndReturn({
        data: chunk,
        select: { id: true },
        skipDuplicates: true,
      });
      createdRows.push(...result);
    }

    await this.enqueueSendsForNotifications(createdRows.map((r) => r.id));

    return {
      created: createdRows.length,
      skipped: allowed.length - createdRows.length,
      notificationIds: createdRows.map((r) => r.id),
    };
  }

  /** Verilen bildirimler için kullanıcının tüm geçerli cihazlarına kuyruk. */
  async enqueueSendsForNotifications(notificationIds: string[]): Promise<number> {
    if (notificationIds.length === 0) return 0;
    const notifications = await this.prisma.notification.findMany({
      where: { id: { in: notificationIds } },
      select: { id: true, userId: true },
    });
    if (notifications.length === 0) return 0;

    const devices = await this.prisma.device.findMany({
      where: {
        userId: { in: notifications.map((n) => n.userId) },
        invalidAt: null,
      },
      select: { id: true, userId: true },
    });
    if (devices.length === 0) return 0;

    const byUser = new Map<string, string[]>();
    for (const d of devices) {
      byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d.id]);
    }

    let created = 0;
    for (const n of notifications) {
      const deviceIds = byUser.get(n.userId) ?? [];
      if (deviceIds.length === 0) continue;
      const result = await this.prisma.notificationSend.createMany({
        data: deviceIds.map((deviceId) => ({
          notificationId: n.id,
          deviceId,
          provider: this.provider.name,
        })),
        skipDuplicates: true,
      });
      created += result.count;
    }
    return created;
  }

  // ───────────────────────── Dispatch çevrimi ────────────────────────────

  /**
   * PENDING gönderimleri sağlayıcıya iletir. Provider 'none' ise dokunmaz
   * (PENDING kalır — dürüst görünürlük); ağ hatasında attempts artar ve
   * satırlar PENDING kalır (sonraki çevrimde yeniden dener, MAX_ATTEMPTS'e
   * kadar).
   */
  async dispatchPending(
    limit = DISPATCH_BATCH,
  ): Promise<{ tried: number; sent: number; failed: number }> {
    if (this.dispatchRunning) return { tried: 0, sent: 0, failed: 0 };
    if (this.provider.name === 'none') return { tried: 0, sent: 0, failed: 0 };
    this.dispatchRunning = true;
    try {
      const pending = await this.prisma.notificationSend.findMany({
        where: { status: NotificationSendStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include: {
          notification: {
            select: {
              id: true,
              titleTr: true,
              titleEn: true,
              bodyTr: true,
              bodyEn: true,
              dataJson: true,
            },
          },
          device: {
            select: { id: true, pushToken: true, locale: true, invalidAt: true },
          },
        },
      });
      if (pending.length === 0) return { tried: 0, sent: 0, failed: 0 };

      // Bayat/geçersiz işaretli cihazlar: doğrudan FAILED (TOKEN_INVALID).
      const invalidSends = pending.filter((s) => s.device.invalidAt !== null);
      for (const s of invalidSends) {
        await this.prisma.notificationSend.update({
          where: { id: s.id },
          data: {
            status: 'FAILED',
            lastError: 'TOKEN_INVALID',
            attempts: { increment: 1 },
          },
        });
      }
      const live = pending.filter((s) => s.device.invalidAt === null);
      if (live.length === 0) {
        return { tried: invalidSends.length, sent: 0, failed: invalidSends.length };
      }

      const messages = live.map((s) => this.toPushMessage(s.notification, s.device, s.id));

      let tickets: PushTicket[];
      try {
        tickets = await this.provider.sendBatch(messages);
      } catch (err) {
        const retryable = err instanceof PushProviderUnreachableError;
        for (const s of live) {
          const attempts = (await this.attemptsOf(s.id)) + 1;
          const data: Prisma.NotificationSendUpdateInput = {
            attempts: { increment: 1 },
            lastError: retryable
              ? 'PROVIDER_UNREACHABLE'
              : String(err).slice(0, 200),
            // Yeniden denenebilir hatada PENDING kalır; kalıcıysa üst sınıra
            // ulaşınca FAILED'e düşer (sonsuz tekrar yok).
            ...(!retryable && attempts >= MAX_ATTEMPTS
              ? { status: 'FAILED' as const }
              : {}),
          };
          await this.prisma.notificationSend.update({ where: { id: s.id }, data });
        }
        return { tried: pending.length, sent: 0, failed: 0 };
      }

      let sent = 0;
      let failed = 0;
      for (const ticket of tickets) {
        // Bilet eşleştirmesi GÖNDERİM SATIRI kimliğiyle yapılır — aynı cihaza
        // giden farklı bildirimler aynı deviceId'yi taşır; deviceId eşleştirmesi
        // yanlış satırı güncellerdi (bütünleşik testte canlı yakalandı).
        const sendRow = live.find((s) => s.id === ticket.sendId);
        if (!sendRow) continue;
        if (ticket.ok) {
          sent += 1;
          await this.prisma.notificationSend.update({
            where: { id: sendRow.id },
            data: {
              status: 'SENT',
              ticketId: ticket.ticketId,
              sentAt: new Date(),
              attempts: { increment: 1 },
              lastError: null,
              provider: this.provider.name,
            },
          });
          // Bildirimde ilk push zamanı (merkez izleme alanı).
          await this.prisma.notification.updateMany({
            where: { id: sendRow.notification.id, pushSentAt: null },
            data: { pushSentAt: new Date() },
          });
        } else {
          failed += 1;
          if (ticket.deviceNotRegistered) {
            await this.prisma.device.update({
              where: { id: sendRow.device.id },
              data: {
                invalidAt: new Date(),
                invalidReason: (ticket.reason ?? 'DeviceNotRegistered').slice(0, 200),
              },
            });
          }
          await this.prisma.notificationSend.update({
            where: { id: sendRow.id },
            data: {
              status: 'FAILED',
              lastError: (ticket.reason ?? 'UNKNOWN').slice(0, 200),
              attempts: { increment: 1 },
              provider: this.provider.name,
            },
          });
        }
      }
      return { tried: pending.length, sent, failed };
    } finally {
      this.dispatchRunning = false;
    }
  }

  private async attemptsOf(sendId: string): Promise<number> {
    const row = await this.prisma.notificationSend.findUnique({
      where: { id: sendId },
      select: { attempts: true },
    });
    return row?.attempts ?? 0;
  }

  // ───────────────────────── Süpürmeler ──────────────────────────────────

  /** TTL aşan geçersiz token'ları siler (çevrim + boot'ta çağrılır). */
  async sweepInvalidTokens(): Promise<{ removed: number }> {
    const cutoff = new Date(
      Date.now() - this.env.PUSH_INVALID_TOKEN_TTL_DAYS * 86_400_000,
    );
    const result = await this.prisma.device.deleteMany({
      where: { invalidAt: { not: null, lt: cutoff } },
    });
    return { removed: result.count };
  }

  /**
   * Abonelik hatırlatmaları (pencere: önümüzdeki SUB_REMINDER_DAYS).
   * Üç mesaj modu: otomatik yenileme / bitiş (otomatik yenileme kapalı) /
   * ödeme sorunu (GRACE_PERIOD). dedupKey dönem bitişine bağlıdır → aynı
   * dönem için tek hatırlatma; yeni dönemde yenisi.
   */
  async sweepSubscriptionReminders(): Promise<{ created: number }> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + this.env.SUB_REMINDER_DAYS * 86_400_000);
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIALING', 'GRACE_PERIOD'] },
        currentPeriodEnd: { not: null, gte: now, lte: windowEnd },
      },
      select: {
        id: true,
        userId: true,
        status: true,
        autoRenew: true,
        currentPeriodEnd: true,
        plan: { select: { titleTr: true, titleEn: true } },
      },
    });

    let created = 0;
    for (const sub of subs) {
      const day = (sub.currentPeriodEnd ?? now).toISOString().slice(0, 10);
      const dedupKeyBase = `SUB_REMINDER:${sub.id}:${day}`;
      const planName = pickLang('tr', sub.plan.titleTr, sub.plan.titleEn);
      const grace = sub.status === 'GRACE_PERIOD';
      const ending = !sub.autoRenew;
      const titleTr = grace
        ? 'Ödeme sorunu — aboneliğin riskte'
        : ending
          ? 'Aboneliğin bitmek üzere'
          : 'Abonelik yenileme hatırlatması';
      const titleEn = grace
        ? 'Payment issue — your subscription is at risk'
        : ending
          ? 'Your subscription is ending'
          : 'Renewal reminder';
      const bodyTr = grace
        ? `${planName} planının ödemesi alınamadı. Ödemeyi tamamlayarak erişimini sürdür.`
        : ending
          ? `${planName} planın ${day} tarihinde sonlanıyor. İstediğin zaman yenileyebilirsin.`
          : `${planName} planın ${day} tarihinde otomatik yenilenecek.`;
      const bodyEn = grace
        ? `We couldn't charge your ${planName} plan. Complete the payment to keep your access.`
        : ending
          ? `Your ${planName} plan ends on ${day}. You can renew anytime.`
          : `Your ${planName} plan renews automatically on ${day}.`;

      const result = await this.notifyUsersOfEvent({
        type: 'SYSTEM',
        titleTr,
        titleEn,
        bodyTr,
        bodyEn,
        dataJson: {
          kind: 'SUB_REMINDER',
          subscriptionId: sub.id,
        },
        dedupKeyBase,
        userIds: [sub.userId],
        prefField: null,
      });
      created += result.created;
    }
    return { created };
  }

  /** Çevrimde birleşik süpürme (token temizliği + hatırlatmalar). */
  async runSweeps(): Promise<{ removed: number; reminders: number }> {
    if (this.sweepRunning) return { removed: 0, reminders: 0 };
    this.sweepRunning = true;
    try {
      const [tokens, reminders] = await Promise.all([
        this.sweepInvalidTokens(),
        this.sweepSubscriptionReminders(),
      ]);
      return { removed: tokens.removed, reminders: reminders.created };
    } finally {
      this.sweepRunning = false;
    }
  }

  // ───────────────────────── Olay yardımcıları ───────────────────────────

  /** Yeni yayınlanan içeriği newContent tercih eden TÜM aktif kullanıcılara duyurur. */
  async notifyTitlePublished(input: {
    contentId: string;
    slug: string;
    titleTr: string;
    titleEn: string;
    isMini: boolean;
  }): Promise<NotifyEventResult> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    return this.notifyUsersOfEvent({
      type: 'NEW_CONTENT',
      titleTr: input.isMini
        ? `Yeni mini dizi: ${input.titleTr}`
        : `Yeni içerik: ${input.titleTr}`,
      titleEn: input.isMini
        ? `New mini series: ${input.titleEn}`
        : `New on PerdeGo: ${input.titleEn}`,
      bodyTr: `${input.titleTr} yayında. Hemen izlemeye başla.`,
      bodyEn: `${input.titleEn} is now streaming. Start watching now.`,
      dataJson: { kind: 'TITLE', contentId: input.contentId },
      dedupKeyBase: `TITLE_PUBLISHED:${input.contentId}`,
      userIds: users.map((u) => u.id),
      prefField: 'newContent',
    });
  }

  /** Favori (izleme listesi) kaydı olan kullanıcılara yeni bölüm bildirimi
   * (newEpisode tercihi). Favori listesi uygulama içinde hem "takip" hem
   * "favori" rolünü üstlenir (tek liste — Favori modeli). */
  async notifyEpisodePublished(input: {
    contentId: string;
    episodeId: string;
    contentTitleTr: string;
    contentTitleEn: string;
    seasonNumber: number;
    episodeNumber: number;
  }): Promise<NotifyEventResult> {
    const followers = await this.prisma.favorite.findMany({
      where: { contentId: input.contentId },
      select: { userId: true },
    });
    const userIds = [...new Set(followers.map((r) => r.userId))];
    if (userIds.length === 0) {
      return { created: 0, skipped: 0, notificationIds: [] };
    }
    return this.notifyUsersOfEvent({
      type: 'NEW_EPISODE',
      titleTr: `${input.contentTitleTr} — yeni bölüm`,
      titleEn: `${input.contentTitleEn} — new episode`,
      bodyTr: `S${input.seasonNumber}B${input.episodeNumber} yayında.`,
      bodyEn: `S${input.seasonNumber}E${input.episodeNumber} is now available.`,
      dataJson: { kind: 'EPISODE', contentId: input.contentId, episodeId: input.episodeId },
      dedupKeyBase: `EP_PUBLISHED:${input.episodeId}`,
      userIds,
      prefField: 'newEpisode',
    });
  }

  /** Satın alma / kredi işlemi bilgilendirmesi (SYSTEM — kapatılamaz, ERD). */
  async notifyBillingEvent(input: {
    userId: string;
    dedupKeyBase: string;
    titleTr: string;
    titleEn: string;
    bodyTr: string;
    bodyEn: string;
    dataJson: { kind: 'BILLING'; subscriptionId?: string };
  }): Promise<NotifyEventResult> {
    return this.notifyUsersOfEvent({
      type: 'SYSTEM',
      titleTr: input.titleTr,
      titleEn: input.titleEn,
      bodyTr: input.bodyTr,
      bodyEn: input.bodyEn,
      dataJson: input.dataJson,
      dedupKeyBase: input.dedupKeyBase,
      userIds: [input.userId],
      prefField: null,
    });
  }

  // ───────────────────────── Payload güvenliği ───────────────────────────

  /**
   * Bildirim + cihazdan push mesajı üretir. Payload alanları izin listesiyle
   * sınırlıdır: kind/contentId/episodeId/campaignId/subscriptionId. Ödeme
   * tutarı, token, e-posta vb. burada bantlanır (savunma derinliği: olay
   * üretiminde zaten girilmez).
   */
  toPushMessage(
    notification: {
      titleTr: string;
      titleEn: string;
      bodyTr: string;
      bodyEn: string;
      dataJson: unknown;
    },
    device: { id: string; pushToken: string; locale: string },
    sendId: string,
  ): PushMessage {
    const lang = (device.locale === 'en' ? 'en' : 'tr') as Lang;
    const raw = (notification.dataJson ?? {}) as Record<string, unknown>;
    const data: Record<string, string> = {};
    for (const key of ['kind', 'contentId', 'episodeId', 'campaignId', 'subscriptionId'] as const) {
      const value = raw[key];
      if (typeof value === 'string' && value.length > 0 && value.length <= 64) {
        data[key] = value;
      }
    }
    return {
      sendId,
      deviceId: device.id,
      pushToken: device.pushToken,
      title: pickLang(lang, notification.titleTr, notification.titleEn).slice(0, 120),
      body: pickLang(lang, notification.bodyTr, notification.bodyEn).slice(0, 200),
      data,
    };
  }
}

/** Sağlayıcı seçimi (env refine: simulated üretimde zaten reddedilir). */
export function createPushProvider(env: Env): PushProviderPort {
  switch (env.PUSH_PROVIDER) {
    case 'expo':
      return new ExpoPushProvider(env.EXPO_PUSH_BASE_URL);
    case 'simulated':
      return new SimulatedPushProvider();
    default:
      return new NoopPushProvider();
  }
}
