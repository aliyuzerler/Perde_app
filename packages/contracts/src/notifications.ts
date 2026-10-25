/**
 * Bildirim sözleşmeleri (Faz 2b: cihaz token kaydı, uygulama içi merkezi,
 * tercihler). Push gönderimi sonraki fazdır (Faz 7).
 */
import { z } from 'zod';
import { pageMetaSchema } from './common';
import { supportedLocaleSchema } from './user';

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
