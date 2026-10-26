/**
 * Bildirim kampanyaları servisi (FAZ 8) — yönetim duyuruları.
 *
 * Amaç: yeni bölüm/yeni içerik duyurusu, promo ve sistem mesajlarının
 * TÜM aktif kullanıcılara tek seferde gönderimi; ileri tarihli planlama.
 *
 * Güvenlik/kalite kararları:
 *  - Gönderim tek yönlü idempotent: kampanya yalnızca SCHEDULED→SENDING→SENT
 *    geçişiyle gönderilir; FAILED/CANCELLED kampanya asla yeniden koşmaz.
 *  - Alıcılar yalnızca status=ACTIVE kullanıcılardır (askıdaki/silinen
 *    hesaba bildirim gitmez).
 *  - Dispatch çevrimi 30 sn'de bir çalışır (NestJS lifecycle ile yönetilir);
 *    createMany chunk'lanır. Push gönderimi yoktur — uygulama içi merkez +
 *    satır kaydı (push Faz 7+ kapsamıdır).
 *  - Sonuç takibi: recipientCount (oluşturulan bildirim) ve okunma sayısı
 *    listede canlı hesaplanır (readCount).
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors';
import type { AdminCampaign, AdminCampaignInput } from '@perdego/contracts';

const DISPATCH_INTERVAL_MS = 30_000;
const CREATE_CHUNK = 500;

@Injectable()
export class CampaignsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

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
      const users = await this.prisma.user.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
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
      for (let i = 0; i < users.length; i += CREATE_CHUNK) {
        const chunk = users.slice(i, i + CREATE_CHUNK);
        const result = await this.prisma.notification.createMany({
          data: chunk.map((u) => ({ userId: u.id, ...payload })),
          skipDuplicates: true,
        });
        created += result.count;
      }

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
}
