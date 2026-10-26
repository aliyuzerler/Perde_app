/**
 * Bildirim derin bağlantı çözümleyici (FAZ 9 — saf fonksiyon).
 *
 * Push/app içi bildirim verisini (izin listeli dataJson) hedef expo-router
 * yoluna çevirir. Güvenlik: yalnızca bilinen kind değerleri rotalanır;
 * beklenmeyen/eksik veride null döner (kullanıcı bildirim merkezine gider).
 */
export interface NotificationDeepLinkData {
  kind?: unknown;
  contentId?: unknown;
  episodeId?: unknown;
  campaignId?: unknown;
  subscriptionId?: unknown;
}

export interface ResolvedNotificationRoute {
  path: string;
  /** Okundu işaretleme: EPISODE/TITLE içerik bildirimleri okundu sayılır. */
  markRead: boolean;
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 64;

/**
 * dataJson → rota. EPISODE → /player/:episodeId (oynatıcı doğru ekrana taşır);
 * TITLE → /content/:contentId; CAMPAIGN → bildirim merkezi (/notifications);
 * BILLING / SUB_REMINDER → hesap sayfası (ödeme verisi gösterilmez).
 */
export function resolveNotificationRoute(
  data: NotificationDeepLinkData | undefined | null,
): ResolvedNotificationRoute | null {
  if (!data || typeof data !== 'object') return null;
  switch (data.kind) {
    case 'EPISODE': {
      if (!isNonEmptyString(data.episodeId)) return null;
      return { path: `/player/${encodeURIComponent(data.episodeId)}`, markRead: true };
    }
    case 'TITLE': {
      if (!isNonEmptyString(data.contentId)) return null;
      return { path: `/content/${encodeURIComponent(data.contentId)}`, markRead: true };
    }
    case 'CAMPAIGN':
      return { path: '/notifications', markRead: false };
    case 'BILLING':
    case 'SUB_REMINDER':
      return { path: '/account', markRead: false };
    default:
      return null;
  }
}
