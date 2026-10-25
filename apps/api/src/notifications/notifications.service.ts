/**
 * Bildirim servisi: cihaz token'ları (devices), uygulama içi merkez,
 * tercih satırı (notification_preferences). Push gönderimi Faz 7'de.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta } from '../common/pagination';
import type {
  DeviceRegister,
  DeviceResponse,
  NotificationPreferences,
  UpdateNotificationPreferences,
} from '@perdego/contracts';
import type { Lang } from '../common/request-context';
import { pickLang } from '../common/request-context';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(userId: string, dto: DeviceRegister): Promise<DeviceResponse> {
    const device = await this.prisma.device.upsert({
      where: { pushToken: dto.pushToken },
      update: {
        platform: dto.platform,
        appVersion: dto.appVersion,
        locale: dto.locale,
        userId,
        lastActiveAt: new Date(),
      },
      create: {
        userId,
        platform: dto.platform,
        pushToken: dto.pushToken,
        appVersion: dto.appVersion,
        locale: dto.locale,
      },
    });
    return {
      id: device.id,
      platform: device.platform,
      pushTokenMasked: `…${device.pushToken.slice(-4)}`,
    };
  }

  async removeDevice(userId: string, deviceId: string): Promise<{ removed: boolean }> {
    const result = await this.prisma.device.deleteMany({
      where: { id: deviceId, userId },
    });
    return { removed: result.count > 0 };
  }

  async list(userId: string, page: number, pageSize: number, lang: Lang) {
    const where = { userId };
    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: pickLang(lang, row.titleTr, row.titleEn),
        body: pickLang(lang, row.bodyTr, row.bodyEn),
        data: row.dataJson ?? undefined,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildPageMeta(page, pageSize, total),
      unreadCount,
    };
  }

  async markRead(userId: string, notificationId: string): Promise<{ marked: boolean }> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: result.count > 0 };
  }

  async markAllRead(userId: string): Promise<{ marked: true }> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: true };
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return {
      newEpisode: prefs.newEpisode,
      newContent: prefs.newContent,
      promo: prefs.promo,
      system: true,
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferences,
  ): Promise<NotificationPreferences> {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
    return {
      newEpisode: prefs.newEpisode,
      newContent: prefs.newContent,
      promo: prefs.promo,
      system: true,
    };
  }
}
