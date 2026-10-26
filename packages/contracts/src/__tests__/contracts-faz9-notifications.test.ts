/**
 * FAZ 9 bildirim sözleşme testleri — push altyapısı şemaları.
 */
import { describe, expect, it } from 'vitest';
import {
  adminNotificationSendItemSchema,
  adminSendListParamsSchema,
  adminSendListResponseSchema,
  pushDeepLinkSchema,
} from '../notifications';

describe('FAZ 9 — push derin bağlantı verisi', () => {
  it('geçerli kind değerlerini kabul eder', () => {
    const kinds = ['TITLE', 'EPISODE', 'CAMPAIGN', 'BILLING', 'SUB_REMINDER'];
    for (const kind of kinds) {
      expect(pushDeepLinkSchema.parse({ kind }).kind).toBe(kind);
    }
  });

  it('bilinmeyen kind’ı reddeder (izin listesi)', () => {
    expect(() => pushDeepLinkSchema.parse({ kind: 'MAGIC' })).toThrow();
  });

  it('id/boş string alanları reddeder', () => {
    expect(() => pushDeepLinkSchema.parse({ kind: 'EPISODE', episodeId: '' })).toThrow();
    expect(pushDeepLinkSchema.parse({ kind: 'EPISODE', episodeId: 'ep1' }).episodeId).toBe('ep1');
  });
});

describe('FAZ 9 — gönderim izleme sözleşmeleri', () => {
  const validSend = {
    id: 'send1',
    notificationId: 'n1',
    deviceId: 'd1',
    platform: 'IOS',
    pushTokenMasked: '…abcd',
    status: 'SENT',
    attempts: 2,
    provider: 'expo',
    sentAt: '2026-10-27T10:00:00.000Z',
    createdAt: '2026-10-27T09:59:00.000Z',
  };

  it('gönderim satırını doğrular', () => {
    expect(adminNotificationSendItemSchema.parse(validSend).status).toBe('SENT');
  });

  it('bilinmeyen durumu ve sağlayıcıyı reddeder', () => {
    expect(() => adminNotificationSendItemSchema.parse({ ...validSend, status: 'QUEUED' })).toThrow();
    expect(() => adminNotificationSendItemSchema.parse({ ...validSend, provider: 'magic' })).toThrow();
  });

  it('liste parametrelerinde status filtresini kabul eder', () => {
    const parsed = adminSendListParamsSchema.parse({ page: 1, pageSize: 20, status: 'FAILED' });
    expect(parsed.status).toBe('FAILED');
    expect(() => adminSendListParamsSchema.parse({ page: 1, pageSize: 20, status: 'NOPE' })).toThrow();
  });

  it('liste yanıtını sayaçlarla doğrular', () => {
    const parsed = adminSendListResponseSchema.parse({
      items: [validSend],
      meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false },
      stats: { pending: 0, sent: 1, failed: 0 },
    });
    expect(parsed.stats.sent).toBe(1);
  });
});
