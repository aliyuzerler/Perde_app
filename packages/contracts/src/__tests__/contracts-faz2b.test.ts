/**
 * Faz 2b sözleşme testleri: auth, catalog, library, notifications, payments.
 */
import { describe, expect, it } from 'vitest';
import {
  authSessionResponseSchema,
  bannerSchema,
  deviceRegisterSchema,
  episodeAccessSchema,
  episodeDetailResponseSchema,
  favoriteMutationResponseSchema,
  homeResponseSchema,
  notificationPreferencesSchema,
  passwordFieldSchema,
  purchaseValidateResponseSchema,
  purchaseValidateSchema,
  authRegisterRequestSchema,
  titleListParamsSchema,
  titleListResponseSchema,
  watchProgressItemSchema,
  watchProgressPutSchema,
  webhookIngestSchema,
} from '../index';

const summary = {
  contentId: 'c_1',
  slug: 'son-vardiya',
  kind: 'SERIES' as const,
  title: 'Son Vardiya',
  releaseYear: 2026,
  genres: ['dram'],
  accessType: 'SUBSCRIPTION' as const,
  isNew: false,
};

describe('auth sözleşmeleri', () => {
  it('geçerli şifreyi kabul eder', () => {
    expect(() => passwordFieldSchema.parse('Dev12345')).not.toThrow();
  });

  it('kısa/harfsiz/rakamsız şifreyi reddeder', () => {
    expect(() => passwordFieldSchema.parse('kisa1')).toThrow();
    expect(() => passwordFieldSchema.parse('sadeceharfler')).toThrow();
    expect(() => passwordFieldSchema.parse('12345678')).toThrow();
  });

  it('kayıt isteğini ayrıştırır ve e-postayı normalize eder', () => {
    const parsed = authRegisterRequestSchema.parse({
      displayName: 'Ayşe',
      email: ' AYSE@Ornek.COM ',
      password: 'Dev12345',
    });
    expect(parsed.email).toBe('ayse@ornek.com');
    expect(parsed.locale).toBe('tr');
  });

  it('oturum yanıtını ayrıştırır', () => {
    const parsed = authSessionResponseSchema.parse({
      user: {
        id: 'usr_1',
        displayName: 'Ayşe',
        email: 'ayse@ornek.com',
        locale: 'tr',
        role: 'USER',
        joinedAt: '2026-10-25T09:00:00Z',
      },
      tokens: { accessToken: 'x'.repeat(20), refreshToken: 'y'.repeat(20), expiresIn: 900 },
    });
    expect(parsed.tokens.expiresIn).toBe(900);
  });
});

describe('catalog sözleşmeleri', () => {
  it('titleListParams filtrelerini ve varsayılanı ayrıştırır', () => {
    const parsed = titleListParamsSchema.parse({ kind: 'SERIES', page: '2' });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.sort).toBe('newest');
  });

  it('geçersiz sıralamayı reddeder', () => {
    expect(() => titleListParamsSchema.parse({ sort: 'rastgele' })).toThrow();
  });

  it('home yanıtını banner ve bölümlerle ayrıştırır', () => {
    const parsed = homeResponseSchema.parse({
      banners: [
        {
          id: 'b_1',
          title: 'Yeni sezon',
          imageUrl: 'https://api.perdego.com/placeholders/banner/gizli-bahce.svg',
          targetContentSlug: 'gizli-bahce',
        },
      ],
      sections: [
        {
          id: 's_1',
          title: 'Yeni Eklenenler',
          layout: 'RAIL',
          items: [summary],
        },
      ],
    });
    expect(parsed.banners[0]!.targetContentSlug).toBe('gizli-bahce');
    expect(parsed.sections[0]!.items).toHaveLength(1);
  });

  it('erişim kararı şeması tüm nedenleri kabul eder', () => {
    for (const reason of [
      'FREE',
      'SUBSCRIPTION_ACTIVE',
      'NEEDS_SUBSCRIPTION',
      'NEEDS_CREDITS',
      'UNLOCKED',
      'SCHEDULED',
      'AGE_RESTRICTED',
    ] as const) {
      const parsed = episodeAccessSchema.parse({ canPlay: reason.startsWith('FREE') || reason === 'UNLOCKED', reason });
      expect(parsed.reason).toBe(reason);
    }
  });

  it('titleListResponse sayfalama üst verisiyle ayrıştırır', () => {
    const parsed = titleListResponseSchema.parse({
      items: [summary],
      meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false },
    });
    expect(parsed.meta.totalItems).toBe(1);
  });

  it('episodeDetailResponse içeriğiyle ayrıştırır', () => {
    const parsed = episodeDetailResponseSchema.parse({
      id: 'ep_1',
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'Bodrum Kat',
      durationSeconds: 498,
      accessType: 'CREDIT',
      creditCost: 2,
      access: { canPlay: false, reason: 'NEEDS_CREDITS' },
      content: summary,
    });
    expect(parsed.access?.reason).toBe('NEEDS_CREDITS');
    expect(parsed.creditCost).toBe(2);
  });

  it('banner deepLink olmadan da geçerli', () => {
    const parsed = bannerSchema.parse({
      id: 'b_2',
      title: 'Kampanya',
      imageUrl: 'https://api.perdego.com/placeholders/banner/x.svg',
    });
    expect(parsed.targetContentSlug).toBeUndefined();
  });
});

describe('library sözleşmeleri', () => {
  it('ilerleme güncellemesini ayrıştırır', () => {
    const parsed = watchProgressPutSchema.parse({ positionSeconds: 187 });
    expect(parsed.completed).toBeUndefined();
  });

  it('negatif konum reddeder', () => {
    expect(() => watchProgressPutSchema.parse({ positionSeconds: -1 })).toThrow();
  });

  it('ilerleme kaydını ayrıştırır', () => {
    const parsed = watchProgressItemSchema.parse({
      episodeId: 'ep_1',
      contentId: 'c_1',
      contentSlug: 'son-vardiya',
      contentTitle: 'Son Vardiya',
      episodeTitle: 'Kapanış Saati',
      seasonNumber: 1,
      episodeNumber: 1,
      positionSeconds: 120,
      durationSeconds: 512,
      completed: false,
      lastWatchedAt: '2026-10-25T09:00:00Z',
    });
    expect(parsed.completed).toBe(false);
  });

  it('favori mutasyon yanıtını ayrıştırır', () => {
    const parsed = favoriteMutationResponseSchema.parse({
      contentId: 'c_1',
      favorited: true,
      alreadyFavorited: false,
    });
    expect(parsed.favorited).toBe(true);
  });
});

describe('notifications sözleşmeleri', () => {
  it('cihaz kaydını ayrıştırır', () => {
    const parsed = deviceRegisterSchema.parse({
      platform: 'IOS',
      pushToken: 'ExponentPushToken[abcdefghijklmnop]',
    });
    expect(parsed.locale).toBe('tr');
  });

  it('kısa push token reddeder', () => {
    expect(() =>
      deviceRegisterSchema.parse({ platform: 'IOS', pushToken: 'abc' }),
    ).toThrow();
  });

  it('tercihler system=true zorunlu kılar', () => {
    expect(() =>
      notificationPreferencesSchema.parse({ newEpisode: true, newContent: true, promo: true, system: false }),
    ).toThrow();
  });
});

describe('payments sözleşmeleri', () => {
  it('satın alma doğrulama gövdesini ayrıştırır', () => {
    const parsed = purchaseValidateSchema.parse({
      platform: 'IOS',
      productType: 'CREDIT_PACK',
      productId: 'PACK_10',
      storeTransactionId: '2000000123456789',
    });
    expect(parsed.productType).toBe('CREDIT_PACK');
  });

  it('boş mağaza işlem kimliğini reddeder', () => {
    expect(() =>
      purchaseValidateSchema.parse({
        platform: 'IOS',
        productType: 'CREDIT_PACK',
        productId: 'PACK_10',
        storeTransactionId: '',
      }),
    ).toThrow();
  });

  it('idempotent doğrulama yanıtını ayrıştırır', () => {
    const parsed = purchaseValidateResponseSchema.parse({
      storeTransactionId: '2000000123456789',
      alreadyProcessed: true,
      productType: 'CREDIT_PACK',
      wallet: { purchased: 10, granted: 0 },
    });
    expect(parsed.alreadyProcessed).toBe(true);
  });

  it('webhook zarfını ayrıştırır', () => {
    const parsed = webhookIngestSchema.parse({
      source: 'REVENUECAT',
      eventId: 'evt_1',
      eventType: 'CREDIT_PACK_PURCHASED',
      payload: { any: true },
    });
    expect(parsed.source).toBe('REVENUECAT');
  });
});
