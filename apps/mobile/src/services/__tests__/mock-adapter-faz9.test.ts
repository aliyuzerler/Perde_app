/**
 * FAZ 9 — mock adapter bildirim metotları (port sözleşmesi + davranış).
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import { createMockAdapter, mockNotificationState } from '@/services/mock/mock-adapter';

describe('FAZ 9 — mock adapter bildirim akışları', () => {
  const api = createMockAdapter();

  beforeEach(() => {
    mockNotificationState.devices = [];
    mockNotificationState.items = [
      {
        id: 'n-1',
        type: 'NEW_EPISODE',
        title: 'Yeni bölüm',
        body: 'S1B2',
        data: { kind: 'EPISODE', contentId: 'c1', episodeId: 'e1' },
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ];
    mockNotificationState.preferences = { newEpisode: true, newContent: true, promo: true, system: true };
  });

  it('cihaz token upsert: aynı token aynı cihazı döner, ikinci cihaz ayrı', async () => {
    const first = await api.registerDeviceToken({
      platform: 'IOS',
      pushToken: 'ExponentPushToken[mock-token-aaaa]',
      locale: 'tr',
    });
    const again = await api.registerDeviceToken({
      platform: 'IOS',
      pushToken: 'ExponentPushToken[mock-token-aaaa]',
      locale: 'en',
    });
    expect(again.id).toBe(first.id);
    expect(first.pushTokenMasked).toContain('…');

    const second = await api.registerDeviceToken({
      platform: 'ANDROID',
      pushToken: 'ExponentPushToken[mock-token-bbbb]',
      locale: 'tr',
    });
    expect(second.id).not.toBe(first.id);
    expect(mockNotificationState.devices).toHaveLength(2);
  });

  it('bildirim listesi unreadCount ile döner; okundu işaretleme sayacı düşürür', async () => {
    const before = await api.listNotifications({ page: 1, pageSize: 20 });
    expect(before.unreadCount).toBe(1);

    const marked = await api.markNotificationRead('n-1');
    expect(marked.marked).toBe(true);

    const after = await api.listNotifications({ page: 1, pageSize: 20 });
    expect(after.unreadCount).toBe(0);
    expect(after.items[0]?.readAt).not.toBeNull();
  });

  it('markAllRead tümünü kapatır; idempotenttir', async () => {
    await api.markAllNotificationsRead();
    const second = await api.markNotificationRead('n-1');
    expect(second.marked).toBe(false);
    const list = await api.listNotifications({ page: 1, pageSize: 20 });
    expect(list.unreadCount).toBe(0);
  });

  it('tercih güncelleme system alanını değiştirmez (salt okunur)', async () => {
    const updated = await api.updateNotificationPreferences({ newEpisode: false, promo: false });
    expect(updated.newEpisode).toBe(false);
    expect(updated.promo).toBe(false);
    expect(updated.system).toBe(true);
    expect(updated.newContent).toBe(true);
  });

  it('removeDeviceToken kaydı kaldırır', async () => {
    const reg = await api.registerDeviceToken({
      platform: 'IOS',
      pushToken: 'ExponentPushToken[mock-token-cccc]',
      locale: 'tr',
    });
    const removed = await api.removeDeviceToken(reg.id);
    expect(removed.removed).toBe(true);
    const again = await api.removeDeviceToken(reg.id);
    expect(again.removed).toBe(false);
  });
});
