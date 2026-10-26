/**
 * Bildirim kampanyaları servisi (FAZ 8; FAZ 9'da push fan-out + tercih filtresi eklendi).
 *
 * Amaç: yeni bölüm/yeni içerik duyurusu, promo ve sistem mesajlarının
 * tek seferde gönderimi; ileri tarihli planlama.
 *
 * Güvenlik/kalite kararları:
 *  - Gönderim tek yönlü idempotent: kampanya yalnızca SCHEDULED→SENDING→SENT
 *    geçişiyle gönderilir; FAILED/CANCELLED kampanya asla yeniden koşmaz.
 *  - Alıcılar yalnızca status=ACTIVE kullanıcılardır (askıdaki/silinen
 *    hesaba bildirim gitmez) VE kampanya türüne karşılık gelen bildirim
 *    tercihini açık olanlardır (FAZ 9: tercihle çelişen duyuru gitmez).
 *  - Dispatch çevrimi 30 sn'de bir çalışır; createMany chunk'lanır.
 *  - FAZ 9: oluşturulan her bildirim için kullanıcı cihazlarına push
 *    gönderim satırları (PENDING) açılır; izleme NotificationSend'dedir.
 *  - Sonuç takibi: recipientCount (oluşturulan bildirim) ve okunma sayısı
 *    listede canlı hesaplanır (readCount).
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors';
import { buildPageMeta } from '../common/pagination';
import type {
  AdminCampaign,
  AdminCampaignInput,
  AdminSendListParams,
  AdminSendListResponse,
} from '@perdego/contracts';
import { PushDispatchService, type NotificationPrefField } from './push-dispatch.service';

const DISPATCH_INTERVAL_MS = 30_000;
const CREATE_CHUNK = 500;

@Injectable()
export class CampaignsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushDispatchService,
  ) {}

  onModuleInit(): void {
    // Sunucu ayaktayken planlanan kampanyaları zamanında yakalar.
    this.timer = setInterval(() => {
      void this.dispatchDue();
    }, DISPATCH_INTERVAL_MS);
    // İlk turu geciktirmeden koşma: boot yükünü artırmamak için ilk tur
    // ilk aralıktan sonra gerçekleşir (30 sn) — yeterli.
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private toAdminCampaign(row: {
    id: string;
    type: AdminCampaign['type'];
    titleTr: string;
    titleEn: string;
    bodyTr: string;
    bodyEn: string;
    status: AdminCampaign['status'];
    scheduledFor: Date | null;
    sentAt: Date | null;
    recipientCount: number;
    failedCount: number;
    createdById: string | null;
    createdAt: Date;
    _readCount?: number;
  }): AdminCampaign {
    return {
      id: row.id,
      type: row.type,
      titleTr: row.titleTr,
      titleEn: row.titleEn,
      bodyTr: row.bodyTr,
      bodyEn: row.bodyEn,
      status: row.status,
      scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      recipientCount: row.recipientCount,
      readCount: row._readCount ?? 0,
      failedCount: row.failedCount,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(): Promise<{ items: AdminCampaign[] }> {
    const rows = await this.prisma.notificationCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const readCounts = await this.prisma.notification.groupBy({
      by: ['dataJson'],
      where: { readAt: { not: null } },
      _count: { _all: true },
    });
    // Okunma sayısı kampanya bağlantılıdır: bildirim dataJson.campaignId.
    const readByCampaign = new Map<string, number>();
    for (const group of readCounts) {
      const data = group.dataJson as { campaignId?: string } | null;
      if (data && typeof data.campaignId === 'string') {
        readByCampaign.set(data.campaignId, group._count._all);
      }
    }
    return {
      items: rows.map((row) =>
        this.toAdminCampaign({
          ...row,
          _readCount: readByCampaign.get(row.id) ?? 0,
        }),
      ),
    };
  }

  async create(input: AdminCampaignInput, actorUserId: string): Promise<AdminCampaign> {
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'scheduledFor', message: 'Geçersiz tarih' }],
      });
    }

    const row = await this.prisma.notificationCampaign.create({
      data: {
        type: input.type,
        titleTr: input.titleTr,
        titleEn: input.titleEn,
        bodyTr: input.bodyTr,
        bodyEn: input.bodyEn,
        dataJson: (input.dataJson ?? undefined) as never,
        status: scheduledFor ? 'SCHEDULED' : 'DRAFT',
        scheduledFor,
        createdById: actorUserId,
      },
    });

    if (!scheduledFor) {
      // Derhal gönderim: SENDING → SENT (veya FAILED).
      const sent = await this.sendCampaign(row.id);
      return this.toAdminCampaign(sent);
    }
    return this.toAdminCampaign(row);
  }

  async cancel(campaignId: string, actorUserId: string): Promise<{ ok: true; id: string }> {
    const row = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true },
    });
    if (!row) {
      throw DomainError.notFound('CAMPAIGN_NOT_FOUND', 'errors.notFound', { campaignId });
    }
    if (row.status !== 'SCHEDULED' && row.status !== 'DRAFT') {
      throw DomainError.conflict('CAMPAIGN_NOT_CANCELLABLE', 'errors.validationFailed', {
        status: row.status,
      });
    }
    await this.prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED' },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'CAMPAIGN_CANCEL',
        entityType: 'notification_campaign',
        entityId: campaignId,
      },
    });
    return { ok: true, id: campaignId };
  }

  /** Planlanmış kampanyaları gönderir (dispatch çevrimi). */
  async dispatchDue(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.prisma.notificationCampaign.findMany({
        where: { status: 'SCHEDULED', scheduledFor: { lte: new Date() } },
        select: { id: true },
        take: 10,
      });
      for (const row of due) {
        await this.sendCampaign(row.id);
      }
      return due.length;
    } finally {
      this.running = false;
    }
  }

  /** Tek kampanyayı tüm aktif kullanıcılara gönderir; son halini döner. */
  private async sendCampaign(campaignId: string) {
    // İdempotansiyon: yalnızca SCHEDULED/DRAFT → SENDING geçişine izin ver
    // (atomik koşullu update; paralel dispatch kaybedeni sıfır etkiler).
    const claimed = await this.prisma.notificationCampaign.updateMany({
      where: { id: campaignId, status: { in: ['SCHEDULED', 'DRAFT'] } },
      data: { status: 'SENDING' },
    });
    if (claimed.count === 0) {
      return this.prisma.notificationCampaign.findUniqueOrThrow({
        where: { id: campaignId },
      });
    }

    const campaign = await this.prisma.notificationCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });

    try {
      // FAZ 9: tercih filtresi — türü kapatmış kullanıcıya duyuru gitmez
      // (SYSTEM kapatılamaz; ERD salt okunur true).
      const prefField: NotificationPrefField | null =
        campaign.type === 'NEW_EPISODE'
          ? 'newEpisode'
          : campaign.type === 'NEW_CONTENT'
            ? 'newContent'
            : campaign.type === 'PROMO'
              ? 'promo'
              : null;
      const users = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          ...(prefField
            ? { notificationPreference: { [prefField]: true } }
            : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      const payload = {
        type: campaign.type,
        titleTr: campaign.titleTr,
        titleEn: campaign.titleEn,
        bodyTr: campaign.bodyTr,
        bodyEn: campaign.bodyEn,
        dataJson: {
          ...((campaign.dataJson as Record<string, unknown> | null) ?? {}),
          campaignId,
        },
      };

      let created = 0;
      const createdIds: string[] = [];
      for (let i = 0; i < users.length; i += CREATE_CHUNK) {
        const chunk = users.slice(i, i + CREATE_CHUNK);
        const rows = chunk.map((u) => ({ userId: u.id, ...payload }));
        const result = await this.prisma.notification.createManyAndReturn({
          data: rows,
          skipDuplicates: true,
        });
        created += result.length;
        createdIds.push(...result.map((r) => r.id));
      }

      // FAZ 9: oluşturulan bildirimleri cihaz push kuyruğuna al.
      await this.push.enqueueSendsForNotifications(createdIds);

      return await this.finalize(campaignId, created, users.length - created);
    } catch (err) {
      this.logger.error(`Kampanya gönderimi başarısız: ${campaignId}`, err);
      await this.prisma.notificationCampaign.update({
        where: { id: campaignId },
        data: { status: 'FAILED' },
      });
      return this.prisma.notificationCampaign.findUniqueOrThrow({
        where: { id: campaignId },
      });
    }
  }

  private async finalize(campaignId: string, recipientCount: number, failedCount: number) {
    const row = await this.prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: {
        status: recipientCount > 0 ? 'SENT' : 'FAILED',
        sentAt: new Date(),
        recipientCount,
        failedCount,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: row.createdById,
        action: 'CAMPAIGN_SENT',
        entityType: 'notification_campaign',
        entityId: campaignId,
        afterJson: { recipientCount, failedCount },
      },
    });
    return row;
  }

  /**
   * Kampanyanın push gönderim izleri (FAZ 9): cihaz başına durum + toplu
   * sayaçlar. dataJson.campaignId üzerinden bildirimlere katılır.
   */
  async listSends(
    campaignId: string,
    params: AdminSendListParams,
  ): Promise<AdminSendListResponse> {
    const { page, pageSize, status } = params;
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) {
      throw DomainError.notFound('CAMPAIGN_NOT_FOUND', 'errors.notFound', { campaignId });
    }
    const notifWhere = {
      dataJson: { path: ['campaignId'], equals: campaignId },
    } as const;
    const where = { notification: notifWhere, ...(status ? { status } : {}) };
    const [rows, total, pending, sent, failed] = await Promise.all([
      this.prisma.notificationSend.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { device: { select: { platform: true, pushToken: true } } },
      }),
      this.prisma.notificationSend.count({ where }),
      this.prisma.notificationSend.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.notificationSend.count({ where: { ...where, status: 'SENT' } }),
      this.prisma.notificationSend.count({ where: { ...where, status: 'FAILED' } }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        notificationId: row.notificationId,
        deviceId: row.deviceId,
        platform: row.device.platform,
        pushTokenMasked: `…${row.device.pushToken.slice(-4)}`,
        status: row.status,
        attempts: row.attempts,
        provider: (row.provider === 'expo' || row.provider === 'simulated'
          ? row.provider
          : 'none') as 'expo' | 'simulated' | 'none',
        lastError: row.lastError ?? null,
        sentAt: row.sentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildPageMeta(page, pageSize, total),
      stats: { pending, sent, failed },
    };
  }
}
