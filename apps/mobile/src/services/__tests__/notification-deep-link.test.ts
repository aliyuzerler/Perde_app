/**
 * FAZ 9 — bildirim derin bağlantı çözümleyici testleri (saf fonksiyonlar).
 */
import { describe, expect, it } from '@jest/globals';
import { resolveNotificationRoute } from '@/services/notifications/deep-link';

describe('FAZ 9 — resolveNotificationRoute', () => {
  it('EPISODE → oynatıcı rotası (doğru ekrana geçiş)', () => {
    const route = resolveNotificationRoute({ kind: 'EPISODE', contentId: 'c1', episodeId: 'e1' });
    expect(route).toEqual({ path: '/player/e1', markRead: true });
  });

  it('TITLE → içerik detayı rotası', () => {
    expect(resolveNotificationRoute({ kind: 'TITLE', contentId: 'c1' })).toEqual({
      path: '/content/c1',
      markRead: true,
    });
  });

  it('CAMPAIGN → bildirim merkezi (okundu işaretlemeden)', () => {
    expect(resolveNotificationRoute({ kind: 'CAMPAIGN', campaignId: 'k1' })).toEqual({
      path: '/notifications',
      markRead: false,
    });
  });

  it('BILLING ve SUB_REMINDER → hesap (ödeme verisi gösterilmez)', () => {
    expect(resolveNotificationRoute({ kind: 'BILLING' })?.path).toBe('/account');
    expect(resolveNotificationRoute({ kind: 'SUB_REMINDER', subscriptionId: 's1' })?.path).toBe('/account');
  });

  it('episodeId eksik/kirliyse null döner (merkeze düşer — çökmez)', () => {
    expect(resolveNotificationRoute({ kind: 'EPISODE' })).toBeNull();
    expect(resolveNotificationRoute({ kind: 'EPISODE', episodeId: '' })).toBeNull();
    expect(resolveNotificationRoute({ kind: 'BILINMEYEN' })).toBeNull();
    expect(resolveNotificationRoute(undefined)).toBeNull();
    expect(resolveNotificationRoute('dizgi' as never)).toBeNull();
  });

  it('id değerlerini encodeURIComponent ile güvenli hale getirir', () => {
    const route = resolveNotificationRoute({ kind: 'TITLE', contentId: 'a/b c' });
    expect(route?.path).toBe('/content/a%2Fb%20c');
  });
});
