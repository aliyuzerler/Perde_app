/**
 * Bildirim sözleşmeleri (Faz 2b: cihaz token kaydı, uygulama içi merkezi,
 * tercihler). FAZ 9: push gönderim izleme + derin bağlantı veri sözleşmesi.
 */
import { z } from 'zod';
import { pageMetaSchema, pageRequestSchema } from './common';
import { supportedLocaleSchema } from './user';

/**
 * Push derin bağlantı verisi (FAZ 9). Push mesajına YALNIZCA bu izin listesi
 * taşınır: gizli bilgiler / ödeme verileri push payload'ına asla girmez
 * (sıra: PushDispatchService.toPushMessage). Vurgulanır: kimlik/kart/fiyat yok.
 */
export const pushDeepLinkSchema = z.object({
  kind: z.enum(['TITLE', 'EPISODE', 'CAMPAIGN', 'BILLING', 'SUB_REMINDER']),
  contentId: z.string().min(1).optional(),
  episodeId: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
});
export type PushDeepLink = z.infer<typeof pushDeepLinkSchema>;

/** Cihaz token'ı geçersizlik bildirimi (yönetim görünümü — FAZ 9). */
export const adminNotificationSendItemSchema = z.object({
  id: z.string().min(1),
  notificationId: z.string().min(1),
  deviceId: z.string().min(1),
  platform: z.enum(['IOS', 'ANDROID']),
  /** Gizlilik: maskelenmiş token (son 4 karakter). */
  pushTokenMasked: z.string().min(1),
  status: z.enum(['PENDING', 'SENT', 'FAILED']),
  attempts: z.number().int().min(0),
  provider: z.enum(['expo', 'simulated', 'none']),
  lastError: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  createdAt: z.string().min(1),
});
export type AdminNotificationSendItem = z.infer<
  typeof adminNotificationSendItemSchema
>;

export const adminSendListParamsSchema = pageRequestSchema.extend({
  status: z.enum(['PENDING', 'SENT', 'FAILED']).optional(),
});
export type AdminSendListParams = z.infer<typeof adminSendListParamsSchema>;

export const adminSendStatsSchema = z.object({
  pending: z.number().int().min(0),
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
});
export type AdminSendStats = z.infer<typeof adminSendStatsSchema>;

export const adminSendListResponseSchema = z.object({
  items: z.array(adminNotificationSendItemSchema).default([]),
  meta: pageMetaSchema,
  stats: adminSendStatsSchema,
});
export type AdminSendListResponse = z.infer<typeof adminSendListResponseSchema>;

/** POST /api/v1/notifications/devices gövdesi. */
export const deviceRegisterSchema = z.object({
  platform: z.enum(['IOS', 'ANDROID']),
  pushToken: z.string().min(10).max(512),
  appVersion: z.string().min(1).max(40).optional(),
  locale: supportedLocaleSchema.default('tr'),
});
export type DeviceRegister = z.infer<typeof deviceRegisterSchema>;

export const deviceResponseSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(['IOS', 'ANDROID']),
  /** Gizlilik: maskelenmiş token son 4 karakter. */
  pushTokenMasked: z.string().min(1),
});
export type DeviceResponse = z.infer<typeof deviceResponseSchema>;

/** Uygulama içi bildirim. */
export const notificationItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['NEW_EPISODE', 'NEW_CONTENT', 'PROMO', 'SYSTEM']),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.unknown().optional(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string().min(1),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationItemSchema).default([]),
  meta: pageMetaSchema.optional(),
  unreadCount: z.number().int().min(0),
});
export type NotificationListResponse = z.infer<
  typeof notificationListResponseSchema
>;

/** Bildirim tercihleri (system salt okunur true). */
export const notificationPreferencesSchema = z.object({
  newEpisode: z.boolean(),
  newContent: z.boolean(),
  promo: z.boolean(),
  system: z.literal(true),
});
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;

export const updateNotificationPreferencesSchema = notificationPreferencesSchema
  .omit({ system: true })
  .partial();
export type UpdateNotificationPreferences = z.infer<
  typeof updateNotificationPreferencesSchema
>;
