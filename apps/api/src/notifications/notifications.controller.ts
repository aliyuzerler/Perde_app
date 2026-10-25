/**
 * Bildirim modülü: cihaz token kaydı, uygulama içi merkezi, tercihler.
 *   POST   /notifications/devices       → push token kaydet (upsert)
 *   DELETE /notifications/devices/:id   → token kaldır
 *   GET    /notifications               → bildirim merkezi (sayfalı)
 *   POST   /notifications/:id/read      → okundu işaretle
 *   POST   /notifications/read-all      → tümünü okundu yap
 *   GET/PATCH /notifications/preferences→ tercihler
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  deviceRegisterSchema,
  pageRequestSchema,
  updateNotificationPreferencesSchema,
  type DeviceRegister,
  type DeviceResponse,
  type NotificationListResponse,
  type NotificationPreferences,
  type UpdateNotificationPreferences,
} from '@perdego/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, parseQuery } from '../common/zod-validation.pipe';
import { CurrentLang, CurrentUser, type Lang, type RequestUser } from '../common/request-context';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('devices')
  @ApiOperation({ summary: 'Push token kaydet (upsert)' })
  async registerDevice(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(deviceRegisterSchema)) dto: DeviceRegister,
  ): Promise<DeviceResponse> {
    return this.notifications.registerDevice(user.id, dto);
  }

  @Delete('devices/:id')
  @ApiOperation({ summary: 'Push token kaldır' })
  async removeDevice(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<{ removed: boolean }> {
    return this.notifications.removeDevice(user.id, id);
  }

  @Get()
  @ApiOperation({ summary: 'Bildirim merkezi' })
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: unknown,
    @CurrentLang() lang: Lang,
  ): Promise<NotificationListResponse> {
    const { page, pageSize } = parseQuery(pageRequestSchema, query);
    return this.notifications.list(user.id, page, pageSize, lang);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Bildirimi okundu işaretle' })
  async markRead(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<{ marked: boolean }> {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Tüm bildirimleri okundu işaretle' })
  async markAllRead(@CurrentUser() user: RequestUser): Promise<{ marked: true }> {
    return this.notifications.markAllRead(user.id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Bildirim tercihleri' })
  async preferences(
    @CurrentUser() user: RequestUser,
  ): Promise<NotificationPreferences> {
    return this.notifications.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Bildirim tercihleri güncelleme' })
  async updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema)) dto: UpdateNotificationPreferences,
  ): Promise<NotificationPreferences> {
    return this.notifications.updatePreferences(user.id, dto);
  }
}
